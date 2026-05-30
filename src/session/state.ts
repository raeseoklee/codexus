import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { harnessRoot } from "../ledger/paths.ts";
import { ensureDir, writeJsonAtomic } from "../util/fs.ts";

export const CODEXUS_OVERLAY_START = "<!-- CODEXUS:RUNTIME:START -->";
export const CODEXUS_OVERLAY_END = "<!-- CODEXUS:RUNTIME:END -->";

export type OverlayScope = "project" | "user";
export type CapabilityStatus = "available" | "unavailable";

export interface OverlayStatus {
  scope: OverlayScope;
  path: string;
  installed: boolean;
  markerStart: string;
  markerEnd: string;
}

export interface SessionCheckpointRecord {
  id: string;
  label: string;
  createdAt: string;
  path: string;
  metadataPath: string;
}

export interface SessionVerificationRecord {
  id: string;
  createdAt: string;
  status: string;
  commands: string[];
  path: string;
  artifactsDir: string;
}

export interface CodexusSessionState {
  schemaVersion: 1;
  sessionId: string;
  cwd: string;
  status: "initialized";
  createdAt: string;
  updatedAt: string;
  lastCommand: string | null;
  checkpoints: SessionCheckpointRecord[];
  verifications: SessionVerificationRecord[];
  linkedRunIds: string[];
  capabilities: {
    tmux: CapabilityStatus;
    hooks: CapabilityStatus;
    statusline: CapabilityStatus;
  };
  overlays: {
    project: OverlayStatus;
    user: OverlayStatus;
  };
}

export interface SessionPaths {
  root: string;
  sessionRoot: string;
  state: string;
  checkpointsDir: string;
  verificationDir: string;
  contextDir: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function createId(prefix: string): string {
  const date = new Date();
  const stamp = [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
    "_",
    String(date.getUTCHours()).padStart(2, "0"),
    String(date.getUTCMinutes()).padStart(2, "0"),
    String(date.getUTCSeconds()).padStart(2, "0"),
  ].join("");
  return `${prefix}_${stamp}_${randomBytes(3).toString("hex")}`;
}

export function sessionPaths(cwd = process.cwd()): SessionPaths {
  const root = harnessRoot(cwd);
  const sessionRoot = join(root, "session");
  return {
    root,
    sessionRoot,
    state: join(sessionRoot, "state.json"),
    checkpointsDir: join(sessionRoot, "checkpoints"),
    verificationDir: join(sessionRoot, "verification"),
    contextDir: join(sessionRoot, "context"),
  };
}

export function codexHome(): string {
  return process.env.CODEX_HOME ? resolve(process.env.CODEX_HOME) : join(homedir(), ".codex");
}

export function overlayPath(cwd: string, scope: OverlayScope): string {
  return scope === "project" ? join(resolve(cwd), "AGENTS.md") : join(codexHome(), "AGENTS.md");
}

export function hasCodexusOverlay(text: string): boolean {
  return text.includes(CODEXUS_OVERLAY_START) && text.includes(CODEXUS_OVERLAY_END);
}

function overlayBody(): string {
  return [
    CODEXUS_OVERLAY_START,
    "# Codexus Runtime Overlay",
    "",
    "Codexus is attached to this Codex session as a local harness layer.",
    "",
    "Operating rules:",
    "- Keep ordinary edits, review, and explanation work in the current Codex session.",
    "- Use Codexus when durable evidence, session checkpoints, verification artifacts, memory, replay, or skill review are useful.",
    "- Prefer `cx session status --json`, `cx session checkpoint <label> --json`, and `cx session verify --verify <cmd> --json` before starting nested supervised runs.",
    "- Use `cx run --driver codex-exec` only for an explicit bounded supervised sub-run.",
    "- Ground Codexus claims in command output, ledger state, or artifacts under `.codex-harness/`.",
    "- Treat unavailable hooks, statusline integration, or Codex private session APIs as unsupported instead of pretending they are active.",
    "",
    "Session state lives under `.codex-harness/session/`.",
    CODEXUS_OVERLAY_END,
  ].join("\n");
}

export async function overlayStatus(cwd: string, scope: OverlayScope): Promise<OverlayStatus> {
  const path = overlayPath(cwd, scope);
  let installed = false;
  if (existsSync(path)) {
    installed = hasCodexusOverlay(await readFile(path, "utf8"));
  }
  return {
    scope,
    path,
    installed,
    markerStart: CODEXUS_OVERLAY_START,
    markerEnd: CODEXUS_OVERLAY_END,
  };
}

export async function installOverlay(cwd: string, scope: OverlayScope): Promise<OverlayStatus & { changed: boolean }> {
  const path = overlayPath(cwd, scope);
  const existing = existsSync(path) ? await readFile(path, "utf8") : "";
  const body = overlayBody();
  let next: string;
  if (hasCodexusOverlay(existing)) {
    const start = existing.indexOf(CODEXUS_OVERLAY_START);
    const end = existing.indexOf(CODEXUS_OVERLAY_END, start);
    next = `${existing.slice(0, start)}${body}${existing.slice(end + CODEXUS_OVERLAY_END.length)}`;
  } else {
    const prefix = existing.length > 0 && !existing.endsWith("\n") ? `${existing}\n\n` : existing;
    next = `${prefix}${body}\n`;
  }
  const changed = next !== existing;
  if (changed) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, next);
  }
  return { ...(await overlayStatus(cwd, scope)), changed };
}

