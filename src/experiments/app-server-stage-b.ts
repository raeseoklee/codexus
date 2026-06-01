import { createHash, randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { createConnection, type Socket } from "node:net";
import { isAbsolute, resolve } from "node:path";
import { redactSensitiveText } from "../policy/redaction.ts";
import { ensureDir, writeJsonAtomic } from "../util/fs.ts";

const STAGE_B_MAX_PREVIEW_BYTES = 2048;
const STAGE_B_MAX_READ_BYTES = 128 * 1024;
const STAGE_B_MAX_MESSAGES = 50;
const READ_ONLY_METHODS = ["initialize", "thread/list", "remoteControl/status/read"] as const;
const TURN_BOUNDARY_METHODS = new Set(["turn/started", "turn/completed"]);

export type StageBStatus = "observed" | "unobserved" | "unavailable";
export type RuntimeSurfaceEvidence = "unknown" | "desktop-app-server";

export interface JsonShapeSummary {
  type: string;
  keys?: string[];
  length?: number;
  items?: JsonShapeSummary;
  properties?: Record<string, JsonShapeSummary>;
}

export interface AppServerMessageEvidence {
  observedAt: string;
  kind: "response" | "notification" | "unknown";
  id: string | number | null;
  method: string | null;
  shape: JsonShapeSummary;
  preview: string;
}

export interface StageBManifest {
  schemaVersion: 1;
  stability: "experimental";
  experimentId: string;
  mode: "live-read-only";
  cwd: string;
  experimentDir: string;
  timeoutMs: number;
  observeMs: number;
  consent: {
    commandFlag: "live-read-only";
    envGate: "CODEXUS_ENABLE_DESKTOP_APP_SERVER_ATTACH";
    envGateEnabled: boolean;
    userProvidedSocket: boolean;
    remoteControlAutoEnabled: false;
    readOnly: true;
  };
  socket: {
    path: string;
    absolute: boolean;
    existsBeforeConnect: boolean;
    source: "flag";
  };
  connection: {
    status: StageBStatus;
    reason: string;
    handshake: StageBStatus;
    error: string | null;
    durationMs: number;
    bytesRead: number;
    bytesWritten: number;
  };
  readOnlyRequests: Array<{
    method: typeof READ_ONLY_METHODS[number];
    sent: boolean;
  }>;
  eventObservation: {
    status: StageBStatus;
    runtimeSurface: RuntimeSurfaceEvidence;
    turnBoundaryObserved: boolean;
    notificationMethods: string[];
    relevantEventMethods: string[];
    messages: AppServerMessageEvidence[];
    reason: string;
  };
  promotionRecommendation: "allow_session_mapping_design" | "block_stage_b" | "inconclusive";
}

function boundText(value: string): string {
  const redacted = redactSensitiveText(value);
  if (redacted.length <= STAGE_B_MAX_PREVIEW_BYTES) return redacted;
  return `${redacted.slice(0, STAGE_B_MAX_PREVIEW_BYTES)}...[+${redacted.length - STAGE_B_MAX_PREVIEW_BYTES}b]`;
}

function shapeOf(value: unknown, depth = 0): JsonShapeSummary {
  if (value === null) return { type: "null" };
  if (Array.isArray(value)) {
    return {
      type: "array",
      length: value.length,
      items: value.length > 0 && depth < 2 ? shapeOf(value[0], depth + 1) : undefined,
    };
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    const properties: Record<string, JsonShapeSummary> = {};
    if (depth < 2) {
      for (const key of keys.slice(0, 12)) {
        properties[key] = shapeOf(record[key], depth + 1);
      }
    }
    return { type: "object", keys: keys.slice(0, 24), properties };
  }
  return { type: typeof value };
}

function messageEvidence(value: unknown): AppServerMessageEvidence {
  const record = typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
  const method = typeof record?.method === "string" ? record.method : null;
  const idValue = typeof record?.id === "string" || typeof record?.id === "number" ? record.id : null;
  const kind: AppServerMessageEvidence["kind"] = method
    ? "notification"
    : idValue !== null
      ? "response"
      : "unknown";
  return {
    observedAt: new Date().toISOString(),
    kind,
    id: idValue,
    method,
    shape: shapeOf(value),
    preview: boundText(JSON.stringify(shapeOf(value))),
  };
}

function frameText(payload: string): Buffer {
  const bytes = Buffer.from(payload, "utf8");
  let header: Buffer;
  if (bytes.length < 126) {
    header = Buffer.alloc(2);
    header[1] = 0x80 | bytes.length;
  } else if (bytes.length <= 0xffff) {
    header = Buffer.alloc(4);
    header[1] = 0x80 | 126;
    header.writeUInt16BE(bytes.length, 2);
  } else {
    throw new Error("stage_b_payload_too_large");
  }
  header[0] = 0x81;
  const mask = randomBytes(4);
  const frame = Buffer.alloc(header.length + mask.length + bytes.length);
  header.copy(frame, 0);
  mask.copy(frame, header.length);
  for (let index = 0; index < bytes.length; index += 1) {
    frame[header.length + mask.length + index] = bytes[index] ^ mask[index % 4];
  }
  return frame;
}

function closeFrame(): Buffer {
  const header = Buffer.from([0x88, 0x80]);
  const mask = randomBytes(4);
  return Buffer.concat([header, mask]);
}

function parseServerFrames(buffer: Buffer): { messages: string[]; rest: Buffer } {
  const messages: string[] = [];
  let offset = 0;
  while (offset + 2 <= buffer.length) {
    const first = buffer[offset];
    const second = buffer[offset + 1];
    const opcode = first & 0x0f;
    let length = second & 0x7f;
    let headerLength = 2;
    if (length === 126) {
      if (offset + 4 > buffer.length) break;
      length = buffer.readUInt16BE(offset + 2);
      headerLength = 4;
    } else if (length === 127) {
      if (offset + 10 > buffer.length) break;
      const bigLength = buffer.readBigUInt64BE(offset + 2);
      if (bigLength > BigInt(Number.MAX_SAFE_INTEGER)) break;
      length = Number(bigLength);
      headerLength = 10;
    }
    const masked = (second & 0x80) !== 0;
    const maskLength = masked ? 4 : 0;
    const frameStart = offset + headerLength + maskLength;
    const frameEnd = frameStart + length;
    if (frameEnd > buffer.length) break;
    if (opcode === 0x1) {
      let payload = buffer.subarray(frameStart, frameEnd);
      if (masked) {
        const mask = buffer.subarray(offset + headerLength, offset + headerLength + 4);
        payload = Buffer.from(payload.map((byte, index) => byte ^ mask[index % 4]));
      }
      messages.push(payload.toString("utf8"));
    }
    offset = frameEnd;
  }
  return { messages, rest: buffer.subarray(offset) };
}

function websocketAccept(key: string): string {
  return createHash("sha1")
    .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest("base64");
}

function readOnlyRequest(id: number, method: typeof READ_ONLY_METHODS[number]): unknown {
  if (method === "initialize") {
    return {
      jsonrpc: "2.0",
      id,
      method,
      params: {
        clientInfo: {
          name: "codexus",
          version: "0.1.0",
        },
        capabilities: {
          experimentalApi: true,
          optOutNotificationMethods: [],
        },
      },
    };
  }
  return {
    jsonrpc: "2.0",
    id,
    method,
    params: {},
  };
}

async function observeReadOnlySocket(input: {
  socketPath: string;
  timeoutMs: number;
  observeMs: number;
}): Promise<{
  status: StageBStatus;
  handshake: StageBStatus;
  reason: string;
  error: string | null;
  durationMs: number;
  bytesRead: number;
  bytesWritten: number;
  messages: AppServerMessageEvidence[];
  sentMethods: Set<typeof READ_ONLY_METHODS[number]>;
}> {
  const started = Date.now();
  const messages: AppServerMessageEvidence[] = [];
  const sentMethods = new Set<typeof READ_ONLY_METHODS[number]>();
  let bytesRead = 0;
  let bytesWritten = 0;
  let handshakeBuffer = Buffer.alloc(0);
  let frameBuffer = Buffer.alloc(0);
  let handshakeDone = false;
  const key = randomBytes(16).toString("base64");

  return await new Promise((resolveObservation) => {
    let resolved = false;
    let socket: Socket | null = null;
    const finish = (status: StageBStatus, handshake: StageBStatus, reason: string, error: string | null): void => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);
      clearTimeout(observeTimer);
      socket?.destroy();
      resolveObservation({
        status,
        handshake,
        reason,
        error,
        durationMs: Date.now() - started,
        bytesRead,
        bytesWritten,
        messages,
        sentMethods,
      });
    };
    const sendJson = (value: unknown): void => {
      const frame = frameText(JSON.stringify(value));
      bytesWritten += frame.length;
      socket?.write(frame);
    };
    const sendReadOnlySequence = (): void => {
      let id = 1;
      for (const method of READ_ONLY_METHODS) {
        sentMethods.add(method);
        sendJson(readOnlyRequest(id, method));
        id += 1;
      }
    };
    const recordMessage = (text: string): void => {
      if (messages.length >= STAGE_B_MAX_MESSAGES) return;
      try {
        messages.push(messageEvidence(JSON.parse(text) as unknown));
      } catch {
        messages.push(messageEvidence({ raw: boundText(text) }));
      }
    };
    const timeout = setTimeout(() => {
      finish("unavailable", handshakeDone ? "observed" : "unavailable", "read-only observation timed out", "timeout");
    }, input.timeoutMs);
    const observeTimer = setTimeout(() => {
      if (!handshakeDone) {
        finish("unavailable", "unavailable", "read-only observation window elapsed before websocket handshake", "handshake_timeout");
        return;
      }
      if (socket && !socket.destroyed) {
        socket.write(closeFrame());
      }
      finish("observed", "observed", "read-only observation window completed", null);
    }, input.observeMs);

    socket = createConnection({ path: input.socketPath });
    socket.on("connect", () => {
      const request = [
        "GET / HTTP/1.1",
        "Host: localhost",
        "Upgrade: websocket",
        "Connection: Upgrade",
        `Sec-WebSocket-Key: ${key}`,
        "Sec-WebSocket-Version: 13",
        "",
        "",
      ].join("\r\n");
      bytesWritten += Buffer.byteLength(request);
      socket?.write(request);
    });
    socket.on("data", (chunk) => {
      bytesRead += chunk.length;
      if (bytesRead > STAGE_B_MAX_READ_BYTES) {
        finish(
          handshakeDone ? "observed" : "unavailable",
          handshakeDone ? "observed" : "unavailable",
          "read-only observation byte limit reached",
          "byte_limit",
        );
        return;
      }
      if (!handshakeDone) {
        handshakeBuffer = Buffer.concat([handshakeBuffer, chunk]);
        const separator = handshakeBuffer.indexOf("\r\n\r\n");
        if (separator === -1) return;
        const header = handshakeBuffer.subarray(0, separator).toString("utf8");
        const leftover = handshakeBuffer.subarray(separator + 4);
        const accept = websocketAccept(key);
        if (!header.startsWith("HTTP/1.1 101") || !header.toLowerCase().includes(accept.toLowerCase())) {
          finish("unavailable", "unavailable", "websocket handshake failed", boundText(header));
          return;
        }
        handshakeDone = true;
        if (leftover.length > 0) {
          frameBuffer = Buffer.concat([frameBuffer, leftover]);
        }
        sendReadOnlySequence();
      } else {
        frameBuffer = Buffer.concat([frameBuffer, chunk]);
      }
      const parsed = parseServerFrames(frameBuffer);
      frameBuffer = parsed.rest;
      for (const text of parsed.messages) {
        recordMessage(text);
      }
      if (messages.length >= STAGE_B_MAX_MESSAGES) {
        finish("observed", "observed", "read-only observation message limit reached", "message_limit");
      }
    });
    socket.on("error", (error) => {
      finish("unavailable", handshakeDone ? "observed" : "unavailable", "socket connection failed", error instanceof Error ? error.message : String(error));
    });
    socket.on("close", () => {
      if (!resolved && handshakeDone) {
        finish("observed", "observed", "socket closed after read-only observation", null);
      } else if (!resolved) {
        finish("unavailable", "unavailable", "socket closed before websocket handshake", "closed_before_handshake");
      }
    });
  });
}

