import { createHash, randomBytes } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { existsSync } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { harnessRoot } from "../ledger/paths.ts";
import { redactSensitiveText } from "../policy/redaction.ts";
import { ensureDir, writeJsonAtomic } from "../util/fs.ts";
import { withFileLock } from "../util/lock.ts";
import { findCodexusPackageRoot } from "../util/package-root.ts";

export type AppInstanceHealthStatus = "passed" | "failed" | "unknown" | "unavailable";
export type AppInstanceStatus = "running" | "stopped" | "orphaned" | "unknown";
export type AppInstanceLifecycleState =
  | "managed_running"
  | "managed_stopped"
  | "orphaned_live_process"
  | "orphaned_dead_artifact"
  | "unmanaged_or_unverifiable";
export type AppInstanceStopPolicy =
  | "requires_owner_identity_check"
  | "unavailable"
  | "not_needed";
export type AppInstanceCleanupPolicy = "none" | "manual_review";

export interface AppInstancePortDescriptor {
  mode: "allocate" | "fixed";
  preferred: number | null;
}

export interface AppInstanceHealthDescriptor {
  type: "http";
  url: string;
  timeoutMs: number;
}

export interface AppInstanceLogDescriptor {
  stdout: boolean;
  stderr: boolean;
}

export interface AppInstanceProfile {
  name: string;
  cwd: string;
  command: string[];
  port: AppInstancePortDescriptor;
  health: AppInstanceHealthDescriptor | null;
  log: AppInstanceLogDescriptor;
}

export interface AppInstanceDescriptor {
  schemaVersion: 1;
  stability: "experimental";
  profiles: AppInstanceProfile[];
}

export interface AppInstanceDescriptorValidation {
  schemaVersion: 1;
  valid: boolean;
  errors: string[];
  descriptor: AppInstanceDescriptor | null;
}

export interface AppInstanceDescriptorResolution {
  declared: boolean;
  source: "flag" | "codexus.app-instances.json" | "package.json#codexus.appInstances" | null;
  path: string | null;
  validation: AppInstanceDescriptorValidation;
}

export interface AppInstanceArtifact {
  schemaVersion: 1;
  stability: "experimental";
  type: "codexus.app.instance";
  instanceId: string;
  worktree: {
    path: string;
    branch: string | null;
    head: string | null;
  };
  profile: string;
  owner: {
    ownedByCodexus: boolean;
    ownerTokenHash: string | null;
    pid: number | null;
    processGroupId: number | null;
    runnerStartMarker?: string | null;
    heartbeatPath: string | null;
  };
  network: {
    host: "127.0.0.1";
    port: number | null;
    url: string | null;
  };
  health: {
    status: AppInstanceHealthStatus;
    lastCheckedAt: string | null;
    evidencePath: string | null;
    url?: string | null;
    timeoutMs?: number | null;
  };
  logs: {
    stdoutPath: string | null;
    stderrPath: string | null;
  };
  status: AppInstanceStatus;
}

export interface AppInstanceArtifactValidation {
  path: string;
  valid: boolean;
  errors: string[];
  artifact: AppInstanceArtifact | null;
}

export type AppInstanceObservationKind = "browser" | "dev-server" | "log" | "screenshot" | "metric";
export type AppInstanceObservationStatus = "observed" | "unavailable" | "failed";

export interface AppInstanceObservationArtifact {
  schemaVersion: 1;
  stability: "experimental";
  type: "codexus.app.instance.observation";
  observationId: string;
  recordedAt: string;
  instance: {
    instanceId: string;
    artifactPath: string;
    worktreePath: string;
    processStatus: AppInstanceStatus;
    processReason?: string | null;
    heartbeatFresh?: boolean | null;
    heartbeatAgeMs?: number | null;
    lifecycleState?: AppInstanceLifecycleState | null;
    healthStatus: AppInstanceHealthStatus;
    url: string | null;
  };
  observation: {
    kind: AppInstanceObservationKind;
    status: AppInstanceObservationStatus;
    source: string;
    url: string | null;
    evidencePath: string | null;
    summary: string | null;
    reason: string | null;
  };
  authority: {
    controlsInstance: false;
    healthAuthority: false;
    completionAuthority: false;
  };
}

export interface AppInstanceObservationValidation {
  path: string;
  valid: boolean;
  errors: string[];
  artifact: AppInstanceObservationArtifact | null;
}

export interface AppInstanceEvidenceSummary {
  schemaVersion: 1;
  stability: "experimental";
  status: "empty" | "observed";
  instances: {
    total: number;
    running: number;
    stopped: number;
    orphaned: number;
    unknown: number;
  };
  observations: {
    total: number;
    observed: number;
    failed: number;
    unavailable: number;
    byKind: Record<AppInstanceObservationKind, number>;
    latest: {
      observationId: string;
      recordedAt: string;
      instanceId: string;
      kind: AppInstanceObservationKind;
      status: AppInstanceObservationStatus;
      processStatus: AppInstanceStatus;
      lifecycleState: AppInstanceLifecycleState | null;
      path: string;
    } | null;
  };
  authority: {
    controlsInstance: false;
    healthAuthority: false;
    completionAuthority: false;
  };
}

interface AppInstanceHeartbeat {
  schemaVersion: 1;
  type: "codexus.app.instance.heartbeat";
  instanceId: string;
  ownerTokenHash: string;
  runnerPid: number;
  runnerStartMarker?: string | null;
  appPid: number | null;
  updatedAt: string;
  status: "running" | "stopped" | "failed";
  exitCode: number | null;
  signal: NodeJS.Signals | null;
}

interface AppInstanceLaunchResult {
  schemaVersion: 1;
  type: "codexus.app.instance.launch-result";
  recordedAt: string;
  status: "ready" | "failed";
  instanceId: string;
  appPid?: number;
  processGroupId?: number;
  error?: string;
}

interface AppInstanceLaunchConfig {
  schemaVersion: 1;
  command: string[];
  cwd: string;
  env: Record<string, string> | null;
  instanceId: string;
  worktreePath: string;
  worktreeBranch: string | null;
  worktreeHead: string | null;
  profile: string;
  artifactPath: string;
  heartbeatPath: string;
  resultPath: string;
  ownerTokenHash: string;
  network: {
    host: "127.0.0.1";
    port: number | null;
    url: string | null;
  };
  health: {
    url: string | null;
    timeoutMs: number | null;
    evidencePath: string | null;
  };
  logs: {
    stdoutPath: string | null;
    stderrPath: string | null;
  };
  heartbeatIntervalMs: number;
}

const MAX_LOG_TAIL_BYTES = 64 * 1024;
const DEFAULT_LOG_TAIL_LINES = 80;
const MAX_LOG_TAIL_LINES = 500;
const LAUNCH_WAIT_TIMEOUT_MS = 2_500;
const HEARTBEAT_STALE_MS = 8_000;
const HEARTBEAT_INTERVAL_MS = 1_000;
const STOP_GRACE_MS = 2_000;
const HEALTH_DEFAULT_TIMEOUT_MS = 2_000;
const HOST = "127.0.0.1" as const;
const DEFAULT_HTTP_OBSERVE_TIMEOUT_MS = 2_000;
const MAX_HTTP_OBSERVE_TIMEOUT_MS = 30_000;
const MAX_HTTP_OBSERVATION_BYTES = 2_048;
const MAX_SCREENSHOT_EVIDENCE_BYTES = 20 * 1024 * 1024;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pathInside(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function requireString(record: Record<string, unknown>, key: string, errors: string[], path = key): string | null {
  const value = record[key];
  if (typeof value !== "string" || !value.trim()) {
    errors.push(`${path}:expected_non_empty_string`);
    return null;
  }
  return value.trim();
}

function optionalString(record: Record<string, unknown>, key: string, errors: string[], path = key): string | null {
  const value = record[key];
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") {
    errors.push(`${path}:expected_string_or_null`);
    return null;
  }
  return value.trim() || null;
}

function requireBoolean(record: Record<string, unknown>, key: string, errors: string[], path = key): boolean | null {
  const value = record[key];
  if (typeof value !== "boolean") {
    errors.push(`${path}:expected_boolean`);
    return null;
  }
  return value;
}

function optionalBoolean(record: Record<string, unknown>, key: string, errors: string[], path = key): boolean | null {
  const value = record[key];
  if (value === null || value === undefined) return null;
  if (typeof value !== "boolean") {
    errors.push(`${path}:expected_boolean_or_null`);
    return null;
  }
  return value;
}

function requireInteger(record: Record<string, unknown>, key: string, errors: string[], path = key): number | null {
  const value = record[key];
  if (!Number.isInteger(value)) {
    errors.push(`${path}:expected_integer`);
    return null;
  }
  return value as number;
}

function optionalInteger(record: Record<string, unknown>, key: string, errors: string[], path = key): number | null {
  const value = record[key];
  if (value === null || value === undefined) return null;
  if (!Number.isInteger(value)) {
    errors.push(`${path}:expected_integer_or_null`);
    return null;
  }
  return value as number;
}

function parsePort(value: unknown, errors: string[], path: string): AppInstancePortDescriptor | null {
  if (!isRecord(value)) {
    errors.push(`${path}:expected_object`);
    return null;
  }
  const mode = value.mode;
  if (mode !== "allocate" && mode !== "fixed") {
    errors.push(`${path}.mode:expected_allocate_or_fixed`);
  }
  const preferred = value.preferred === null || value.preferred === undefined ? null : requireInteger(value, "preferred", errors, `${path}.preferred`);
  if (preferred !== null && (preferred < 1 || preferred > 65535)) errors.push(`${path}.preferred:expected_port_range`);
  return mode === "allocate" || mode === "fixed"
    ? { mode, preferred }
    : null;
}

function parseHealth(value: unknown, errors: string[], path: string): AppInstanceHealthDescriptor | null {
  if (value === null || value === undefined) return null;
  if (!isRecord(value)) {
    errors.push(`${path}:expected_object_or_null`);
    return null;
  }
  if (value.type !== "http") errors.push(`${path}.type:expected_http`);
  const url = requireString(value, "url", errors, `${path}.url`);
  const timeoutMs = requireInteger(value, "timeoutMs", errors, `${path}.timeoutMs`);
  if (timeoutMs !== null && timeoutMs <= 0) errors.push(`${path}.timeoutMs:expected_positive_integer`);
  return value.type === "http" && url && timeoutMs !== null && timeoutMs > 0
    ? { type: "http", url, timeoutMs }
    : null;
}

