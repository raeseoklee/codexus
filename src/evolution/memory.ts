import { appendFile, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { redactSensitiveText } from "../policy/redaction.ts";
import { assertSchemaValue } from "../validation/schemas.ts";
import { withFileLock } from "../util/lock.ts";
import { ensureDir } from "../util/fs.ts";
import { harnessRoot, legacyHarnessRoot } from "../ledger/paths.ts";

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

export type MemoryQualityStatus = "pass" | "fail" | "unknown";

export interface MemoryQualityCheck {
  status: MemoryQualityStatus;
  reason: string;
}

export interface MemoryQualityFinding {
  id: string;
  traceable: MemoryQualityCheck;
  singular: MemoryQualityCheck;
  unambiguous: MemoryQualityCheck;
  scopeBounded: MemoryQualityCheck;
  verifiable: MemoryQualityCheck;
  conflictReviewed: MemoryQualityCheck;
}

export interface MemoryCurationResult {
  schemaVersion: 1;
  generatedAt: string;
  total: number;
  duplicateCandidates: Array<{ id: string; duplicateOf: string; reason: string }>;
  conflictCandidates: Array<{
    id: string;
    conflictsWith: string;
    reason: string;
    confidence: "low" | "medium" | "high";
    suggestedResolution: "review_for_supersession";
  }>;
  qualityFindings: MemoryQualityFinding[];
  staleLowConfidence: Array<{ id: string; ageDays: number; reason: string }>;
  invalidEntries: Array<{ id: string; reason: string }>;
}

export function redactMemoryText(text: string): string {
  return redactSensitiveText(text);
}

export function memoryPath(cwd: string): string {
  return join(harnessRoot(cwd), "memory", "entries.jsonl");
}

export function memoryIndexPath(cwd: string): string {
  return join(harnessRoot(cwd), "memory", "index.json");
}

function readableMemoryPath(cwd: string): string {
  const path = memoryPath(cwd);
  if (existsSync(path)) return path;
  const legacyPath = join(legacyHarnessRoot(cwd), "memory", "entries.jsonl");
  return existsSync(legacyPath) ? legacyPath : path;
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
  const path = readableMemoryPath(cwd);
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

function normalizeMemoryText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

const subjectStopWords = new Set([
  "the",
  "and",
  "or",
  "for",
  "with",
  "without",
  "from",
  "into",
  "that",
  "this",
  "when",
  "then",
  "than",
  "should",
  "must",
  "shall",
  "only",
  "always",
  "never",
  "use",
  "uses",
  "using",
  "used",
  "not",
  "enabled",
  "disabled",
  "available",
  "unavailable",
  "supported",
  "unsupported",
  "allow",
  "allows",
  "allowed",
  "deny",
  "denies",
  "denied",
  "avoid",
  "prefer",
  "require",
  "requires",
  "required",
]);

function subjectTerms(entry: MemoryEntry): Set<string> {
  const terms = `${entry.tags.join(" ")} ${entry.text}`
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length > 2 && !subjectStopWords.has(term));
  return new Set(terms);
}

function hasOverlap(left: Set<string>, right: Set<string>): boolean {
  for (const term of left) {
    if (right.has(term)) return true;
  }
  return false;
}

function directiveMarkers(text: string): Set<string> {
  const normalized = normalizeMemoryText(text);
  const markers = new Set<string>();
  const negativeUse = /\b(do not|don't|must not|never)\s+use\b/.test(normalized);
  if (negativeUse) markers.add("not_use");
  if (/\buse\b/.test(normalized) && !negativeUse) markers.add("use");
  if (/\balways\b/.test(normalized)) markers.add("always");
  if (/\bnever\b/.test(normalized)) markers.add("never");
  if (/\benabled?\b/.test(normalized)) markers.add("enabled");
  if (/\bdisabled?\b/.test(normalized)) markers.add("disabled");
  if (/\bavailable\b/.test(normalized)) markers.add("available");
  if (/\bunavailable\b/.test(normalized)) markers.add("unavailable");
  if (/\bsupported\b/.test(normalized) && !/\bunsupported\b/.test(normalized)) markers.add("supported");
  if (/\bunsupported\b/.test(normalized)) markers.add("unsupported");
  if (/\ballow(?:ed|s)?\b/.test(normalized)) markers.add("allowed");
  if (/\b(disallow(?:ed|s)?|deny|denied|denies)\b/.test(normalized)) markers.add("denied");
  if (/\brequir(?:e|es|ed)\b/.test(normalized)) markers.add("required");
  if (/\b(forbid(?:s|den)?|forbidden|prohibit(?:s|ed)?)\b/.test(normalized)) markers.add("forbidden");
  return markers;
}

const oppositeDirectivePairs: Array<[string, string]> = [
  ["use", "not_use"],
  ["always", "never"],
  ["enabled", "disabled"],
  ["available", "unavailable"],
  ["supported", "unsupported"],
  ["allowed", "denied"],
  ["required", "forbidden"],
];

function findOppositeDirective(left: Set<string>, right: Set<string>): string | null {
  for (const [positive, negative] of oppositeDirectivePairs) {
    if ((left.has(positive) && right.has(negative)) || (left.has(negative) && right.has(positive))) {
      return `${positive}/${negative}`;
    }
  }
  return null;
}

function buildConflictCandidates(entries: MemoryEntry[]): MemoryCurationResult["conflictCandidates"] {
  const candidates: MemoryCurationResult["conflictCandidates"] = [];
  const terms = new Map(entries.map((entry) => [entry.id, subjectTerms(entry)]));
  const markers = new Map(entries.map((entry) => [entry.id, directiveMarkers(entry.text)]));

  for (let leftIndex = 0; leftIndex < entries.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < entries.length; rightIndex += 1) {
      const left = entries[leftIndex];
      const right = entries[rightIndex];
      if (left.kind !== right.kind) continue;
      const leftTerms = terms.get(left.id) ?? new Set<string>();
      const rightTerms = terms.get(right.id) ?? new Set<string>();
      if (!hasOverlap(leftTerms, rightTerms)) continue;
      const opposite = findOppositeDirective(markers.get(left.id) ?? new Set<string>(), markers.get(right.id) ?? new Set<string>());
      if (!opposite) continue;
      candidates.push({
        id: right.id,
        conflictsWith: left.id,
        reason: `same kind with overlapping subject terms and opposite directive (${opposite})`,
        confidence: left.tags.some((tag) => right.tags.includes(tag)) ? "high" : "medium",
        suggestedResolution: "review_for_supersession",
      });
    }
  }

  return candidates;
}

function quality(status: MemoryQualityStatus, reason: string): MemoryQualityCheck {
  return { status, reason };
}

function buildQualityFinding(entry: MemoryEntry, conflictingIds: Set<string>): MemoryQualityFinding {
  const normalized = normalizeMemoryText(entry.text);
  const sentenceCount = entry.text.split(/[.!?]+/).map((part) => part.trim()).filter(Boolean).length;
  const vague = /\b(handle well|do better|improve things|as needed|etc\.?|stuff|things)\b/i.test(entry.text);
  const verifiable = entry.kind === "verification_pattern" || entry.kind === "failure_pattern" || /\b(test|verify|verification|check|inspect|replay|observe|observed|evidence|artifact|run)\b/.test(normalized);

  return {
    id: entry.id,
    traceable: entry.sourceRunId && entry.sourceRunId !== "manual"
      ? quality("pass", "sourceRunId cites a non-manual run")
      : quality("unknown", "sourceRunId is manual or unavailable; no artifact evidence is linked"),
    singular: sentenceCount <= 1 && !/[;\n]/.test(entry.text)
      ? quality("pass", "single sentence with no list separator")
      : quality("unknown", "entry may contain multiple claims"),
    unambiguous: vague
      ? quality("fail", "entry contains vague guidance")
      : entry.text.trim().length >= 12
        ? quality("pass", "entry text is concrete enough for retrieval")
        : quality("unknown", "entry text is too short to classify"),
    scopeBounded: entry.tags.length > 0
      ? quality("pass", "tags provide a retrieval scope")
      : quality("fail", "missing tags"),
    verifiable: verifiable
      ? quality("pass", "entry mentions verification, evidence, observation, or has a verification/failure kind")
      : quality("unknown", "no explicit observable check found"),
    conflictReviewed: conflictingIds.has(entry.id)
      ? quality("fail", "curation found a possible contradiction requiring review")
      : quality("pass", "no rule-based contradiction found during curation"),
  };
}

export async function curateMemoryEntries(cwd: string, options: { staleDays?: number } = {}): Promise<MemoryCurationResult> {
  const entries = await readMemoryEntries(cwd);
  const generatedAt = new Date().toISOString();
  const staleDays = options.staleDays ?? 60;
  const seen = new Map<string, MemoryEntry>();
  const duplicateCandidates: MemoryCurationResult["duplicateCandidates"] = [];
  const conflictCandidates = buildConflictCandidates(entries);
  const conflictingIds = new Set(conflictCandidates.flatMap((candidate) => [candidate.id, candidate.conflictsWith]));
  const qualityFindings = entries.map((entry) => buildQualityFinding(entry, conflictingIds));
  const staleLowConfidence: MemoryCurationResult["staleLowConfidence"] = [];
  const invalidEntries: MemoryCurationResult["invalidEntries"] = [];
  const now = Date.now();

  for (const entry of entries) {
    const normalized = normalizeMemoryText(entry.text);
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
    conflictCandidates,
    qualityFindings,
    staleLowConfidence,
    invalidEntries,
  };
}
