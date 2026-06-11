import { existsSync, readFileSync, realpathSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { harnessRoot } from "../ledger/paths.ts";
import { buildChangeEvidenceReport, type ChangeEvidenceReport, type EvidenceGap } from "../session/change-evidence.ts";
import { readSessionStateWithMigration, refreshSessionState } from "../session/state.ts";
import { sha256Bytes, sha256CanonicalJson } from "../util/hash.ts";
import { matchesPattern, normalizeGlobPath } from "../util/glob.ts";
import { createRunId } from "../util/id.ts";
import { ensureDir, writeJsonAtomic } from "../util/fs.ts";
import type { SchemaArtifactValidationResult } from "../validation/schemas.ts";
import { DEFAULT_AUTONOMY_PRESET, isAutonomyPresetName, type AutonomyPresetName } from "../control/autonomy.ts";

export interface AutopilotSourceDoc {
  path: string;
  sha256: string;
}

export interface AutopilotContractApproval {
  approvedAt: string;
  approvedBy: string;
  subjectHash: string;
  approvalRecordPath: string;
}

export interface AutopilotScopePolicy {
  allow: string[];
  forbiddenChanges: string[];
}

export interface AutopilotBody {
  scope: AutopilotScopePolicy;
  acceptanceCriteria: string[];
  verificationRequired: string[];
  commandAllowlist: string[];
  networkPolicy: {
    mode: "none" | "driver-default";
    requiresDriverEnforcement: boolean;
  };
  maxRuntimeMs: number;
  maxRepairIterations: number;
  maxChangedFiles: number;
  maxDiffLines: number;
  approval: "enforced-never-with-isolation";
  stopOnPolicyViolation: boolean;
}

export interface AutopilotContract {
  schemaVersion: 1;
  stability: "experimental";
  type: "codexus.autopilot.contract";
  status: "draft" | "approved";
  autonomyPreset: AutonomyPresetName;
  sourceDocs: AutopilotSourceDoc[];
  autopilot: AutopilotBody;
  approval?: AutopilotContractApproval;
}

export interface AutopilotContractValidation {
  schemaVersion: 1;
  valid: boolean;
  errors: string[];
  contract: AutopilotContract | null;
  canonicalSubjectHash: string | null;
  subjectHashMatches: boolean | null;
}

export interface AutopilotPlanHeuristicClaim {
  kind:
    | "draft_requires_human_approval"
    | "acceptance_criteria_extraction_deferred"
    | "scope_inferred_from_source_docs"
    | "verification_commands_inferred_from_package_scripts";
  confidence: "low" | "medium" | "high";
  evidence: string;
  recommendation: string;
}

export interface AutopilotPlanFact {
  kind:
    | "source_doc_linked"
    | "acceptance_criteria_extracted"
    | "verification_command_declared"
    | "autonomy_preset_declared";
  gate: false;
  evidence: string;
  files?: string[];
  commands?: string[];
}

export interface AutopilotPlanResult {
  schemaVersion: 1;
  stability: "experimental";
  command: "autopilot plan";
  artifactPath: string;
  contract: AutopilotContract;
  draftRequiresApproval: true;
  derivableFacts: AutopilotPlanFact[];
  heuristicClaims: AutopilotPlanHeuristicClaim[];
}

export interface AutopilotApprovalRecord {
  schemaVersion: 1;
  stability: "experimental";
  type: "codexus.autopilot.approval-record";
  approvedAt: string;
  approvedBy: string;
  subjectHash: string;
  contractPath: string;
  sourceDocs: AutopilotSourceDoc[];
}

export interface AutopilotApproveResult {
  schemaVersion: 1;
  stability: "experimental";
  command: "autopilot contract approve";
  artifactPath: string;
  approvalRecordPath: string;
  contract: AutopilotContract;
  validation: AutopilotContractValidation;
}

export interface AutopilotContractValidateResult {
  schemaVersion: 1;
  stability: "experimental";
  command: "autopilot contract validate";
  file: string;
  ok: boolean;
  validation: AutopilotContractValidation;
  artifactValidation: SchemaArtifactValidationResult;
  sourceDocs: Array<AutopilotSourceDoc & { exists: boolean }>;
  approvalRecordExists: boolean | null;
}

function subjectPayload(contract: Pick<AutopilotContract, "autonomyPreset" | "autopilot">) {
  return {
    autonomyPreset: contract.autonomyPreset,
    autopilot: contract.autopilot,
  };
}

export interface AutopilotBlockingUnknown {
  kind: "contract_invalid" | "approval_record_missing";
  gate: true;
  evidence: string | null;
  recommendation: string;
}

export interface AutopilotScopeEvidenceGap extends Omit<EvidenceGap, "kind"> {
  kind: EvidenceGap["kind"] | "forbidden_change_touched";
}

export interface AutopilotScopeCheckResult {
  schemaVersion: 1;
  stability: "experimental";
  command: "autopilot contract scope-check";
  file: string;
  contractStatus: "draft" | "approved" | "invalid";
  validation: AutopilotContractValidation;
  artifactValidation: SchemaArtifactValidationResult;
  sourceDocs: Array<AutopilotSourceDoc & { exists: boolean }>;
  approvalRecordExists: boolean | null;
  diff: ChangeEvidenceReport["diff"];
  evidence: ChangeEvidenceReport["evidence"];
  evidenceGaps: AutopilotScopeEvidenceGap[];
  derivableFacts: ChangeEvidenceReport["derivableFacts"];
  heuristicClaims: ChangeEvidenceReport["heuristicClaims"];
  changeEvidence: ChangeEvidenceReport["changeEvidence"];
  blockingUnknowns: AutopilotBlockingUnknown[];
  gate: {
    enabled: boolean;
    status: "not_requested" | "passed" | "failed" | "blocked";
    exitCode: 0 | 1;
    reason: string;
  };
  migration: Awaited<ReturnType<typeof readSessionStateWithMigration>>["migration"];
}

export interface AutopilotRunGateResult {
  schemaVersion: 1;
  stability: "experimental";
  command: "autopilot run-gate";
  file: string;
  runSupported: false;
  contractStatus: AutopilotScopeCheckResult["contractStatus"];
  validation: AutopilotScopeCheckResult["validation"];
  approvalRecordExists: boolean | null;
  scope: {
    allow: string[];
    forbiddenChanges: string[];
    diffStatus: AutopilotScopeCheckResult["changeEvidence"]["status"];
    freshEvidence: boolean;
  };
  readinessGate: AutopilotScopeCheckResult["gate"];
  executionGate: {
    enabled: true;
    status: "blocked";
    exitCode: 1;
    reason: string;
  };
  actionAuthority: {
    schemaVersion: 1;
    contractVersion: "autopilot-run-gate-v1";
    actionSurface: "autopilot.run";
    runSupported: false;
    sideEffects: {
      startsRun: false;
      mutatesWorkspace: false;
      requiresWorktreeIsolation: true;
      requiresExplicitApproval: true;
      requiresFreshVerification: true;
    };
    driverAuthority: "none";
    completionAuthority: false;
    cleanupAuthority: false;
    healthAuthority: false;
    caveat: string;
  };
  evidenceGaps: AutopilotScopeCheckResult["evidenceGaps"];
  derivableFacts: AutopilotScopeCheckResult["derivableFacts"];
  heuristicClaims: AutopilotScopeCheckResult["heuristicClaims"];
  blockingUnknowns: AutopilotScopeCheckResult["blockingUnknowns"];
  gate: AutopilotScopeCheckResult["gate"];
}

const allowedTopLevelKeys = new Set(["schemaVersion", "stability", "type", "status", "autonomyPreset", "sourceDocs", "autopilot", "approval"]);
const allowedBodyKeys = new Set([
  "scope",
  "acceptanceCriteria",
  "verificationRequired",
  "commandAllowlist",
  "networkPolicy",
  "maxRuntimeMs",
  "maxRepairIterations",
  "maxChangedFiles",
  "maxDiffLines",
  "approval",
  "stopOnPolicyViolation",
]);
const allowedScopeKeys = new Set(["allow", "forbiddenChanges"]);
const allowedApprovalKeys = new Set(["approvedAt", "approvedBy", "subjectHash", "approvalRecordPath"]);
const allowedNetworkKeys = new Set(["mode", "requiresDriverEnforcement"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireStringArray(record: Record<string, unknown>, key: string, errors: string[], path: string, required = false): string[] | undefined {
  const value = record[key];
  if (value === undefined) {
    if (required) errors.push(`${path}:expected_non_empty_string_array`);
    return undefined;
  }
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== "string" || item.trim() === "")) {
    errors.push(`${path}:expected_non_empty_string_array`);
    return undefined;
  }
  return value;
}

function optionalStringArray(record: Record<string, unknown>, key: string, errors: string[], path: string): string[] {
  const value = record[key];
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim() === "")) {
    errors.push(`${path}:expected_string_array`);
    return [];
  }
  return value as string[];
}