function parseLog(value: unknown, errors: string[], path: string): AppInstanceLogDescriptor | null {
  if (!isRecord(value)) {
    errors.push(`${path}:expected_object`);
    return null;
  }
  const stdout = requireBoolean(value, "stdout", errors, `${path}.stdout`);
  const stderr = requireBoolean(value, "stderr", errors, `${path}.stderr`);
  return stdout !== null && stderr !== null ? { stdout, stderr } : null;
}

function parseProfile(value: unknown, errors: string[], index: number): AppInstanceProfile | null {
  const path = `profiles[${index}]`;
  if (!isRecord(value)) {
    errors.push(`${path}:expected_object`);
    return null;
  }
  const name = requireString(value, "name", errors, `${path}.name`);
  const cwd = requireString(value, "cwd", errors, `${path}.cwd`);
  const rawCommand = value.command;
  const command = Array.isArray(rawCommand) && rawCommand.length > 0 && rawCommand.every((item) => typeof item === "string" && item.trim())
    ? rawCommand.map((item) => String(item))
    : null;
  if (!command) errors.push(`${path}.command:expected_non_empty_string_array`);
  const port = parsePort(value.port, errors, `${path}.port`);
  const health = parseHealth(value.health, errors, `${path}.health`);
  const log = parseLog(value.log, errors, `${path}.log`);
  return name && cwd && command && port && log ? { name, cwd, command, port, health, log } : null;
}

