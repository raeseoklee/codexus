import { appendFile, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { redactSensitiveText } from "../policy/redaction.ts";
import { withFileLock } from "../util/lock.ts";
import { ensureDir } from "../util/fs.ts";

export interface MemoryEntry {
  schemaVersion: 1;
  id: string;
  createdAt: string;
  sourceRunId: string;
  kind: "repo_fact" | "user_preference" | "workflow_lesson" | "verification_pattern" | "failure_pattern" | "tooling_note";
  text: string;
  tags: string[];
  confidence: "low" | "medium" | "high";
}

export interface MemoryIndex {
  schemaVersion: 1;
  total: number;
  byKind: Record<string, number>;
  lastUpdated: string | null;
  lastId: string | null;
}

export function redactMemoryText(text: string): string {
  return redactSensitiveText(text);
}

export function memoryPath(cwd: string): string {
  return join(cwd, ".codex-harness", "memory", "entries.jsonl");
}

export function memoryIndexPath(cwd: string): string {
  return join(cwd, ".codex-harness", "memory", "index.json");
}

export function buildMemoryIndex(entries: MemoryEntry[]): MemoryIndex {
  const byKind: Record<string, number> = {};
  for (const entry of entries) byKind[entry.kind] = (byKind[entry.kind] ?? 0) + 1;
  const last = entries.at(-1);
  return {
    schemaVersion: 1,
    total: entries.length,
    byKind,
    lastUpdated: last?.createdAt ?? null,
    lastId: last?.id ?? null,
  };
}

async function writeMemoryIndex(cwd: string, entries: MemoryEntry[]): Promise<MemoryIndex> {
  const index = buildMemoryIndex(entries);
  const path = memoryIndexPath(cwd);
  await ensureDir(dirname(path));
  await writeFile(path, `${JSON.stringify(index, null, 2)}\n`);
  return index;
}

export async function appendMemoryEntry(cwd: string, entry: Omit<MemoryEntry, "schemaVersion" | "createdAt" | "text"> & { text: string }): Promise<MemoryEntry> {
  return await withFileLock(cwd, "memory", async () => {
    const record: MemoryEntry = {
      schemaVersion: 1,
      createdAt: new Date().toISOString(),
      ...entry,
      text: redactMemoryText(entry.text),
    };
    const path = memoryPath(cwd);
    await ensureDir(dirname(path));
    await appendFile(path, `${JSON.stringify(record)}\n`);
    await writeMemoryIndex(cwd, await readMemoryEntries(cwd));
    return record;
  });
}

export function searchMemoryEntries(entries: MemoryEntry[], query: string, limit = 5): MemoryEntry[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];
  return entries
    .map((entry) => ({
      entry,
      score: terms.reduce((score, term) => score + (entry.text.toLowerCase().includes(term) ? 1 : 0), 0),
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map((item) => item.entry);
}

export async function readMemoryEntries(cwd: string): Promise<MemoryEntry[]> {
  const path = memoryPath(cwd);
  if (!existsSync(path)) return [];
  const raw = await readFile(path, "utf8");
  return raw.split("\n").filter(Boolean).map((line) => JSON.parse(line) as MemoryEntry);
}

export async function listMemoryEntries(cwd: string, limit = 20): Promise<MemoryEntry[]> {
  const entries = await readMemoryEntries(cwd);
  return entries.slice(-limit).reverse();
}

export async function readMemoryIndex(cwd: string): Promise<MemoryIndex> {
  const path = memoryIndexPath(cwd);
  if (existsSync(path)) {
    return JSON.parse(await readFile(path, "utf8")) as MemoryIndex;
  }
  return await writeMemoryIndex(cwd, await readMemoryEntries(cwd));
}

export async function pruneMemoryEntries(cwd: string, before: Date, dryRun = false): Promise<{ removed: number; remaining: number; dryRun: boolean }> {
  return await withFileLock(cwd, "memory", async () => {
    const entries = await readMemoryEntries(cwd);
    const kept = entries.filter((entry) => new Date(entry.createdAt).getTime() >= before.getTime());
    const removed = entries.length - kept.length;
    if (!dryRun) {
      const path = memoryPath(cwd);
      await ensureDir(dirname(path));
      await writeFile(path, kept.map((entry) => JSON.stringify(entry)).join("\n") + (kept.length > 0 ? "\n" : ""));
      await writeMemoryIndex(cwd, kept);
    }
    return { removed, remaining: kept.length, dryRun };
  });
}