function requirePositiveInteger(record: Record<string, unknown>, key: string, errors: string[], path: string, min = 1): number | undefined {
  const value = record[key];
  if (!Number.isInteger(value) || (value as number) < min) {
    errors.push(`${path}:expected_integer_gte_${min}`);
    return undefined;
  }
  return value as number;
}

function relativeWorkspacePath(cwd: string, target: string): string {
  const workspaceRoot = existsSync(cwd) ? realpathSync(cwd) : resolve(cwd);
  const resolvedTarget = existsSync(target) ? realpathSync(target) : resolve(target);
  const rel = normalizeGlobPath(relative(workspaceRoot, resolvedTarget));
  if (rel === "" || rel === ".") return ".";
  if (rel === ".." || rel.startsWith("../")) throw new Error(`autopilot_source_doc_outside_workspace:${target}`);
  return rel;
}

function autopilotRoot(cwd: string): string {
  return join(harnessRoot(cwd), "autopilot");
}

function extractAcceptanceCriteria(text: string): string[] {
  const lines = text.split(/\r?\n/);
  const criteria: string[] = [];
  let inSection = false;
  for (const rawLine of lines) {
    const heading = rawLine.match(/^#{1,6}\s+(.+?)\s*$/);
    if (heading) {
      const title = heading[1].trim().toLowerCase();
      if (title === "acceptance criteria") {
        inSection = true;
        continue;
      }
      if (inSection) break;
    }
    if (!inSection) continue;
    const bullet = rawLine.match(/^\s*(?:[-*+]|\d+\.)\s+(.*?)\s*$/);
    if (bullet && bullet[1].trim()) criteria.push(bullet[1].trim());
  }
  return [...new Set(criteria)];
}

function inferVerificationCommands(cwd: string): { verificationRequired: string[]; commandAllowlist: string[]; heuristic: AutopilotPlanHeuristicClaim | null } {
  const packageJsonPath = join(resolve(cwd), "package.json");
  if (!existsSync(packageJsonPath)) {
    return {
      verificationRequired: [],
      commandAllowlist: [],
      heuristic: {
        kind: "verification_commands_inferred_from_package_scripts",
        confidence: "low",
        evidence: "package.json is missing; no verification commands could be inferred",
        recommendation: "Add verificationRequired and commandAllowlist before approving the contract.",
      },
    };
  }
  try {
    const parsed = JSON.parse(readFileSync(packageJsonPath, "utf8")) as unknown;
    if (!isRecord(parsed) || !isRecord(parsed.scripts)) {
      return {
        verificationRequired: [],
        commandAllowlist: [],
        heuristic: {
          kind: "verification_commands_inferred_from_package_scripts",
          confidence: "low",
          evidence: "package.json has no scripts object",
          recommendation: "Add explicit verification commands before approving the contract.",
        },
      };
    }
    const commands: string[] = [];
    if (typeof parsed.scripts.test === "string") commands.push("npm test");
    if (typeof parsed.scripts.typecheck === "string") commands.push("npm run typecheck");
    if (typeof parsed.scripts.lint === "string") commands.push("npm run lint");
    return {
      verificationRequired: commands.filter((command) => command === "npm test" || command === "npm run typecheck"),
      commandAllowlist: commands,
      heuristic: {
        kind: "verification_commands_inferred_from_package_scripts",
        confidence: commands.length > 0 ? "medium" : "low",
        evidence: commands.length > 0
          ? `inferred from package.json scripts: ${commands.join(", ")}`
          : "package.json scripts did not expose test/typecheck/lint defaults",
        recommendation: commands.length > 0
          ? "Review the inferred commands before approval."
          : "Add explicit verification commands before approving the contract.",
      },
    };
  } catch {
    return {
      verificationRequired: [],
      commandAllowlist: [],
      heuristic: {
        kind: "verification_commands_inferred_from_package_scripts",
        confidence: "low",
        evidence: "package.json could not be parsed",
        recommendation: "Fix package.json or add verification commands manually before approval.",
      },
    };
  }
}

function inferScopeAllow(sourceDocs: string[], texts: string[]): string[] {
  const scoped = new Set<string>();
  for (const doc of sourceDocs) scoped.add(doc);
  for (const text of texts) {
    const matches = text.match(/\b(?:src|tests|docs|scripts|schemas|fixtures|codex|\.github)\/[A-Za-z0-9_./-]+|(?:^|[\s`])(package\.json)(?=$|[\s`])/g) ?? [];
    for (const raw of matches) {
      const value = raw.trim().replace(/^`|`$/g, "");
      if (!value) continue;
      if (value === "package.json") {
        scoped.add("package.json");
      } else if (value.startsWith("src/")) {
        scoped.add("src/**");
      } else if (value.startsWith("tests/")) {
        scoped.add("tests/**");
      } else if (value.startsWith(".github/")) {
        scoped.add(".github/**");
      } else {
        scoped.add(normalizeGlobPath(value));
      }
    }
  }
  return [...scoped];
}

function defaultForbiddenChanges(): string[] {
  return [".github/**", "package.json", "**/.env*", ".env", ".env.*"];
}

function nowId(prefix: string): string {
  return createRunId().replace(/^run_/, `${prefix}_`);
}

function validateSourceDocs(value: unknown, errors: string[]): AutopilotSourceDoc[] {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push("sourceDocs:expected_non_empty_array");
    return [];
  }
  const sourceDocs: AutopilotSourceDoc[] = [];
  for (const [index, item] of value.entries()) {
    const path = `sourceDocs[${index}]`;
    if (!isRecord(item)) {
      errors.push(`${path}:not_object`);
      continue;
    }
    if (typeof item.path !== "string" || item.path.trim() === "") errors.push(`${path}.path:expected_non_empty_string`);
    if (typeof item.sha256 !== "string" || !item.sha256.startsWith("sha256:")) errors.push(`${path}.sha256:expected_sha256`);
    if (typeof item.path === "string" && item.path.trim() && typeof item.sha256 === "string" && item.sha256.startsWith("sha256:")) {
      sourceDocs.push({ path: normalizeGlobPath(item.path), sha256: item.sha256 });
    }
  }
  return sourceDocs;
}

