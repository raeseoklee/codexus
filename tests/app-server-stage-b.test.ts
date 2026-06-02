import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import {
  buildAppServerDiscoveryReport,
  classifyAppServerProcessLine,
  type AppServerDiscoveryReport,
} from "../src/experiments/app-server-discovery.ts";

const cli = resolve("src/cli/main.ts");

async function tempDir(): Promise<string> {
  return await mkdtemp(join(tmpdir(), "codexus-stageb-test-"));
}

function runCli(cwd: string, args: string[], env: Record<string, string> = {}) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

async function runCliAsync(cwd: string, args: string[], env: Record<string, string> = {}) {
  return await new Promise<{ status: number | null; stdout: string; stderr: string }>((resolveRun) => {
    const child = spawn(process.execPath, [cli, ...args], {
      cwd,
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (status) => {
      resolveRun({ status, stdout, stderr });
    });
  });
}

function websocketAccept(key: string): string {
  return createHash("sha1")
    .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest("base64");
}

function serverFrameText(payload: string): Buffer {
  const bytes = Buffer.from(payload, "utf8");
  if (bytes.length >= 126) throw new Error("test frame too large");
  return Buffer.concat([Buffer.from([0x81, bytes.length]), bytes]);
}

function parseClientFrames(buffer: Buffer): { messages: string[]; rest: Buffer } {
  const messages: string[] = [];
  let offset = 0;
  while (offset + 2 <= buffer.length) {
    const opcode = buffer[offset] & 0x0f;
    let length = buffer[offset + 1] & 0x7f;
    let headerLength = 2;
    if (length === 126) {
      if (offset + 4 > buffer.length) break;
      length = buffer.readUInt16BE(offset + 2);
      headerLength = 4;
    } else if (length === 127) {
      break;
    }
    const maskOffset = offset + headerLength;
    const frameEnd = maskOffset + 4 + length;
    if (frameEnd > buffer.length) break;
    if (opcode === 0x1) {
      const mask = buffer.subarray(maskOffset, maskOffset + 4);
      const payload = buffer.subarray(maskOffset + 4, frameEnd);
      const decoded = Buffer.from(payload.map((byte, index) => byte ^ mask[index % 4]));
      messages.push(decoded.toString("utf8"));
    }
    offset = frameEnd;
  }
  return { messages, rest: buffer.subarray(offset) };
}

async function startFakeAppServer(socketPath: string, options: { sendTurnBoundary: boolean; floodNotifications?: boolean }) {
  const sockets = new Set<Socket>();
  const receivedMethods: string[] = [];
  const server = createServer((socket) => {
    sockets.add(socket);
    let handshake = Buffer.alloc(0);
    let frames = Buffer.alloc(0);
    let initialized = false;
    socket.on("data", (chunk) => {
      if (!initialized) {
        handshake = Buffer.concat([handshake, chunk]);
        const text = handshake.toString("utf8");
        const end = text.indexOf("\r\n\r\n");
        if (end === -1) return;
        const keyLine = text.split("\r\n").find((line) => line.toLowerCase().startsWith("sec-websocket-key:"));
        const key = keyLine?.split(":").slice(1).join(":").trim() ?? "";
        socket.write([
          "HTTP/1.1 101 Switching Protocols",
          "Connection: Upgrade",
          "Upgrade: websocket",
          `Sec-WebSocket-Accept: ${websocketAccept(key)}`,
          "",
          "",
        ].join("\r\n"));
        initialized = true;
        const leftover = handshake.subarray(end + 4);
        if (leftover.length > 0) frames = Buffer.concat([frames, leftover]);
      } else {
        frames = Buffer.concat([frames, chunk]);
      }
      const parsed = parseClientFrames(frames);
      frames = parsed.rest;
      for (const message of parsed.messages) {
        const request = JSON.parse(message) as { id?: number; method?: string };
        if (!request.method) continue;
        receivedMethods.push(request.method);
        if (request.method === "initialize") {
          socket.write(serverFrameText(JSON.stringify({
            id: request.id,
            result: { userAgent: "fake", codexHome: "/tmp/fake", platformFamily: "unix", platformOs: "test" },
          })));
          socket.write(serverFrameText(JSON.stringify({
            method: "remoteControl/status/changed",
            params: { status: "enabled" },
          })));
          if (options.sendTurnBoundary) {
            socket.write(serverFrameText(JSON.stringify({
              method: "turn/completed",
              params: {
                threadId: "thread-1",
                transcript: "password=should-not-be-stored",
              },
            })));
          }
          if (options.floodNotifications) {
            for (let index = 0; index < 70; index += 1) {
              socket.write(serverFrameText(JSON.stringify({
                method: "thread/item/delta",
                params: { transcript: "password=should-not-be-stored" },
              })));
            }
          }
        } else if (request.method === "thread/list") {
          socket.write(serverFrameText(JSON.stringify({ id: request.id, result: { data: [], nextCursor: null } })));
        } else if (request.method === "remoteControl/status/read") {
          socket.write(serverFrameText(JSON.stringify({ id: request.id, result: { status: "enabled" } })));
        }
      }
    });
    socket.on("close", () => sockets.delete(socket));
    socket.on("error", () => sockets.delete(socket));
  });
  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(socketPath, resolveListen);
  });
  return {
    receivedMethods,
    close: async () => {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
    },
  };
}

