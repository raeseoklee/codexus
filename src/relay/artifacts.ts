import { copyFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { basename, join, resolve } from "node:path";
import { harnessRoot } from "../ledger/paths.ts";
import { ensureDir, writeJsonAtomic } from "../util/fs.ts";
import { sha256Bytes } from "../util/hash.ts";

export type RelayStage = "issue" | "design" | "plan" | "implementation";
export type RelayReviewScope = "delta-check" | "full-gate";
export type RelayRole = "author-engine" | "review-engine" | string;
export type RelayVerificationStatus = "passed" | "failed" | "skipped" | "unknown";
export type RelayStatus = "pass" | "fail" | "unknown";

export interface RelayEngineDescriptor {
  engine: string;
  driverId: string;
  role: RelayRole;
  capabilities: {
    writes: "gated" | "none" | "unknown";
    review: boolean;
    verification: "external" | "none" | "unknown";
    spawn: boolean;
  };
}

export interface RelayImportedArtifact {
  role: RelayRole;
  inputPath: string;
  storedPath: string;
  hash: string;
  parsedJson: boolean;
  rawShape: {
    type: string;
    keys: string[];
  };
}

export interface RelayEvidenceGap {
  kind:
    | "missing_required_role_declaration"
    | "artifact_hash_mismatch"
    | "unresolved_high_findings"
    | "decision_needed"
    | "stage_gate_missing"
    | "stage_gate_invalid"
    | "stage_gate_not_full_gate"
    | "stage_gate_stage_mismatch"
    | "stage_gate_artifact_hash_mismatch"
    | "stage_gate_residual_findings"
    | "verification_failed_blocks_completion";
  gate: true;
  evidence: string | null;
  policy: string;
  recommendation: string;
}

export interface RelayDerivableFact {
  kind:
    | "relay_round_recorded"
    | "external_author_artifact_imported"
    | "external_review_artifact_imported"
    | "review_engine_import_only"
    | "stage_artifact_hashed"
    | "convergence_agreement_loaded"
    | "required_role_declarations_present"
    | "required_declarations_same_artifact_hash"
    | "stage_gate_full_gate_present"
    | "verification_passed";
  gate: boolean;
  evidence: string;
}

export interface RelayHeuristicClaim {
  kind:
    | "artifact_content_not_semantically_evaluated"
    | "engine_agreement_is_advisory";
  confidence: "low" | "medium" | "high";
  evidence: string;
  recommendation: string;
}

export interface RelayUnknown {
  kind:
    | "agreement_unreadable"
    | "stage_gate_unreadable"
    | "verification_status_unknown";
  gate: boolean;
  evidence: string | null;
  recommendation: string;
}

export interface RelayGate {
  enabled: boolean;
  status: "not_requested" | "passed" | "failed" | "blocked";
  exitCode: 0 | 1;
  reason: string;
}

export interface RelaySessionArtifact {
  schemaVersion: 1;
  stability: "experimental";
  type: "codexus.autopilot.relay.session";
  relayId: string;
  contractSubjectHash: string | null;
  stage: RelayStage;
  round: number;
  status: "recorded";
  recordOnly: true;
  createdAt: string;
  updatedAt: string;
  authorEngine: RelayEngineDescriptor;
  reviewEngine: RelayEngineDescriptor;
  stageArtifact: {
    path: string;
    storedPath: string;
    hash: string;
  };
  submissions: RelayImportedArtifact[];
  reviews: RelayImportedArtifact[];
  stageGateEvidence: StageGateEvidenceArtifact[];
  convergenceAgreement: ConvergenceAgreementArtifact | null;
  stop: null;
  evidenceGaps: RelayEvidenceGap[];
  derivableFacts: RelayDerivableFact[];
  heuristicClaims: RelayHeuristicClaim[];
  blockingUnknowns: RelayUnknown[];
  informationalUnknowns: RelayUnknown[];
  gate: RelayGate;
}

export interface StageGateEvidenceArtifact {
  schemaVersion: 1;
  stability: "experimental";
  type: "codexus.autopilot.stage-gate-evidence";
  evidenceId: string;
  stage: RelayStage;
  scope: RelayReviewScope;
  role: RelayRole;
  recordedAt: string;
  stageArtifactHash: string;
  freshReadArtifacts: Array<{
    path: string;
    storedPath: string | null;
    hash: string;
  }>;
  verificationMatrix: unknown[];
  findings: unknown[];
  residualFindingCount: number;
  verificationResults: Array<{
    status: RelayVerificationStatus;
    command: string | null;
    evidencePath: string | null;
  }>;
  heuristicClaims: RelayHeuristicClaim[];
  derivableFacts: RelayDerivableFact[];
}

export interface ConvergenceDeclaration {
  role: RelayRole;
  engine: string;
  artifactHash: string;
  declaredAt: string;
}

export interface ConvergenceAgreementArtifact {
  schemaVersion: 1;
  stability: "experimental";
  type: "codexus.autopilot.convergence-agreement";
  stage: RelayStage;
  round: number;
  declarations: ConvergenceDeclaration[];
  unresolvedHighFindings: number;
  decisionNeeded: boolean;
}

export interface RelayRecordResult extends RelaySessionArtifact {
  command: "relay record";
  artifactDir: string;
  artifactPath: string;
}

export interface StageGateRecordResult extends StageGateEvidenceArtifact {
  command: "relay stage-gate";
  artifactPath: string;
}

export interface RelayAgreementCheckResult {
  schemaVersion: 1;
  stability: "experimental";
  type: "codexus.autopilot.relay.agreement_check";
  command: "relay check-agreement";
  agreementPath: string;
  stageGatePath: string | null;
  relay: {
    status: RelayStatus;
    convergence: "valid" | "invalid" | "unknown";
    canComplete: boolean;
    convergenceIsCompletionAuthority: false;
    completionAuthority: "verification_and_evidence_gates";
    stage: RelayStage | null;
    requiredRoles: string[];
    artifactHash: string | null;
    verificationStatus: RelayVerificationStatus;
  };
  evidenceGaps: RelayEvidenceGap[];
  derivableFacts: RelayDerivableFact[];
  heuristicClaims: RelayHeuristicClaim[];
  blockingUnknowns: RelayUnknown[];
  informationalUnknowns: RelayUnknown[];
  gate: RelayGate;
}

const relayStages = new Set<RelayStage>(["issue", "design", "plan", "implementation"]);
const relayReviewScopes = new Set<RelayReviewScope>(["delta-check", "full-gate"]);
const verificationStatuses = new Set<RelayVerificationStatus>(["passed", "failed", "skipped", "unknown"]);
const agreementStructuralGapKinds = new Set<RelayEvidenceGap["kind"]>([
  "missing_required_role_declaration",
  "artifact_hash_mismatch",
  "unresolved_high_findings",
  "decision_needed",
  "stage_gate_missing",
  "stage_gate_invalid",
  "stage_gate_not_full_gate",
  "stage_gate_stage_mismatch",
  "stage_gate_artifact_hash_mismatch",
  "stage_gate_residual_findings",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9_.-]/g, "-").slice(0, 120) || randomBytes(4).toString("hex");
}

