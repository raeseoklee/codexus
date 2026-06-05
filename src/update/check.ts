import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { userHarnessRoot } from "../ledger/paths.ts";

export type UpdateStatus = "current" | "available" | "unknown" | "disabled";
export type UpdateSource = "registry" | "cache" | "none" | "disabled";

export interface UpdateSummary {
  schemaVersion: 1;
  stability: "experimental";
  packageName: "codexus";
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean | null;
  status: UpdateStatus;
  source: UpdateSource;
  checkedAt: string | null;
  cacheExpiresAt: string | null;
  ttlMs: number;
  registryChecked: boolean;
  cachePath: string;
  disabled: boolean;
  disabledReason: "env" | "cache_only_miss" | null;
  error: { kind: "registry_unavailable" | "cache_unreadable" | "cache_write_failed"; summary: string } | null;
  advisory: true;
  completionAuthority: false;
  installationMutated: false;
  primaryCommandCanFail: false;
}

interface UpdateCache {
  schemaVersion: 1;
  packageName: "codexus";
  latestVersion: string | null;
  checkedAt: string;
  registryError: string | null;
}

export interface UpdateCheckOptions {
  currentVersion: string;
  now?: Date;
  ttlMs?: number;
  cacheOnly?: boolean;
}

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

function cachePath(): string {
  if (process.env.CODEXUS_UPDATE_CACHE_DIR) return join(process.env.CODEXUS_UPDATE_CACHE_DIR, "latest.json");
  if (process.env.CODEXUS_HOME) return join(process.env.CODEXUS_HOME, "update", "latest.json");
  if (process.env.XDG_CACHE_HOME) return join(process.env.XDG_CACHE_HOME, "codexus", "update", "latest.json");
  return join(userHarnessRoot(), "update", "latest.json");
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

function readCache(path: string): { cache: UpdateCache | null; error: UpdateSummary["error"] } {
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
      const candidate = parsed as { latestVersion?: unknown; checkedAt: string; registryError?: unknown };
      return {
        cache: {
          schemaVersion: 1,
          packageName: "codexus",
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

function fetchLatestVersion(timeoutMs: number): { latestVersion: string | null; error: string | null } {
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
      const latest = (parsed as { latest?: unknown }).latest;
      return { latestVersion: typeof latest === "string" ? latest : null, error: null };
    }
    return { latestVersion: null, error: "npm dist-tags output was not an object" };
  } catch (error) {
    return { latestVersion: null, error: error instanceof Error ? error.message : String(error) };
  }
}

function fromKnownVersion(input: {
  currentVersion: string;
  latestVersion: string | null;
  source: UpdateSource;
  checkedAt: string | null;
  cachePath: string;
  ttlMs: number;
  now: Date;
  registryChecked: boolean;
  disabled?: boolean;
  disabledReason?: UpdateSummary["disabledReason"];
  error?: UpdateSummary["error"];
}): UpdateSummary {
  const cacheExpiresAt = input.checkedAt ? new Date(Date.parse(input.checkedAt) + input.ttlMs).toISOString() : null;
  const updateAvailable = input.latestVersion ? compareVersions(input.latestVersion, input.currentVersion) > 0 : null;
  const status: UpdateStatus = input.disabled
    ? "disabled"
    : input.latestVersion
      ? updateAvailable ? "available" : "current"
      : "unknown";
  return {
    schemaVersion: 1,
    stability: "experimental",
    packageName: "codexus",
    currentVersion: input.currentVersion,
    latestVersion: input.latestVersion,
    updateAvailable,
    status,
    source: input.source,
    checkedAt: input.checkedAt,
    cacheExpiresAt,
    ttlMs: input.ttlMs,
    registryChecked: input.registryChecked,
    cachePath: input.cachePath,
    disabled: input.disabled === true,
    disabledReason: input.disabledReason ?? null,
    error: input.error ?? null,
    advisory: true,
    completionAuthority: false,
    installationMutated: false,
    primaryCommandCanFail: false,
  };
}

export function buildUpdateSummary(options: UpdateCheckOptions): UpdateSummary {
  const now = options.now ?? new Date();
  const ttlMs = options.ttlMs ?? parsePositiveInt(process.env.CODEXUS_UPDATE_TTL_MS, DEFAULT_TTL_MS);
  const path = cachePath();
  const { cache, error: cacheError } = readCache(path);
  const checkedAtMs = cache ? Date.parse(cache.checkedAt) : Number.NaN;
  const freshCache = cache !== null && Number.isFinite(checkedAtMs) && now.getTime() - checkedAtMs < ttlMs;
  const disabledByEnv = process.env.CODEXUS_NO_UPDATE_CHECK === "1";
  const cacheOnly = options.cacheOnly === true || process.env.CI === "true" || process.env.CI === "1";

  if (disabledByEnv) {
    return fromKnownVersion({
      currentVersion: options.currentVersion,
      latestVersion: cache?.latestVersion ?? null,
      source: "disabled",
      checkedAt: cache?.checkedAt ?? null,
      cachePath: path,
      ttlMs,
      now,
      registryChecked: false,
      disabled: true,
      disabledReason: "env",
      error: cacheError,
    });
  }

  if (freshCache) {
    return fromKnownVersion({
      currentVersion: options.currentVersion,
      latestVersion: cache.latestVersion,
      source: "cache",
      checkedAt: cache.checkedAt,
      cachePath: path,
      ttlMs,
      now,
      registryChecked: false,
      error: cacheError,
    });
  }

  if (cacheOnly) {
    return fromKnownVersion({
      currentVersion: options.currentVersion,
      latestVersion: cache?.latestVersion ?? null,
      source: cache ? "cache" : "none",
      checkedAt: cache?.checkedAt ?? null,
      cachePath: path,
      ttlMs,
      now,
      registryChecked: false,
      disabled: cache === null,
      disabledReason: cache === null ? "cache_only_miss" : null,
      error: cacheError,
    });
  }

  const timeoutMs = parsePositiveInt(process.env.CODEXUS_UPDATE_TIMEOUT_MS, 1500);
  const fetched = fetchLatestVersion(timeoutMs);
  const checkedAt = now.toISOString();
  if (fetched.error) {
    const registryError: UpdateSummary["error"] = { kind: "registry_unavailable", summary: fetched.error };
    const writeError = writeCache(path, {
      schemaVersion: 1,
      packageName: "codexus",
      latestVersion: cache?.latestVersion ?? null,
      checkedAt,
      registryError: fetched.error,
    });
    return fromKnownVersion({
      currentVersion: options.currentVersion,
      latestVersion: cache?.latestVersion ?? null,
      source: cache ? "cache" : "none",
      checkedAt: cache?.checkedAt ?? checkedAt,
      cachePath: path,
      ttlMs,
      now,
      registryChecked: true,
      error: writeError ?? registryError,
    });
  }
  const writeError = writeCache(path, {
    schemaVersion: 1,
    packageName: "codexus",
    latestVersion: fetched.latestVersion,
    checkedAt,
    registryError: null,
  });
  return fromKnownVersion({
    currentVersion: options.currentVersion,
    latestVersion: fetched.latestVersion,
    source: "registry",
    checkedAt,
    cachePath: path,
    ttlMs,
    now,
    registryChecked: true,
    error: writeError,
  });
}
