import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, statSync } from "node:fs";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { sha256Text } from "../util/hash.ts";

// Byte-accurate content hash. Hashes the raw Buffer (no encoding) so binary
// files and invalid-UTF-8 content are never lossily decoded. A utf8 decode would
// map distinct byte sequences to identical replacement characters, which could
// hide a real binary change behind an unchanged hash (a false "not dirty").
function sha256Bytes(bytes: Buffer): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

export const WORKSPACE_FINGERPRINT_SCHEMA_VERSION = 1 as const;

// Bounds for untracked-file hashing. Content-based, never mtime, but bounded so a
// large workspace cannot make fingerprinting unbounded. When exceeded, the
// untracked component is hashed over the bounded subset and marked partial.
export const MAX_UNTRACKED_FILES = 200;
export const MAX_UNTRACKED_BYTES = 5 * 1024 * 1024;

// Harness-internal state directories. These mutate on every Codexus command
// (state.json, locks, artifacts), so counting them as untracked workspace
// content would make the evidence model perpetually dirty/stale. They are
// excluded from the untracked component of the fingerprint.
const EXCLUDED_UNTRACKED_PREFIXES = [".codexus/", ".codex-harness/"];

function isExcludedUntracked(relative: string): boolean {
  const normalized = relative.replace(/\\/g, "/");
  return EXCLUDED_UNTRACKED_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

export interface UntrackedFingerprint {
  hash: string;
  count: number;
  partial: boolean;
}

export interface WorkspaceFingerprint {
  schemaVersion: typeof WORKSPACE_FINGERPRINT_SCHEMA_VERSION;
  isGit: boolean;
  head: string | null;
  stagedDiffHash: string | null;
  unstagedDiffHash: string | null;
  untracked: UntrackedFingerprint;
  cwd: string;
  computedAt: string;
  degraded: boolean;
  degradedReason: string | null;
}

interface GitResult {
  ok: boolean;
  stdout: string;
  status: number | null;
  error?: string;
}

function runGit(cwd: string, args: string[]): GitResult {
  const result = spawnSync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return {
    ok: result.status === 0,
    stdout: typeof result.stdout === "string" ? result.stdout : "",
    status: result.status,
    ...(result.error instanceof Error ? { error: result.error.message } : {}),
  };
}

function emptyUntracked(): UntrackedFingerprint {
  return { hash: sha256Text(""), count: 0, partial: false };
}

function degradedFingerprint(cwd: string, computedAt: string, reason: string): WorkspaceFingerprint {
  return {
    schemaVersion: WORKSPACE_FINGERPRINT_SCHEMA_VERSION,
    isGit: false,
    head: null,
    stagedDiffHash: null,
    unstagedDiffHash: null,
    untracked: emptyUntracked(),
    cwd,
    computedAt,
    degraded: true,
    degradedReason: reason,
  };
}

// Hash path + content of each untracked file, bounded by file count and total
// bytes. The file list comes from `git ls-files --others --exclude-standard`,
// which already respects .gitignore, so ignored files are never hashed.
function hashUntracked(cwd: string, paths: string[]): UntrackedFingerprint {
  let partial = paths.length > MAX_UNTRACKED_FILES;
  const bounded = paths.slice(0, MAX_UNTRACKED_FILES);
  const parts: string[] = [];
  let totalBytes = 0;
  let included = 0;
  for (const relative of bounded) {
    const absolute = join(cwd, relative);
    let contentHash: string;
    try {
      // Single stat reused for both isFile() and size, avoiding a TOCTOU window
      // and a redundant syscall between the two checks.
      const stat = existsSync(absolute) ? statSync(absolute) : null;
      if (!stat || !stat.isFile()) {
        // Path listed but no longer a readable regular file (symlink target,
        // race, fifo). Record its absence honestly rather than skipping silently.
        contentHash = "absent";
      } else {
        const size = stat.size;
        if (totalBytes + size > MAX_UNTRACKED_BYTES) {
          partial = true;
          break;
        }
        totalBytes += size;
        // Hash raw bytes (no encoding) so binary / invalid-UTF-8 changes are
        // observed exactly rather than collapsed to UTF-8 replacement chars.
        contentHash = sha256Bytes(readFileSync(absolute));
      }
    } catch {
      // Unreadable file: we could not fully observe the workspace. Mark partial
      // so the fingerprint never claims confident cleanliness it cannot back up,
      // and path-qualify the marker so two different unreadable files do not
      // collide to an identical hash.
      partial = true;
      contentHash = `unreadable:${relative}`;
    }
    parts.push(`${relative}\0${contentHash}`);
    included += 1;
  }
  return {
    hash: sha256Text(parts.join("\n")),
    count: included,
    partial,
  };
}

export function computeWorkspaceFingerprint(cwd: string): WorkspaceFingerprint {
  const resolvedCwd = resolve(cwd);
  const computedAt = new Date().toISOString();

  const topLevel = runGit(resolvedCwd, ["rev-parse", "--show-toplevel"]);
  if (!topLevel.ok) {
    const reason = topLevel.error
      ? `git_unavailable:${topLevel.error}`
      : "not_a_git_repository";
    return degradedFingerprint(resolvedCwd, computedAt, reason);
  }

  // Normalize every scope-sensitive query to the repository top level. `git diff`
  // is always repo-wide, but `git ls-files --others` is relative to the cwd, so
  // running from a subdirectory would mix a repo-wide diff with a subdir-only
  // untracked listing and could miss untracked files outside cwd (a false-fresh
  // fingerprint). Computing from the top level keeps diff/untracked/hash scopes
  // consistent and makes the fingerprint identical regardless of which
  // subdirectory it was invoked from.
  const root = topLevel.stdout.trim();
  const head = runGit(root, ["rev-parse", "HEAD"]);
  const stagedDiff = runGit(root, ["diff", "--binary", "--cached"]);
  const unstagedDiff = runGit(root, ["diff", "--binary"]);
  const untrackedList = runGit(root, ["ls-files", "--others", "--exclude-standard", "-z"]);

  // A brand-new repository with no commits has no HEAD; `git rev-parse HEAD`
  // fails. That is a legitimate (non-degraded) state: head is null but the diff
  // and untracked components still fully describe the workspace content.
  const headValue = head.ok ? head.stdout.trim() : null;

  if (!stagedDiff.ok || !unstagedDiff.ok || !untrackedList.ok) {
    return degradedFingerprint(resolvedCwd, computedAt, "git_diff_failed");
  }

  const untrackedPaths = untrackedList.stdout
    .split("\0")
    .filter((line) => line.length > 0)
    .filter((line) => !isExcludedUntracked(line));

  return {
    schemaVersion: WORKSPACE_FINGERPRINT_SCHEMA_VERSION,
    isGit: true,
    head: headValue,
    stagedDiffHash: sha256Text(stagedDiff.stdout),
    unstagedDiffHash: sha256Text(unstagedDiff.stdout),
    untracked: hashUntracked(root, untrackedPaths),
    cwd: resolvedCwd,
    computedAt,
    degraded: false,
    degradedReason: null,
  };
}

function isUntrackedFingerprint(value: unknown): value is UntrackedFingerprint {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.hash === "string"
    && typeof record.count === "number"
    && typeof record.partial === "boolean";
}

// Structural type guard, used by session-state validation. Matches the shape
// produced by computeWorkspaceFingerprint, including degraded fingerprints.
export function isWorkspaceFingerprint(value: unknown): value is WorkspaceFingerprint {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== WORKSPACE_FINGERPRINT_SCHEMA_VERSION) return false;
  if (typeof record.isGit !== "boolean") return false;
  if (!(record.head === null || typeof record.head === "string")) return false;
  if (!(record.stagedDiffHash === null || typeof record.stagedDiffHash === "string")) return false;
  if (!(record.unstagedDiffHash === null || typeof record.unstagedDiffHash === "string")) return false;
  if (!isUntrackedFingerprint(record.untracked)) return false;
  if (typeof record.cwd !== "string") return false;
  if (typeof record.computedAt !== "string") return false;
  if (typeof record.degraded !== "boolean") return false;
  if (!(record.degradedReason === null || typeof record.degradedReason === "string")) return false;
  return true;
}

// Pure equality over content hashes. Returns true only when BOTH fingerprints are
// non-degraded and every content component matches. If either side is degraded we
// cannot assert equality, so it returns false. `computedAt` and `cwd` are
// metadata and intentionally excluded from the comparison.
export function fingerprintsEqual(
  a: WorkspaceFingerprint | null | undefined,
  b: WorkspaceFingerprint | null | undefined,
): boolean {
  if (!a || !b) return false;
  if (a.degraded || b.degraded) return false;
  if (a.isGit !== b.isGit) return false;
  if (a.head !== b.head) return false;
  if (a.stagedDiffHash !== b.stagedDiffHash) return false;
  if (a.unstagedDiffHash !== b.unstagedDiffHash) return false;
  if (a.untracked.hash !== b.untracked.hash) return false;
  if (a.untracked.partial || b.untracked.partial) {
    // A partial untracked component cannot prove full equality of the untracked
    // set, so equality cannot be asserted under partiality.
    return false;
  }
  return true;
}