function createRelayId(): string {
  return `relay_${Date.now()}_${randomBytes(4).toString("hex")}`;
}

function createEvidenceId(): string {
  return `stage_gate_${Date.now()}_${randomBytes(4).toString("hex")}`;
}

function assertStage(value: string | undefined): RelayStage {
  if (!value || !relayStages.has(value as RelayStage)) throw new Error(`invalid_relay_stage:${value ?? "missing"}`);
  return value as RelayStage;
}

function assertReviewScope(value: string | undefined): RelayReviewScope {
  if (!value || !relayReviewScopes.has(value as RelayReviewScope)) {
    throw new Error(`invalid_relay_review_scope:${value ?? "missing"}`);
  }
  return value as RelayReviewScope;
}

function assertVerificationStatus(value: string | undefined): RelayVerificationStatus {
  if (value === undefined) return "unknown";
  if (!verificationStatuses.has(value as RelayVerificationStatus)) throw new Error(`invalid_relay_verification_status:${value}`);
  return value as RelayVerificationStatus;
}

function assertNonNegativeInteger(value: string | undefined, field: string): number {
  if (value === undefined) return 0;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`invalid_relay_number:${field}`);
  return parsed;
}

async function hashFile(path: string): Promise<string> {
  return sha256Bytes(await readFile(path));
}

