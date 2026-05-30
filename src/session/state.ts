import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { harnessRoot } from "../ledger/paths.ts";
import { ensureDir, writeJsonAtomic } from "../util/fs.ts";
import { withFileLock } from "../util/lock.ts";
import { codexHome, inspectNotifyHookConfig } from "./hook-config.ts";
import { deriveEvidenceModel, type EvidenceModel } from "./evidence.ts";
import { detectVerifyCandidates } from "./verify-detect.ts";
import { computeWorkspaceFingerprint, isWorkspaceFingerprint, type WorkspaceFingerprint } from "./workspace-fingerprint.ts";

export const CODEXUS_OVERLAY_START = "<!-- CODEXUS:RUNTIME:START -->";
export const CODEXUS_OVERLAY_END = "<!-- CODEXUS:RUNTIME:END -->";
export const CURRENT_SESSION_STATE_SCHEMA_VERSION = 3 as const;

export type OverlayScope = "project" | "user";
export type OverlayProfile = "default" | "always-on";
export type CapabilityStatus = "available" | "unavailable";
export type HookCapabilityStatus = "available" | "configured" | "unavailable";
export type NotifyDispatchStatus = "observed" | "unobserved" | "not_configured";
export type RuntimeSurface = "unknown" | "cli-tui" | "desktop-app-server";

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
  workspaceFingerprint: WorkspaceFingerprint | null;
}

export interface LastVerifiedFingerprint {
  verificationId: string;
  status: string;
  recordedAt: string;
  fingerprint: WorkspaceFingerprint;
}

export interface SessionHookEventRecord {
  id: string;
  event: string;
  observedAt: string;
  source: "notify";
  cwd: string;
  runtimeSurface: RuntimeSurface;
  process: {
    pid: number;
    ppid: number;
    cwd: string;
    bundleIdentifier: string | null;
  };
  heartbeatEvidence?: EvidenceModel | null;
}