export function validateAppInstanceDescriptor(value: unknown): AppInstanceDescriptorValidation {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return { schemaVersion: 1, valid: false, errors: ["descriptor:not_object"], descriptor: null };
  }
  if (value.schemaVersion !== 1) errors.push("schemaVersion:not_1");
  if (value.stability !== "experimental") errors.push("stability:not_experimental");
  const rawProfiles = value.profiles;
  const profiles: AppInstanceProfile[] = [];
  if (!Array.isArray(rawProfiles)) {
    errors.push("profiles:expected_array");
  } else {
    const seen = new Set<string>();
    for (const [index, rawProfile] of rawProfiles.entries()) {
      const profile = parseProfile(rawProfile, errors, index);
      if (!profile) continue;
      if (seen.has(profile.name)) {
        errors.push(`profiles[${index}].name:duplicate`);
        continue;
      }
      seen.add(profile.name);
      profiles.push(profile);
    }
  }
  return {
    schemaVersion: 1,
    valid: errors.length === 0,
    errors,
    descriptor: errors.length === 0 ? { schemaVersion: 1, stability: "experimental", profiles } : null,
  };
}

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch (error) {
    throw new Error(`json_parse_failed:${path}:${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function readAppInstanceDescriptor(cwd: string, explicitPath?: string): Promise<AppInstanceDescriptorResolution> {
  if (explicitPath) {
    const path = resolve(cwd, explicitPath);
    if (!existsSync(path)) {
      return {
        declared: true,
        source: "flag",
        path,
        validation: { schemaVersion: 1, valid: false, errors: ["descriptor_file_missing"], descriptor: null },
      };
    }
    const value = await readJson(path);
    return { declared: true, source: "flag", path, validation: validateAppInstanceDescriptor(value) };
  }

  const defaultPath = resolve(cwd, "codexus.app-instances.json");
  if (existsSync(defaultPath)) {
    const value = await readJson(defaultPath);
    return { declared: true, source: "codexus.app-instances.json", path: defaultPath, validation: validateAppInstanceDescriptor(value) };
  }

  const packageJsonPath = resolve(cwd, "package.json");
  if (existsSync(packageJsonPath)) {
    const packageJson = await readJson(packageJsonPath);
    if (isRecord(packageJson) && isRecord(packageJson.codexus) && packageJson.codexus.appInstances !== undefined) {
      return {
        declared: true,
        source: "package.json#codexus.appInstances",
        path: packageJsonPath,
        validation: validateAppInstanceDescriptor(packageJson.codexus.appInstances),
      };
    }
  }

  return {
    declared: false,
    source: null,
    path: null,
    validation: { schemaVersion: 1, valid: true, errors: [], descriptor: null },
  };
}

function gitField(cwd: string, args: string[]): string | null {
  const result = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() || null : null;
}

function inspectWorktree(worktree: string) {
  const branch = gitField(worktree, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const head = gitField(worktree, ["rev-parse", "HEAD"]);
  return {
    path: worktree,
    isGit: head !== null,
    branch,
    head,
    degradedReason: head === null ? "not_a_git_worktree_or_head_unavailable" : null,
  };
}

function parsePortOverride(port: string | undefined): number | null {
  if (port === undefined) return null;
  const parsed = Number(port);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) throw new Error("invalid_app_instance_port");
  return parsed;
}

function nowIso(): string {
  return new Date().toISOString();
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pidLive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error
      ? (error as { code?: unknown }).code
      : null;
    return code === "EPERM";
  }
}

function readProcessStartMarker(pid: number): string | null {
  if (!Number.isInteger(pid) || pid <= 0) return null;
  const result = spawnSync("ps", ["-o", "lstart=", "-p", String(pid)], { encoding: "utf8" });
  if (result.status !== 0) return null;
  const marker = result.stdout.trim();
  return marker.length > 0 ? marker : null;
}

function hashOwnerToken(token: string): string {
  return `sha256:${createHash("sha256").update(token).digest("hex")}`;
}

function appInstanceRoot(cwd: string): string {
  return join(harnessRoot(cwd), "app-instances");
}

function instanceDirPath(worktree: string, instanceId: string): string {
  return join(appInstanceRoot(worktree), instanceId);
}

function instancePaths(worktree: string, instanceId: string) {
  const dir = instanceDirPath(worktree, instanceId);
  return {
    dir,
    observations: join(dir, "observations"),
    artifact: join(dir, "instance.json"),
    heartbeat: join(dir, "heartbeat.json"),
    launch: join(dir, "launch.json"),
    result: join(dir, "result.json"),
    stdout: join(dir, "stdout.log"),
    stderr: join(dir, "stderr.log"),
    health: join(dir, "health.json"),
  };
}

function observationPath(worktree: string, instanceId: string, observationId: string): string {
  return join(instancePaths(worktree, instanceId).observations, `${observationId}.json`);
}

function runnerScriptPath(): string {
  return join(findCodexusPackageRoot(), "scripts", "codexus-app-instance-runner.mjs");
}

function substitutePlaceholders(value: string, port: number | null): string {
  return value
    .replaceAll("{host}", HOST)
    .replaceAll("{port}", port === null ? "" : String(port));
}

function buildLaunchCommand(profile: AppInstanceProfile, port: number | null): string[] {
  return profile.command.map((part) => substitutePlaceholders(part, port));
}

function renderHealthUrl(profile: AppInstanceProfile, port: number | null): string | null {
  if (!profile.health) return null;
  return substitutePlaceholders(profile.health.url, port);
}

async function probePort(port: number): Promise<boolean> {
  return await new Promise((resolve) => {
    const server = createServer();
    server.unref();
    server.once("error", () => {
      resolve(false);
    });
    server.listen(port, HOST, () => {
      server.close(() => resolve(true));
    });
  });
}

async function allocateEphemeralPort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, HOST, () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("ephemeral_port_unavailable")));
        return;
      }
      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
  });
}

async function selectPort(profile: AppInstanceProfile, override: number | null): Promise<{
  port: number | null;
  status: "preferred" | "reallocated" | "fixed" | "fixed_override" | "unassigned";
}> {
  const requested = override ?? profile.port.preferred;
  if (profile.port.mode === "fixed") {
    if (requested === null) throw new Error("app_instance_fixed_port_required");
    const available = await probePort(requested);
    if (!available) throw new Error(`app_instance_port_unavailable:${requested}`);
    return { port: requested, status: override === null ? "fixed" : "fixed_override" };
  }
  if (requested !== null && await probePort(requested)) {
    return { port: requested, status: "preferred" };
  }
  const fallback = requested === null ? await allocateEphemeralPort() : await allocateEphemeralPort();
  return { port: fallback, status: requested === null ? "unassigned" : "reallocated" };
}

function buildInstanceEnvironment(port: number | null): Record<string, string> {
  return {
    HOST,
    PORT: port === null ? "" : String(port),
    CODEXUS_HOST: HOST,
    CODEXUS_PORT: port === null ? "" : String(port),
  };
}

function isHealthStatus(value: unknown): value is AppInstanceHealthStatus {
  return value === "passed" || value === "failed" || value === "unknown" || value === "unavailable";
}

function isInstanceStatus(value: unknown): value is AppInstanceStatus {
  return value === "running" || value === "stopped" || value === "orphaned" || value === "unknown";
}

function isLifecycleState(value: unknown): value is AppInstanceLifecycleState {
  return value === "managed_running"
    || value === "managed_stopped"
    || value === "orphaned_live_process"
    || value === "orphaned_dead_artifact"
    || value === "unmanaged_or_unverifiable";
}

export function validateAppInstanceArtifact(value: unknown, path = "artifact"): AppInstanceArtifactValidation {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return { path, valid: false, errors: [`${path}:not_object`], artifact: null };
  }
  if (value.schemaVersion !== 1) errors.push("schemaVersion:not_1");
  if (value.stability !== "experimental") errors.push("stability:not_experimental");
  if (value.type !== "codexus.app.instance") errors.push("type:not_codexus_app_instance");
  const instanceId = requireString(value, "instanceId", errors);
  const profile = requireString(value, "profile", errors);
  if (!isRecord(value.worktree)) errors.push("worktree:expected_object");
  if (!isRecord(value.owner)) errors.push("owner:expected_object");
  if (!isRecord(value.network)) errors.push("network:expected_object");
  if (!isRecord(value.health)) errors.push("health:expected_object");
  if (!isRecord(value.logs)) errors.push("logs:expected_object");
  if (!isInstanceStatus(value.status)) errors.push("status:invalid_enum");
  const worktree = isRecord(value.worktree)
    ? {
      path: requireString(value.worktree, "path", errors, "worktree.path") ?? "",
      branch: optionalString(value.worktree, "branch", errors, "worktree.branch"),
      head: optionalString(value.worktree, "head", errors, "worktree.head"),
    }
    : { path: "", branch: null, head: null };
  const owner = isRecord(value.owner)
    ? {
      ownedByCodexus: requireBoolean(value.owner, "ownedByCodexus", errors, "owner.ownedByCodexus") ?? false,
      ownerTokenHash: optionalString(value.owner, "ownerTokenHash", errors, "owner.ownerTokenHash"),
      pid: value.owner.pid === null ? null : requireInteger(value.owner, "pid", errors, "owner.pid"),
      processGroupId: value.owner.processGroupId === null ? null : requireInteger(value.owner, "processGroupId", errors, "owner.processGroupId"),
      runnerStartMarker: optionalString(value.owner, "runnerStartMarker", errors, "owner.runnerStartMarker"),
      heartbeatPath: optionalString(value.owner, "heartbeatPath", errors, "owner.heartbeatPath"),
    }
    : { ownedByCodexus: false, ownerTokenHash: null, pid: null, processGroupId: null, runnerStartMarker: null, heartbeatPath: null };
  const networkPort = isRecord(value.network) && value.network.port === null ? null : isRecord(value.network) ? requireInteger(value.network, "port", errors, "network.port") : null;
  if (networkPort !== null && (networkPort < 1 || networkPort > 65535)) errors.push("network.port:expected_port_range");
  const network = isRecord(value.network)
    ? {
      host: value.network.host === HOST ? HOST : HOST,
      port: networkPort,
      url: optionalString(value.network, "url", errors, "network.url"),
    }
    : { host: HOST, port: null, url: null };
  if (isRecord(value.network) && value.network.host !== HOST) errors.push("network.host:not_loopback");
  const rawHealthStatus = isRecord(value.health) ? value.health.status : null;
  if (!isHealthStatus(rawHealthStatus)) errors.push("health.status:invalid_enum");
  const healthTimeoutMs = isRecord(value.health) && value.health.timeoutMs === null
    ? null
    : isRecord(value.health) && value.health.timeoutMs !== undefined
      ? requireInteger(value.health, "timeoutMs", errors, "health.timeoutMs")
      : null;
  if (healthTimeoutMs !== null && healthTimeoutMs <= 0) errors.push("health.timeoutMs:expected_positive_integer");
  const health = isRecord(value.health)
    ? {
      status: isHealthStatus(rawHealthStatus) ? rawHealthStatus : "unknown" as const,
      lastCheckedAt: optionalString(value.health, "lastCheckedAt", errors, "health.lastCheckedAt"),
      evidencePath: optionalString(value.health, "evidencePath", errors, "health.evidencePath"),
      url: optionalString(value.health, "url", errors, "health.url"),
      timeoutMs: healthTimeoutMs,
    }
    : { status: "unknown" as const, lastCheckedAt: null, evidencePath: null, url: null, timeoutMs: null };
  const logs = isRecord(value.logs)
    ? {
      stdoutPath: optionalString(value.logs, "stdoutPath", errors, "logs.stdoutPath"),
      stderrPath: optionalString(value.logs, "stderrPath", errors, "logs.stderrPath"),
    }
    : { stdoutPath: null, stderrPath: null };
  const artifact = errors.length === 0 && instanceId && profile
    ? {
      schemaVersion: 1 as const,
      stability: "experimental" as const,
      type: "codexus.app.instance" as const,
      instanceId,
      worktree,
      profile,
      owner,
      network,
      health,
      logs,
      status: value.status as AppInstanceStatus,
    }
    : null;
  return { path, valid: errors.length === 0, errors, artifact };
}

function isObservationKind(value: unknown): value is AppInstanceObservationKind {
  return value === "browser" || value === "dev-server" || value === "log" || value === "screenshot" || value === "metric";
}

function isObservationStatus(value: unknown): value is AppInstanceObservationStatus {
  return value === "observed" || value === "unavailable" || value === "failed";
}

export function validateAppInstanceObservation(value: unknown, path = "observation"): AppInstanceObservationValidation {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return { path, valid: false, errors: [`${path}:not_object`], artifact: null };
  }
  if (value.schemaVersion !== 1) errors.push("schemaVersion:not_1");
  if (value.stability !== "experimental") errors.push("stability:not_experimental");
  if (value.type !== "codexus.app.instance.observation") errors.push("type:not_codexus_app_instance_observation");
  const observationId = requireString(value, "observationId", errors);
  const recordedAt = requireString(value, "recordedAt", errors);
  if (!isRecord(value.instance)) errors.push("instance:expected_object");
  if (!isRecord(value.observation)) errors.push("observation:expected_object");
  if (!isRecord(value.authority)) errors.push("authority:expected_object");

  const rawProcessStatus = isRecord(value.instance) ? value.instance.processStatus : null;
  if (!isInstanceStatus(rawProcessStatus)) errors.push("instance.processStatus:invalid_enum");
  const rawHealthStatus = isRecord(value.instance) ? value.instance.healthStatus : null;
  if (!isHealthStatus(rawHealthStatus)) errors.push("instance.healthStatus:invalid_enum");
  const rawLifecycleState = isRecord(value.instance) ? value.instance.lifecycleState : null;
  if (rawLifecycleState !== null && rawLifecycleState !== undefined && !isLifecycleState(rawLifecycleState)) {
    errors.push("instance.lifecycleState:invalid_enum");
  }
  const rawKind = isRecord(value.observation) ? value.observation.kind : null;
  if (!isObservationKind(rawKind)) errors.push("observation.kind:invalid_enum");
  const rawStatus = isRecord(value.observation) ? value.observation.status : null;
  if (!isObservationStatus(rawStatus)) errors.push("observation.status:invalid_enum");
  if (isRecord(value.authority)) {
    if (value.authority.controlsInstance !== false) errors.push("authority.controlsInstance:not_false");
    if (value.authority.healthAuthority !== false) errors.push("authority.healthAuthority:not_false");
    if (value.authority.completionAuthority !== false) errors.push("authority.completionAuthority:not_false");
  }

  const instance = isRecord(value.instance)
    ? {
      instanceId: requireString(value.instance, "instanceId", errors, "instance.instanceId") ?? "",
      artifactPath: requireString(value.instance, "artifactPath", errors, "instance.artifactPath") ?? "",
      worktreePath: requireString(value.instance, "worktreePath", errors, "instance.worktreePath") ?? "",
      processStatus: isInstanceStatus(rawProcessStatus) ? rawProcessStatus : "unknown" as const,
      processReason: optionalString(value.instance, "processReason", errors, "instance.processReason"),
      heartbeatFresh: optionalBoolean(value.instance, "heartbeatFresh", errors, "instance.heartbeatFresh"),
      heartbeatAgeMs: optionalInteger(value.instance, "heartbeatAgeMs", errors, "instance.heartbeatAgeMs"),
      lifecycleState: isLifecycleState(rawLifecycleState) ? rawLifecycleState : null,
      healthStatus: isHealthStatus(rawHealthStatus) ? rawHealthStatus : "unknown" as const,
      url: optionalString(value.instance, "url", errors, "instance.url"),
    }
    : null;
  const observation = isRecord(value.observation)
    ? {
      kind: isObservationKind(rawKind) ? rawKind : "browser" as const,
      status: isObservationStatus(rawStatus) ? rawStatus : "unavailable" as const,
      source: requireString(value.observation, "source", errors, "observation.source") ?? "",
      url: optionalString(value.observation, "url", errors, "observation.url"),
      evidencePath: optionalString(value.observation, "evidencePath", errors, "observation.evidencePath"),
      summary: optionalString(value.observation, "summary", errors, "observation.summary"),
      reason: optionalString(value.observation, "reason", errors, "observation.reason"),
    }
    : null;
  const artifact = errors.length === 0 && observationId && recordedAt && instance && observation
    ? {
      schemaVersion: 1 as const,
      stability: "experimental" as const,
      type: "codexus.app.instance.observation" as const,
      observationId,
      recordedAt,
      instance,
      observation,
      authority: {
        controlsInstance: false as const,
        healthAuthority: false as const,
        completionAuthority: false as const,
      },
    }
    : null;
  return { path, valid: errors.length === 0, errors, artifact };
}

function isHeartbeat(value: unknown): value is AppInstanceHeartbeat {
  return isRecord(value)
    && value.schemaVersion === 1
    && value.type === "codexus.app.instance.heartbeat"
    && typeof value.instanceId === "string"
    && typeof value.ownerTokenHash === "string"
    && Number.isInteger(value.runnerPid)
    && (value.runnerStartMarker === undefined || value.runnerStartMarker === null || typeof value.runnerStartMarker === "string")
    && (value.appPid === null || Number.isInteger(value.appPid))
    && typeof value.updatedAt === "string"
    && (value.status === "running" || value.status === "stopped" || value.status === "failed")
    && (value.exitCode === null || Number.isInteger(value.exitCode))
    && (value.signal === null || typeof value.signal === "string");
}

function isLaunchResult(value: unknown): value is AppInstanceLaunchResult {
  return isRecord(value)
    && value.schemaVersion === 1
    && value.type === "codexus.app.instance.launch-result"
    && typeof value.recordedAt === "string"
    && (value.status === "ready" || value.status === "failed")
    && typeof value.instanceId === "string";
}

async function readHeartbeat(path: string | null): Promise<AppInstanceHeartbeat | null> {
  if (!path || !existsSync(path)) return null;
  try {
    const value = JSON.parse(await readFile(path, "utf8")) as unknown;
    return isHeartbeat(value) ? value : null;
  } catch {
    return null;
  }
}

async function readLaunchResult(path: string): Promise<AppInstanceLaunchResult | null> {
  if (!existsSync(path)) return null;
  try {
    const value = JSON.parse(await readFile(path, "utf8")) as unknown;
    return isLaunchResult(value) ? value : null;
  } catch {
    return null;
  }
}

async function readInstanceArtifact(path: string): Promise<AppInstanceArtifactValidation> {
  try {
    return validateAppInstanceArtifact(JSON.parse(await readFile(path, "utf8")) as unknown, path);
  } catch (error) {
    return { path, valid: false, errors: [`json_unreadable:${error instanceof Error ? error.message : String(error)}`], artifact: null };
  }
}

async function listInstanceArtifactPaths(cwd: string): Promise<string[]> {
  const root = appInstanceRoot(cwd);
  if (!existsSync(root)) return [];
  const paths: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const path = join(root, entry.name, "instance.json");
      if (existsSync(path)) paths.push(path);
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      paths.push(join(root, entry.name));
    }
  }
  return paths.sort();
}

function resolveArtifactPath(artifact: AppInstanceArtifact, artifactPath: string, path: string | null): string | null {
  if (!path) return null;
  if (isAbsolute(path)) return path;
  const worktreePath = resolve(artifact.worktree.path, path);
  if (existsSync(worktreePath)) return worktreePath;
  return resolve(artifactPath, "..", path);
}

function heartbeatFresh(heartbeat: AppInstanceHeartbeat): boolean {
  const ageMs = heartbeatAgeMs(heartbeat);
  return ageMs !== null && ageMs <= HEARTBEAT_STALE_MS;
}

function heartbeatAgeMs(heartbeat: AppInstanceHeartbeat | null): number | null {
  if (!heartbeat) return null;
  const timestamp = new Date(heartbeat.updatedAt).getTime();
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, Date.now() - timestamp);
}

function heartbeatStaleReason(artifact: AppInstanceArtifact, heartbeat: AppInstanceHeartbeat | null) {
  if (!heartbeat) return "heartbeat_missing" as const;
  if (heartbeat.ownerTokenHash !== artifact.owner.ownerTokenHash) return "heartbeat_owner_token_mismatch" as const;
  if (!heartbeatFresh(heartbeat)) return "heartbeat_stale" as const;
  return null;
}

function lifecyclePolicy(input: {
  status: AppInstanceStatus;
  reason: string;
  heartbeat: AppInstanceHeartbeat | null;
  ownedByCodexus: boolean;
  live: boolean;
}) {
  const heartbeatAge = heartbeatAgeMs(input.heartbeat);
  const stale = input.heartbeat === null
    || !heartbeatFresh(input.heartbeat)
    || input.reason === "heartbeat_owner_token_mismatch";
  const state: AppInstanceLifecycleState =
    !input.ownedByCodexus
      ? "unmanaged_or_unverifiable"
      : input.status === "running"
        ? "managed_running"
        : input.status === "stopped"
          ? "managed_stopped"
          : input.status === "orphaned" && input.live
            ? "orphaned_live_process"
            : input.status === "orphaned"
              ? "orphaned_dead_artifact"
              : "unmanaged_or_unverifiable";
  const stopPolicy: AppInstanceStopPolicy =
    input.status === "running"
      ? "requires_owner_identity_check"
      : input.status === "stopped"
        ? "not_needed"
        : "unavailable";
  const cleanupPolicy: AppInstanceCleanupPolicy = state === "orphaned_live_process" || state === "orphaned_dead_artifact"
    ? "manual_review"
    : "none";
  return {
    state,
    stale,
    staleReason: stale ? input.reason : null,
    heartbeatAgeMs: heartbeatAge,
    heartbeatStaleAfterMs: HEARTBEAT_STALE_MS,
    stopPolicy,
    cleanupPolicy,
    cleanupAuthority: false as const,
    healthAuthority: false as const,
    completionAuthority: false as const,
  };
}

function projectProcess(artifact: AppInstanceArtifact, heartbeat: AppInstanceHeartbeat | null) {
  if (!artifact.owner.ownedByCodexus || artifact.owner.pid === null) {
    const status = "unknown" as const;
    const reason = "not_codexus_owned_or_missing_pid" as const;
    return {
      status,
      reason,
      pid: artifact.owner.pid,
      processGroupId: artifact.owner.processGroupId,
      heartbeatFresh: false,
      heartbeatAgeMs: heartbeatAgeMs(heartbeat),
      heartbeatStaleAfterMs: HEARTBEAT_STALE_MS,
      ownedByCodexus: artifact.owner.ownedByCodexus,
      lifecycle: lifecyclePolicy({ status, reason, heartbeat, ownedByCodexus: artifact.owner.ownedByCodexus, live: false }),
    };
  }
  const live = pidLive(artifact.owner.pid);
  const staleReason = heartbeatStaleReason(artifact, heartbeat);
  if (live && heartbeat && staleReason === null) {
    const status = "running" as const;
    const reason = "pid_live_and_heartbeat_fresh" as const;
    return {
      status,
      reason,
      pid: artifact.owner.pid,
      processGroupId: artifact.owner.processGroupId,
      heartbeatFresh: true,
      heartbeatAgeMs: heartbeatAgeMs(heartbeat),
      heartbeatStaleAfterMs: HEARTBEAT_STALE_MS,
      ownedByCodexus: artifact.owner.ownedByCodexus,
      lifecycle: lifecyclePolicy({ status, reason, heartbeat, ownedByCodexus: artifact.owner.ownedByCodexus, live }),
    };
  }
  if (!live && artifact.status === "stopped") {
    const status = "stopped" as const;
    const reason = "artifact_marked_stopped_and_pid_dead" as const;
    return {
      status,
      reason,
      pid: artifact.owner.pid,
      processGroupId: artifact.owner.processGroupId,
      heartbeatFresh: heartbeat ? heartbeatFresh(heartbeat) : false,
      heartbeatAgeMs: heartbeatAgeMs(heartbeat),
      heartbeatStaleAfterMs: HEARTBEAT_STALE_MS,
      ownedByCodexus: artifact.owner.ownedByCodexus,
      lifecycle: lifecyclePolicy({ status, reason, heartbeat, ownedByCodexus: artifact.owner.ownedByCodexus, live }),
    };
  }
  if (live) {
    const status = "orphaned" as const;
    const reason = staleReason ?? "heartbeat_unavailable" as const;
    return {
      status,
      reason,
      pid: artifact.owner.pid,
      processGroupId: artifact.owner.processGroupId,
      heartbeatFresh: heartbeat ? heartbeatFresh(heartbeat) : false,
      heartbeatAgeMs: heartbeatAgeMs(heartbeat),
      heartbeatStaleAfterMs: HEARTBEAT_STALE_MS,
      ownedByCodexus: artifact.owner.ownedByCodexus,
      lifecycle: lifecyclePolicy({ status, reason, heartbeat, ownedByCodexus: artifact.owner.ownedByCodexus, live }),
    };
  }
  const status = artifact.status === "running" ? "orphaned" as const : artifact.status;
  const reason = "pid_dead" as const;
  return {
    status,
    reason,
    pid: artifact.owner.pid,
    processGroupId: artifact.owner.processGroupId,
    heartbeatFresh: heartbeat ? heartbeatFresh(heartbeat) : false,
    heartbeatAgeMs: heartbeatAgeMs(heartbeat),
    heartbeatStaleAfterMs: HEARTBEAT_STALE_MS,
    ownedByCodexus: artifact.owner.ownedByCodexus,
    lifecycle: lifecyclePolicy({ status, reason, heartbeat, ownedByCodexus: artifact.owner.ownedByCodexus, live }),
  };
}

async function probeHealth(artifact: AppInstanceArtifact, artifactPath: string, processStatus: ReturnType<typeof projectProcess>) {
  const evidencePath = resolveArtifactPath(artifact, artifactPath, artifact.health.evidencePath);
  if (processStatus.status !== "running") {
    return {
      status: "unknown" as const,
      rawStatus: artifact.health.status,
      evidencePath,
      evidenceExists: evidencePath !== null && existsSync(evidencePath),
      reason: "process_not_running" as const,
      lastCheckedAt: artifact.health.lastCheckedAt,
    };
  }
  if (!artifact.health.url) {
    return {
      status: "unavailable" as const,
      rawStatus: artifact.health.status,
      evidencePath,
      evidenceExists: evidencePath !== null && existsSync(evidencePath),
      reason: "health_descriptor_unavailable" as const,
      lastCheckedAt: artifact.health.lastCheckedAt,
    };
  }
  const timeoutMs = artifact.health.timeoutMs ?? HEALTH_DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let nextStatus: AppInstanceHealthStatus = "failed";
  let summary = "request_failed";
  let statusCode: number | null = null;
  try {
    const response = await fetch(artifact.health.url, { signal: controller.signal });
    statusCode = response.status;
    nextStatus = response.ok ? "passed" : "failed";
    summary = response.ok ? "http_ok" : "http_non_ok";
  } catch (error) {
    nextStatus = "failed";
    summary = error instanceof Error ? error.message : String(error);
  } finally {
    clearTimeout(timer);
  }
  const checkedAt = nowIso();
  if (evidencePath) {
    await writeJsonAtomic(evidencePath, {
      schemaVersion: 1,
      type: "codexus.app.instance.health-evidence",
      instanceId: artifact.instanceId,
      checkedAt,
      url: artifact.health.url,
      timeoutMs,
      status: nextStatus,
      statusCode,
      summary,
    });
  }
  const nextArtifact: AppInstanceArtifact = {
    ...artifact,
    health: {
      ...artifact.health,
      status: nextStatus,
      lastCheckedAt: checkedAt,
      evidencePath,
    },
  };
  await writeJsonAtomic(artifactPath, nextArtifact);
  return {
    status: nextStatus,
    rawStatus: nextStatus,
    evidencePath,
    evidenceExists: evidencePath !== null && existsSync(evidencePath),
    reason: nextStatus === "passed" ? null : summary,
    lastCheckedAt: checkedAt,
  };
}

async function projectInstance(validation: AppInstanceArtifactValidation) {
  if (!validation.artifact) return null;
  const artifact = validation.artifact;
  const heartbeatPath = resolveArtifactPath(artifact, validation.path, artifact.owner.heartbeatPath);
  const heartbeat = await readHeartbeat(heartbeatPath);
  const process = projectProcess(artifact, heartbeat);
  const health = await probeHealth(artifact, validation.path, process);
  return {
    instanceId: artifact.instanceId,
    artifactPath: validation.path,
    worktree: artifact.worktree,
    profile: artifact.profile,
    status: process.status,
    process,
    heartbeat: heartbeat
      ? {
        path: heartbeatPath,
        status: heartbeat.status,
        updatedAt: heartbeat.updatedAt,
        fresh: heartbeatFresh(heartbeat),
        ageMs: heartbeatAgeMs(heartbeat),
        staleAfterMs: HEARTBEAT_STALE_MS,
        runnerPid: heartbeat.runnerPid,
        appPid: heartbeat.appPid,
      }
      : {
        path: heartbeatPath,
        status: "missing" as const,
        updatedAt: null,
        fresh: false,
        ageMs: null,
        staleAfterMs: HEARTBEAT_STALE_MS,
        runnerPid: null,
        appPid: null,
      },
    network: artifact.network,
    health,
    logs: artifact.logs,
    owner: artifact.owner,
  };
}

async function existingRunningInstance(worktree: string, profile: string) {
  const validations = await Promise.all((await listInstanceArtifactPaths(worktree)).map(readInstanceArtifact));
  for (const validation of validations) {
    if (!validation.artifact || validation.artifact.profile !== profile) continue;
    const heartbeatPath = resolveArtifactPath(validation.artifact, validation.path, validation.artifact.owner.heartbeatPath);
    const heartbeat = await readHeartbeat(heartbeatPath);
    const process = projectProcess(validation.artifact, heartbeat);
    if (process.status === "running") return projectInstance(validation);
  }
  return null;
}

async function waitForLaunchResult(resultPath: string): Promise<AppInstanceLaunchResult | null> {
  const deadline = Date.now() + LAUNCH_WAIT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const result = await readLaunchResult(resultPath);
    if (result) return result;
    await wait(50);
  }
  return null;
}

function buildLaunchConfig(
  worktree: string,
  profile: AppInstanceProfile,
  instanceId: string,
  ownerTokenHash: string,
  selectedPort: number | null,
  selectedWorktree: ReturnType<typeof inspectWorktree>,
): AppInstanceLaunchConfig {
  const paths = instancePaths(worktree, instanceId);
  return {
    schemaVersion: 1,
    command: buildLaunchCommand(profile, selectedPort),
    cwd: resolve(worktree, profile.cwd),
    env: buildInstanceEnvironment(selectedPort),
    instanceId,
    worktreePath: worktree,
    worktreeBranch: selectedWorktree.branch,
    worktreeHead: selectedWorktree.head,
    profile: profile.name,
    artifactPath: paths.artifact,
    heartbeatPath: paths.heartbeat,
    resultPath: paths.result,
    ownerTokenHash,
    network: {
      host: HOST,
      port: selectedPort,
      url: selectedPort === null ? null : `http://${HOST}:${selectedPort}/`,
    },
    health: {
      url: renderHealthUrl(profile, selectedPort),
      timeoutMs: profile.health?.timeoutMs ?? null,
      evidencePath: paths.health,
    },
    logs: {
      stdoutPath: profile.log.stdout ? paths.stdout : null,
      stderrPath: profile.log.stderr ? paths.stderr : null,
    },
    heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS,
  };
}