async function parseJsonIfPossible(path: string): Promise<{ parsedJson: boolean; rawShape: { type: string; keys: string[] } }> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
    return {
      parsedJson: true,
      rawShape: {
        type: Array.isArray(parsed) ? "array" : typeof parsed,
        keys: isRecord(parsed) ? Object.keys(parsed).sort().slice(0, 50) : [],
      },
    };
  } catch {
    return { parsedJson: false, rawShape: { type: "opaque", keys: [] } };
  }
}

async function importArtifact(cwd: string, path: string, artifactDir: string, name: string, role: RelayRole): Promise<RelayImportedArtifact> {
  const inputPath = resolve(cwd, path);
  if (!existsSync(inputPath)) throw new Error(`missing_relay_artifact:${inputPath}`);
  const storedPath = join(artifactDir, `${name}${basename(inputPath).includes(".") ? `.${basename(inputPath).split(".").pop()}` : ".artifact"}`);
  await copyFile(inputPath, storedPath);
  const shape = await parseJsonIfPossible(inputPath);
  return {
    role,
    inputPath,
    storedPath,
    hash: await hashFile(inputPath),
    parsedJson: shape.parsedJson,
    rawShape: shape.rawShape,
  };
}

function notRequestedGate(): RelayGate {
  return { enabled: false, status: "not_requested", exitCode: 0, reason: "gate_not_requested" };
}

function gateFor(enabled: boolean, evidenceGaps: RelayEvidenceGap[], blockingUnknowns: RelayUnknown[]): RelayGate {
  if (!enabled) return notRequestedGate();
  if (evidenceGaps.length > 0) return { enabled: true, status: "failed", exitCode: 1, reason: "evidence_gaps" };
  if (blockingUnknowns.length > 0) return { enabled: true, status: "blocked", exitCode: 1, reason: "blocking_unknowns" };
  return { enabled: true, status: "passed", exitCode: 0, reason: "all_gateable_relay_evidence_passed" };
}

function artifactContentNotEvaluated(evidence: string): RelayHeuristicClaim {
  return {
    kind: "artifact_content_not_semantically_evaluated",
    confidence: "high",
    evidence,
    recommendation: "Use relay artifacts as review inputs; do not treat imported prose as verification.",
  };
}

function importOnlyReviewEngine(engine: string): RelayEngineDescriptor {
  return {
    engine,
    driverId: "external-relay",
    role: "review-engine",
    capabilities: {
      writes: "none",
      review: true,
      verification: "external",
      spawn: false,
    },
  };
}

function authorEngine(engine: string): RelayEngineDescriptor {
  return {
    engine,
    driverId: "artifact-import",
    role: "author-engine",
    capabilities: {
      writes: "unknown",
      review: false,
      verification: "external",
      spawn: false,
    },
  };
}

