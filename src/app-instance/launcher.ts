import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { open, readFile, readdir, stat } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { harnessRoot } from "../ledger/paths.ts";

export type AppInstanceHealthStatus = "passed" | "failed" | "unknown" | "unavailable";
export type AppInstanceStatus = "running" | "stopped" | "orphaned" | "unknown";

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

const MAX_LOG_TAIL_BYTES = 64 * 1024;
const DEFAULT_LOG_TAIL_LINES = 80;
const MAX_LOG_TAIL_LINES = 500;

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

function requireInteger(record: Record<string, unknown>, key: string, errors: string[], path = key): number | null {
  const value = record[key];
  if (!Number.isInteger(value)) {
    errors.push(`${path}:expected_integer`);
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

function renderHealthUrl(profile: AppInstanceProfile, port: number | null): string | null {
  if (!profile.health) return null;
  if (port === null) return profile.health.url;
  return profile.health.url.replaceAll("{port}", String(port));
}

export async function listAppInstanceProfiles(cwd: string, options: { descriptorPath?: string }) {
  const descriptor = await readAppInstanceDescriptor(cwd, options.descriptorPath);
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
      liveStart: false,
      liveStop: false,
      dryRunStart: descriptor.declared && descriptor.validation.valid,
    },
  };
}

export async function planAppInstanceStart(cwd: string, options: {
  descriptorPath?: string;
  profile?: string;
  worktree?: string;
  port?: string;
  dryRun: boolean;
}) {
  if (!options.dryRun) throw new Error("unsupported_feature:app-instance-live-start");
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
  const candidatePort = portOverride ?? profile.port.preferred;
  const instanceId = `app_dry_run_${Date.now().toString(36)}`;
  const instanceDir = join(harnessRoot(worktree), "app-instances", instanceId);
  const stdoutPath = profile.log.stdout ? join(instanceDir, "stdout.log") : null;
  const stderrPath = profile.log.stderr ? join(instanceDir, "stderr.log") : null;
  const heartbeatPath = join(instanceDir, "heartbeat.json");
  return {
    schemaVersion: 1,
    stability: "experimental" as const,
    command: "app instance start" as const,
    mode: "dry-run" as const,
    spawned: false,
    status: "planned" as const,
    cwd,
    descriptor: {
      source: descriptor.source,
      path: descriptor.path,
      valid: descriptor.validation.valid,
    },
    profile,
    worktree: inspectWorktree(worktree),
    launchPlan: {
      command: profile.command,
      cwd: profileCwd,
      host: "127.0.0.1" as const,
      port: candidatePort,
      healthUrl: renderHealthUrl(profile, candidatePort),
      portCheck: {
        status: "not_checked" as const,
        reason: "dry_run_does_not_bind_or_probe_ports" as const,
      },
      environment: {
        copied: false,
        reason: "first_slice_does_not_copy_environment_variables" as const,
      },
    },
    wouldWrite: {
      instanceId,
      instancePath: join(instanceDir, "instance.json"),
      heartbeatPath,
      stdoutPath,
      stderrPath,
    },
    capabilities: {
      liveStart: false,
      liveStop: false,
      dryRunStart: true,
    },
  };
}

function isHealthStatus(value: unknown): value is AppInstanceHealthStatus {
  return value === "passed" || value === "failed" || value === "unknown" || value === "unavailable";
}

function isInstanceStatus(value: unknown): value is AppInstanceStatus {
  return value === "running" || value === "stopped" || value === "orphaned" || value === "unknown";
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
      heartbeatPath: optionalString(value.owner, "heartbeatPath", errors, "owner.heartbeatPath"),
    }
    : { ownedByCodexus: false, ownerTokenHash: null, pid: null, processGroupId: null, heartbeatPath: null };
  const networkPort = isRecord(value.network) && value.network.port === null ? null : isRecord(value.network) ? requireInteger(value.network, "port", errors, "network.port") : null;
  if (networkPort !== null && (networkPort < 1 || networkPort > 65535)) errors.push("network.port:expected_port_range");
  const network = isRecord(value.network)
    ? {
      host: value.network.host === "127.0.0.1" ? "127.0.0.1" as const : "127.0.0.1" as const,
      port: networkPort,
      url: optionalString(value.network, "url", errors, "network.url"),
    }
    : { host: "127.0.0.1" as const, port: null, url: null };
  if (isRecord(value.network) && value.network.host !== "127.0.0.1") errors.push("network.host:not_loopback");
  const rawHealthStatus = isRecord(value.health) ? value.health.status : null;
  if (!isHealthStatus(rawHealthStatus)) errors.push("health.status:invalid_enum");
  const health = isRecord(value.health)
    ? {
      status: isHealthStatus(rawHealthStatus) ? rawHealthStatus : "unknown" as const,
      lastCheckedAt: optionalString(value.health, "lastCheckedAt", errors, "health.lastCheckedAt"),
      evidencePath: optionalString(value.health, "evidencePath", errors, "health.evidencePath"),
    }
    : { status: "unknown" as const, lastCheckedAt: null, evidencePath: null };
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

