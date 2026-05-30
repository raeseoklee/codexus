import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { harnessRoot } from "../ledger/paths.ts";
import { ensureDir, writeJsonAtomic } from "../util/fs.ts";
import { withFileLock } from "../util/lock.ts";
import { codexHome, inspectNotifyHookConfig } from "./hook-config.ts";

export const CODEXUS_OVERLAY_START = "<!-- CODEXUS:RUNTIME:START -->";
export const CODEXUS_OVERLAY_END = "<!-- CODEXUS:RUNTIME:END -->";
export const CURRENT_SESSION_STATE_SCHEMA_VERSION = 1 as const;

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

export interface SessionHookEventRecord {
  id: string;
  event: string;
  observedAt: string;
  source: "notify";
  cwd: string;
}

export interface CodexusSessionState {
  schemaVersion: typeof CURRENT_SESSION_STATE_SCHEMA_VERSION;
  sessionId: string;
  cwd: string;
  status: "initialized";
  createdAt: string;
  updatedAt: string;
  lastCommand: string | null;
  checkpoints: SessionCheckpointRecord[];
  verifications: SessionVerificationRecord[];
  hookEvents: SessionHookEventRecord[];
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

export interface SessionStateMigrationReport {
  schemaVersion: 1;
  fromVersion: number | null;
  toVersion: typeof CURRENT_SESSION_STATE_SCHEMA_VERSION;
  migrated: boolean;
  applied: string[];
  reason: string | null;
}

export interface SessionStateReadResult {
  state: CodexusSessionState | null;
  migration: SessionStateMigrationReport;
}

export interface SessionStateMigrationFileResult {
  schemaVersion: 1;
  status: "not_initialized" | "current" | "migrated";
  dryRun: boolean;
  statePath: string;
  migration: SessionStateMigrationReport;
  state: CodexusSessionState | null;
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
  if (!Array.isArray(value.checkpoints) || !Array.isArray(value.verifications) || !Array.isArray(value.hookEvents) || !Array.isArray(value.linkedRunIds)) return false;
  if (!isRecord(value.capabilities)) return false;
  if (!(value.capabilities.tmux === "available" || value.capabilities.tmux === "unavailable")) return false;
  if (!(value.capabilities.hooks === "available" || value.capabilities.hooks === "unavailable")) return false;
  if (!(value.capabilities.statusline === "available" || value.capabilities.statusline === "unavailable")) return false;
  if (!isRecord(value.overlays)) return false;
  return isOverlayStatus(value.overlays.project) && isOverlayStatus(value.overlays.user);
}

function migrationReport(options: {
  fromVersion: number | null;
  migrated?: boolean;
  applied?: string[];
  reason?: string | null;
}): SessionStateMigrationReport {
  return {
    schemaVersion: 1,
    fromVersion: options.fromVersion,
    toVersion: CURRENT_SESSION_STATE_SCHEMA_VERSION,
    migrated: options.migrated ?? false,
    applied: options.applied ?? [],
    reason: options.reason ?? null,
  };
}

function schemaVersionOf(value: Record<string, unknown>): number | null {
  return typeof value.schemaVersion === "number" ? value.schemaVersion : null;
}

function migrateSessionState(value: unknown): { value: unknown; report: SessionStateMigrationReport } {
  if (!isRecord(value)) return { value, report: migrationReport({ fromVersion: null, reason: "not_an_object" }) };
  const fromVersion = schemaVersionOf(value);
  if (fromVersion !== CURRENT_SESSION_STATE_SCHEMA_VERSION) {
    return {
      value,
      report: migrationReport({
        fromVersion,
        reason: fromVersion === null ? "missing_schema_version" : `unsupported_schema_version:${fromVersion}`,
      }),
    };
  }

  const applied: string[] = [];
  let next: Record<string, unknown> = value;
  if (!Object.hasOwn(next, "hookEvents")) {
    next = {
      ...next,
      hookEvents: [],
    };
    applied.push("session_state_v1.add_hook_events");
  }
  return {
    value: next,
    report: migrationReport({
      fromVersion,
      migrated: applied.length > 0,
      applied,
    }),
  };
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
    "- Ground Codexus claims in command output, ledger state, or artifacts under `.codexus/`.",
    "- Treat unavailable hooks, statusline integration, or Codex private session APIs as unsupported instead of pretending they are active.",
    "",
    "Session state lives under `.codexus/session/`.",
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

export async function detectSessionCapabilities(cwd = process.cwd()): Promise<CodexusSessionState["capabilities"]> {
  const tmux = spawnSync("tmux", ["-V"], { encoding: "utf8" });
  const notifyHook = await inspectNotifyHookConfig(cwd);
  return {
    tmux: tmux.status === 0 ? "available" : "unavailable",
    hooks: notifyHook.installed ? "available" : "unavailable",
    statusline: "unavailable",
  };
}

async function defaultState(cwd: string): Promise<CodexusSessionState> {
  const createdAt = nowIso();
  return {
    schemaVersion: CURRENT_SESSION_STATE_SCHEMA_VERSION,
    sessionId: createId("session"),
    cwd: resolve(cwd),
    status: "initialized",
    createdAt,
    updatedAt: createdAt,
    lastCommand: null,
    checkpoints: [],
    verifications: [],
    hookEvents: [],
    linkedRunIds: [],
    capabilities: await detectSessionCapabilities(cwd),
    overlays: {
      project: await overlayStatus(cwd, "project"),
      user: await overlayStatus(cwd, "user"),
    },
  };
}

export async function readSessionState(cwd: string): Promise<CodexusSessionState | null> {
  return (await readSessionStateWithMigration(cwd)).state;
}

export async function readSessionStateWithMigration(cwd: string): Promise<SessionStateReadResult> {
  const paths = sessionPaths(cwd);
  if (!existsSync(paths.state)) {
    return {
      state: null,
      migration: migrationReport({
        fromVersion: null,
        reason: "not_initialized",
      }),
    };
  }
  try {
    const parsed = JSON.parse(await readFile(paths.state, "utf8")) as unknown;
    const migrated = migrateSessionState(parsed);
    if (migrated.report.reason) throw new Error(migrated.report.reason);
    if (!isSessionState(migrated.value)) throw new Error("invalid_shape");
    return {
      state: migrated.value,
      migration: migrated.report,
    };
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
  const existing = await readSessionStateWithMigration(cwd);
  if (existing.state) {
    const refreshed = await refreshSessionState(cwd, existing.state);
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

export async function migrateSessionStateFile(cwd: string, options: { dryRun?: boolean } = {}): Promise<SessionStateMigrationFileResult> {
  return await withFileLock(cwd, "session", async () => {
    const paths = sessionPaths(cwd);
    const result = await readSessionStateWithMigration(cwd);
    if (!result.state) {
      return {
        schemaVersion: 1,
        status: "not_initialized",
        dryRun: options.dryRun ?? false,
        statePath: paths.state,
        migration: result.migration,
        state: null,
      };
    }
    if (result.migration.migrated && !options.dryRun) {
      await writeSessionState(cwd, result.state);
    }
    return {
      schemaVersion: 1,
      status: result.migration.migrated ? "migrated" : "current",
      dryRun: options.dryRun ?? false,
      statePath: paths.state,
      migration: result.migration,
      state: result.state,
    };
  }, {
    operation: "session-migrate",
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
    capabilities: await detectSessionCapabilities(cwd),
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

export function createHookEventId(): string {
  return createId("hook");
}

export async function recordSessionHookEvent(cwd: string, event: string): Promise<{ record: SessionHookEventRecord; state: CodexusSessionState }> {
  const record: SessionHookEventRecord = {
    id: createHookEventId(),
    event,
    observedAt: nowIso(),
    source: "notify",
    cwd: resolve(cwd),
  };
  const state = await updateSessionState(cwd, "session notify", (value) => ({
    ...value,
    hookEvents: [...value.hookEvents, record].slice(-20),
  }));
  return { record, state };
}