export interface NotifyDispatchState {
  status: NotifyDispatchStatus;
  lastTurnEndedAt: string | null;
  lastObservedAt: string | null;
  runtimeSurface: RuntimeSurface;
  caveat: string;
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
  lastVerifiedFingerprint: LastVerifiedFingerprint | null;
  hookEvents: SessionHookEventRecord[];
  linkedRunIds: string[];
  capabilities: {
    tmux: CapabilityStatus;
    hooks: HookCapabilityStatus;
    statusline: CapabilityStatus;
  };
  notifyDispatch: NotifyDispatchState;
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

function isRuntimeSurface(value: unknown): value is RuntimeSurface {
  return value === "unknown" || value === "cli-tui" || value === "desktop-app-server";
}

function isNotifyDispatchState(value: unknown): value is NotifyDispatchState {
  if (!isRecord(value)) return false;
  return (value.status === "observed" || value.status === "unobserved" || value.status === "not_configured")
    && (value.lastTurnEndedAt === null || typeof value.lastTurnEndedAt === "string")
    && (value.lastObservedAt === null || typeof value.lastObservedAt === "string")
    && isRuntimeSurface(value.runtimeSurface)
    && typeof value.caveat === "string";
}

function isSessionHookEventRecord(value: unknown): value is SessionHookEventRecord {
  if (!isRecord(value)) return false;
  if (typeof value.id !== "string" || typeof value.event !== "string" || typeof value.observedAt !== "string") return false;
  if (value.source !== "notify" || typeof value.cwd !== "string") return false;
  if (!isRuntimeSurface(value.runtimeSurface)) return false;
  if (!isRecord(value.process)) return false;
  return typeof value.process.pid === "number"
    && typeof value.process.ppid === "number"
    && typeof value.process.cwd === "string"
    && (value.process.bundleIdentifier === null || typeof value.process.bundleIdentifier === "string")
    && (
      value.heartbeatEvidence === undefined
      || value.heartbeatEvidence === null
      || isRecord(value.heartbeatEvidence)
    );
}

function isSessionVerificationRecord(value: unknown): value is SessionVerificationRecord {
  if (!isRecord(value)) return false;
  if (typeof value.id !== "string" || typeof value.createdAt !== "string" || typeof value.status !== "string") return false;
  if (!Array.isArray(value.commands) || !value.commands.every((item) => typeof item === "string")) return false;
  if (typeof value.path !== "string" || typeof value.artifactsDir !== "string") return false;
  if (!(value.workspaceFingerprint === null || isWorkspaceFingerprint(value.workspaceFingerprint))) return false;
  return true;
}

function isLastVerifiedFingerprint(value: unknown): value is LastVerifiedFingerprint {
  if (!isRecord(value)) return false;
  return typeof value.verificationId === "string"
    && typeof value.status === "string"
    && typeof value.recordedAt === "string"
    && isWorkspaceFingerprint(value.fingerprint);
}

function isSessionState(value: unknown): value is CodexusSessionState {
  if (!isRecord(value)) return false;
  if (value.schemaVersion !== CURRENT_SESSION_STATE_SCHEMA_VERSION) return false;
  if (typeof value.sessionId !== "string" || typeof value.cwd !== "string") return false;
  if (value.status !== "initialized") return false;
  if (typeof value.createdAt !== "string" || typeof value.updatedAt !== "string") return false;
  if (!(value.lastCommand === null || typeof value.lastCommand === "string")) return false;
  if (!Array.isArray(value.checkpoints) || !Array.isArray(value.verifications) || !Array.isArray(value.hookEvents) || !Array.isArray(value.linkedRunIds)) return false;
  if (!value.verifications.every(isSessionVerificationRecord)) return false;
  if (!(value.lastVerifiedFingerprint === null || isLastVerifiedFingerprint(value.lastVerifiedFingerprint))) return false;
  if (!value.hookEvents.every(isSessionHookEventRecord)) return false;
  if (!isRecord(value.capabilities)) return false;
  if (!(value.capabilities.tmux === "available" || value.capabilities.tmux === "unavailable")) return false;
  if (!(value.capabilities.hooks === "available" || value.capabilities.hooks === "configured" || value.capabilities.hooks === "unavailable")) return false;
  if (!(value.capabilities.statusline === "available" || value.capabilities.statusline === "unavailable")) return false;
  if (!isNotifyDispatchState(value.notifyDispatch)) return false;
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

function normalizeRuntimeSurface(value: unknown): RuntimeSurface {
  return isRuntimeSurface(value) ? value : "unknown";
}

function normalizeHookProcess(value: unknown, cwd: string): SessionHookEventRecord["process"] {
  if (isRecord(value)
    && typeof value.pid === "number"
    && typeof value.ppid === "number"
    && typeof value.cwd === "string"
    && (value.bundleIdentifier === null || typeof value.bundleIdentifier === "string")) {
    return {
      pid: value.pid,
      ppid: value.ppid,
      cwd: value.cwd,
      bundleIdentifier: value.bundleIdentifier,
    };
  }
  return {
    pid: 0,
    ppid: 0,
    cwd,
    bundleIdentifier: null,
  };
}

function normalizeHookEvents(value: unknown, fallbackCwd: string): SessionHookEventRecord[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item)
      || typeof item.id !== "string"
      || typeof item.event !== "string"
      || typeof item.observedAt !== "string"
      || item.source !== "notify"
      || typeof item.cwd !== "string") {
      return [];
    }
    return [{
      id: item.id,
      event: item.event,
      observedAt: item.observedAt,
      source: "notify" as const,
      cwd: item.cwd,
      runtimeSurface: normalizeRuntimeSurface(item.runtimeSurface),
      process: normalizeHookProcess(item.process, item.cwd || fallbackCwd),
      heartbeatEvidence: isRecord(item.heartbeatEvidence) ? item.heartbeatEvidence as unknown as EvidenceModel : null,
    }];
  });
}

function latestHookEvent(events: SessionHookEventRecord[], eventName?: string): SessionHookEventRecord | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (!eventName || events[index].event === eventName) return events[index];
  }
  return null;
}

function notifyDispatchCaveat(status: NotifyDispatchStatus): string {
  if (status === "observed") {
    return "Codexus has observed at least one real turn-ended notify event. Runtime surface is captured from the hook process when available.";
  }
  if (status === "unobserved") {
    return "Codexus notify is configured in Codex CLI config, but no real turn-ended dispatch has been observed for this session state. Manual smoke events do not prove live dispatch; Desktop/app-server sessions may not invoke CLI notify.";
  }
  return "Codexus notify is not configured in Codex CLI config.";
}