async function spawnRunner(config: AppInstanceLaunchConfig): Promise<void> {
  const script = runnerScriptPath();
  if (!existsSync(script)) throw new Error("app_instance_runner_missing");
  await ensureDir(dirnameSafe(config.artifactPath));
  await writeJsonAtomic(instancePaths(config.worktreePath, config.instanceId).launch, config);
  const child = spawn(process.execPath, [script, instancePaths(config.worktreePath, config.instanceId).launch], {
    cwd: config.cwd,
    stdio: "ignore",
    detached: true,
  });
  child.unref();
}

function dirnameSafe(path: string): string {
  return resolve(path, "..");
}

async function readStartedInstance(path: string) {
  const validation = await readInstanceArtifact(path);
  return await projectInstance(validation);
}

function terminatePid(pid: number, signal: NodeJS.Signals): boolean {
  try {
    process.kill(pid, signal);
    return true;
  } catch {
    return false;
  }
}

async function terminateOwnedProcess(owner: AppInstanceArtifact["owner"]) {
  const processGroupId = owner.processGroupId;
  const pid = owner.pid;
  if (processGroupId !== null && process.platform !== "win32") {
    terminatePid(-processGroupId, "SIGTERM");
  } else if (pid !== null) {
    terminatePid(pid, "SIGTERM");
  }
  const deadline = Date.now() + STOP_GRACE_MS;
  while (pid !== null && pidLive(pid) && Date.now() < deadline) {
    await wait(100);
  }
  const forced = pid !== null && pidLive(pid);
  if (forced) {
    if (processGroupId !== null && process.platform !== "win32") {
      terminatePid(-processGroupId, "SIGKILL");
    } else if (pid !== null) {
      terminatePid(pid, "SIGKILL");
    }
  }
  return { forced };
}

