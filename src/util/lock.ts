import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { ensureDir } from "./fs.ts";

export function lockPath(cwd: string, name: string): string {
  const safe = name.toLowerCase().replace(/[^a-z0-9_.-]+/g, "-").replace(/^-|-$/g, "") || "lock";
  return join(resolve(cwd), ".codex-harness", "locks", `${safe}.lock`);
}

export async function withFileLock<T>(cwd: string, name: string, fn: () => Promise<T>): Promise<T> {
  const path = lockPath(cwd, name);
  await ensureDir(dirname(path));
  try {
    await mkdir(path);
  } catch {
    throw new Error(`lock_unavailable:${name}`);
  }
  await writeFile(join(path, "owner.json"), `${JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }, null, 2)}\n`);
  try {
    return await fn();
  } finally {
    await rm(path, { recursive: true, force: true });
  }
}