export function validateAutopilotContract(value: unknown): AutopilotContractValidation {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return { schemaVersion: 1, valid: false, errors: ["contract:not_object"], contract: null, canonicalSubjectHash: null, subjectHashMatches: null };
  }
  for (const key of Object.keys(value)) {
    if (!allowedTopLevelKeys.has(key)) errors.push(`${key}:unknown_key`);
  }
  if (value.schemaVersion !== 1) errors.push("schemaVersion:not_1");
  if (value.stability !== "experimental") errors.push("stability:not_experimental");
  if (value.type !== "codexus.autopilot.contract") errors.push("type:not_codexus_autopilot_contract");
  if (value.status !== "draft" && value.status !== "approved") errors.push("status:invalid_enum");
  if (!isAutonomyPresetName(value.autonomyPreset)) errors.push("autonomyPreset:invalid_enum");
  const sourceDocs = validateSourceDocs(value.sourceDocs, errors);

  let autopilotBody: AutopilotBody | null = null;
  if (!isRecord(value.autopilot)) {
    errors.push("autopilot:not_object");
  } else {
    const body = value.autopilot;
    for (const key of Object.keys(body)) {
      if (!allowedBodyKeys.has(key)) errors.push(`autopilot.${key}:unknown_key`);
    }
    let scope: AutopilotScopePolicy | null = null;
    if (!isRecord(body.scope)) {
      errors.push("autopilot.scope:not_object");
    } else {
      for (const key of Object.keys(body.scope)) {
        if (!allowedScopeKeys.has(key)) errors.push(`autopilot.scope.${key}:unknown_key`);
      }
      const allow = requireStringArray(body.scope, "allow", errors, "autopilot.scope.allow", true);
      const forbiddenChanges = optionalStringArray(body.scope, "forbiddenChanges", errors, "autopilot.scope.forbiddenChanges");
      if (allow) scope = { allow, forbiddenChanges };
    }
    const acceptanceCriteria = optionalStringArray(body, "acceptanceCriteria", errors, "autopilot.acceptanceCriteria");
    const verificationRequired = optionalStringArray(body, "verificationRequired", errors, "autopilot.verificationRequired");
    const commandAllowlist = optionalStringArray(body, "commandAllowlist", errors, "autopilot.commandAllowlist");
    let networkPolicy: AutopilotBody["networkPolicy"] | null = null;
    if (!isRecord(body.networkPolicy)) {
      errors.push("autopilot.networkPolicy:not_object");
    } else {
      for (const key of Object.keys(body.networkPolicy)) {
        if (!allowedNetworkKeys.has(key)) errors.push(`autopilot.networkPolicy.${key}:unknown_key`);
      }
      const mode = body.networkPolicy.mode;
      if (mode !== "none" && mode !== "driver-default") errors.push("autopilot.networkPolicy.mode:invalid_enum");
      if (typeof body.networkPolicy.requiresDriverEnforcement !== "boolean") {
        errors.push("autopilot.networkPolicy.requiresDriverEnforcement:expected_boolean");
      } else if (mode === "none" || mode === "driver-default") {
        networkPolicy = {
          mode,
          requiresDriverEnforcement: body.networkPolicy.requiresDriverEnforcement,
        };
      }
    }
    const maxRuntimeMs = requirePositiveInteger(body, "maxRuntimeMs", errors, "autopilot.maxRuntimeMs");
    const maxRepairIterations = requirePositiveInteger(body, "maxRepairIterations", errors, "autopilot.maxRepairIterations");
    const maxChangedFiles = requirePositiveInteger(body, "maxChangedFiles", errors, "autopilot.maxChangedFiles");
    const maxDiffLines = requirePositiveInteger(body, "maxDiffLines", errors, "autopilot.maxDiffLines");
    if (body.approval !== "enforced-never-with-isolation") errors.push("autopilot.approval:invalid_enum");
    if (typeof body.stopOnPolicyViolation !== "boolean") errors.push("autopilot.stopOnPolicyViolation:expected_boolean");
    if (scope && networkPolicy && maxRuntimeMs && maxRepairIterations && maxChangedFiles && maxDiffLines && body.approval === "enforced-never-with-isolation" && typeof body.stopOnPolicyViolation === "boolean") {
      autopilotBody = {
        scope,
        acceptanceCriteria,
        verificationRequired,
        commandAllowlist,
        networkPolicy,
        maxRuntimeMs,
        maxRepairIterations,
        maxChangedFiles,
        maxDiffLines,
        approval: "enforced-never-with-isolation",
        stopOnPolicyViolation: body.stopOnPolicyViolation,
      };
    }
  }

  let approval: AutopilotContractApproval | undefined;
  if (value.status === "approved") {
    if (!isRecord(value.approval)) {
      errors.push("approval:required_for_approved_contract");
    } else {
      for (const key of Object.keys(value.approval)) {
        if (!allowedApprovalKeys.has(key)) errors.push(`approval.${key}:unknown_key`);
      }
      if (typeof value.approval.approvedAt !== "string" || value.approval.approvedAt.trim() === "") errors.push("approval.approvedAt:expected_non_empty_string");
      if (typeof value.approval.approvedBy !== "string" || value.approval.approvedBy.trim() === "") errors.push("approval.approvedBy:expected_non_empty_string");
      if (typeof value.approval.subjectHash !== "string" || !value.approval.subjectHash.startsWith("sha256:")) errors.push("approval.subjectHash:expected_sha256");
      if (typeof value.approval.approvalRecordPath !== "string" || value.approval.approvalRecordPath.trim() === "") errors.push("approval.approvalRecordPath:expected_non_empty_string");
      if (typeof value.approval.approvedAt === "string"
        && typeof value.approval.approvedBy === "string"
        && typeof value.approval.subjectHash === "string"
        && typeof value.approval.approvalRecordPath === "string"
      ) {
        approval = {
          approvedAt: value.approval.approvedAt,
          approvedBy: value.approval.approvedBy,
          subjectHash: value.approval.subjectHash,
          approvalRecordPath: normalizeGlobPath(value.approval.approvalRecordPath),
        };
      }
    }
  } else if (value.approval !== undefined) {
    errors.push("approval:not_allowed_for_draft_contract");
  }

  const canonicalSubjectHash = autopilotBody ? sha256CanonicalJson(subjectPayload({
    autonomyPreset: value.autonomyPreset as AutonomyPresetName,
    autopilot: autopilotBody,
  })) : null;
  let subjectHashMatches: boolean | null = null;
  if (value.status === "approved" && approval && canonicalSubjectHash) {
    subjectHashMatches = approval.subjectHash === canonicalSubjectHash;
    if (!subjectHashMatches) errors.push("approval.subjectHash:mismatch");
  }

  const contract = errors.length === 0 && autopilotBody
    ? {
      schemaVersion: 1 as const,
      stability: "experimental" as const,
      type: "codexus.autopilot.contract" as const,
      status: value.status as "draft" | "approved",
      autonomyPreset: value.autonomyPreset,
      sourceDocs,
      autopilot: autopilotBody,
      ...(approval ? { approval } : {}),
    }
    : null;

  return {
    schemaVersion: 1,
    valid: errors.length === 0,
    errors,
    contract,
    canonicalSubjectHash,
    subjectHashMatches,
  };
}