function ownerIdentityVerifiable(owner: AppInstanceArtifact["owner"], heartbeat: AppInstanceHeartbeat | null) {
  if (!owner.ownedByCodexus || !owner.ownerTokenHash || !owner.heartbeatPath) {
    return { ok: false as const, reason: "owner_not_codexus_managed" as const };
  }
  if (!heartbeat) {
    return { ok: false as const, reason: "heartbeat_missing" as const };
  }
  if (!heartbeatFresh(heartbeat)) {
    return { ok: false as const, reason: "heartbeat_stale" as const };
  }
  if (heartbeat.ownerTokenHash !== owner.ownerTokenHash) {
    return { ok: false as const, reason: "heartbeat_owner_token_mismatch" as const };
  }
  if (owner.processGroupId === null || heartbeat.runnerPid !== owner.processGroupId) {
    return { ok: false as const, reason: "runner_pid_mismatch" as const };
  }
  if (!owner.runnerStartMarker || !heartbeat.runnerStartMarker) {
    return { ok: false as const, reason: "runner_start_marker_missing" as const };
  }
  if (heartbeat.runnerStartMarker !== owner.runnerStartMarker) {
    return { ok: false as const, reason: "runner_start_marker_mismatch" as const };
  }
  const liveRunnerMarker = readProcessStartMarker(owner.processGroupId);
  if (!liveRunnerMarker || liveRunnerMarker !== owner.runnerStartMarker) {
    return { ok: false as const, reason: "runner_identity_unverifiable" as const };
  }
  return { ok: true as const, reason: "owner_identity_verified" as const };
}

export async function listAppInstanceProfiles(cwd: string, options: { descriptorPath?: string }) {
  const descriptor = await readAppInstanceDescriptor(cwd, options.descriptorPath);
  const runnerAvailable = existsSync(runnerScriptPath());
  return {
    schemaVersion: 1,
    stability: "experimental" as const,
    command: "app instance profile list" as const,
    cwd,
    descriptor: {
      declared: descriptor.declared,
      source: descriptor.source,
      path: descriptor.path,
      valid: descriptor.validation.valid,
      errors: descriptor.validation.errors,
    },
    profiles: descriptor.validation.descriptor?.profiles ?? [],
    capabilities: {
      liveStart: descriptor.declared && descriptor.validation.valid && runnerAvailable,
      liveStop: runnerAvailable,
      dryRunStart: descriptor.declared && descriptor.validation.valid,
    },
  };
}

export async function startAppInstance(cwd: string, options: {
  descriptorPath?: string;
  profile?: string;
  worktree?: string;
  port?: string;
  dryRun: boolean;
}) {
  if (!options.profile) throw new Error("missing_app_instance_profile");
  if (!options.worktree) throw new Error("missing_app_instance_worktree");
  const descriptor = await readAppInstanceDescriptor(cwd, options.descriptorPath);
  if (!descriptor.declared) throw new Error("missing_app_instance_descriptor");
  if (!descriptor.validation.valid || !descriptor.validation.descriptor) throw new Error(`app_instance_descriptor_invalid:${descriptor.validation.errors.join(",")}`);
  const profile = descriptor.validation.descriptor.profiles.find((candidate) => candidate.name === options.profile);
  if (!profile) throw new Error(`app_instance_profile_not_found:${options.profile}`);
  const worktree = resolve(cwd, options.worktree);
  if (!existsSync(worktree) || !(await stat(worktree)).isDirectory()) throw new Error(`invalid_app_instance_worktree:${worktree}`);
  const profileCwd = resolve(worktree, profile.cwd);
  if (!pathInside(worktree, profileCwd)) throw new Error("app_instance_profile_cwd_outside_worktree");
  const portOverride = parsePortOverride(options.port);
  const selectedWorktree = inspectWorktree(worktree);
  const selectedPort = await selectPort(profile, portOverride);
  const launchCommand = buildLaunchCommand(profile, selectedPort.port);
  const launchConfig = buildLaunchConfig(worktree, profile, `app_${Date.now().toString(36)}${randomBytes(3).toString("hex")}`, hashOwnerToken(randomBytes(32).toString("hex")), selectedPort.port, selectedWorktree);

  if (options.dryRun) {
    return {
      schemaVersion: 1,
      stability: "experimental" as const,
      command: "app instance start" as const,
      mode: "dry-run" as const,
      spawned: false,
      owned: false,
      status: "planned" as const,
      cwd,
      descriptor: {
        source: descriptor.source,
        path: descriptor.path,
        valid: descriptor.validation.valid,
      },
      profile,
      worktree: selectedWorktree,
      launchPlan: {
        command: launchCommand,
        cwd: profileCwd,
        host: HOST,
        port: selectedPort.port,
        portCheck: {
          status: selectedPort.status,
          reason: selectedPort.status === "preferred" || selectedPort.status === "fixed" || selectedPort.status === "fixed_override"
            ? "requested_port_available"
            : "preferred_port_reallocated",
        },
        healthUrl: launchConfig.health.url,
        environment: {
          copied: true,
          keys: Object.keys(launchConfig.env ?? {}).sort(),
        },
      },
      wouldWrite: {
        instanceId: launchConfig.instanceId,
        instancePath: launchConfig.artifactPath,
        heartbeatPath: launchConfig.heartbeatPath,
        stdoutPath: launchConfig.logs.stdoutPath,
        stderrPath: launchConfig.logs.stderrPath,
      },
      capabilities: {
        liveStart: true,
        liveStop: true,
        dryRunStart: true,
      },
    };
  }

  return await withFileLock(worktree, "app-instance", async () => {
    const running = await existingRunningInstance(worktree, profile.name);
    if (running) throw new Error(`app_instance_profile_already_running:${profile.name}:${running.instanceId}`);
    await spawnRunner(launchConfig);
    const launchResult = await waitForLaunchResult(launchConfig.resultPath);
    if (!launchResult) throw new Error("app_instance_start_timeout");
    if (launchResult.status === "failed") throw new Error(`app_instance_start_failed:${launchResult.error ?? "runner_failed"}`);
    const started = await readStartedInstance(launchConfig.artifactPath);
    if (!started) throw new Error("app_instance_start_failed:artifact_missing_after_ready");
    return {
      schemaVersion: 1,
      stability: "experimental" as const,
      command: "app instance start" as const,
      mode: "live" as const,
      spawned: true,
      owned: true,
      status: "started" as const,
      cwd,
      descriptor: {
        source: descriptor.source,
        path: descriptor.path,
        valid: descriptor.validation.valid,
      },
      profile,
      worktree: selectedWorktree,
      launch: {
        instanceId: launchConfig.instanceId,
        artifactPath: launchConfig.artifactPath,
        heartbeatPath: launchConfig.heartbeatPath,
        processGroupId: launchResult.processGroupId ?? null,
        appPid: launchResult.appPid ?? null,
        command: launchCommand,
        cwd: profileCwd,
        host: HOST,
        port: selectedPort.port,
        url: launchConfig.network.url,
        healthUrl: launchConfig.health.url,
      },
      instance: started,
      capabilities: {
        liveStart: true,
        liveStop: true,
        dryRunStart: true,
      },
    };
  }, {
    operation: "app-instance-start",
  });
}

