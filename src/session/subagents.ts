import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import {
  createSubagentId,
  sessionPaths,
  updateSessionState,
  type CodexusSessionState,
  type SessionSubagentLink,
} from "./state.ts";
import { ensureDir, writeJsonAtomic } from "../util/fs.ts";

export type SubagentRecordMode = "record" | "attach";
export type SubagentClaimConfidence = "low" | "medium" | "high" | "unknown";

export interface SubagentClaim {
  kind: string;
  text: string;
  confidence: SubagentClaimConfidence;
  evidenceLinks: string[];
}

export interface SubagentResultArtifact {
  schemaVersion: 1;
  type: "codexus.session.subagent_result";
  taskId: string;
  role: string;
  status: "recorded" | "attached";
  recordedAt: string;
  source: {
    mode: SubagentRecordMode;
    inputFile: string | null;
  };
  claims: SubagentClaim[];
  limitations: string[];
  evidenceLinks: string[];
  rawShape: {
    type: string;
    keys: string[];
  };
}

export interface SubagentRecordResult {
  schemaVersion: 1;
  artifact: SubagentResultArtifact;
  link: SessionSubagentLink;
  artifactDir: string;
  artifactPath: string;
  statePath: string;
  state: CodexusSessionState;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9_.-]/g, "-").slice(0, 120) || createSubagentId();
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function confidence(value: unknown): SubagentClaimConfidence {
  return value === "low" || value === "medium" || value === "high" ? value : "unknown";
}

function normalizeClaim(value: unknown): SubagentClaim | null {
  if (typeof value === "string") {
    return { kind: "claim", text: value, confidence: "unknown", evidenceLinks: [] };
  }
  if (!isRecord(value)) return null;
  const text = typeof value.text === "string"
    ? value.text
    : typeof value.summary === "string"
      ? value.summary
      : typeof value.claim === "string"
        ? value.claim
        : null;
  if (!text) return null;
  return {
    kind: typeof value.kind === "string" ? value.kind : "claim",
    text,
    confidence: confidence(value.confidence),
    evidenceLinks: stringArray(value.evidenceLinks),
  };
}

function normalizeClaims(parsed: unknown): SubagentClaim[] {
  if (Array.isArray(parsed)) return parsed.map(normalizeClaim).filter((item): item is SubagentClaim => item !== null);
  if (!isRecord(parsed)) return [];
  const direct = Array.isArray(parsed.claims)
    ? parsed.claims
    : Array.isArray(parsed.findings)
      ? parsed.findings
      : Array.isArray(parsed.results)
        ? parsed.results
        : [];
  return direct.map(normalizeClaim).filter((item): item is SubagentClaim => item !== null);
}

function normalizeLimitations(parsed: unknown): string[] {
  if (!isRecord(parsed)) return [];
  return stringArray(parsed.limitations);
}

function normalizeEvidenceLinks(parsed: unknown, claims: SubagentClaim[]): string[] {
  const links = new Set<string>();
  if (isRecord(parsed)) {
    for (const link of stringArray(parsed.evidenceLinks)) links.add(link);
  }
  for (const claim of claims) {
    for (const link of claim.evidenceLinks) links.add(link);
  }
  return [...links].sort();
}

function roleFrom(parsed: unknown, fallback: string): string {
  return isRecord(parsed) && typeof parsed.role === "string" && parsed.role.trim()
    ? parsed.role.trim()
    : fallback;
}

function taskIdFrom(parsed: unknown): string {
  return isRecord(parsed) && typeof parsed.taskId === "string" && parsed.taskId.trim()
    ? safeSegment(parsed.taskId.trim())
    : createSubagentId();
}

async function parseJsonFile(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch (error) {
    throw new Error(`json_parse_failed:${path}:${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function recordSubagentArtifact(cwd: string, options: {
  mode: SubagentRecordMode;
  role?: string;
  inputFile: string;
}): Promise<SubagentRecordResult> {
  const inputFile = resolve(cwd, options.inputFile);
  if (!existsSync(inputFile)) throw new Error(`missing_subagent_file:${inputFile}`);
  const parsed = await parseJsonFile(inputFile);
  const taskId = taskIdFrom(parsed);
  const role = roleFrom(parsed, options.role ?? "subagent");
  const claims = normalizeClaims(parsed);
  const limitations = normalizeLimitations(parsed);
  const evidenceLinks = normalizeEvidenceLinks(parsed, claims);
  const recordedAt = new Date().toISOString();
  const artifact: SubagentResultArtifact = {
    schemaVersion: 1,
    type: "codexus.session.subagent_result",
    taskId,
    role,
    status: options.mode === "attach" ? "attached" : "recorded",
    recordedAt,
    source: {
      mode: options.mode,
      inputFile,
    },
    claims,
    limitations,
    evidenceLinks,
    rawShape: {
      type: Array.isArray(parsed) ? "array" : typeof parsed,
      keys: isRecord(parsed) ? Object.keys(parsed).sort().slice(0, 50) : [],
    },
  };
  const paths = sessionPaths(cwd);
  const artifactDir = join(paths.subagentsDir, taskId);
  const artifactPath = join(artifactDir, "result.json");
  await ensureDir(artifactDir);
  await writeJsonAtomic(artifactPath, artifact);
  const link: SessionSubagentLink = {
    taskId,
    role,
    status: artifact.status,
    recordedAt,
    path: artifactPath,
    claimCount: claims.length,
    limitationCount: limitations.length,
    evidenceLinks,
  };
  const state = await updateSessionState(cwd, `session subagent ${options.mode}`, (value) => ({
    ...value,
    subagents: [
      ...value.subagents.filter((item) => item.taskId !== taskId),
      link,
    ].slice(-50),
  }));
  return {
    schemaVersion: 1,
    artifact,
    link,
    artifactDir,
    artifactPath,
    statePath: paths.state,
    state,
  };
}

export async function readSubagentArtifact(cwd: string, taskId: string): Promise<SubagentResultArtifact> {
  const safeTaskId = safeSegment(taskId);
  const path = join(sessionPaths(cwd).subagentsDir, safeTaskId, "result.json");
  if (!existsSync(path)) throw new Error(`subagent_not_found:${safeTaskId}`);
  const parsed = await parseJsonFile(path);
  if (!isRecord(parsed) || parsed.type !== "codexus.session.subagent_result" || parsed.schemaVersion !== 1) {
    throw new Error(`subagent_artifact_invalid:${safeTaskId}`);
  }
  return parsed as unknown as SubagentResultArtifact;
}

export function summarizeSubagentClaims(state: CodexusSessionState | null): {
  count: number;
  unverifiedClaims: Array<{
    taskId: string;
    role: string;
    claimCount: number;
    limitationCount: number;
    evidenceLinks: string[];
    path: string;
  }>;
} {
  const unverifiedClaims = (state?.subagents ?? []).map((item) => ({
    taskId: item.taskId,
    role: item.role,
    claimCount: item.claimCount,
    limitationCount: item.limitationCount,
    evidenceLinks: item.evidenceLinks,
    path: item.path,
  }));
  return {
    count: unverifiedClaims.reduce((sum, item) => sum + item.claimCount, 0),
    unverifiedClaims,
  };
}

export function subagentDisplayName(path: string): string {
  return basename(path);
}
