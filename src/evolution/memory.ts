import { appendFile, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { redactSensitiveText } from "../policy/redaction.ts";
import { assertSchemaValue } from "../validation/schemas.ts";
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

export interface MemoryCurationResult {
  schemaVersion: 1;
  generatedAt: string;
  total: number;
  duplicateCandidates: Array<{ id: string; duplicateOf: string; reason: string }>;
  staleLowConfidence: Array<{ id: string; ageDays: number; reason: string }>;
  invalidEntries: Array<{ id: string; reason: string }>;
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
    assertSchemaValue("memory-entry", record);
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
  return raw.split("\n").filter(Boolean).map((line) => {
    const entry = JSON.parse(line) as unknown;
    assertSchemaValue("memory-entry", entry);
    return entry as MemoryEntry;
  });
}

export async function listMemoryEntries(cwd: string, limit = 20): Promise<MemoryEntry[]> {
  const entries = await readMemoryEntries(cwd);
  return entries.slice(-limit).reverse();
}

export async function readMemoryIndex(cwd: string): Promise<MemoryIndex> {
  const path = memoryIndexPath(cwd);
  if (existsSync(path)) {
    const parsed = JSON.parse(await readFile(path, "utf8")) as MemoryIndex;
    if (parsed.schemaVersion !== 1 || !Number.isInteger(parsed.total) || parsed.total < 0 || typeof parsed.byKind !== "object" || parsed.byKind === null) {
      throw new Error(`schema_validation_failed:memory-index:${path}`);
    }
    return parsed;
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

export async function curateMemoryEntries(cwd: string, options: { staleDays?: number } = {}): Promise<MemoryCurationResult> {
  const entries = await readMemoryEntries(cwd);
  const generatedAt = new Date().toISOString();
  const staleDays = options.staleDays ?? 60;
  const seen = new Map<string, MemoryEntry>();
  const duplicateCandidates: MemoryCurationResult["duplicateCandidates"] = [];
  const staleLowConfidence: MemoryCurationResult["staleLowConfidence"] = [];
  const invalidEntries: MemoryCurationResult["invalidEntries"] = [];
  const now = Date.now();

  for (const entry of entries) {
    const normalized = entry.text.toLowerCase().replace(/\s+/g, " ").trim();
    const existing = seen.get(normalized);
    if (existing) {
      duplicateCandidates.push({ id: entry.id, duplicateOf: existing.id, reason: "same normalized text" });
    } else {
      seen.set(normalized, entry);
    }
    const ageDays = Math.floor((now - new Date(entry.createdAt).getTime()) / (24 * 60 * 60 * 1000));
    if (!Number.isFinite(ageDays)) {
      invalidEntries.push({ id: entry.id, reason: "invalid createdAt timestamp" });
    } else if (entry.confidence === "low" && ageDays >= staleDays) {
      staleLowConfidence.push({ id: entry.id, ageDays, reason: `low confidence and older than ${staleDays} days` });
    }
    if (entry.tags.length === 0) invalidEntries.push({ id: entry.id, reason: "missing tags" });
  }

  return {
    schemaVersion: 1,
    generatedAt,
    total: entries.length,
    duplicateCandidates,
    staleLowConfidence,
    invalidEntries,
  };
}