export async function appInstanceStatus(cwd: string, options: { instanceId?: string; worktree?: string }) {
  const scanCwd = resolve(options.worktree ?? cwd);
  const validations = await Promise.all((await listInstanceArtifactPaths(scanCwd)).map(readInstanceArtifact));
  const projected = (await Promise.all(validations.map(projectInstance)))
    .filter((item): item is NonNullable<Awaited<ReturnType<typeof projectInstance>>> => item !== null)
    .filter((item) => !options.instanceId || item.instanceId === options.instanceId)
    .filter((item) => !options.worktree || resolve(item.worktree.path) === scanCwd);
  return {
    schemaVersion: 1,
    stability: "experimental" as const,
    command: "app instance status" as const,
    cwd,
    scanCwd,
    status: projected.length > 0 ? "observed" as const : "empty" as const,
    instances: projected,
    artifacts: validations.map((validation) => ({
      path: validation.path,
      valid: validation.valid,
      errors: validation.errors,
      instanceId: validation.artifact?.instanceId ?? null,
    })),
    capabilities: {
      liveProcessProbe: true,
      liveStart: true,
      liveStop: true,
    },
  };
}

async function readTail(path: string | null, lines: number) {
  if (!path) return { path: null, exists: false, truncated: false, lines: [] as string[] };
  if (!existsSync(path)) return { path, exists: false, truncated: false, lines: [] as string[] };
  const info = await stat(path);
  const length = Math.min(info.size, MAX_LOG_TAIL_BYTES);
  const buffer = Buffer.alloc(length);
  const handle = await readFile(path);
  const slice = handle.subarray(Math.max(0, handle.length - length));
  slice.copy(buffer, 0, 0, slice.length);
  const text = buffer.toString("utf8");
  const renderedLines = text.split(/\r?\n/).filter((line) => line.length > 0);
  return {
    path,
    exists: true,
    truncated: info.size > length,
    lines: renderedLines.slice(-lines),
  };
}

export async function appInstanceLogs(cwd: string, options: { instanceId?: string; tail?: string }) {
  if (!options.instanceId) throw new Error("missing_app_instance_id");
  const tail = options.tail === undefined ? DEFAULT_LOG_TAIL_LINES : Number(options.tail);
  if (!Number.isInteger(tail) || tail <= 0 || tail > MAX_LOG_TAIL_LINES) throw new Error("invalid_app_instance_log_tail");
  const status = await appInstanceStatus(cwd, { instanceId: options.instanceId });
  const instance = status.instances[0];
  if (!instance) throw new Error(`app_instance_not_found:${options.instanceId}`);
  const validation = await readInstanceArtifact(instance.artifactPath);
  if (!validation.artifact) throw new Error(`app_instance_artifact_invalid:${options.instanceId}`);
  const stdoutPath = resolveArtifactPath(validation.artifact, validation.path, validation.artifact.logs.stdoutPath);
  const stderrPath = resolveArtifactPath(validation.artifact, validation.path, validation.artifact.logs.stderrPath);
  return {
    schemaVersion: 1,
    stability: "experimental" as const,
    command: "app instance logs" as const,
    cwd,
    instanceId: options.instanceId,
    tail,
    stdout: await readTail(stdoutPath, tail),
    stderr: await readTail(stderrPath, tail),
  };
}

function redactLogTail(tail: Awaited<ReturnType<typeof readTail>>) {
  return {
    ...tail,
    lines: tail.lines.map((line) => redactSensitiveText(line)),
  };
}

function parseObservationKindFlag(value: string | undefined): AppInstanceObservationKind {
  if (isObservationKind(value)) return value;
  throw new Error(`invalid_app_instance_observation_kind:${value ?? "missing"}`);
}

function parseObservationStatusFlag(value: string | undefined): AppInstanceObservationStatus {
  if (value === undefined) return "observed";
  if (isObservationStatus(value)) return value;
  throw new Error(`invalid_app_instance_observation_status:${value}`);
}

function parsePositiveIntegerFlag(value: string | undefined, fallback: number, errorCode: string, max: number | null = null): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(errorCode);
  if (max !== null && parsed > max) throw new Error(errorCode);
  return parsed;
}