export async function runLiveReadOnlyStageB(input: {
  cwd: string;
  experimentDir: string;
  experimentId: string;
  timeoutMs: number;
  observeMs: number;
  socketPath: string;
  record: boolean;
}): Promise<{ manifest: StageBManifest; manifestPath: string | null }> {
  const socketPath = isAbsolute(input.socketPath) ? input.socketPath : resolve(input.cwd, input.socketPath);
  const existsBeforeConnect = existsSync(socketPath);
  const started = Date.now();
  const observation = existsBeforeConnect
    ? await observeReadOnlySocket({
      socketPath,
      timeoutMs: input.timeoutMs,
      observeMs: input.observeMs,
    })
    : {
      status: "unavailable" as const,
      handshake: "unavailable" as const,
      reason: "socket path does not exist",
      error: null,
      durationMs: Date.now() - started,
      bytesRead: 0,
      bytesWritten: 0,
      messages: [],
      sentMethods: new Set<typeof READ_ONLY_METHODS[number]>(),
    };
  const notificationMethods = [...new Set(observation.messages
    .map((message) => message.method)
    .filter((method): method is string => typeof method === "string"))].sort();
  const relevantEventMethods = notificationMethods.filter((method) => {
    const lower = method.toLowerCase();
    return lower.includes("turn") || lower.includes("thread") || lower.includes("item");
  });
  const turnBoundaryObserved = notificationMethods.some((method) => TURN_BOUNDARY_METHODS.has(method));
  const eventStatus: StageBStatus = turnBoundaryObserved
    ? "observed"
    : observation.status === "unavailable"
      ? "unavailable"
      : "unobserved";
  const runtimeSurface: RuntimeSurfaceEvidence = turnBoundaryObserved ? "desktop-app-server" : "unknown";
  const promotionRecommendation: StageBManifest["promotionRecommendation"] = turnBoundaryObserved
    ? "allow_session_mapping_design"
    : observation.status === "unavailable"
      ? "block_stage_b"
      : "inconclusive";
  const manifest: StageBManifest = {
    schemaVersion: 1,
    stability: "experimental",
    experimentId: input.experimentId,
    mode: "live-read-only",
    cwd: input.cwd,
    experimentDir: input.experimentDir,
    timeoutMs: input.timeoutMs,
    observeMs: input.observeMs,
    consent: {
      commandFlag: "live-read-only",
      envGate: "CODEXUS_ENABLE_DESKTOP_APP_SERVER_ATTACH",
      envGateEnabled: true,
      userProvidedSocket: true,
      remoteControlAutoEnabled: false,
      readOnly: true,
    },
    socket: {
      path: socketPath,
      absolute: isAbsolute(socketPath),
      existsBeforeConnect,
      source: "flag",
    },
    connection: {
      status: observation.status,
      reason: observation.reason,
      handshake: observation.handshake,
      error: observation.error,
      durationMs: observation.durationMs,
      bytesRead: observation.bytesRead,
      bytesWritten: observation.bytesWritten,
    },
    readOnlyRequests: READ_ONLY_METHODS.map((method) => ({
      method,
      sent: observation.sentMethods.has(method),
    })),
    eventObservation: {
      status: eventStatus,
      runtimeSurface,
      turnBoundaryObserved,
      notificationMethods,
      relevantEventMethods,
      messages: observation.messages.slice(0, 20),
      reason: turnBoundaryObserved
        ? "read-only app-server notification included a turn boundary method"
        : observation.status === "unavailable"
          ? "read-only app-server connection unavailable"
          : "read-only connection succeeded but no turn boundary notification was observed during the observation window",
    },
    promotionRecommendation,
  };
  let manifestPath: string | null = null;
  if (input.record) {
    await ensureDir(input.experimentDir);
    manifestPath = resolve(input.experimentDir, "manifest.json");
    await writeJsonAtomic(manifestPath, manifest);
  }
  return { manifest, manifestPath };
}
