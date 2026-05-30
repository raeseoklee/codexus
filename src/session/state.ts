import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { harnessRoot } from "../ledger/paths.ts";
import { ensureDir, writeJsonAtomic } from "../util/fs.ts";
import { withFileLock } from "../util/lock.ts";

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

interface OverlayRange {
  start: number;
  endAfter: number;
}

export interface SessionPaths {
  root: string;
  sessionRoot: string;
  state: string;
  checkpointsDir: string;
  verificationDir: string;
  contextDir: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOverlayStatus(value: unknown): value is OverlayStatus {
  if (!isRecord(value)) return false;
  return (value.scope === "project" || value.scope === "user")
    && typeof value.path === "string"
    && typeof value.installed === "boolean"
    && typeof value.markerStart === "string"
    && typeof value.markerEnd === "string";
}

function isSessionState(value: unknown): value is CodexusSessionState {
  if (!isRecord(value)) return false;
  if (value.schemaVersion !== 1) return false;
  if (typeof value.sessionId !== "string" || typeof value.cwd !== "string") return false;
  if (value.status !== "initialized") return false;
  if (typeof value.createdAt !== "string" || typeof value.updatedAt !== "string") return false;
  if (!(value.lastCommand === null || typeof value.lastCommand === "string")) return false;
  if (!Array.isArray(value.checkpoints) || !Array.isArray(value.verifications) || !Array.isArray(value.linkedRunIds)) return false;
  if (!isRecord(value.capabilities)) return false;
  if (!(value.capabilities.tmux === "available" || value.capabilities.tmux === "unavailable")) return false;
  if (!(value.capabilities.hooks === "available" || value.capabilities.hooks === "unavailable")) return false;
  if (!(value.capabilities.statusline === "available" || value.capabilities.statusline === "unavailable")) return false;
  if (!isRecord(value.overlays)) return false;
  return isOverlayStatus(value.overlays.project) && isOverlayStatus(value.overlays.user);
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
  return findOverlayRange(text) !== null;
}

function findOverlayRange(text: string): OverlayRange | null {
  let searchFrom = 0;
  while (searchFrom < text.length) {
    const start = text.indexOf(CODEXUS_OVERLAY_START, searchFrom);
    if (start === -1) return null;
    const afterStart = start + CODEXUS_OVERLAY_START.length;
    const end = text.indexOf(CODEXUS_OVERLAY_END, afterStart);
    const nextStart = text.indexOf(CODEXUS_OVERLAY_START, afterStart);
    if (end !== -1 && (nextStart === -1 || end < nextStart)) {
      return { start, endAfter: end + CODEXUS_OVERLAY_END.length };
    }
    searchFrom = nextStart === -1 ? afterStart : nextStart;
  }
  return null;
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

async function writeTextAtomic(path: string, text: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = join(dirname(path), `.${basename(path)}.${process.pid}.${Date.now()}.tmp`);
  await writeFile(tmp, text);
  await rename(tmp, path);
}

async function writeBackupOnce(path: string, text: string): Promise<string | null> {
  if (!existsSync(path) || text.length === 0) return null;
  const backupPath = `${path}.codexus.bak`;
  if (existsSync(backupPath)) return backupPath;
  await writeTextAtomic(backupPath, text);
  return backupPath;
}

export async function installOverlay(cwd: string, scope: OverlayScope): Promise<OverlayStatus & { changed: boolean }> {
  const path = overlayPath(cwd, scope);
  const existing = existsSync(path) ? await readFile(path, "utf8") : "";
  const body = overlayBody();
  let next: string;
  const range = findOverlayRange(existing);
  if (range) {
    next = `${existing.slice(0, range.start)}${body}${existing.slice(range.endAfter)}`;
  } else {
    const prefix = existing.length > 0 && !existing.endsWith("\n") ? `${existing}\n\n` : existing;
    next = `${prefix}${body}\n`;
  }
  const changed = next !== existing;
  if (changed) {
    await writeBackupOnce(path, existing);
    await writeTextAtomic(path, next);
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
    const parsed = JSON.parse(await readFile(paths.state, "utf8")) as unknown;
    if (!isSessionState(parsed)) throw new Error("invalid_shape");
    return parsed;
  } catch (error) {
    throw new Error(`session_state_corrupt:${error instanceof Error ? error.message : String(error)}`);
  }
}

async function loadOrCreateSessionStateUnlocked(cwd: string): Promise<CodexusSessionState> {
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

export async function loadOrCreateSessionState(cwd: string): Promise<CodexusSessionState> {
  return await withFileLock(cwd, "session", async () => await loadOrCreateSessionStateUnlocked(cwd), {
    operation: "session-state",
  });
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
  return await withFileLock(cwd, "session", async () => {
    const base = await loadOrCreateSessionStateUnlocked(cwd);
    const updated = await refreshSessionState(cwd, {
      ...update(base),
      lastCommand: command,
      updatedAt: nowIso(),
    });
    await writeSessionState(cwd, updated);
    return updated;
  }, {
    operation: command,
  });
}

export function createCheckpointId(): string {
  return createId("checkpoint");
}

export function createVerificationId(): string {
  return createId("verification");
}