function parseLoopbackUrl(value: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`invalid_app_instance_probe_url:${value}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`invalid_app_instance_probe_url:${value}`);
  }
  if (parsed.hostname !== "127.0.0.1" && parsed.hostname !== "localhost" && parsed.hostname !== "::1" && parsed.hostname !== "[::1]") {
    throw new Error(`invalid_app_instance_probe_url:${value}`);
  }
  return parsed;
}

async function boundedResponsePreview(response: Response): Promise<{ bytesRead: number; truncated: boolean; preview: string }> {
  const reader = response.body?.getReader();
  if (!reader) return { bytesRead: 0, truncated: false, preview: "" };

  const chunks: Uint8Array[] = [];
  let bytesRead = 0;
  let truncated = false;

  try {
    while (bytesRead < MAX_HTTP_OBSERVATION_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      const remaining = MAX_HTTP_OBSERVATION_BYTES - bytesRead;
      if (value.byteLength > remaining) {
        chunks.push(value.subarray(0, remaining));
        bytesRead += remaining;
        truncated = true;
        await reader.cancel();
        break;
      }
      chunks.push(value);
      bytesRead += value.byteLength;
    }

    if (!truncated && bytesRead === MAX_HTTP_OBSERVATION_BYTES) {
      const next = await reader.read();
      if (!next.done) {
        truncated = true;
        await reader.cancel();
      }
    }
  } finally {
    reader.releaseLock();
  }

  const text = Buffer.concat(chunks, bytesRead).toString("utf8");
  return {
    bytesRead,
    truncated,
    preview: redactSensitiveText(text),
  };
}

async function writeObservationArtifact(cwd: string, options: {
  instance: Awaited<ReturnType<typeof findProjectedInstance>>;
  kind: AppInstanceObservationKind;
  source: string;
  requestedStatus: AppInstanceObservationStatus;
  url: string | null;
  evidencePath: string | null;
  summary: string | null;
  reason: string | null;
}) {
  const instance = options.instance;
  const status: AppInstanceObservationStatus = options.requestedStatus === "observed" && instance.process.status !== "running"
    ? "unavailable"
    : options.requestedStatus;
  const reason = status === "unavailable" && options.requestedStatus === "observed" && instance.process.status !== "running"
    ? `instance_not_running:${instance.process.reason}`
    : options.reason;
  const observationId = `observation_${Date.now().toString(36)}_${randomBytes(3).toString("hex")}`;
  const path = observationPath(instance.worktree.path, instance.instanceId, observationId);
  const artifact: AppInstanceObservationArtifact = {
    schemaVersion: 1,
    stability: "experimental",
    type: "codexus.app.instance.observation",
    observationId,
    recordedAt: nowIso(),
    instance: {
      instanceId: instance.instanceId,
      artifactPath: instance.artifactPath,
      worktreePath: instance.worktree.path,
      processStatus: instance.process.status,
      processReason: instance.process.reason,
      heartbeatFresh: instance.process.heartbeatFresh,
      heartbeatAgeMs: instance.process.heartbeatAgeMs,
      lifecycleState: instance.process.lifecycle.state,
      healthStatus: instance.health.status,
      url: instance.network.url,
    },
    observation: {
      kind: options.kind,
      status,
      source: options.source,
      url: options.url,
      evidencePath: options.evidencePath,
      summary: options.summary,
      reason,
    },
    authority: {
      controlsInstance: false,
      healthAuthority: false,
      completionAuthority: false,
    },
  };
  await ensureDir(dirname(path));
  await writeJsonAtomic(path, artifact);
  return { path, artifact };
}

async function findProjectedInstance(cwd: string, instanceId: string) {
  const status = await appInstanceStatus(cwd, { instanceId });
  const instance = status.instances[0];
  if (!instance) throw new Error(`app_instance_not_found:${instanceId}`);
  return instance;
}

export async function recordAppInstanceObservation(cwd: string, options: {
  instanceId?: string;
  kind?: string;
  source?: string;
  status?: string;
  url?: string;
  evidencePath?: string;
  summary?: string;
}) {
  if (!options.instanceId) throw new Error("missing_app_instance_id");
  const kind = parseObservationKindFlag(options.kind);
  const requestedStatus = parseObservationStatusFlag(options.status);
  const source = options.source?.trim();
  if (!source) throw new Error("missing_app_instance_observation_source");
  const instance = await findProjectedInstance(cwd, options.instanceId);
  const evidencePath = options.evidencePath ? resolve(cwd, options.evidencePath) : null;
  if (evidencePath && !existsSync(evidencePath)) throw new Error(`app_instance_observation_evidence_missing:${evidencePath}`);
  const { path, artifact } = await writeObservationArtifact(cwd, {
    instance,
    kind,
    source,
    requestedStatus,
    url: options.url ?? null,
    evidencePath,
    summary: options.summary ?? null,
    reason: null,
  });
  return {
    schemaVersion: 1,
    stability: "experimental" as const,
    command: "app instance evidence record" as const,
    cwd,
    path,
    observation: artifact,
  };
}

export async function probeAppInstanceHttpObservation(cwd: string, options: {
  instanceId?: string;
  url?: string;
  timeoutMs?: string;
}) {
  if (!options.instanceId) throw new Error("missing_app_instance_id");
  const instance = await findProjectedInstance(cwd, options.instanceId);
  const timeoutMs = parsePositiveIntegerFlag(
    options.timeoutMs,
    DEFAULT_HTTP_OBSERVE_TIMEOUT_MS,
    "invalid_app_instance_probe_timeout",
    MAX_HTTP_OBSERVE_TIMEOUT_MS,
  );
  const target = parseLoopbackUrl(options.url ?? instance.network.url ?? "");
  const observationId = `http_probe_${Date.now().toString(36)}_${randomBytes(3).toString("hex")}`;
  const evidencePath = join(instancePaths(instance.worktree.path, instance.instanceId).observations, `${observationId}.http.json`);
  let requestedStatus: AppInstanceObservationStatus = "observed";
  let summary: string | null = null;
  let reason: string | null = null;
  let httpEvidence: Record<string, unknown> | null = null;

  if (instance.process.status !== "running") {
    requestedStatus = "observed";
    summary = "probe_not_run";
    reason = `instance_not_running:${instance.process.reason}`;
    httpEvidence = {
      schemaVersion: 1,
      type: "codexus.app.instance.http-probe",
      recordedAt: nowIso(),
      instanceId: instance.instanceId,
      url: target.toString(),
      status: "unavailable",
      reason,
      requestAttempted: false,
      authority: {
        controlsInstance: false,
        healthAuthority: false,
        completionAuthority: false,
      },
    };
  } else {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(target, { signal: controller.signal });
      const preview = await boundedResponsePreview(response);
      requestedStatus = response.ok ? "observed" : "failed";
      summary = response.ok ? `http_${response.status}` : `http_non_ok:${response.status}`;
      reason = response.ok ? null : "http_non_ok";
      httpEvidence = {
        schemaVersion: 1,
        type: "codexus.app.instance.http-probe",
        recordedAt: nowIso(),
        instanceId: instance.instanceId,
        url: target.toString(),
        status: requestedStatus,
        statusCode: response.status,
        ok: response.ok,
        timeoutMs,
        headers: {
          contentType: response.headers.get("content-type"),
        },
        body: {
          bytesRead: preview.bytesRead,
          truncated: preview.truncated,
          preview: preview.preview,
        },
        authority: {
          controlsInstance: false,
          healthAuthority: false,
          completionAuthority: false,
        },
      };
    } catch (error) {
      requestedStatus = "failed";
      summary = "request_failed";
      reason = error instanceof Error ? error.message : String(error);
      httpEvidence = {
        schemaVersion: 1,
        type: "codexus.app.instance.http-probe",
        recordedAt: nowIso(),
        instanceId: instance.instanceId,
        url: target.toString(),
        status: "failed",
        statusCode: null,
        ok: false,
        timeoutMs,
        reason,
        authority: {
          controlsInstance: false,
          healthAuthority: false,
          completionAuthority: false,
        },
      };
    } finally {
      clearTimeout(timer);
    }
  }

  await ensureDir(dirname(evidencePath));
  await writeJsonAtomic(evidencePath, httpEvidence);
  const { path, artifact } = await writeObservationArtifact(cwd, {
    instance,
    kind: "dev-server",
    source: "http-probe",
    requestedStatus,
    url: target.toString(),
    evidencePath,
    summary,
    reason,
  });
  return {
    schemaVersion: 1,
    stability: "experimental" as const,
    command: "app instance evidence probe" as const,
    cwd,
    path,
    probe: {
      source: "http-probe" as const,
      url: target.toString(),
      timeoutMs,
      evidencePath,
      status: artifact.observation.status,
      reason: artifact.observation.reason,
      controlsInstance: false as const,
      healthAuthority: false as const,
      completionAuthority: false as const,
    },
    observation: artifact,
  };
}

export async function recordAppInstanceLogObservation(cwd: string, options: {
  instanceId?: string;
  tail?: string;
}) {
  if (!options.instanceId) throw new Error("missing_app_instance_id");
  const instance = await findProjectedInstance(cwd, options.instanceId);
  const logs = await appInstanceLogs(cwd, {
    instanceId: options.instanceId,
    tail: options.tail,
  });
  const observationId = `log_snapshot_${Date.now().toString(36)}_${randomBytes(3).toString("hex")}`;
  const evidencePath = join(instancePaths(instance.worktree.path, instance.instanceId).observations, `${observationId}.log.json`);
  const stdout = redactLogTail(logs.stdout);
  const stderr = redactLogTail(logs.stderr);
  const hasLogEvidence = stdout.lines.length > 0 || stderr.lines.length > 0;
  const requestedStatus: AppInstanceObservationStatus = hasLogEvidence && instance.process.status === "running" ? "observed" : "unavailable";
  const reason = !hasLogEvidence
    ? "log_tail_empty_or_unavailable"
    : instance.process.status === "running"
      ? null
      : `instance_not_running:${instance.process.reason}`;
  const logEvidence = {
    schemaVersion: 1,
    type: "codexus.app.instance.log-snapshot",
    recordedAt: nowIso(),
    instanceId: instance.instanceId,
    tail: logs.tail,
    status: requestedStatus,
    reason,
    stdout,
    stderr,
    authority: {
      controlsInstance: false,
      healthAuthority: false,
      completionAuthority: false,
    },
  };

  await ensureDir(dirname(evidencePath));
  await writeJsonAtomic(evidencePath, logEvidence);
  const { path, artifact } = await writeObservationArtifact(cwd, {
    instance,
    kind: "log",
    source: "log-snapshot",
    requestedStatus,
    url: instance.network.url,
    evidencePath,
    summary: hasLogEvidence ? `log_tail:${logs.tail}` : "log_unavailable",
    reason,
  });
  return {
    schemaVersion: 1,
    stability: "experimental" as const,
    command: "app instance evidence logs" as const,
    cwd,
    path,
    logSnapshot: {
      source: "log-snapshot" as const,
      tail: logs.tail,
      evidencePath,
      status: artifact.observation.status,
      reason: artifact.observation.reason,
      stdoutLines: stdout.lines.length,
      stderrLines: stderr.lines.length,
      controlsInstance: false as const,
      healthAuthority: false as const,
      completionAuthority: false as const,
    },
    observation: artifact,
  };
}

async function fileMetric(path: string | null) {
  if (!path) return { path: null, exists: false, bytes: null as number | null, modifiedAt: null as string | null };
  if (!existsSync(path)) return { path, exists: false, bytes: null as number | null, modifiedAt: null as string | null };
  const info = await stat(path);
  return {
    path,
    exists: true,
    bytes: info.size,
    modifiedAt: info.mtime.toISOString(),
  };
}

function inferScreenshotMediaType(path: string): string | null {
  const extension = extname(path).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  if (extension === ".gif") return "image/gif";
  return null;
}

async function screenshotFileEvidence(path: string) {
  if (!existsSync(path)) throw new Error(`app_instance_screenshot_missing:${path}`);
  const info = await stat(path);
  if (!info.isFile()) throw new Error(`app_instance_screenshot_not_file:${path}`);
  if (info.size > MAX_SCREENSHOT_EVIDENCE_BYTES) throw new Error(`app_instance_screenshot_too_large:${path}`);
  const bytes = await readFile(path);
  return {
    path,
    exists: true as const,
    bytes: info.size,
    modifiedAt: info.mtime.toISOString(),
    mediaType: inferScreenshotMediaType(path),
    sha256: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
  };
}

export async function recordAppInstanceMetricObservation(cwd: string, options: {
  instanceId?: string;
}) {
  if (!options.instanceId) throw new Error("missing_app_instance_id");
  const instance = await findProjectedInstance(cwd, options.instanceId);
  const validation = await readInstanceArtifact(instance.artifactPath);
  if (!validation.artifact) throw new Error(`app_instance_artifact_invalid:${options.instanceId}`);
  const artifact = validation.artifact;
  const observationId = `metric_snapshot_${Date.now().toString(36)}_${randomBytes(3).toString("hex")}`;
  const evidencePath = join(instancePaths(instance.worktree.path, instance.instanceId).observations, `${observationId}.metric.json`);
  const stdoutPath = resolveArtifactPath(artifact, validation.path, artifact.logs.stdoutPath);
  const stderrPath = resolveArtifactPath(artifact, validation.path, artifact.logs.stderrPath);
  const heartbeatPath = resolveArtifactPath(artifact, validation.path, artifact.owner.heartbeatPath);
  const healthEvidencePath = resolveArtifactPath(artifact, validation.path, artifact.health.evidencePath);
  const metricEvidence = {
    schemaVersion: 1,
    type: "codexus.app.instance.metric-snapshot",
    recordedAt: nowIso(),
    instanceId: instance.instanceId,
    status: instance.process.status === "running" ? "observed" : "unavailable",
    reason: instance.process.status === "running" ? null : `instance_not_running:${instance.process.reason}`,
    process: {
      status: instance.process.status,
      reason: instance.process.reason,
      pid: instance.process.pid,
      processGroupId: instance.process.processGroupId,
      heartbeatFresh: instance.process.heartbeatFresh,
      heartbeatAgeMs: instance.process.heartbeatAgeMs,
      heartbeatStaleAfterMs: instance.process.heartbeatStaleAfterMs,
      lifecycle: instance.process.lifecycle,
    },
    heartbeat: {
      path: heartbeatPath,
      status: instance.heartbeat.status,
      updatedAt: instance.heartbeat.updatedAt,
      fresh: instance.heartbeat.fresh,
      ageMs: instance.heartbeat.ageMs,
      staleAfterMs: instance.heartbeat.staleAfterMs,
      runnerPid: instance.heartbeat.runnerPid,
      appPid: instance.heartbeat.appPid,
    },
    network: {
      url: instance.network.url,
      port: instance.network.port,
      host: instance.network.host,
    },
    health: {
      status: instance.health.status,
      rawStatus: instance.health.rawStatus,
      reason: instance.health.reason,
      lastCheckedAt: instance.health.lastCheckedAt,
      evidence: await fileMetric(healthEvidencePath),
    },
    logs: {
      stdout: await fileMetric(stdoutPath),
      stderr: await fileMetric(stderrPath),
    },
    authority: {
      controlsInstance: false,
      healthAuthority: false,
      completionAuthority: false,
    },
  };

  await ensureDir(dirname(evidencePath));
  await writeJsonAtomic(evidencePath, metricEvidence);
  const { path, artifact: observation } = await writeObservationArtifact(cwd, {
    instance,
    kind: "metric",
    source: "metric-snapshot",
    requestedStatus: "observed",
    url: instance.network.url,
    evidencePath,
    summary: `process:${instance.process.status};heartbeat:${instance.heartbeat.status}`,
    reason: metricEvidence.reason,
  });
  return {
    schemaVersion: 1,
    stability: "experimental" as const,
    command: "app instance evidence metrics" as const,
    cwd,
    path,
    metricSnapshot: {
      source: "metric-snapshot" as const,
      evidencePath,
      status: observation.observation.status,
      reason: observation.observation.reason,
      processStatus: instance.process.status,
      heartbeatFresh: instance.heartbeat.fresh,
      stdoutBytes: metricEvidence.logs.stdout.bytes,
      stderrBytes: metricEvidence.logs.stderr.bytes,
      controlsInstance: false as const,
      healthAuthority: false as const,
      completionAuthority: false as const,
    },
    observation,
  };
}

export async function recordAppInstanceScreenshotObservation(cwd: string, options: {
  instanceId?: string;
  evidencePath?: string;
  url?: string;
  summary?: string;
}) {
  if (!options.instanceId) throw new Error("missing_app_instance_id");
  if (!options.evidencePath) throw new Error("missing_app_instance_screenshot_evidence_path");
  const instance = await findProjectedInstance(cwd, options.instanceId);
  const sourcePath = resolve(cwd, options.evidencePath);
  const source = await screenshotFileEvidence(sourcePath);
  const targetUrl = options.url ? parseLoopbackUrl(options.url).toString() : instance.network.url;
  const observationId = `screenshot_snapshot_${Date.now().toString(36)}_${randomBytes(3).toString("hex")}`;
  const evidencePath = join(instancePaths(instance.worktree.path, instance.instanceId).observations, `${observationId}.screenshot.json`);
  const reason = instance.process.status === "running" ? null : `instance_not_running:${instance.process.reason}`;
  const screenshotEvidence = {
    schemaVersion: 1,
    type: "codexus.app.instance.screenshot-snapshot",
    recordedAt: nowIso(),
    instanceId: instance.instanceId,
    status: instance.process.status === "running" ? "observed" as const : "unavailable" as const,
    reason,
    url: targetUrl,
    source: "screenshot-file" as const,
    file: source,
    summary: options.summary?.trim() || `screenshot_file:${source.bytes} bytes`,
    authority: {
      controlsInstance: false,
      healthAuthority: false,
      completionAuthority: false,
    },
  };

  await ensureDir(dirname(evidencePath));
  await writeJsonAtomic(evidencePath, screenshotEvidence);
  const { path, artifact: observation } = await writeObservationArtifact(cwd, {
    instance,
    kind: "screenshot",
    source: "screenshot-file",
    requestedStatus: "observed",
    url: targetUrl,
    evidencePath,
    summary: screenshotEvidence.summary,
    reason,
  });
  return {
    schemaVersion: 1,
    stability: "experimental" as const,
    command: "app instance evidence screenshot" as const,
    cwd,
    path,
    screenshot: {
      source: "screenshot-file" as const,
      sourcePath,
      evidencePath,
      url: targetUrl,
      status: observation.observation.status,
      reason: observation.observation.reason,
      bytes: source.bytes,
      mediaType: source.mediaType,
      sha256: source.sha256,
      controlsInstance: false as const,
      healthAuthority: false as const,
      completionAuthority: false as const,
    },
    observation,
  };
}

async function listObservationPaths(worktree: string, instanceId: string): Promise<string[]> {
  const dir = instancePaths(worktree, instanceId).observations;
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir);
  return entries.filter((entry) => entry.endsWith(".json")).sort().map((entry) => join(dir, entry));
}

export async function readAppInstanceObservation(path: string): Promise<AppInstanceObservationValidation> {
  if (!existsSync(path)) return { path, valid: false, errors: ["observation_missing"], artifact: null };
  try {
    return validateAppInstanceObservation(JSON.parse(await readFile(path, "utf8")) as unknown, path);
  } catch (error) {
    return { path, valid: false, errors: [`json_unreadable:${error instanceof Error ? error.message : String(error)}`], artifact: null };
  }
}

export async function summarizeAppInstanceEvidence(cwd: string): Promise<AppInstanceEvidenceSummary> {
  const validations = await Promise.all((await listInstanceArtifactPaths(cwd)).map(readInstanceArtifact));
  const instanceCounts = {
    total: 0,
    running: 0,
    stopped: 0,
    orphaned: 0,
    unknown: 0,
  };
  const observationCounts = {
    total: 0,
    observed: 0,
    failed: 0,
    unavailable: 0,
    byKind: {
      browser: 0,
      "dev-server": 0,
      log: 0,
      screenshot: 0,
      metric: 0,
    } satisfies Record<AppInstanceObservationKind, number>,
    latest: null as AppInstanceEvidenceSummary["observations"]["latest"],
  };

  const observations: Array<AppInstanceObservationArtifact & { path: string }> = [];
  for (const validation of validations) {
    if (!validation.artifact) continue;
    const heartbeatPath = resolveArtifactPath(validation.artifact, validation.path, validation.artifact.owner.heartbeatPath);
    const heartbeat = await readHeartbeat(heartbeatPath);
    const process = projectProcess(validation.artifact, heartbeat);
    instanceCounts.total += 1;
    instanceCounts[process.status] += 1;
    const observationPaths = await listObservationPaths(validation.artifact.worktree.path, validation.artifact.instanceId);
    for (const path of observationPaths) {
      const observation = await readAppInstanceObservation(path);
      if (observation.artifact) observations.push({ ...observation.artifact, path });
    }
  }

  observations.sort((left, right) => right.recordedAt.localeCompare(left.recordedAt));
  for (const observation of observations) {
    observationCounts.total += 1;
    observationCounts[observation.observation.status] += 1;
    observationCounts.byKind[observation.observation.kind] += 1;
  }
  const latest = observations[0] ?? null;
  observationCounts.latest = latest
    ? {
      observationId: latest.observationId,
      recordedAt: latest.recordedAt,
      instanceId: latest.instance.instanceId,
      kind: latest.observation.kind,
      status: latest.observation.status,
      processStatus: latest.instance.processStatus,
      lifecycleState: latest.instance.lifecycleState ?? null,
      path: latest.path,
    }
    : null;

  return {
    schemaVersion: 1,
    stability: "experimental",
    status: instanceCounts.total > 0 || observationCounts.total > 0 ? "observed" : "empty",
    instances: instanceCounts,
    observations: observationCounts,
    authority: {
      controlsInstance: false,
      healthAuthority: false,
      completionAuthority: false,
    },
  };
}

export async function listAppInstanceObservations(cwd: string, options: { instanceId?: string }) {
  if (!options.instanceId) throw new Error("missing_app_instance_id");
  const instance = await findProjectedInstance(cwd, options.instanceId);
  const validations = await Promise.all((await listObservationPaths(instance.worktree.path, instance.instanceId)).map(readAppInstanceObservation));
  return {
    schemaVersion: 1,
    stability: "experimental" as const,
    command: "app instance evidence list" as const,
    cwd,
    instanceId: options.instanceId,
    observations: validations
      .filter((validation): validation is AppInstanceObservationValidation & { artifact: AppInstanceObservationArtifact } => validation.artifact !== null)
      .map((validation) => ({ path: validation.path, ...validation.artifact })),
    artifacts: validations.map((validation) => ({
      path: validation.path,
      valid: validation.valid,
      errors: validation.errors,
      observationId: validation.artifact?.observationId ?? null,
    })),
    authority: {
      controlsInstance: false as const,
      healthAuthority: false as const,
      completionAuthority: false as const,
    },
  };
}

export async function stopAppInstance(cwd: string, options: { instanceId?: string }) {
  if (!options.instanceId) throw new Error("missing_app_instance_id");
  const status = await appInstanceStatus(cwd, { instanceId: options.instanceId });
  const instance = status.instances[0];
  if (!instance) throw new Error(`app_instance_not_found:${options.instanceId}`);
  const validation = await readInstanceArtifact(instance.artifactPath);
  if (!validation.artifact) throw new Error(`app_instance_artifact_invalid:${options.instanceId}`);
  const artifact = validation.artifact;
  if (!artifact.owner.ownedByCodexus || !artifact.owner.ownerTokenHash || !artifact.owner.heartbeatPath) {
    return {
      schemaVersion: 1,
      stability: "experimental" as const,
      command: "app instance stop" as const,
      cwd,
      instanceId: options.instanceId,
      status: "unavailable" as const,
      stopped: false,
      reason: "stop_requires_codexus_owned_instance" as const,
      capabilities: {
        liveStop: false,
      },
    };
  }
  if (instance.process.status === "stopped") {
    return {
      schemaVersion: 1,
      stability: "experimental" as const,
      command: "app instance stop" as const,
      cwd,
      instanceId: options.instanceId,
      status: "already_stopped" as const,
      stopped: false,
      capabilities: {
        liveStop: true,
      },
    };
  }
  const heartbeatPath = resolveArtifactPath(artifact, validation.path, artifact.owner.heartbeatPath);
  const heartbeat = await readHeartbeat(heartbeatPath);
  if (!heartbeat || heartbeat.ownerTokenHash !== artifact.owner.ownerTokenHash) {
    return {
      schemaVersion: 1,
      stability: "experimental" as const,
      command: "app instance stop" as const,
      cwd,
      instanceId: options.instanceId,
      status: "unavailable" as const,
      stopped: false,
      reason: "owner_heartbeat_missing_or_mismatched" as const,
      capabilities: {
        liveStop: false,
      },
    };
  }
  const identity = ownerIdentityVerifiable(artifact.owner, heartbeat);
  if (!identity.ok) {
    return {
      schemaVersion: 1,
      stability: "experimental" as const,
      command: "app instance stop" as const,
      cwd,
      instanceId: options.instanceId,
      status: "unavailable" as const,
      stopped: false,
      reason: "owner_identity_unverifiable" as const,
      identityCheck: identity.reason,
      capabilities: {
        liveStop: false,
      },
    };
  }
  return await withFileLock(artifact.worktree.path, "app-instance", async () => {
    const termination = await terminateOwnedProcess(artifact.owner);
    const nextArtifact: AppInstanceArtifact = {
      ...artifact,
      status: "stopped",
      health: {
        ...artifact.health,
        status: artifact.health.url ? "unknown" : "unavailable",
      },
    };
    await writeJsonAtomic(validation.path, nextArtifact);
    return {
      schemaVersion: 1,
      stability: "experimental" as const,
      command: "app instance stop" as const,
      cwd,
      instanceId: options.instanceId,
      status: "stopped" as const,
      stopped: true,
      forced: termination.forced,
      capabilities: {
        liveStop: true,
      },
    };
  }, {
    operation: "app-instance-stop",
  });
}
