import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { userHarnessRoot } from "../ledger/paths.ts";

export type UpdateStatus = "current" | "available" | "unknown" | "disabled";
export type UpdateSource = "registry" | "cache" | "none" | "disabled";
export type UpdateChannel = "stable" | "next";
export type UpdateDistTag = "latest" | "next";
export type UpdateCacheState = "fresh" | "stale" | "missing";
export type UpdateNotificationStatus = "available" | "silent";

export interface UpdateNotification {
  schemaVersion: 1;
  status: UpdateNotificationStatus;
  shouldNotify: boolean;
  reason:
    | "update_available"
    | "no_fresh_update_available"
    | "cache_only_unavailable"
    | "disabled"
    | "unknown";
  message: string | null;
  command: string;
  advisory: true;
  completionAuthority: false;
  installationMutated: false;
}

export interface UpdateSummary {
  schemaVersion: 1;
  stability: "experimental";
  packageName: "codexus";
  channel: UpdateChannel;
  distTag: UpdateDistTag;
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean | null;
  status: UpdateStatus;
  source: UpdateSource;
  checkedAt: string | null;
  cacheExpiresAt: string | null;
  ttlMs: number;
  cacheState: UpdateCacheState;
  versionFresh: boolean;
  registryChecked: boolean;
  cachePath: string;
  disabled: boolean;
  disabledReason: "env" | "cache_only_miss" | "cache_only_stale" | null;
  error: { kind: "registry_unavailable" | "cache_unreadable" | "cache_write_failed"; summary: string } | null;
  advisory: true;
  completionAuthority: false;
  installationMutated: false;
  primaryCommandCanFail: false;
  notification: UpdateNotification;
}

interface UpdateCache {
  schemaVersion: 1;
  packageName: "codexus";
  channel?: UpdateChannel;
  distTag?: UpdateDistTag;
  latestVersion: string | null;
  checkedAt: string;
  registryError: string | null;
}

export interface UpdateCheckOptions {
  currentVersion: string;
  channel?: UpdateChannel;
  now?: Date;
  ttlMs?: number;
  cacheOnly?: boolean;
}

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

export function normalizeUpdateChannel(value: string | undefined): UpdateChannel | null {
  if (!value || value === "stable" || value === "latest") return "stable";
  if (value === "next" || value === "prerelease") return "next";
  return null;
}

function distTagForChannel(channel: UpdateChannel): UpdateDistTag {
  return channel === "next" ? "next" : "latest";
}

function cacheFileName(channel: UpdateChannel): string {
  return channel === "next" ? "next.json" : "latest.json";
}

function cachePath(channel: UpdateChannel): string {
  const fileName = cacheFileName(channel);
  if (process.env.CODEXUS_UPDATE_CACHE_DIR) return join(process.env.CODEXUS_UPDATE_CACHE_DIR, fileName);
  if (process.env.CODEXUS_HOME) return join(process.env.CODEXUS_HOME, "update", fileName);
  if (process.env.XDG_CACHE_HOME) return join(process.env.XDG_CACHE_HOME, "codexus", "update", fileName);
  return join(userHarnessRoot(), "update", fileName);
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function compareVersions(left: string, right: string): number {
  const leftParts = left.split("-")[0].split(".").map((part) => Number.parseInt(part, 10));
  const rightParts = right.split("-")[0].split(".").map((part) => Number.parseInt(part, 10));
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const a = Number.isFinite(leftParts[index]) ? leftParts[index] : 0;
    const b = Number.isFinite(rightParts[index]) ? rightParts[index] : 0;
    if (a > b) return 1;
    if (a < b) return -1;
  }
  return 0;
}

