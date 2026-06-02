import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { assertSchemaValue } from "../validation/schemas.ts";
import { ensureDir, writeJsonAtomic } from "../util/fs.ts";
import { sessionPaths, updateSessionState } from "./state.ts";

export type DecisionKind = "decision" | "boundary" | "rejected_alternative" | "approval" | "note";

export interface CodexusDecisionArtifact {
  schemaVersion: 1;
  stability: "experimental";
  type: "codexus.decision";
  decisionId: string;
  kind: DecisionKind;
  createdAt: string;
  cwd: string;
  summary: string;
  rationale: string | null;
  constraints: string[];
  rejectedAlternatives: string[];
  evidenceLinks: string[];
  authority: "advisory";
  completionAuthority: false;
}

export interface DecisionRecordResult {
  schemaVersion: 1;
  stability: "experimental";
  decision: CodexusDecisionArtifact;
  artifactPath: string;
  statePath: string;
}

export interface DecisionSummary {
  schemaVersion: 1;
  count: number;
  lastDecision: {
    decisionId: string;
    kind: DecisionKind;
    createdAt: string;
    summary: string;
    artifactPath: string;
  } | null;
  recent: Array<{
    decisionId: string;
    kind: DecisionKind;
    createdAt: string;
    summary: string;
    artifactPath: string;
  }>;
}

const decisionKinds = new Set<DecisionKind>(["decision", "boundary", "rejected_alternative", "approval", "note"]);

function nowIso(): string {
  return new Date().toISOString();
}

function createDecisionId(): string {
  const date = new Date();
  const stamp = [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
    "_",
    String(date.getUTCHours()).padStart(2, "0"),
    String(date.getUTCMinutes()).padStart(2, "0"),
    String(date.getUTCSeconds()).padStart(2, "0"),
  ].join("");
  return `decision_${stamp}_${randomBytes(3).toString("hex")}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDecisionArtifact(value: unknown): value is CodexusDecisionArtifact {
  if (!isRecord(value)) return false;
  return value.schemaVersion === 1
    && value.stability === "experimental"
    && value.type === "codexus.decision"
    && typeof value.decisionId === "string"
    && decisionKinds.has(value.kind as DecisionKind)
    && typeof value.createdAt === "string"
    && typeof value.cwd === "string"
    && typeof value.summary === "string"
    && (value.rationale === null || typeof value.rationale === "string")
    && Array.isArray(value.constraints)
    && value.constraints.every((item) => typeof item === "string")
    && Array.isArray(value.rejectedAlternatives)
    && value.rejectedAlternatives.every((item) => typeof item === "string")
    && Array.isArray(value.evidenceLinks)
    && value.evidenceLinks.every((item) => typeof item === "string")
    && value.authority === "advisory"
    && value.completionAuthority === false;
}

function normalizeNonEmpty(value: string | undefined | null, error: string): string {
  const normalized = value?.trim() ?? "";
  if (!normalized) throw new Error(error);
  return normalized;
}

function normalizeStringArray(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function normalizeEvidenceLink(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("invalid_decision_evidence_link:empty");
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) throw new Error(`invalid_decision_evidence_link:${trimmed}`);
  if (trimmed.startsWith("/")) throw new Error(`invalid_decision_evidence_link:${trimmed}`);
  const normalized = trimmed.replace(/\\/g, "/").replace(/^\.\/+/, "");
  if (normalized === ".." || normalized.startsWith("../") || normalized.includes("/../") || normalized.endsWith("/..")) {
    throw new Error(`invalid_decision_evidence_link:${trimmed}`);
  }
  return normalized;
}

function decisionDir(cwd: string, decisionId: string): string {
  return join(sessionPaths(cwd).sessionRoot, "decisions", decisionId);
}

function decisionPath(cwd: string, decisionId: string): string {
  return join(decisionDir(cwd, decisionId), "decision.json");
}

async function readDecisionPath(path: string): Promise<CodexusDecisionArtifact | null> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
    if (!isDecisionArtifact(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function recordDecisionArtifact(cwd: string, options: {
  kind?: string;
  summary?: string;
  rationale?: string | null;
  constraints?: string[];
  rejectedAlternatives?: string[];
  evidenceLinks?: string[];
}): Promise<DecisionRecordResult> {
  const kind = (options.kind ?? "decision").trim();
  if (!decisionKinds.has(kind as DecisionKind)) throw new Error(`invalid_decision_kind:${kind}`);
  const decisionId = createDecisionId();
  const artifactPath = decisionPath(cwd, decisionId);
  const artifact: CodexusDecisionArtifact = {
    schemaVersion: 1,
    stability: "experimental",
    type: "codexus.decision",
    decisionId,
    kind: kind as DecisionKind,
    createdAt: nowIso(),
    cwd,
    summary: normalizeNonEmpty(options.summary, "missing_decision_summary"),
    rationale: options.rationale?.trim() || null,
    constraints: normalizeStringArray(options.constraints ?? []),
    rejectedAlternatives: normalizeStringArray(options.rejectedAlternatives ?? []),
    evidenceLinks: normalizeStringArray(options.evidenceLinks ?? []).map(normalizeEvidenceLink),
    authority: "advisory",
    completionAuthority: false,
  };
  assertSchemaValue("decision", artifact);
  await ensureDir(decisionDir(cwd, decisionId));
  await writeJsonAtomic(artifactPath, artifact);
  await updateSessionState(cwd, "session decision record", (value) => value);
  return {
    schemaVersion: 1,
    stability: "experimental",
    decision: artifact,
    artifactPath,
    statePath: sessionPaths(cwd).state,
  };
}

export async function readDecisionArtifact(cwd: string, decisionId: string): Promise<{ artifact: CodexusDecisionArtifact; artifactPath: string }> {
  const safeId = normalizeNonEmpty(decisionId, "missing_decision_id");
  if (safeId.includes("/") || safeId.includes("\\")) throw new Error(`invalid_decision_id:${safeId}`);
  const artifactPath = decisionPath(cwd, safeId);
  if (!existsSync(artifactPath)) throw new Error(`decision_not_found:${safeId}`);
  const artifact = await readDecisionPath(artifactPath);
  if (!artifact) throw new Error(`decision_artifact_invalid:${safeId}`);
  return { artifact, artifactPath };
}

export async function listDecisionArtifacts(cwd: string): Promise<Array<{ artifact: CodexusDecisionArtifact; artifactPath: string }>> {
  const root = join(sessionPaths(cwd).sessionRoot, "decisions");
  if (!existsSync(root)) return [];
  const entries = await readdir(root, { withFileTypes: true });
  const artifacts: Array<{ artifact: CodexusDecisionArtifact; artifactPath: string }> = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const artifactPath = join(root, entry.name, "decision.json");
    if (!existsSync(artifactPath)) continue;
    const artifact = await readDecisionPath(artifactPath);
    if (artifact) artifacts.push({ artifact, artifactPath });
  }
  return artifacts.sort((left, right) => left.artifact.createdAt.localeCompare(right.artifact.createdAt));
}

export async function summarizeDecisions(cwd: string): Promise<DecisionSummary> {
  const decisions = await listDecisionArtifacts(cwd);
  const recent = decisions.slice(-5).reverse().map(({ artifact, artifactPath }) => ({
    decisionId: artifact.decisionId,
    kind: artifact.kind,
    createdAt: artifact.createdAt,
    summary: artifact.summary,
    artifactPath,
  }));
  return {
    schemaVersion: 1,
    count: decisions.length,
    lastDecision: recent[0] ?? null,
    recent,
  };
}