async function readContractFile(file: string): Promise<unknown> {
  return JSON.parse(await readFile(file, "utf8")) as unknown;
}

function sourceDocExists(cwd: string, docs: AutopilotSourceDoc[]): Array<AutopilotSourceDoc & { exists: boolean }> {
  return docs.map((doc) => ({ ...doc, exists: existsSync(resolve(cwd, doc.path)) }));
}

export async function buildAutopilotPlan(cwd: string, from: string[], preset: AutonomyPresetName = DEFAULT_AUTONOMY_PRESET): Promise<AutopilotPlanResult> {
  if (from.length === 0) throw new Error("missing_autopilot_from");
  if (!isAutonomyPresetName(preset)) throw new Error(`invalid_autopilot_preset:${String(preset)}`);
  const resolvedCwd = resolve(cwd);
  const sourceDocs: AutopilotSourceDoc[] = [];
  const texts: string[] = [];
  for (const source of from) {
    const absolute = resolve(resolvedCwd, source);
    if (!existsSync(absolute)) throw new Error(`autopilot_source_doc_missing:${source}`);
    const rel = relativeWorkspacePath(resolvedCwd, absolute);
    const bytes = await readFile(absolute);
    sourceDocs.push({ path: rel, sha256: sha256Bytes(bytes) });
    texts.push(bytes.toString("utf8"));
  }
  const acceptanceCriteria = [...new Set(texts.flatMap((text) => extractAcceptanceCriteria(text)))];
  const scopeAllow = inferScopeAllow(sourceDocs.map((doc) => doc.path), texts);
  const verification = inferVerificationCommands(resolvedCwd);
  const contract: AutopilotContract = {
    schemaVersion: 1,
    stability: "experimental",
    type: "codexus.autopilot.contract",
    status: "draft",
    autonomyPreset: preset,
    sourceDocs,
    autopilot: {
      scope: {
        allow: scopeAllow,
        forbiddenChanges: defaultForbiddenChanges(),
      },
      acceptanceCriteria,
      verificationRequired: verification.verificationRequired,
      commandAllowlist: verification.commandAllowlist,
      networkPolicy: {
        mode: "none",
        requiresDriverEnforcement: true,
      },
      maxRuntimeMs: 3600000,
      maxRepairIterations: 3,
      maxChangedFiles: 40,
      maxDiffLines: 2000,
      approval: "enforced-never-with-isolation",
      stopOnPolicyViolation: true,
    },
  };
  const validation = validateAutopilotContract(contract);
  if (!validation.valid) throw new Error(`autopilot_contract_invalid:${validation.errors.join(",")}`);
  const artifactPath = join(autopilotRoot(resolvedCwd), "drafts", `${nowId("autopilot-plan")}.json`);
  await ensureDir(dirname(artifactPath));
  await writeJsonAtomic(artifactPath, contract);
  return {
    schemaVersion: 1,
    stability: "experimental",
    command: "autopilot plan",
    artifactPath,
    contract,
    draftRequiresApproval: true,
    derivableFacts: [
      {
        kind: "source_doc_linked",
        gate: false,
        evidence: sourceDocs.map((doc) => doc.path).join(", "),
        files: sourceDocs.map((doc) => doc.path),
      },
      {
        kind: "autonomy_preset_declared",
        gate: false,
        evidence: preset,
      },
      ...(acceptanceCriteria.length > 0
        ? [{
          kind: "acceptance_criteria_extracted" as const,
          gate: false as const,
          evidence: `${acceptanceCriteria.length} acceptance criteria extracted from source docs`,
        }]
        : []),
      ...(verification.commandAllowlist.length > 0
        ? [{
          kind: "verification_command_declared" as const,
          gate: false as const,
          evidence: `${verification.commandAllowlist.length} package-script commands inferred`,
          commands: verification.commandAllowlist,
        }]
        : []),
    ],
    heuristicClaims: [
      {
        kind: "draft_requires_human_approval",
        confidence: "high",
        evidence: "autopilot plan emits a draft contract, not an approved execution authority",
        recommendation: "Review the scope, verification commands, and forbidden changes before approval.",
      },
      {
        kind: "scope_inferred_from_source_docs",
        confidence: "medium",
        evidence: `scope inferred from source docs and explicit path mentions: ${scopeAllow.join(", ")}`,
        recommendation: "Tighten or broaden scope.allow before approval if the inferred scope is not accurate.",
      },
      ...(acceptanceCriteria.length === 0
        ? [{
          kind: "acceptance_criteria_extraction_deferred" as const,
          confidence: "medium" as const,
          evidence: "no Acceptance Criteria section bullets were extracted from the source docs",
          recommendation: "Add acceptance criteria manually before approval.",
        }]
        : []),
      ...(verification.heuristic ? [verification.heuristic] : []),
    ],
  };
}