export async function recordRelayRound(cwd: string, options: {
  stage?: string;
  artifact?: string;
  authorFile?: string;
  reviewFile?: string;
  authorEngine?: string;
  reviewEngine?: string;
  contractSubjectHash?: string;
}): Promise<RelayRecordResult> {
  const stage = assertStage(options.stage);
  if (!options.artifact) throw new Error("missing_relay_stage_artifact");
  if (!options.authorFile) throw new Error("missing_relay_author_file");
  if (!options.reviewFile) throw new Error("missing_relay_review_file");
  const stageArtifactPath = resolve(cwd, options.artifact);
  if (!existsSync(stageArtifactPath)) throw new Error(`missing_relay_stage_artifact:${stageArtifactPath}`);
  const relayId = createRelayId();
  const artifactDir = join(harnessRoot(cwd), "relay", relayId);
  await ensureDir(artifactDir);
  const storedStageArtifactPath = join(artifactDir, `stage-artifact${basename(stageArtifactPath).includes(".") ? `.${basename(stageArtifactPath).split(".").pop()}` : ".artifact"}`);
  await copyFile(stageArtifactPath, storedStageArtifactPath);
  const stageArtifactHash = await hashFile(stageArtifactPath);
  const author = await importArtifact(cwd, options.authorFile, artifactDir, "author", "author-engine");
  const review = await importArtifact(cwd, options.reviewFile, artifactDir, "review", "review-engine");
  const now = new Date().toISOString();
  const artifact: RelaySessionArtifact = {
    schemaVersion: 1,
    stability: "experimental",
    type: "codexus.autopilot.relay.session",
    relayId,
    contractSubjectHash: options.contractSubjectHash ?? null,
    stage,
    round: 1,
    status: "recorded",
    recordOnly: true,
    createdAt: now,
    updatedAt: now,
    authorEngine: authorEngine(options.authorEngine ?? "external-author"),
    reviewEngine: importOnlyReviewEngine(options.reviewEngine ?? "external-reviewer"),
    stageArtifact: {
      path: stageArtifactPath,
      storedPath: storedStageArtifactPath,
      hash: stageArtifactHash,
    },
    submissions: [author],
    reviews: [review],
    stageGateEvidence: [],
    convergenceAgreement: null,
    stop: null,
    evidenceGaps: [],
    derivableFacts: [
      { kind: "relay_round_recorded", gate: false, evidence: relayId },
      { kind: "stage_artifact_hashed", gate: true, evidence: stageArtifactHash },
      { kind: "external_author_artifact_imported", gate: false, evidence: author.hash },
      { kind: "external_review_artifact_imported", gate: false, evidence: review.hash },
      { kind: "review_engine_import_only", gate: true, evidence: "driverId:external-relay spawn:false" },
    ],
    heuristicClaims: [
      artifactContentNotEvaluated("author/review artifacts were imported, not semantically verified"),
    ],
    blockingUnknowns: [],
    informationalUnknowns: [],
    gate: notRequestedGate(),
  };
  const artifactPath = join(artifactDir, "session.json");
  await writeJsonAtomic(artifactPath, artifact);
  return { ...artifact, command: "relay record", artifactDir, artifactPath };
}

export async function recordStageGateEvidence(cwd: string, options: {
  stage?: string;
  scope?: string;
  role?: string;
  artifact?: string;
  artifactHash?: string;
  residualHighFindings?: string;
  verificationStatus?: string;
}): Promise<StageGateRecordResult> {
  const stage = assertStage(options.stage);
  const scope = assertReviewScope(options.scope);
  const role = options.role ?? "review-engine";
  const residualFindingCount = assertNonNegativeInteger(options.residualHighFindings, "residual-high-findings");
  const verificationStatus = assertVerificationStatus(options.verificationStatus);
  if (!options.artifact && !options.artifactHash) throw new Error("missing_relay_stage_artifact_or_hash");
  const evidenceId = createEvidenceId();
  const artifactDir = join(harnessRoot(cwd), "relay", "stage-gates");
  await ensureDir(artifactDir);
  const resolvedArtifactPath = options.artifact ? resolve(cwd, options.artifact) : null;
  if (resolvedArtifactPath && !existsSync(resolvedArtifactPath)) throw new Error(`missing_relay_stage_artifact:${resolvedArtifactPath}`);
  const storedPath = resolvedArtifactPath ? join(artifactDir, `${evidenceId}-${basename(resolvedArtifactPath)}`) : null;
  if (resolvedArtifactPath && storedPath) await copyFile(resolvedArtifactPath, storedPath);
  const stageArtifactHash = options.artifactHash ?? await hashFile(resolvedArtifactPath as string);
  const recordedAt = new Date().toISOString();
  const artifact: StageGateEvidenceArtifact = {
    schemaVersion: 1,
    stability: "experimental",
    type: "codexus.autopilot.stage-gate-evidence",
    evidenceId,
    stage,
    scope,
    role,
    recordedAt,
    stageArtifactHash,
    freshReadArtifacts: [
      {
        path: resolvedArtifactPath ?? "<artifact-hash-only>",
        storedPath,
        hash: stageArtifactHash,
      },
    ],
    verificationMatrix: [],
    findings: [],
    residualFindingCount,
    verificationResults: [
      {
        status: verificationStatus,
        command: null,
        evidencePath: null,
      },
    ],
    heuristicClaims: [
      artifactContentNotEvaluated("stage-gate evidence shape does not prove semantic correctness by itself"),
    ],
    derivableFacts: [
      { kind: "stage_artifact_hashed", gate: true, evidence: stageArtifactHash },
      {
        kind: scope === "full-gate" ? "stage_gate_full_gate_present" : "relay_round_recorded",
        gate: scope === "full-gate",
        evidence: `${stage}:${scope}`,
      },
    ],
  };
  const artifactPath = join(artifactDir, `${evidenceId}.json`);
  await writeJsonAtomic(artifactPath, artifact);
  return { ...artifact, command: "relay stage-gate", artifactPath };
}