function probe(status: AppServerDiscoveryReport["daemonVersionProbe"]["status"]): AppServerDiscoveryReport["daemonVersionProbe"] {
  return {
    command: "codex",
    args: ["app-server", "daemon", "version"],
    status,
    exitCode: status === "passed" ? 0 : 1,
    signal: null,
    stdoutPreview: status === "passed" ? "{\"version\":\"1\"}" : "",
    stderrPreview: status === "passed" ? "" : "failed",
    error: null,
    timeoutMs: 1000,
  };
}

test("app-server discovery classifies stdio-only Desktop surfaces without promoting Stage B", () => {
  const desktop = classifyAppServerProcessLine("  74924     1 /Applications/Codex.app/Contents/Resources/codex app-server --analytics-default-enabled");
  const session = classifyAppServerProcessLine("  58539 58536 /Applications/Codex.app/Contents/Resources/codex app-server --listen stdio://");
  const vscode = classifyAppServerProcessLine("  50301 50223 /Users/me/.vscode/extensions/openai.chatgpt/bin/codex app-server --analytics-default-enabled");
  assert.ok(desktop);
  assert.ok(session);
  assert.ok(vscode);
  assert.equal(desktop.source, "desktop-app");
  assert.equal(vscode.source, "vscode-extension");
  const report = buildAppServerDiscoveryReport({
    cwd: "/repo",
    command: "codex",
    controlSocketPath: "/home/user/.codex/app-server-control/app-server-control.sock",
    controlSocketExists: false,
    daemonVersionProbe: probe("failed"),
    processCandidates: [desktop, session, vscode],
  });
  assert.equal(report.consent.remoteControlAutoEnabled, false);
  assert.equal(report.consent.connectsToLiveSocket, false);
  assert.equal(report.processes.total, 3);
  assert.equal(report.processes.stdioCount, 3);
  assert.equal(report.stageBReadiness.status, "stdio_only");
  assert.equal(report.stageBReadiness.candidateSocket, null);
  assert.equal(report.stageBReadiness.promotionRecommendation, "design_stdio_observer");
});

test("app-server discovery surfaces explicit socket candidates without connecting", () => {
  const candidate = classifyAppServerProcessLine("  100 1 codex app-server --listen unix:///tmp/codex.sock");
  assert.ok(candidate);
  const report = buildAppServerDiscoveryReport({
    cwd: "/repo",
    command: "codex",
    controlSocketPath: "/home/user/.codex/app-server-control/app-server-control.sock",
    controlSocketExists: false,
    daemonVersionProbe: probe("failed"),
    processCandidates: [candidate],
    recordPath: "/repo/.codexus/experiments/app-server/discovery.json",
  });
  assert.equal(report.processes.attachableCount, 1);
  assert.equal(report.stageBReadiness.status, "candidate_socket_found");
  assert.equal(report.stageBReadiness.candidateSocket, "/tmp/codex.sock");
  assert.equal(report.stageBReadiness.promotionRecommendation, "run_live_read_only_with_explicit_socket");
  assert.equal(report.record.enabled, true);
});

