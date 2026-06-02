import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { once } from "node:events";
import { resolve } from "node:path";
import { redactSensitiveText } from "../policy/redaction.ts";
import { ensureDir, writeJsonAtomic } from "../util/fs.ts";

const STDIO_MAX_READ_BYTES = 64 * 1024;
const STDIO_MAX_MESSAGES = 50;
const STDIO_MAX_PREVIEW_BYTES = 2048;
const TURN_BOUNDARY_METHODS = new Set(["turn/started", "turn/completed"]);

export type StdioProofStatus = "observed" | "unobserved" | "unavailable";
export type StdioRuntimeSurface = "unknown" | "desktop-app-server";

export interface StdioMessageEvidence {
  observedAt: string;
  kind: "notification" | "response" | "unknown";
  id: string | number | null;
  method: string | null;
  shape: {
    type: string;
    keys: string[];
  };
  preview: string;
}

export interface AppServerStdioProofManifest {
  schemaVersion: 1;
  stability: "experimental";
  experimentId: string;
  mode: "stdio-proof";
  cwd: string;
  experimentDir: string;
  timeoutMs: number;
  source: {
    kind: "fake-process" | "codexus-owned-process";
    ownedByCodexus: true;
    existingDesktopStdioAttachAttempted: false;
    desktopProcessPid: null;
    command: string;
    argsPreview: string[];
  };
  safety: {
    readOnly: true;
    startsDesktopTurn: false;
    transcriptValuesStored: false;
    remoteControlAutoEnabled: false;
    completionAuthority: false;
    runtimeSurfaceAuthority: "turn-boundary-event-only";
  };
  process: {
    pid: number | null;
    startedAt: string;
    completedAt: string;
    exitCode: number | null;
    signal: NodeJS.Signals | null;
    status: "passed" | "failed" | "timed_out" | "error";
    error: string | null;
  };
  limits: {
    maxReadBytes: number;
    maxMessages: number;
    bytesRead: number;
    truncated: boolean;
    timeoutMs: number;
  };
  observation: {
    status: StdioProofStatus;
    runtimeSurface: StdioRuntimeSurface;
    turnBoundaryObserved: boolean;
    notificationMethods: string[];
    relevantEventMethods: string[];
    messages: StdioMessageEvidence[];
    reason: string;
  };
  promotionRecommendation: "allow_session_mapping_design" | "block_stage_b" | "inconclusive";
}

function boundText(value: string): string {
  const redacted = redactSensitiveText(value);
  if (redacted.length <= STDIO_MAX_PREVIEW_BYTES) return redacted;
  return `${redacted.slice(0, STDIO_MAX_PREVIEW_BYTES)}...[+${redacted.length - STDIO_MAX_PREVIEW_BYTES}b]`;
}

function shapeOf(value: unknown): StdioMessageEvidence["shape"] {
  if (value === null) return { type: "null", keys: [] };
  if (Array.isArray(value)) return { type: "array", keys: [] };
  if (typeof value === "object") return { type: "object", keys: Object.keys(value as Record<string, unknown>).sort().slice(0, 24) };
  return { type: typeof value, keys: [] };
}

function messageEvidence(value: unknown): StdioMessageEvidence {
  const record = typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
  const method = typeof record?.method === "string" ? record.method : null;
  const idValue = typeof record?.id === "string" || typeof record?.id === "number" ? record.id : null;
  return {
    observedAt: new Date().toISOString(),
    kind: method ? "notification" : idValue !== null ? "response" : "unknown",
    id: idValue,
    method,
    shape: shapeOf(value),
    preview: boundText(JSON.stringify(shapeOf(value))),
  };
}

function fakeProcessScript(sendTurnBoundary: boolean): string {
  const notifications = [
    { method: "thread/item/updated", params: { transcript: "password=should-not-be-stored", itemId: "item-1" } },
    sendTurnBoundary
      ? { method: "turn/completed", params: { transcript: "password=should-not-be-stored", threadId: "thread-1" } }
      : { method: "remoteControl/status/changed", params: { status: "enabled" } },
  ];
  return [
    "const messages = " + JSON.stringify(notifications) + ";",
    "let index = 0;",
    "const timer = setInterval(() => {",
    "  if (index >= messages.length) { clearInterval(timer); setTimeout(() => process.exit(0), 10); return; }",
    "  process.stdout.write(JSON.stringify(messages[index]) + '\\n');",
    "  index += 1;",
    "}, 10);",
  ].join("\n");
}

function parseJsonLines(buffer: string): StdioMessageEvidence[] {
  const messages: StdioMessageEvidence[] = [];
  for (const line of buffer.split(/\r?\n/)) {
    if (!line.trim()) continue;
    if (messages.length >= STDIO_MAX_MESSAGES) break;
    try {
      messages.push(messageEvidence(JSON.parse(line) as unknown));
    } catch {
      messages.push(messageEvidence({ raw: boundText(line) }));
    }
  }
  return messages;
}