export async function approveAutopilotContract(cwd: string, file: string, approvedBy: string, output?: string): Promise<AutopilotApproveResult> {
  if (!approvedBy.trim()) throw new Error("missing_autopilot_approved_by");
  const resolvedCwd = resolve(cwd);
  const inputPath = resolve(resolvedCwd, file);
  const parsed = await readContractFile(inputPath);
  const validation = validateAutopilotContract(parsed);
  if (!validation.valid || !validation.contract) throw new Error(`autopilot_contract_invalid:${validation.errors.join(",")}`);
  if (validation.contract.status !== "draft") throw new Error(`autopilot_contract_not_draft:${inputPath}`);
  const approvedAt = new Date().toISOString();
  const subjectHash = sha256CanonicalJson(subjectPayload(validation.contract));
  const approvalRecordPath = join(autopilotRoot(resolvedCwd), "approvals", `${nowId("autopilot-approval")}.json`);
  const artifactPath = resolve(resolvedCwd, output ?? file);
  const approvedContract: AutopilotContract = {
    ...validation.contract,
    status: "approved",
    approval: {
      approvedAt,
      approvedBy: approvedBy.trim(),
      subjectHash,
      approvalRecordPath: normalizeGlobPath(relative(resolvedCwd, approvalRecordPath)),
    },
  };
  const approvedValidation = validateAutopilotContract(approvedContract);
  if (!approvedValidation.valid || !approvedValidation.contract) throw new Error(`autopilot_contract_invalid:${approvedValidation.errors.join(",")}`);
  const approvalRecord: AutopilotApprovalRecord = {
    schemaVersion: 1,
    stability: "experimental",
    type: "codexus.autopilot.approval-record",
    approvedAt,
    approvedBy: approvedBy.trim(),
    subjectHash,
    contractPath: normalizeGlobPath(relative(resolvedCwd, artifactPath)),
    sourceDocs: approvedValidation.contract.sourceDocs,
  };
  await ensureDir(dirname(approvalRecordPath));
  await writeJsonAtomic(approvalRecordPath, approvalRecord);
  await writeJsonAtomic(artifactPath, approvedContract);
  return {
    schemaVersion: 1,
    stability: "experimental",
    command: "autopilot contract approve",
    artifactPath,
    approvalRecordPath,
    contract: approvedValidation.contract,
    validation: approvedValidation,
  };
}