function readCache(path: string, expectedChannel: UpdateChannel): { cache: UpdateCache | null; error: UpdateSummary["error"] } {
  if (!existsSync(path)) return { cache: null, error: null };
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    if (
      typeof parsed === "object"
      && parsed !== null
      && !Array.isArray(parsed)
      && (parsed as { schemaVersion?: unknown }).schemaVersion === 1
      && (parsed as { packageName?: unknown }).packageName === "codexus"
      && typeof (parsed as { checkedAt?: unknown }).checkedAt === "string"
    ) {
      const candidate = parsed as {
        channel?: unknown;
        distTag?: unknown;
        latestVersion?: unknown;
        checkedAt: string;
        registryError?: unknown;
      };
      const channel = typeof candidate.channel === "string" ? normalizeUpdateChannel(candidate.channel) : expectedChannel;
      const distTag = typeof candidate.distTag === "string" && (candidate.distTag === "latest" || candidate.distTag === "next")
        ? candidate.distTag
        : distTagForChannel(expectedChannel);
      if (channel !== expectedChannel || distTag !== distTagForChannel(expectedChannel)) {
        return { cache: null, error: { kind: "cache_unreadable", summary: "update cache belongs to a different channel" } };
      }
      return {
        cache: {
          schemaVersion: 1,
          packageName: "codexus",
          channel,
          distTag,
          latestVersion: typeof candidate.latestVersion === "string" ? candidate.latestVersion : null,
          checkedAt: candidate.checkedAt,
          registryError: typeof candidate.registryError === "string" ? candidate.registryError : null,
        },
        error: null,
      };
    }
    return { cache: null, error: { kind: "cache_unreadable", summary: "update cache has an unsupported shape" } };
  } catch (error) {
    return {
      cache: null,
      error: {
        kind: "cache_unreadable",
        summary: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

function writeCache(path: string, cache: UpdateCache): UpdateSummary["error"] {
  try {
    mkdirSync(dirname(path), { recursive: true });
    const temp = `${path}.${process.pid}.tmp`;
    writeFileSync(temp, `${JSON.stringify(cache, null, 2)}\n`);
    renameSync(temp, path);
    return null;
  } catch (error) {
    return {
      kind: "cache_write_failed",
      summary: error instanceof Error ? error.message : String(error),
    };
  }
}

function fetchLatestVersion(timeoutMs: number, distTag: UpdateDistTag): { latestVersion: string | null; error: string | null } {
  const npmCommand = process.env.CODEXUS_UPDATE_NPM_COMMAND ?? "npm";
  const result = spawnSync(npmCommand, ["view", "codexus", "dist-tags", "--json", "--prefer-online"], {
    encoding: "utf8",
    timeout: timeoutMs,
  });
  if (result.status !== 0) {
    return {
      latestVersion: null,
      error: (result.stderr || result.stdout || result.error?.message || `exit ${result.status ?? "unknown"}`).trim(),
    };
  }
  try {
    const parsed = JSON.parse(result.stdout) as unknown;
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      const latest = (parsed as Record<string, unknown>)[distTag];
      return { latestVersion: typeof latest === "string" ? latest : null, error: null };
    }
    return { latestVersion: null, error: "npm dist-tags output was not an object" };
  } catch (error) {
    return { latestVersion: null, error: error instanceof Error ? error.message : String(error) };
  }
}

function fromKnownVersion(input: {
  currentVersion: string;
  channel: UpdateChannel;
  distTag: UpdateDistTag;
  latestVersion: string | null;
  source: UpdateSource;
  checkedAt: string | null;
  cachePath: string;
  ttlMs: number;
  now: Date;
  cacheState: UpdateCacheState;
  versionFresh?: boolean;
  registryChecked: boolean;
  disabled?: boolean;
  disabledReason?: UpdateSummary["disabledReason"];
  error?: UpdateSummary["error"];
}): UpdateSummary {
  const cacheExpiresAt = input.checkedAt ? new Date(Date.parse(input.checkedAt) + input.ttlMs).toISOString() : null;
  const versionFresh = input.versionFresh ?? (input.source === "registry" || input.cacheState === "fresh");
  const updateAvailable = input.latestVersion && versionFresh ? compareVersions(input.latestVersion, input.currentVersion) > 0 : null;
  const status: UpdateStatus = input.disabled
    ? "disabled"
    : input.latestVersion && versionFresh
      ? updateAvailable ? "available" : "current"
      : "unknown";
  const notification = buildUpdateNotification({
    channel: input.channel,
    currentVersion: input.currentVersion,
    latestVersion: input.latestVersion,
    status,
    versionFresh,
    disabled: input.disabled === true,
    disabledReason: input.disabledReason ?? null,
  });
  return {
    schemaVersion: 1,
    stability: "experimental",
    packageName: "codexus",
    channel: input.channel,
    distTag: input.distTag,
    currentVersion: input.currentVersion,
    latestVersion: input.latestVersion,
    updateAvailable,
    status,
    source: input.source,
    checkedAt: input.checkedAt,
    cacheExpiresAt,
    ttlMs: input.ttlMs,
    cacheState: input.cacheState,
    versionFresh,
    registryChecked: input.registryChecked,
    cachePath: input.cachePath,
    disabled: input.disabled === true,
    disabledReason: input.disabledReason ?? null,
    error: input.error ?? null,
    advisory: true,
    completionAuthority: false,
    installationMutated: false,
    primaryCommandCanFail: false,
    notification,
  };
}

function buildUpdateNotification(input: {
  channel: UpdateChannel;
  currentVersion: string;
  latestVersion: string | null;
  status: UpdateStatus;
  versionFresh: boolean;
  disabled: boolean;
  disabledReason: UpdateSummary["disabledReason"];
}): UpdateNotification {
  const checkCommand = input.channel === "next"
    ? "codexus update check --channel next --json"
    : "codexus update check --json";
  if (input.status === "available" && input.versionFresh && input.latestVersion) {
    const installCommand = input.channel === "next"
      ? `npm install -g codexus@next`
      : `npm install -g codexus`;
    return {
      schemaVersion: 1,
      status: "available",
      shouldNotify: true,
      reason: "update_available",
      message: `Codexus ${input.channel} update available: ${input.currentVersion} -> ${input.latestVersion}. Run \`${checkCommand}\` for details; install explicitly with \`${installCommand}\` when you choose.`,
      command: checkCommand,
      advisory: true,
      completionAuthority: false,
      installationMutated: false,
    };
  }
  const reason: UpdateNotification["reason"] = input.disabled
    ? input.disabledReason === "env" ? "disabled" : "cache_only_unavailable"
    : input.versionFresh ? "no_fresh_update_available" : "unknown";
  return {
    schemaVersion: 1,
    status: "silent",
    shouldNotify: false,
    reason,
    message: null,
    command: checkCommand,
    advisory: true,
    completionAuthority: false,
    installationMutated: false,
  };
}

export function buildUpdateSummary(options: UpdateCheckOptions): UpdateSummary {
  const now = options.now ?? new Date();
  const channel = options.channel ?? "stable";
  const distTag = distTagForChannel(channel);
  const ttlMs = options.ttlMs ?? parsePositiveInt(process.env.CODEXUS_UPDATE_TTL_MS, DEFAULT_TTL_MS);
  const path = cachePath(channel);
  const { cache, error: cacheError } = readCache(path, channel);
  const checkedAtMs = cache ? Date.parse(cache.checkedAt) : Number.NaN;
  const freshCache = cache !== null && Number.isFinite(checkedAtMs) && now.getTime() - checkedAtMs < ttlMs;
  const cacheState: UpdateCacheState = cache === null ? "missing" : freshCache ? "fresh" : "stale";
  const disabledByEnv = process.env.CODEXUS_NO_UPDATE_CHECK === "1";
  const cacheOnly = options.cacheOnly === true || process.env.CI === "true" || process.env.CI === "1";

  if (disabledByEnv) {
    return fromKnownVersion({
      currentVersion: options.currentVersion,
      channel,
      distTag,
      latestVersion: cache?.latestVersion ?? null,
      source: "disabled",
      checkedAt: cache?.checkedAt ?? null,
      cachePath: path,
      ttlMs,
      now,
      cacheState,
      versionFresh: freshCache,
      registryChecked: false,
      disabled: true,
      disabledReason: "env",
      error: cacheError,
    });
  }

  if (freshCache) {
    return fromKnownVersion({
      currentVersion: options.currentVersion,
      channel,
      distTag,
      latestVersion: cache.latestVersion,
      source: "cache",
      checkedAt: cache.checkedAt,
      cachePath: path,
      ttlMs,
      now,
      cacheState,
      versionFresh: true,
      registryChecked: false,
      error: cacheError,
    });
  }

  if (cacheOnly) {
    return fromKnownVersion({
      currentVersion: options.currentVersion,
      channel,
      distTag,
      latestVersion: cache?.latestVersion ?? null,
      source: cache ? "cache" : "none",
      checkedAt: cache?.checkedAt ?? null,
      cachePath: path,
      ttlMs,
      now,
      cacheState,
      versionFresh: freshCache,
      registryChecked: false,
      disabled: true,
      disabledReason: cache === null ? "cache_only_miss" : "cache_only_stale",
      error: cacheError,
    });
  }

  const timeoutMs = parsePositiveInt(process.env.CODEXUS_UPDATE_TIMEOUT_MS, 1500);
  const fetched = fetchLatestVersion(timeoutMs, distTag);
  const checkedAt = now.toISOString();
  if (fetched.error) {
    const registryError: UpdateSummary["error"] = { kind: "registry_unavailable", summary: fetched.error };
    const writeError = writeCache(path, {
      schemaVersion: 1,
      packageName: "codexus",
      channel,
      distTag,
      latestVersion: cache?.latestVersion ?? null,
      checkedAt,
      registryError: fetched.error,
    });
    return fromKnownVersion({
      currentVersion: options.currentVersion,
      channel,
      distTag,
      latestVersion: cache?.latestVersion ?? null,
      source: cache ? "cache" : "none",
      checkedAt: cache?.checkedAt ?? checkedAt,
      cachePath: path,
      ttlMs,
      now,
      cacheState,
      versionFresh: false,
      registryChecked: true,
      error: writeError ?? registryError,
    });
  }
  const writeError = writeCache(path, {
    schemaVersion: 1,
    packageName: "codexus",
    channel,
    distTag,
    latestVersion: fetched.latestVersion,
    checkedAt,
    registryError: null,
  });
  return fromKnownVersion({
    currentVersion: options.currentVersion,
    channel,
    distTag,
    latestVersion: fetched.latestVersion,
    source: "registry",
    checkedAt,
    cachePath: path,
    ttlMs,
    now,
    cacheState: "fresh",
    versionFresh: true,
    registryChecked: true,
    error: writeError,
  });
}