export function deriveNotifyDispatch(events: SessionHookEventRecord[], notifyConfigured: boolean): NotifyDispatchState {
  const lastObserved = latestHookEvent(events);
  const lastTurnEnded = latestHookEvent(events, "turn-ended");
  const status: NotifyDispatchStatus = notifyConfigured
    ? lastTurnEnded ? "observed" : "unobserved"
    : "not_configured";
  return {
    status,
    lastTurnEndedAt: lastTurnEnded?.observedAt ?? null,
    lastObservedAt: lastObserved?.observedAt ?? null,
    runtimeSurface: lastTurnEnded?.runtimeSurface ?? "unknown",
    caveat: notifyDispatchCaveat(status),
  };
}

function hooksCapabilityFromDispatch(dispatch: NotifyDispatchState): HookCapabilityStatus {
  if (dispatch.status === "observed") return "available";
  if (dispatch.status === "unobserved") return "configured";
  return "unavailable";
}

// v1 -> v2: add hookEvents and derived notifyDispatch. Leaves schemaVersion at 2;
// the v2 -> v3 step finishes the chain so forward migration stays additive.
function migrateV1SessionState(value: Record<string, unknown>, applied: string[]): Record<string, unknown> {
  let next: Record<string, unknown> = value;
  if (!Object.hasOwn(next, "hookEvents")) {
    next = {
      ...next,
      hookEvents: [],
    };
    applied.push("session_state_v1.add_hook_events");
  }
  const hookEvents = normalizeHookEvents(next.hookEvents, typeof next.cwd === "string" ? next.cwd : "");
  const previousHooksConfigured = isRecord(next.capabilities) && next.capabilities.hooks === "available";
  const notifyDispatch = deriveNotifyDispatch(hookEvents, previousHooksConfigured);
  next = {
    ...next,
    schemaVersion: 2,
    hookEvents,
    notifyDispatch,
    capabilities: {
      ...(isRecord(next.capabilities) ? next.capabilities : {}),
      hooks: hooksCapabilityFromDispatch(notifyDispatch),
    },
  };
  applied.push("session_state_v2.add_notify_dispatch");
  return next;
}

// v2 -> v3: introduce the workspace-fingerprint evidence model. Existing
// verification records gain an explicit `workspaceFingerprint: null` (they were
// recorded before fingerprints existed and cannot be reconstructed), and the
// state gains `lastVerifiedFingerprint: null`. Defaulting to null is honest: a
// migrated state has no fingerprint evidence until the next verify run.
function migrateV2SessionState(value: Record<string, unknown>, applied: string[]): Record<string, unknown> {
  const verifications = Array.isArray(value.verifications)
    ? value.verifications.map((record) => (
      isRecord(record) && !Object.hasOwn(record, "workspaceFingerprint")
        ? { ...record, workspaceFingerprint: null }
        : record
    ))
    : value.verifications;
  const next: Record<string, unknown> = {
    ...value,
    schemaVersion: 3,
    verifications,
    lastVerifiedFingerprint: Object.hasOwn(value, "lastVerifiedFingerprint")
      ? value.lastVerifiedFingerprint
      : null,
  };
  applied.push("session_state_v3.add_workspace_fingerprint");
  return next;
}

