import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { hostname } from "node:os";
import { dirname, join } from "node:path";
import { ensureDir } from "./fs.ts";
import { harnessRoot } from "../ledger/paths.ts";

export interface LockMetadata {
  schemaVersion: 1;
  name: string;
  pid: number;
  hostname: string;
  createdAt: string;
  ttlMs: number;
  operation: string;
}

export interface LockInfo {
  name: string;
  path: string;
  exists: boolean;
  stale: boolean;
  metadata: LockMetadata | null;
  ownerValid: boolean;
  error: string | null;
}

const defaultLockTtlMs = 10 * 60 * 1000;
const missingOwnerGraceMs = 5_000;

export function lockPath(cwd: string, name: string): string {
  const safe = name.toLowerCase().replace(/[^a-z0-9_.-]+/g, "-").replace(/^-|-$/g, "") || "lock";
  return join(harnessRoot(cwd), "locks", `${safe}.lock`);
}

function metadataPath(path: string): string {
  return join(path, "owner.json");
}

export function isLockMetadataStale(metadata: LockMetadata, now = Date.now()): boolean {
  const created = new Date(metadata.createdAt).getTime();
  if (!Number.isFinite(created) || !Number.isFinite(metadata.ttlMs) || metadata.ttlMs <= 0) return true;
  return now - created > metadata.ttlMs;
}

function isLockMetadata(value: unknown): value is LockMetadata {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return record.schemaVersion === 1
    && typeof record.name === "string"
    && Number.isInteger(record.pid)
    && typeof record.hostname === "string"
    && typeof record.createdAt === "string"
    && typeof record.ttlMs === "number"
    && typeof record.operation === "string";
}

async function lockDirAgeMs(path: string): Promise<number> {
  try {
    return Date.now() - (await stat(path)).mtimeMs;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

async function readLockMetadata(path: string): Promise<{ metadata: LockMetadata | null; error: string | null }> {
  try {
    const parsed = JSON.parse(await readFile(metadataPath(path), "utf8")) as unknown;
    if (!isLockMetadata(parsed)) return { metadata: null, error: "owner_invalid" };
    return { metadata: parsed, error: null };
  } catch (error) {
    return { metadata: null, error: error instanceof SyntaxError ? "owner_parse_failed" : "owner_missing" };
  }
}

export async function inspectLock(cwd: string, name: string): Promise<LockInfo> {
  const path = lockPath(cwd, name);
  const exists = existsSync(path);
  const owner = exists ? await readLockMetadata(path) : { metadata: null, error: null };
  const ageMs = exists && !owner.metadata ? await lockDirAgeMs(path) : 0;
  const ownerValid = Boolean(owner.metadata);
  return {
    name,
    path,
    exists,
    stale: owner.metadata ? isLockMetadataStale(owner.metadata) : exists && ageMs > missingOwnerGraceMs,
    metadata: owner.metadata,
    ownerValid,
    error: owner.error,
  };
}

export async function listLocks(cwd: string): Promise<LockInfo[]> {
  const root = join(harnessRoot(cwd), "locks");
  if (!existsSync(root)) return [];
  const entries = await readdir(root, { withFileTypes: true });
  const locks: LockInfo[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.endsWith(".lock")) continue;
    const name = entry.name.slice(0, -".lock".length);
    locks.push(await inspectLock(cwd, name));
  }
  return locks.sort((left, right) => left.name.localeCompare(right.name));
}

export async function clearLock(cwd: string, name: string, options: { staleOnly?: boolean } = {}): Promise<LockInfo> {
  const info = await inspectLock(cwd, name);
  if (!info.exists) throw new Error(`lock_not_found:${name}`);
  if (options.staleOnly && !info.stale) throw new Error(`lock_not_stale:${name}`);
  if (options.staleOnly) {
    const rechecked = await inspectLock(cwd, name);
    if (!rechecked.exists) throw new Error(`lock_not_found:${name}`);
    if (!rechecked.stale) throw new Error(`lock_not_stale:${name}`);
  }
  await rm(info.path, { recursive: true, force: true });
  return { ...info, exists: false };
}

function sameOwner(left: LockMetadata | null, right: LockMetadata): boolean {
  return Boolean(left
    && left.name === right.name
    && left.pid === right.pid
    && left.hostname === right.hostname
    && left.createdAt === right.createdAt);
}

export async function withFileLock<T>(cwd: string, name: string, fn: () => Promise<T>, options: {
  ttlMs?: number;
  operation?: string;
} = {}): Promise<T> {
  const path = lockPath(cwd, name);
  await ensureDir(dirname(path));
  try {
    await mkdir(path);
  } catch {
    const info = await inspectLock(cwd, name);
    if (!info.stale) throw new Error(`lock_unavailable:${name}`);
    await clearLock(cwd, name, { staleOnly: true });
    await mkdir(path);
  }
  const metadata: LockMetadata = {
    schemaVersion: 1,
    name,
    pid: process.pid,
    hostname: hostname(),
    createdAt: new Date().toISOString(),
    ttlMs: options.ttlMs ?? defaultLockTtlMs,
    operation: options.operation ?? name,
  };
  await writeFile(metadataPath(path), `${JSON.stringify(metadata, null, 2)}\n`);
  try {
    return await fn();
  } finally {
    const owner = await readLockMetadata(path);
    if (sameOwner(owner.metadata, metadata)) {
      await rm(path, { recursive: true, force: true });
    }
  }
}