test("app-server discovery reports validate as schema artifacts", async () => {
  const cwd = await tempDir();
  try {
    const candidate = classifyAppServerProcessLine("  100 1 codex app-server --listen unix:///tmp/codex.sock");
    assert.ok(candidate);
    const reportPath = join(cwd, "discovery.json");
    const report = buildAppServerDiscoveryReport({
      cwd,
      command: "codex",
      controlSocketPath: "/home/user/.codex/app-server-control/app-server-control.sock",
      controlSocketExists: false,
      daemonVersionProbe: probe("failed"),
      processCandidates: [candidate],
      recordPath: reportPath,
    });
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    const schema = runCli(cwd, ["schema", "validate", "--type", "app-server-discovery", "--file", reportPath, "--json"]);
    assert.equal(schema.status, 0, schema.stderr);
    assert.equal(JSON.parse(schema.stdout).ok, true);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("live-read-only without env gate yields structured unsupported error", async () => {
  const cwd = await tempDir();
  try {
    const result = runCli(cwd, ["app-server", "experiment", "--live-read-only", "--sock", "/tmp/nope.sock", "--json"], {
      CODEXUS_ENABLE_DESKTOP_APP_SERVER_ATTACH: "",
    });
    assert.equal(result.status, 1);
    const output = JSON.parse(result.stdout);
    assert.equal(output.type, "error");
    assert.equal(output.code, "unsupported_feature");
    assert.equal(output.details.target, "codex-app-server-live-read-only");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("live-read-only requires explicit socket path", async () => {
  const cwd = await tempDir();
  try {
    const result = runCli(cwd, ["app-server", "experiment", "--live-read-only", "--json"], {
      CODEXUS_ENABLE_DESKTOP_APP_SERVER_ATTACH: "1",
    });
    assert.equal(result.status, 1);
    const output = JSON.parse(result.stdout);
    assert.equal(output.code, "missing_app_server_socket");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("live-read-only records desktop turn-boundary evidence without transcript values", async () => {
  const cwd = await tempDir();
  const socketDir = await tempDir();
  const socketPath = join(socketDir, "app-server.sock");
  const fake = await startFakeAppServer(socketPath, { sendTurnBoundary: true });
  try {
    const result = await runCliAsync(cwd, [
      "app-server",
      "experiment",
      "--live-read-only",
      "--sock",
      socketPath,
      "--record",
      "--observe-ms",
      "200",
      "--timeout-ms",
      "2000",
      "--json",
    ], {
      CODEXUS_ENABLE_DESKTOP_APP_SERVER_ATTACH: "1",
    });
    assert.equal(result.status, 0, result.stderr);
    const manifest = JSON.parse(result.stdout);
    assert.equal(manifest.mode, "live-read-only");
    assert.equal(manifest.consent.envGateEnabled, true);
    assert.equal(manifest.consent.remoteControlAutoEnabled, false);
    assert.equal(manifest.socket.path, socketPath);
    assert.equal(manifest.socket.existsBeforeConnect, true);
    assert.equal(manifest.connection.handshake, "observed");
    assert.equal(manifest.eventObservation.status, "observed");
    assert.equal(manifest.eventObservation.runtimeSurface, "desktop-app-server");
    assert.equal(manifest.eventObservation.turnBoundaryObserved, true);
    assert.ok(manifest.eventObservation.notificationMethods.includes("turn/completed"));
    assert.equal(manifest.promotionRecommendation, "allow_session_mapping_design");
    assert.deepEqual(fake.receivedMethods, ["initialize", "thread/list", "remoteControl/status/read"]);
    assert.doesNotMatch(JSON.stringify(manifest), /should-not-be-stored/);
    assert.ok(existsSync(join(manifest.experimentDir, "manifest.json")));
    const manifestPath = join(manifest.experimentDir, "manifest.json");
    const persisted = JSON.parse(await readFile(manifestPath, "utf8"));
    assert.equal(persisted.eventObservation.runtimeSurface, "desktop-app-server");
    const schema = runCli(cwd, ["schema", "validate", "--type", "app-server-stage-b", "--file", manifestPath, "--json"]);
    assert.equal(schema.status, 0, schema.stderr);
    assert.equal(JSON.parse(schema.stdout).ok, true);
  } finally {
    await fake.close();
    await rm(cwd, { recursive: true, force: true });
    await rm(socketDir, { recursive: true, force: true });
  }
});

test("live-read-only keeps runtime unknown when no turn boundary is observed", async () => {
  const cwd = await tempDir();
  const socketDir = await tempDir();
  const socketPath = join(socketDir, "app-server.sock");
  const fake = await startFakeAppServer(socketPath, { sendTurnBoundary: false });
  try {
    const result = await runCliAsync(cwd, [
      "app-server",
      "experiment",
      "--live-read-only",
      "--sock",
      socketPath,
      "--observe-ms",
      "200",
      "--timeout-ms",
      "2000",
      "--json",
    ], {
      CODEXUS_ENABLE_DESKTOP_APP_SERVER_ATTACH: "1",
    });
    assert.equal(result.status, 0, result.stderr);
    const manifest = JSON.parse(result.stdout);
    assert.equal(manifest.connection.status, "observed");
    assert.equal(manifest.eventObservation.status, "unobserved");
    assert.equal(manifest.eventObservation.runtimeSurface, "unknown");
    assert.equal(manifest.eventObservation.turnBoundaryObserved, false);
    assert.equal(manifest.promotionRecommendation, "inconclusive");
    assert.deepEqual(fake.receivedMethods, ["initialize", "thread/list", "remoteControl/status/read"]);
  } finally {
    await fake.close();
    await rm(cwd, { recursive: true, force: true });
    await rm(socketDir, { recursive: true, force: true });
  }
});

test("live-read-only bounds notification flood without transcript values", async () => {
  const cwd = await tempDir();
  const socketDir = await tempDir();
  const socketPath = join(socketDir, "app-server.sock");
  const fake = await startFakeAppServer(socketPath, { sendTurnBoundary: false, floodNotifications: true });
  try {
    const result = await runCliAsync(cwd, [
      "app-server",
      "experiment",
      "--live-read-only",
      "--sock",
      socketPath,
      "--observe-ms",
      "2000",
      "--timeout-ms",
      "3000",
      "--json",
    ], {
      CODEXUS_ENABLE_DESKTOP_APP_SERVER_ATTACH: "1",
    });
    assert.equal(result.status, 0, result.stderr);
    const manifest = JSON.parse(result.stdout);
    assert.equal(manifest.connection.status, "observed");
    assert.equal(manifest.connection.reason, "read-only observation message limit reached");
    assert.equal(manifest.eventObservation.status, "unobserved");
    assert.equal(manifest.eventObservation.messages.length, 20);
    assert.doesNotMatch(JSON.stringify(manifest), /should-not-be-stored/);
  } finally {
    await fake.close();
    await rm(cwd, { recursive: true, force: true });
    await rm(socketDir, { recursive: true, force: true });
  }
});

test("stdio-proof records owned fake process evidence without attaching existing Desktop stdio", async () => {
  const cwd = await tempDir();
  try {
    const result = runCli(cwd, [
      "app-server",
      "experiment",
      "--stdio-proof",
      "--record",
      "--timeout-ms",
      "2000",
      "--json",
    ]);
    assert.equal(result.status, 0, result.stderr);
    const manifest = JSON.parse(result.stdout);
    assert.equal(manifest.mode, "stdio-proof");
    assert.equal(manifest.source.kind, "fake-process");
    assert.equal(manifest.source.ownedByCodexus, true);
    assert.equal(manifest.source.existingDesktopStdioAttachAttempted, false);
    assert.equal(manifest.source.desktopProcessPid, null);
    assert.equal(manifest.safety.startsDesktopTurn, false);
    assert.equal(manifest.safety.transcriptValuesStored, false);
    assert.equal(manifest.safety.completionAuthority, false);
    assert.equal(manifest.observation.status, "observed");
    assert.equal(manifest.observation.runtimeSurface, "desktop-app-server");
    assert.equal(manifest.observation.turnBoundaryObserved, true);
    assert.ok(manifest.observation.notificationMethods.includes("turn/completed"));
    assert.equal(manifest.promotionRecommendation, "allow_session_mapping_design");
    assert.doesNotMatch(JSON.stringify(manifest), /should-not-be-stored/);
    const manifestPath = join(manifest.experimentDir, "stdio-proof.json");
    assert.ok(existsSync(manifestPath));
    const schema = runCli(cwd, ["schema", "validate", "--type", "app-server-stdio-proof", "--file", manifestPath, "--json"]);
    assert.equal(schema.status, 0, schema.stderr);
    assert.equal(JSON.parse(schema.stdout).ok, true);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("stdio-proof keeps runtime unknown without turn-boundary notification", async () => {
  const cwd = await tempDir();
  try {
    const result = runCli(cwd, [
      "app-server",
      "experiment",
      "--stdio-proof",
      "--no-turn-boundary",
      "--timeout-ms",
      "2000",
      "--json",
    ]);
    assert.equal(result.status, 0, result.stderr);
    const manifest = JSON.parse(result.stdout);
    assert.equal(manifest.mode, "stdio-proof");
    assert.equal(manifest.source.existingDesktopStdioAttachAttempted, false);
    assert.equal(manifest.observation.status, "unobserved");
    assert.equal(manifest.observation.runtimeSurface, "unknown");
    assert.equal(manifest.observation.turnBoundaryObserved, false);
    assert.equal(manifest.promotionRecommendation, "inconclusive");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
