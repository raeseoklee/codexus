import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { hostname } from "node:os";
import { dirname, join, resolve } from "node:path";
import { ensureDir } from "./fs.ts";

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
}

const defaultLockTtlMs = 10 * 60 * 1000;

export function lockPath(cwd: string, name: string): string {
  const safe = name.toLowerCase().replace(/[^a-z0-9_.-]+/g, "-").replace(/^-|-$/g, "") || "lock";
  return join(resolve(cwd), ".codex-harness", "locks", `${safe}.lock`);
}

function metadataPath(path: string): string {
  return join(path, "owner.json");
}

export function isLockMetadataStale(metadata: LockMetadata, now = Date.now()): boolean {
  return now - new Date(metadata.createdAt).getTime() > metadata.ttlMs;
}

async function readLockMetadata(path: string): Promise<LockMetadata | null> {
  try {
    return JSON.parse(await readFile(metadataPath(path), "utf8")) as LockMetadata;
  } catch {
    return null;
  }
}

export async function inspectLock(cwd: string, name: string): Promise<LockInfo> {
  const path = lockPath(cwd, name);
  const metadata = existsSync(path) ? await readLockMetadata(path) : null;
  return {
    name,
    path,
    exists: existsSync(path),
    stale: metadata ? isLockMetadataStale(metadata) : existsSync(path),
    metadata,
  };
}

export async function listLocks(cwd: string): Promise<LockInfo[]> {
  const root = join(resolve(cwd), ".codex-harness", "locks");
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
  await rm(info.path, { recursive: true, force: true });
  return { ...info, exists: false };
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
    await rm(path, { recursive: true, force: true });
  }
}
