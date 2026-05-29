import { appendFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { redactSensitiveText } from "../policy/redaction.ts";
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

export function redactMemoryText(text: string): string {
  return redactSensitiveText(text);
}

export function memoryPath(cwd: string): string {
  return join(cwd, ".codex-harness", "memory", "entries.jsonl");
}

export async function appendMemoryEntry(cwd: string, entry: Omit<MemoryEntry, "schemaVersion" | "createdAt" | "text"> & { text: string }): Promise<MemoryEntry> {
  const record: MemoryEntry = {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    ...entry,
    text: redactMemoryText(entry.text),
  };
  const path = memoryPath(cwd);
  await ensureDir(dirname(path));
  await appendFile(path, `${JSON.stringify(record)}\n`);
  return record;
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