function instanceRoot(cwd: string): string {
  return join(harnessRoot(cwd), "app-instances");
}

async function readInstanceArtifact(path: string): Promise<AppInstanceArtifactValidation> {
  try {
    return validateAppInstanceArtifact(JSON.parse(await readFile(path, "utf8")) as unknown, path);
  } catch (error) {
    return { path, valid: false, errors: [`json_unreadable:${error instanceof Error ? error.message : String(error)}`], artifact: null };
  }
}

async function listInstanceArtifactPaths(cwd: string): Promise<string[]> {
  const root = instanceRoot(cwd);
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

function projectHealth(artifact: AppInstanceArtifact, artifactPath: string) {
  const evidencePath = resolveArtifactPath(artifact, artifactPath, artifact.health.evidencePath);
  const evidenceExists = evidencePath !== null && existsSync(evidencePath);
  if (artifact.health.status === "passed" && !evidenceExists) {
    return {
      status: "unknown" as const,
      rawStatus: artifact.health.status,
      evidencePath,
      evidenceExists,
      reason: "passed_health_requires_existing_evidence_artifact" as const,
    };
  }
  return {
    status: artifact.health.status,
    rawStatus: artifact.health.status,
    evidencePath,
    evidenceExists,
    reason: null,
  };
}

function projectInstance(validation: AppInstanceArtifactValidation) {
  if (!validation.artifact) return null;
  const artifact = validation.artifact;
  return {
    instanceId: artifact.instanceId,
    artifactPath: validation.path,
    worktree: artifact.worktree,
    profile: artifact.profile,
    status: artifact.status,
    process: {
      status: "unknown" as const,
      reason: "live_process_liveness_probe_deferred" as const,
      pid: artifact.owner.pid,
      ownedByCodexus: artifact.owner.ownedByCodexus,
    },
    network: artifact.network,
    health: projectHealth(artifact, validation.path),
    logs: artifact.logs,
  };
}

export async function appInstanceStatus(cwd: string, options: { instanceId?: string; worktree?: string }) {
  const scanCwd = resolve(options.worktree ?? cwd);
  const validations = await Promise.all((await listInstanceArtifactPaths(scanCwd)).map(readInstanceArtifact));
  const projected = validations
    .map(projectInstance)
    .filter((item): item is NonNullable<ReturnType<typeof projectInstance>> => item !== null)
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
      liveProcessProbe: false,
      liveStart: false,
      liveStop: false,
    },
  };
}

async function readTail(path: string | null, lines: number) {
  if (!path) return { path: null, exists: false, truncated: false, lines: [] as string[] };
  if (!existsSync(path)) return { path, exists: false, truncated: false, lines: [] as string[] };
  const info = await stat(path);
  const length = Math.min(info.size, MAX_LOG_TAIL_BYTES);
  const buffer = Buffer.alloc(length);
  const handle = await open(path, "r");
  try {
    await handle.read(buffer, 0, length, info.size - length);
  } finally {
    await handle.close();
  }
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

export async function appInstanceStopUnavailable(cwd: string, options: { instanceId?: string }) {
  if (!options.instanceId) throw new Error("missing_app_instance_id");
  return {
    schemaVersion: 1,
    stability: "experimental" as const,
    command: "app instance stop" as const,
    cwd,
    instanceId: options.instanceId,
    status: "unavailable" as const,
    stopped: false,
    reason: "live_stop_deferred_until_owned_process_artifact_and_owner_token_are_enforced" as const,
    capabilities: {
      liveStop: false,
    },
  };
}