export async function validateAutopilotContractFile(cwd: string, file: string): Promise<AutopilotContractValidateResult> {
  const resolvedCwd = resolve(cwd);
  const path = resolve(resolvedCwd, file);
  const value = await readContractFile(path);
  const validation = validateAutopilotContract(value);
  const { validateSchemaArtifactValue } = await import("../validation/schemas.ts");
  const artifactValidation = await validateSchemaArtifactValue("autopilot-contract", value);
  const sourceDocs = sourceDocExists(resolvedCwd, validation.contract?.sourceDocs ?? []);
  const approvalRecordExists = validation.contract?.approval
    ? existsSync(resolve(resolvedCwd, validation.contract.approval.approvalRecordPath))
    : null;
  return {
    schemaVersion: 1,
    stability: "experimental",
    command: "autopilot contract validate",
    file: path,
    ok: validation.valid && artifactValidation.valid && (validation.subjectHashMatches ?? true) && (approvalRecordExists ?? true),
    validation,
    artifactValidation,
    sourceDocs,
    approvalRecordExists,
  };
}

export async function scopeCheckAutopilotContract(
  cwd: string,
  file: string,
  options: { gate?: boolean; since?: string } = {},
): Promise<AutopilotScopeCheckResult> {
  const resolvedCwd = resolve(cwd);
  const validation = await validateAutopilotContractFile(resolvedCwd, file);
  const stateRead = await readSessionStateWithMigration(resolvedCwd);
  const state = stateRead.state ? await refreshSessionState(resolvedCwd, stateRead.state) : null;
  const changeReport = buildChangeEvidenceReport(resolvedCwd, state, {
    since: options.since,
    scope: validation.validation.contract?.autopilot.scope.allow.join(","),
    gate: false,
  });
  const forbiddenPatterns = validation.validation.contract?.autopilot.scope.forbiddenChanges ?? [];
  const forbiddenFiles = changeReport.diff.files.filter((path) => forbiddenPatterns.some((pattern) => matchesPattern(path, pattern)));
  const evidenceGaps: AutopilotScopeEvidenceGap[] = [...changeReport.evidenceGaps];
  if (forbiddenFiles.length > 0) {
    evidenceGaps.push({
      kind: "forbidden_change_touched",
      gate: true,
      verification: "unknown",
      evidence: forbiddenPatterns.join(","),
      recommendation: "Remove forbidden file changes or revise the contract before approval.",
      files: forbiddenFiles,
    });
  }
  const blockingUnknowns: AutopilotBlockingUnknown[] = [];
  if (!validation.validation.valid || !validation.artifactValidation.valid) {
    blockingUnknowns.push({
      kind: "contract_invalid",
      gate: true,
      evidence: validation.file,
      recommendation: "Fix the autopilot contract before using scope-check as a gate.",
    });
  }
  if (validation.approvalRecordExists === false) {
    blockingUnknowns.push({
      kind: "approval_record_missing",
      gate: true,
      evidence: validation.validation.contract?.approval?.approvalRecordPath ?? null,
      recommendation: "Regenerate the approval record or re-approve the contract before relying on it.",
    });
  }
  const gate = !options.gate
    ? {
      enabled: false as const,
      status: "not_requested" as const,
      exitCode: 0 as const,
      reason: "pass --gate to make autopilot scope evidence affect the process exit code",
    }
    : blockingUnknowns.length > 0
      ? {
        enabled: true as const,
        status: "blocked" as const,
        exitCode: 1 as const,
        reason: "autopilot contract evidence is incomplete or invalid",
      }
      : evidenceGaps.length > 0
        ? {
          enabled: true as const,
          status: "failed" as const,
          exitCode: 1 as const,
          reason: "the current diff escapes the contract scope or touches forbidden changes",
        }
        : changeReport.changeEvidence.status === "pass"
          ? {
            enabled: true as const,
            status: "passed" as const,
            exitCode: 0 as const,
            reason: "fresh passing evidence covers the current diff and it stays inside contract scope",
          }
          : {
            enabled: true as const,
            status: "blocked" as const,
            exitCode: 1 as const,
            reason: "scope is clean, but fresh verification evidence is not available",
          };
  return {
    schemaVersion: 1,
    stability: "experimental",
    command: "autopilot contract scope-check",
    file: validation.file,
    contractStatus: validation.validation.contract?.status ?? "invalid",
    validation: validation.validation,
    artifactValidation: validation.artifactValidation,
    sourceDocs: validation.sourceDocs,
    approvalRecordExists: validation.approvalRecordExists,
    diff: changeReport.diff,
    evidence: changeReport.evidence,
    evidenceGaps,
    derivableFacts: changeReport.derivableFacts,
    heuristicClaims: changeReport.heuristicClaims,
    changeEvidence: changeReport.changeEvidence,
    blockingUnknowns,
    gate,
    migration: stateRead.migration,
  };
}