export function detectSessionCapabilities(): CodexusSessionState["capabilities"] {
  const tmux = spawnSync("tmux", ["-V"], { encoding: "utf8" });
  return {
    tmux: tmux.status === 0 ? "available" : "unavailable",
    hooks: "unavailable",
    statusline: "unavailable",
  };
}

async function defaultState(cwd: string): Promise<CodexusSessionState> {
  const createdAt = nowIso();
  return {
    schemaVersion: 1,
    sessionId: createId("session"),
    cwd: resolve(cwd),
    status: "initialized",
    createdAt,
    updatedAt: createdAt,
    lastCommand: null,
    checkpoints: [],
    verifications: [],
    linkedRunIds: [],
    capabilities: detectSessionCapabilities(),
    overlays: {
      project: await overlayStatus(cwd, "project"),
      user: await overlayStatus(cwd, "user"),
    },
  };
}

export async function readSessionState(cwd: string): Promise<CodexusSessionState | null> {
  const paths = sessionPaths(cwd);
  if (!existsSync(paths.state)) return null;
  try {
    const parsed = JSON.parse(await readFile(paths.state, "utf8")) as CodexusSessionState;
    return parsed;
  } catch (error) {
    throw new Error(`session_state_corrupt:${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function loadOrCreateSessionState(cwd: string): Promise<CodexusSessionState> {
  const paths = sessionPaths(cwd);
  await ensureDir(paths.sessionRoot);
  await ensureDir(paths.checkpointsDir);
  await ensureDir(paths.verificationDir);
  await ensureDir(paths.contextDir);
  const existing = await readSessionState(cwd);
  if (existing) {
    const refreshed = await refreshSessionState(cwd, existing);
    await writeSessionState(cwd, refreshed);
    return refreshed;
  }
  const created = await defaultState(cwd);
  await writeSessionState(cwd, created);
  return created;
}

export async function writeSessionState(cwd: string, state: CodexusSessionState): Promise<void> {
  await writeJsonAtomic(sessionPaths(cwd).state, state);
}

export async function refreshSessionState(cwd: string, state: CodexusSessionState): Promise<CodexusSessionState> {
  return {
    ...state,
    cwd: resolve(cwd),
    updatedAt: nowIso(),
    capabilities: detectSessionCapabilities(),
    overlays: {
      project: await overlayStatus(cwd, "project"),
      user: await overlayStatus(cwd, "user"),
    },
  };
}

export async function updateSessionState(
  cwd: string,
  command: string,
  update: (state: CodexusSessionState) => CodexusSessionState,
): Promise<CodexusSessionState> {
  const base = await loadOrCreateSessionState(cwd);
  const updated = await refreshSessionState(cwd, {
    ...update(base),
    lastCommand: command,
    updatedAt: nowIso(),
  });
  await writeSessionState(cwd, updated);
  return updated;
}

export function createCheckpointId(): string {
  return createId("checkpoint");
}

export function createVerificationId(): string {
  return createId("verification");
}
