import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { redactSensitiveText } from "../policy/redaction.ts";
import { ensureDir, writeJsonAtomic } from "../util/fs.ts";
import { trimmedProcessOutput } from "../util/process-output.ts";

const MAX_COMMAND_PREVIEW = 500;
const DEFAULT_DAEMON_VERSION_TIMEOUT_MS = 2000;

export type AppServerTransport = "stdio" | "stdio-default" | "unix" | "websocket" | "off" | "other";
export type AppServerProcessSource = "desktop-app" | "vscode-extension" | "codex-cli" | "unknown";
export type AppServerDiscoveryStatus = "candidate_socket_found" | "stdio_only" | "no_app_server" | "unknown";

export interface AppServerProcessCandidate {
  pid: number | null;
  ppid: number | null;
  source: AppServerProcessSource;
  transport: AppServerTransport;
  listenUrl: string | null;
  attachableSocket: string | null;
  commandPreview: string;
}

export interface AppServerDiscoveryReport {
  schemaVersion: 1;
  stability: "experimental";
  command: "app-server discover";
  cwd: string;
  generatedAt: string;
  consent: {
    readOnly: true;
    remoteControlAutoEnabled: false;
    connectsToLiveSocket: false;
    startsDaemon: false;
  };
  controlSocket: {
    path: string;
    exists: boolean;
    source: "codex-default";
  };
  daemonVersionProbe: {
    command: string;
    args: string[];
    status: "passed" | "failed" | "error" | "timed_out";
    exitCode: number | null;
    signal: NodeJS.Signals | null;
    stdoutPreview: string;
    stderrPreview: string;
    error: string | null;
    timeoutMs: number;
  };
  processes: {
    candidates: AppServerProcessCandidate[];
    total: number;
    stdioCount: number;
    attachableCount: number;
  };
  stageBReadiness: {
    status: AppServerDiscoveryStatus;
    reason: string;
    candidateSocket: string | null;
    promotionRecommendation: "run_live_read_only_with_explicit_socket" | "design_stdio_observer" | "block_stage_b";
  };
  record: {
    enabled: boolean;
    path: string | null;
  };
}

export function defaultAppServerControlSocketPath(home = homedir()): string {
  return join(home, ".codex", "app-server-control", "app-server-control.sock");
}

function boundCommand(value: string): string {
  const redacted = redactSensitiveText(value.trim());
  if (redacted.length <= MAX_COMMAND_PREVIEW) return redacted;
  return `${redacted.slice(0, MAX_COMMAND_PREVIEW)}...[+${redacted.length - MAX_COMMAND_PREVIEW} chars]`;
}

function parseListenUrl(command: string): string | null {
  const match = command.match(/(?:^|\s)--listen(?:=|\s+)(\S+)/);
  return match?.[1] ?? null;
}

function classifyTransport(listenUrl: string | null): AppServerTransport {
  if (!listenUrl) return "stdio-default";
  if (listenUrl === "stdio://") return "stdio";
  if (listenUrl.startsWith("unix://")) return "unix";
  if (listenUrl.startsWith("ws://") || listenUrl.startsWith("wss://")) return "websocket";
  if (listenUrl === "off") return "off";
  return "other";
}

function attachableSocketForListenUrl(listenUrl: string | null): string | null {
  if (!listenUrl?.startsWith("unix://")) return null;
  const path = listenUrl.slice("unix://".length);
  return path.length > 0 ? path : null;
}

function classifySource(command: string): AppServerProcessSource {
  if (command.includes("/.vscode/extensions/openai.chatgpt")) return "vscode-extension";
  if (command.includes("/Applications/Codex.app/") || command.includes("--analytics-default-enabled")) return "desktop-app";
  if (/(^|\s)codex\s+app-server(\s|$)/.test(command) || command.includes("/codex app-server")) return "codex-cli";
  return "unknown";
}

export function classifyAppServerProcessLine(line: string): AppServerProcessCandidate | null {
  const match = line.match(/^\s*(\d+)\s+(\d+)\s+(.+)$/);
  if (!match) return null;
  const command = match[3];
  if (!/(^|\s|\/)codex\s+app-server(\s|$)/.test(command)) return null;
  const listenUrl = parseListenUrl(command);
  return {
    pid: Number(match[1]),
    ppid: Number(match[2]),
    source: classifySource(command),
    transport: classifyTransport(listenUrl),
    listenUrl,
    attachableSocket: attachableSocketForListenUrl(listenUrl),
    commandPreview: boundCommand(command),
  };
}

export function classifyAppServerProcesses(psOutput: string): AppServerProcessCandidate[] {
  return psOutput
    .split(/\r?\n/)
    .map((line) => classifyAppServerProcessLine(line))
    .filter((candidate): candidate is AppServerProcessCandidate => candidate !== null);
}