async function readJsonFile(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch (error) {
    throw new Error(`json_parse_failed:${path}:${error instanceof Error ? error.message : String(error)}`);
  }
}

function normalizeRequiredRoles(values: string[] | undefined): string[] {
  const roles = values && values.length > 0 ? values : ["author-engine", "review-engine"];
  return [...new Set(roles.map((role) => role.trim()).filter(Boolean))].sort();
}

function asAgreement(value: unknown): ConvergenceAgreementArtifact | null {
  if (!isRecord(value)) return null;
  if (value.schemaVersion !== 1 || value.stability !== "experimental" || value.type !== "codexus.autopilot.convergence-agreement") return null;
  if (!relayStages.has(value.stage as RelayStage)) return null;
  if (!Number.isInteger(value.round) || (value.round as number) < 0) return null;
  if (!Array.isArray(value.declarations)) return null;
  if (!Number.isInteger(value.unresolvedHighFindings) || (value.unresolvedHighFindings as number) < 0) return null;
  if (typeof value.decisionNeeded !== "boolean") return null;
  const declarations: ConvergenceDeclaration[] = [];
  for (const item of value.declarations) {
    if (!isRecord(item)) return null;
    if (typeof item.role !== "string" || typeof item.engine !== "string" || typeof item.artifactHash !== "string" || typeof item.declaredAt !== "string") {
      return null;
    }
    declarations.push({
      role: item.role,
      engine: item.engine,
      artifactHash: item.artifactHash,
      declaredAt: item.declaredAt,
    });
  }
  return {
    schemaVersion: 1,
    stability: "experimental",
    type: "codexus.autopilot.convergence-agreement",
    stage: value.stage as RelayStage,
    round: value.round as number,
    declarations,
    unresolvedHighFindings: value.unresolvedHighFindings as number,
    decisionNeeded: value.decisionNeeded,
  };
}

function asStageGate(value: unknown): StageGateEvidenceArtifact | null {
  if (!isRecord(value)) return null;
  if (value.schemaVersion !== 1 || value.stability !== "experimental" || value.type !== "codexus.autopilot.stage-gate-evidence") return null;
  if (!relayStages.has(value.stage as RelayStage)) return null;
  if (!relayReviewScopes.has(value.scope as RelayReviewScope)) return null;
  if (typeof value.role !== "string" || typeof value.stageArtifactHash !== "string") return null;
  if (!Number.isInteger(value.residualFindingCount) || (value.residualFindingCount as number) < 0) return null;
  return value as unknown as StageGateEvidenceArtifact;
}

function gap(kind: RelayEvidenceGap["kind"], evidence: string | null, policy: string, recommendation: string): RelayEvidenceGap {
  return { kind, gate: true, evidence, policy, recommendation };
}

function unknown(kind: RelayUnknown["kind"], evidence: string | null, recommendation: string, gate = true): RelayUnknown {
  return { kind, gate, evidence, recommendation };
}