function migrateSessionState(value: unknown): { value: unknown; report: SessionStateMigrationReport } {
  if (!isRecord(value)) return { value, report: migrationReport({ fromVersion: null, reason: "not_an_object" }) };
  const fromVersion = schemaVersionOf(value);
  const applied: string[] = [];
  if (fromVersion === 1 || fromVersion === 2) {
    let next: Record<string, unknown> = value;
    if (fromVersion === 1) next = migrateV1SessionState(next, applied);
    next = migrateV2SessionState(next, applied);
    return {
      value: next,
      report: migrationReport({
        fromVersion,
        migrated: applied.length > 0,
        applied,
      }),
    };
  }
  if (fromVersion !== CURRENT_SESSION_STATE_SCHEMA_VERSION) {
    return {
      value,
      report: migrationReport({
        fromVersion,
        reason: fromVersion === null ? "missing_schema_version" : `unsupported_schema_version:${fromVersion}`,
      }),
    };
  }

  return {
    value,
    report: migrationReport({
      fromVersion,
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

function overlayBody(profile: OverlayProfile = "default"): string {
  const alwaysOnLines = profile === "always-on"
    ? [
      "- Always-on profile: before code-changing work, create or update a Codexus checkpoint when it would help future recovery.",
      "- Always-on profile: before claiming completion, run or request an explicit `cx session verify --verify <cmd> --json` or `cx session verify --auto --execute --json` when a safe verification command is known.",
      "- Always-on profile: if verification is missing, failed, stale, or degraded, say so plainly; truth comes from `cx session status --json`, not from this overlay being present.",
      "- Always-on profile: notify hook heartbeats may record derived evidence snapshots, but they must never execute verification or turn stale evidence fresh by themselves.",
    ]
    : [];
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
    ...alwaysOnLines,
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

export async function installOverlay(cwd: string, scope: OverlayScope, profile: OverlayProfile = "default"): Promise<OverlayStatus & { changed: boolean; profile: OverlayProfile }> {
  const path = overlayPath(cwd, scope);
  const existing = existsSync(path) ? await readFile(path, "utf8") : "";
  const body = overlayBody(profile);
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
  return { ...(await overlayStatus(cwd, scope)), changed, profile };
}

export async function detectSessionCapabilities(cwd = process.cwd(), dispatch?: NotifyDispatchState): Promise<CodexusSessionState["capabilities"]> {
  const tmux = spawnSync("tmux", ["-V"], { encoding: "utf8" });
  const resolvedDispatch = dispatch ?? deriveNotifyDispatch([], (await inspectNotifyHookConfig(cwd)).installed);
  return {
    tmux: tmux.status === 0 ? "available" : "unavailable",
    hooks: hooksCapabilityFromDispatch(resolvedDispatch),
    statusline: "unavailable",
  };
}

async function defaultState(cwd: string): Promise<CodexusSessionState> {
  const createdAt = nowIso();
  const notifyDispatch = deriveNotifyDispatch([], (await inspectNotifyHookConfig(cwd)).installed);
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
    lastVerifiedFingerprint: null,
    hookEvents: [],
    linkedRunIds: [],
    capabilities: await detectSessionCapabilities(cwd, notifyDispatch),
    notifyDispatch,
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
  const notifyDispatch = deriveNotifyDispatch(state.hookEvents, (await inspectNotifyHookConfig(cwd)).installed);
  return {
    ...state,
    cwd: resolve(cwd),
    updatedAt: nowIso(),
    capabilities: await detectSessionCapabilities(cwd, notifyDispatch),
    notifyDispatch,
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

function runtimeSurfaceFromEnv(env: NodeJS.ProcessEnv): RuntimeSurface {
  const explicit = env.CODEXUS_NOTIFY_RUNTIME_SURFACE;
  return isRuntimeSurface(explicit) ? explicit : "unknown";
}

function hookProcessContext(cwd: string): SessionHookEventRecord["process"] {
  return {
    pid: process.pid,
    ppid: process.ppid,
    cwd: resolve(cwd),
    bundleIdentifier: process.env.__CFBundleIdentifier ?? null,
  };
}

export async function recordSessionHookEvent(cwd: string, event: string): Promise<{ record: SessionHookEventRecord; state: CodexusSessionState }> {
  const base = await loadOrCreateSessionState(cwd);
  const heartbeatEvidence = event === "turn-ended"
    ? deriveEvidenceModel(
      base,
      computeWorkspaceFingerprint(cwd),
      detectVerifyCandidates(cwd).recommended,
    )
    : null;
  const record: SessionHookEventRecord = {
    id: createHookEventId(),
    event,
    observedAt: nowIso(),
    source: "notify",
    cwd: resolve(cwd),
    runtimeSurface: runtimeSurfaceFromEnv(process.env),
    process: hookProcessContext(cwd),
    heartbeatEvidence,
  };
  const state = await updateSessionState(cwd, "session notify", (value) => ({
    ...value,
    hookEvents: [...value.hookEvents, record].slice(-20),
  }));
  return { record, state };
}