function runDaemonVersionProbe(command: string, timeoutMs: number): AppServerDiscoveryReport["daemonVersionProbe"] {
  const args = ["app-server", "daemon", "version"];
  const result = spawnSync(command, args, {
    encoding: "utf8",
    timeout: timeoutMs,
  });
  const timedOut = result.error instanceof Error && (result.error as NodeJS.ErrnoException).code === "ETIMEDOUT";
  return {
    command,
    args,
    status: timedOut ? "timed_out" : result.error ? "error" : result.status === 0 ? "passed" : "failed",
    exitCode: result.status,
    signal: result.signal,
    stdoutPreview: boundCommand(trimmedProcessOutput(result.stdout)),
    stderrPreview: boundCommand(trimmedProcessOutput(result.stderr)),
    error: result.error instanceof Error ? result.error.message : null,
    timeoutMs,
  };
}

function readProcessCandidates(): AppServerProcessCandidate[] {
  const result = spawnSync("ps", ["-axo", "pid,ppid,command"], {
    encoding: "utf8",
    timeout: 2000,
  });
  if (result.error || result.status !== 0) return [];
  return classifyAppServerProcesses(result.stdout);
}

export function buildAppServerDiscoveryReport(input: {
  cwd: string;
  command: string;
  controlSocketPath: string;
  controlSocketExists: boolean;
  daemonVersionProbe: AppServerDiscoveryReport["daemonVersionProbe"];
  processCandidates: AppServerProcessCandidate[];
  recordPath?: string | null;
}): AppServerDiscoveryReport {
  const attachable = input.processCandidates
    .map((candidate) => candidate.attachableSocket)
    .find((socket): socket is string => typeof socket === "string" && socket.length > 0);
  const candidateSocket = input.controlSocketExists ? input.controlSocketPath : attachable ?? null;
  const stdioCount = input.processCandidates.filter((candidate) => candidate.transport === "stdio" || candidate.transport === "stdio-default").length;
  const attachableCount = input.processCandidates.filter((candidate) => candidate.attachableSocket !== null).length + (input.controlSocketExists ? 1 : 0);
  const status: AppServerDiscoveryStatus = candidateSocket
    ? "candidate_socket_found"
    : input.processCandidates.length > 0 && stdioCount === input.processCandidates.length
      ? "stdio_only"
      : input.processCandidates.length === 0
        ? "no_app_server"
        : "unknown";
  const reason = status === "candidate_socket_found"
    ? "an explicit app-server socket candidate exists; Stage B still requires explicit --sock and read-only opt-in"
    : status === "stdio_only"
      ? "app-server processes are present, but they expose stdio transports only; Codexus cannot attach without a supported observer bridge"
      : status === "no_app_server"
        ? "no running codex app-server process was found by read-only process discovery"
        : "app-server process discovery was inconclusive";
  const promotionRecommendation: AppServerDiscoveryReport["stageBReadiness"]["promotionRecommendation"] = status === "candidate_socket_found"
    ? "run_live_read_only_with_explicit_socket"
    : status === "stdio_only"
      ? "design_stdio_observer"
      : "block_stage_b";
  return {
    schemaVersion: 1,
    stability: "experimental",
    command: "app-server discover",
    cwd: input.cwd,
    generatedAt: new Date().toISOString(),
    consent: {
      readOnly: true,
      remoteControlAutoEnabled: false,
      connectsToLiveSocket: false,
      startsDaemon: false,
    },
    controlSocket: {
      path: input.controlSocketPath,
      exists: input.controlSocketExists,
      source: "codex-default",
    },
    daemonVersionProbe: input.daemonVersionProbe,
    processes: {
      candidates: input.processCandidates,
      total: input.processCandidates.length,
      stdioCount,
      attachableCount,
    },
    stageBReadiness: {
      status,
      reason,
      candidateSocket,
      promotionRecommendation,
    },
    record: {
      enabled: input.recordPath !== null && input.recordPath !== undefined,
      path: input.recordPath ?? null,
    },
  };
}

export async function runAppServerDiscovery(input: {
  cwd: string;
  command: string;
  experimentDir: string;
  timeoutMs?: number;
  record: boolean;
}): Promise<{ report: AppServerDiscoveryReport; reportPath: string | null }> {
  const timeoutMs = input.timeoutMs ?? DEFAULT_DAEMON_VERSION_TIMEOUT_MS;
  const controlSocketPath = defaultAppServerControlSocketPath();
  const reportPath = input.record ? resolve(input.experimentDir, "discovery.json") : null;
  const report = buildAppServerDiscoveryReport({
    cwd: input.cwd,
    command: input.command,
    controlSocketPath,
    controlSocketExists: existsSync(controlSocketPath),
    daemonVersionProbe: runDaemonVersionProbe(input.command, timeoutMs),
    processCandidates: readProcessCandidates(),
    recordPath: reportPath,
  });
  if (reportPath) {
    await ensureDir(input.experimentDir);
    await writeJsonAtomic(reportPath, report);
  }
  return { report, reportPath };
}