export async function checkConvergenceAgreement(cwd: string, options: {
  agreement?: string;
  stageGate?: string;
  requiredRoles?: string[];
  verificationStatus?: string;
  gate?: boolean;
}): Promise<RelayAgreementCheckResult> {
  if (!options.agreement) throw new Error("missing_relay_agreement");
  const agreementPath = resolve(cwd, options.agreement);
  if (!existsSync(agreementPath)) throw new Error(`missing_relay_agreement:${agreementPath}`);
  const evidenceGaps: RelayEvidenceGap[] = [];
  const derivableFacts: RelayDerivableFact[] = [];
  const heuristicClaims: RelayHeuristicClaim[] = [
    {
      kind: "engine_agreement_is_advisory",
      confidence: "high",
      evidence: "Convergence declarations are review artifacts, not completion authority.",
      recommendation: "Keep final completion attached to verification and evidence gates.",
    },
  ];
  const blockingUnknowns: RelayUnknown[] = [];
  const informationalUnknowns: RelayUnknown[] = [];
  let agreement: ConvergenceAgreementArtifact | null = null;
  try {
    agreement = asAgreement(await readJsonFile(agreementPath));
  } catch (error) {
    blockingUnknowns.push(unknown("agreement_unreadable", agreementPath, error instanceof Error ? error.message : String(error)));
  }
  if (!agreement) {
    blockingUnknowns.push(unknown("agreement_unreadable", agreementPath, "Provide a codexus.autopilot.convergence-agreement artifact."));
  } else {
    derivableFacts.push({ kind: "convergence_agreement_loaded", gate: true, evidence: agreementPath });
  }

  const requiredRoles = normalizeRequiredRoles(options.requiredRoles);
  let agreementArtifactHash: string | null = null;
  if (agreement) {
    const declarationsByRole = new Map(agreement.declarations.map((declaration) => [declaration.role, declaration]));
    for (const role of requiredRoles) {
      if (!declarationsByRole.has(role)) {
        evidenceGaps.push(gap(
          "missing_required_role_declaration",
          role,
          "Every required relay role must declare convergence.",
          "Add a declaration for the missing role or keep the stage open.",
        ));
      }
    }
    if (requiredRoles.every((role) => declarationsByRole.has(role))) {
      derivableFacts.push({ kind: "required_role_declarations_present", gate: true, evidence: requiredRoles.join(",") });
    }
    const requiredHashes = requiredRoles
      .map((role) => declarationsByRole.get(role)?.artifactHash)
      .filter((hash): hash is string => typeof hash === "string" && hash.length > 0);
    const uniqueHashes = [...new Set(requiredHashes)];
    if (uniqueHashes.length === 1 && requiredHashes.length === requiredRoles.length) {
      agreementArtifactHash = uniqueHashes[0];
      derivableFacts.push({ kind: "required_declarations_same_artifact_hash", gate: true, evidence: agreementArtifactHash });
    } else if (requiredHashes.length > 0) {
      evidenceGaps.push(gap(
        "artifact_hash_mismatch",
        uniqueHashes.join(","),
        "Required convergence declarations must reference the same stage artifact hash.",
        "Regenerate declarations over the same stage artifact.",
      ));
    }
    if (agreement.unresolvedHighFindings > 0) {
      evidenceGaps.push(gap(
        "unresolved_high_findings",
        String(agreement.unresolvedHighFindings),
        "High-severity review findings must be resolved before convergence.",
        "Resolve or explicitly move the stage to decision_needed.",
      ));
    }
    if (agreement.decisionNeeded) {
      evidenceGaps.push(gap(
        "decision_needed",
        agreement.stage,
        "Decision-needed stages cannot converge.",
        "Capture the missing decision before accepting convergence.",
      ));
    }
  }

  let stageGate: StageGateEvidenceArtifact | null = null;
  const stageGatePath = options.stageGate ? resolve(cwd, options.stageGate) : null;
  if (!stageGatePath) {
    evidenceGaps.push(gap(
      "stage_gate_missing",
      null,
      "Stage convergence requires fresh full-gate stage evidence.",
      "Provide --stage-gate <path> with scope full-gate.",
    ));
  } else if (!existsSync(stageGatePath)) {
    blockingUnknowns.push(unknown("stage_gate_unreadable", stageGatePath, "Stage-gate evidence file is missing."));
  } else {
    try {
      stageGate = asStageGate(await readJsonFile(stageGatePath));
    } catch (error) {
      blockingUnknowns.push(unknown("stage_gate_unreadable", stageGatePath, error instanceof Error ? error.message : String(error)));
    }
    if (!stageGate) {
      evidenceGaps.push(gap(
        "stage_gate_invalid",
        stageGatePath,
        "Stage-gate evidence must use codexus.autopilot.stage-gate-evidence shape.",
        "Regenerate the stage-gate artifact with cx autopilot relay stage-gate.",
      ));
    }
  }
  if (agreement && stageGate) {
    if (stageGate.scope !== "full-gate") {
      evidenceGaps.push(gap(
        "stage_gate_not_full_gate",
        stageGate.scope,
        "Delta-check evidence cannot establish convergence.",
        "Run or import a fresh full-gate review artifact.",
      ));
    } else {
      derivableFacts.push({ kind: "stage_gate_full_gate_present", gate: true, evidence: stageGatePath as string });
    }
    if (stageGate.stage !== agreement.stage) {
      evidenceGaps.push(gap(
        "stage_gate_stage_mismatch",
        `${stageGate.stage}!=${agreement.stage}`,
        "Stage-gate evidence must match the convergence agreement stage.",
        "Use matching stage artifacts.",
      ));
    }
    if (agreementArtifactHash && stageGate.stageArtifactHash !== agreementArtifactHash) {
      evidenceGaps.push(gap(
        "stage_gate_artifact_hash_mismatch",
        `${stageGate.stageArtifactHash}!=${agreementArtifactHash}`,
        "Stage-gate evidence must cover the same artifact hash as convergence declarations.",
        "Regenerate stage-gate evidence for the same stage artifact.",
      ));
    }
    if (stageGate.residualFindingCount > 0) {
      evidenceGaps.push(gap(
        "stage_gate_residual_findings",
        String(stageGate.residualFindingCount),
        "Full-gate evidence must not leave residual findings when accepting convergence.",
        "Resolve residual findings or stop with decision_needed.",
      ));
    }
  }

  const verificationStatus = assertVerificationStatus(options.verificationStatus);
  if (verificationStatus === "passed") {
    derivableFacts.push({ kind: "verification_passed", gate: true, evidence: "verification-status:passed" });
  } else if (verificationStatus === "failed") {
    evidenceGaps.push(gap(
      "verification_failed_blocks_completion",
      "verification-status:failed",
      "Convergence agreement is not completion authority.",
      "Repair the failing verification before marking the run complete.",
    ));
  } else {
    blockingUnknowns.push(unknown(
      "verification_status_unknown",
      `verification-status:${verificationStatus}`,
      "Provide --verification-status passed only after a fresh verification gate passes.",
    ));
  }

  const structuralGaps = evidenceGaps.filter((item) => agreementStructuralGapKinds.has(item.kind));
  const convergence = !agreement && blockingUnknowns.some((item) => item.kind === "agreement_unreadable")
    ? "unknown"
    : structuralGaps.length === 0 && blockingUnknowns.every((item) => item.kind !== "agreement_unreadable" && item.kind !== "stage_gate_unreadable")
      ? "valid"
      : "invalid";
  const status: RelayStatus = evidenceGaps.length > 0 ? "fail" : blockingUnknowns.length > 0 ? "unknown" : "pass";
  const gate = gateFor(Boolean(options.gate), evidenceGaps, blockingUnknowns);
  return {
    schemaVersion: 1,
    stability: "experimental",
    type: "codexus.autopilot.relay.agreement_check",
    command: "relay check-agreement",
    agreementPath,
    stageGatePath,
    relay: {
      status,
      convergence,
      canComplete: convergence === "valid" && status === "pass" && verificationStatus === "passed",
      convergenceIsCompletionAuthority: false,
      completionAuthority: "verification_and_evidence_gates",
      stage: agreement?.stage ?? null,
      requiredRoles,
      artifactHash: agreementArtifactHash,
      verificationStatus,
    },
    evidenceGaps,
    derivableFacts,
    heuristicClaims,
    blockingUnknowns,
    informationalUnknowns,
    gate,
  };
}

export async function readRelaySession(cwd: string, relayId: string): Promise<RelaySessionArtifact> {
  const safeRelayId = safeSegment(relayId);
  const path = join(harnessRoot(cwd), "relay", safeRelayId, "session.json");
  if (!existsSync(path)) throw new Error(`missing_relay_session:${safeRelayId}`);
  const parsed = await readJsonFile(path);
  if (!isRecord(parsed) || parsed.type !== "codexus.autopilot.relay.session" || parsed.schemaVersion !== 1) {
    throw new Error(`relay_session_invalid:${safeRelayId}`);
  }
  return parsed as unknown as RelaySessionArtifact;
}