async function waitForOwnedProcess(child: ChildProcessWithoutNullStreams, timeoutMs: number): Promise<{
  completedAt: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  status: "passed" | "failed" | "timed_out" | "error";
  error: string | null;
}> {
  let timer: NodeJS.Timeout | null = null;
  let timedOut = false;
  let closed = false;
  const close = (once(child, "close") as Promise<[number | null, NodeJS.Signals | null]>).then((result) => {
    closed = true;
    return result;
  });
  const timeout = new Promise<[number | null, NodeJS.Signals | null]>((resolveTimeout) => {
    timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => {
        if (!closed) child.kill("SIGKILL");
      }, 250).unref();
      resolveTimeout([null, "SIGTERM"]);
    }, timeoutMs);
  });
  const [exitCode, signal] = await Promise.race([close, timeout]);
  if (timer) clearTimeout(timer);
  return {
    completedAt: new Date().toISOString(),
    exitCode,
    signal,
    status: timedOut ? "timed_out" : exitCode === 0 ? "passed" : "failed",
    error: null,
  };
}

export async function runStdioProof(input: {
  cwd: string;
  experimentDir: string;
  experimentId: string;
  timeoutMs: number;
  record: boolean;
  sendTurnBoundary?: boolean;
}): Promise<{ manifest: AppServerStdioProofManifest; manifestPath: string | null }> {
  const startedAt = new Date().toISOString();
  const args = ["-e", fakeProcessScript(input.sendTurnBoundary !== false)];
  const child = spawn(process.execPath, args, {
    cwd: input.cwd,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let bytesRead = 0;
  let truncated = false;
  let spawnError: string | null = null;
  child.stdout.on("data", (chunk) => {
    const text = chunk.toString("utf8");
    bytesRead += Buffer.byteLength(text);
    if (stdout.length < STDIO_MAX_READ_BYTES) {
      stdout += text;
      if (stdout.length > STDIO_MAX_READ_BYTES) {
        stdout = stdout.slice(0, STDIO_MAX_READ_BYTES);
        truncated = true;
      }
    } else {
      truncated = true;
    }
  });
  child.on("error", (error) => {
    spawnError = error instanceof Error ? error.message : String(error);
  });
  const processResult = await waitForOwnedProcess(child, input.timeoutMs);
  const messages = parseJsonLines(stdout);
  const notificationMethods = [...new Set(messages
    .map((message) => message.method)
    .filter((method): method is string => typeof method === "string"))].sort();
  const relevantEventMethods = notificationMethods.filter((method) => {
    const lower = method.toLowerCase();
    return lower.includes("turn") || lower.includes("thread") || lower.includes("item");
  });
  const turnBoundaryObserved = notificationMethods.some((method) => TURN_BOUNDARY_METHODS.has(method));
  const status: StdioProofStatus = spawnError
    ? "unavailable"
    : turnBoundaryObserved
      ? "observed"
      : messages.length > 0
        ? "unobserved"
        : "unavailable";
  const runtimeSurface: StdioRuntimeSurface = turnBoundaryObserved ? "desktop-app-server" : "unknown";
  const promotionRecommendation: AppServerStdioProofManifest["promotionRecommendation"] = turnBoundaryObserved
    ? "allow_session_mapping_design"
    : status === "unavailable"
      ? "block_stage_b"
      : "inconclusive";
  const manifest: AppServerStdioProofManifest = {
    schemaVersion: 1,
    stability: "experimental",
    experimentId: input.experimentId,
    mode: "stdio-proof",
    cwd: input.cwd,
    experimentDir: input.experimentDir,
    timeoutMs: input.timeoutMs,
    source: {
      kind: "fake-process",
      ownedByCodexus: true,
      existingDesktopStdioAttachAttempted: false,
      desktopProcessPid: null,
      command: process.execPath,
      argsPreview: ["-e", "fake app-server stdio notification fixture"],
    },
    safety: {
      readOnly: true,
      startsDesktopTurn: false,
      transcriptValuesStored: false,
      remoteControlAutoEnabled: false,
      completionAuthority: false,
      runtimeSurfaceAuthority: "turn-boundary-event-only",
    },
    process: {
      pid: child.pid ?? null,
      startedAt,
      completedAt: processResult.completedAt,
      exitCode: processResult.exitCode,
      signal: processResult.signal,
      status: spawnError ? "error" : processResult.status,
      error: spawnError ?? processResult.error,
    },
    limits: {
      maxReadBytes: STDIO_MAX_READ_BYTES,
      maxMessages: STDIO_MAX_MESSAGES,
      bytesRead,
      truncated,
      timeoutMs: input.timeoutMs,
    },
    observation: {
      status,
      runtimeSurface,
      turnBoundaryObserved,
      notificationMethods,
      relevantEventMethods,
      messages: messages.slice(0, 20),
      reason: turnBoundaryObserved
        ? "owned fake stdio process emitted a turn-boundary-shaped notification"
        : messages.length > 0
          ? "owned fake stdio process emitted notifications but no turn boundary"
          : "owned fake stdio process emitted no parseable notifications",
    },
    promotionRecommendation,
  };
  let manifestPath: string | null = null;
  if (input.record) {
    await ensureDir(input.experimentDir);
    manifestPath = resolve(input.experimentDir, "stdio-proof.json");
    await writeJsonAtomic(manifestPath, manifest);
  }
  return { manifest, manifestPath };
}