export async function buildAutopilotRunGate(
  cwd: string,
  file: string,
  options: { gate?: boolean; since?: string } = {},
): Promise<AutopilotRunGateResult> {
  const scope = await scopeCheckAutopilotContract(cwd, file, {
    gate: options.gate,
    since: options.since,
  });
  const contract = scope.validation.contract;
  const actionAuthority: AutopilotRunGateResult["actionAuthority"] = {
    schemaVersion: 1,
    contractVersion: "autopilot-run-gate-v1",
    actionSurface: "autopilot.run",
    runSupported: false,
    sideEffects: {
      startsRun: false,
      mutatesWorkspace: false,
      requiresWorktreeIsolation: true,
      requiresExplicitApproval: true,
      requiresFreshVerification: true,
    },
    driverAuthority: "none",
    completionAuthority: false,
    cleanupAuthority: false,
    healthAuthority: false,
    caveat: "This command checks pre-run contract, approval, scope, and fresh-evidence readiness only. Live autopilot execution remains deferred and this command never starts a run.",
  };
  return {
    schemaVersion: 1,
    stability: "experimental",
    command: "autopilot run-gate",
    file: scope.file,
    runSupported: false,
    contractStatus: scope.contractStatus,
    validation: scope.validation,
    approvalRecordExists: scope.approvalRecordExists,
    scope: {
      allow: contract?.autopilot.scope.allow ?? [],
      forbiddenChanges: contract?.autopilot.scope.forbiddenChanges ?? [],
      diffStatus: scope.changeEvidence.status,
      freshEvidence: scope.changeEvidence.status === "pass",
    },
    readinessGate: scope.gate,
    executionGate: {
      enabled: true,
      status: "blocked",
      exitCode: 1,
      reason: "live autopilot run remains deferred until worktree-owned execution and capability start gates are implemented",
    },
    actionAuthority,
    evidenceGaps: scope.evidenceGaps,
    derivableFacts: [
      ...scope.derivableFacts,
      {
        kind: "autopilot_run_authority_deferred",
        gate: false,
        evidence: "runSupported=false; actionAuthority.sideEffects.startsRun=false",
      },
    ],
    heuristicClaims: scope.heuristicClaims,
    blockingUnknowns: scope.blockingUnknowns,
    gate: scope.gate,
  };
}
