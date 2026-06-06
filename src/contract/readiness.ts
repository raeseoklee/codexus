import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export type ContractPromotionStatus = "ready" | "not_ready" | "unknown";
export type ContractPromotionDisposition = "promote_candidate" | "candidate_after_hardening" | "defer";
export type ContractCurrentStability = "stable" | "experimental" | "deferred" | "unknown";

export interface ContractReadinessEvidenceGap {
  kind:
    | "package_json_missing"
    | "json_contract_missing"
    | "json_contract_promotion_rule_missing"
    | "stable_promotion_missing"
    | "candidate_frozen_fields_missing";
  gate: true;
  evidence: string | null;
  policy: string;
  recommendation: string;
  surfaces?: string[];
  files?: string[];
}

export interface ContractReadinessDerivableFact {
  kind:
    | "json_contract_promotion_rule_present"
    | "surface_current_stability"
    | "promotion_candidate_identified"
    | "surface_deferred_from_promotion";
  gate: boolean;
  evidence: string;
  surface?: string;
  command?: string;
  currentStability?: ContractCurrentStability;
  files?: string[];
}

export interface ContractReadinessHeuristicClaim {
  kind: "promotion_candidate_prioritization";
  confidence: "low" | "medium" | "high";
  evidence: string;
  recommendation: string;
  surfaces: string[];
}

export interface ContractReadinessUnknown {
  kind: "candidate_source_unreadable" | "implementation_status_unreadable";
  gate: boolean;
  evidence: string | null;
  recommendation: string;
  surface?: string;
  files?: string[];
}

export interface ContractPromotionCandidate {
  surface: string;
  command: string;
  currentStability: ContractCurrentStability;
  disposition: ContractPromotionDisposition;
  contractRisk: "low" | "medium" | "high";
  sideEffectRisk: "low" | "medium" | "high";
  sourceFile: string;
  frozenFieldsDocumented: boolean;
  promotionStatus: "not_promoted" | "promoted" | "deferred" | "unknown";
  reasons: string[];
  requiredEvidence: string[];
  blockers: string[];
}

export interface ContractPromotionGate {
  enabled: boolean;
  status: "not_requested" | "passed" | "failed" | "blocked";
  exitCode: 0 | 1;
  reason: string;
}

export interface ContractReadinessReport {
  schemaVersion: 1;
  stability: "experimental";
  command: "contract check";
  cwd: string;
  packageRoot: string | null;
  targetVersion: "0.2.0";
  policy: {
    source: "docs/json-contract.md";
    rule: "0.2.0 requires a stable promotion or a documented breaking change to frozen stable fields";
    stablePromotionRequired: true;
  };
  contractReadiness: {
    status: ContractPromotionStatus;
    promotedSurfaceCount: number;
    candidateCount: number;
    deferredSurfaceCount: number;
  };
  candidates: ContractPromotionCandidate[];
  deferredSurfaces: ContractPromotionCandidate[];
  evidenceGaps: ContractReadinessEvidenceGap[];
  derivableFacts: ContractReadinessDerivableFact[];
  heuristicClaims: ContractReadinessHeuristicClaim[];
  blockingUnknowns: ContractReadinessUnknown[];
  informationalUnknowns: ContractReadinessUnknown[];
  gate: ContractPromotionGate;
}

export interface ContractReadinessOptions {
  gate?: boolean;
  targetVersion?: string;
}

interface CandidateDefinition {
  surface: string;
  command: string;
  sourceFile: string;
  disposition: ContractPromotionDisposition;
  contractRisk: "low" | "medium" | "high";
  sideEffectRisk: "low" | "medium" | "high";
  reasons: string[];
  requiredEvidence: string[];
}

const candidateDefinitions: CandidateDefinition[] = [
  {
    surface: "repo-knowledge-check",
    command: "repo check --gate",
    sourceFile: "src/repo-knowledge/check.ts",
    disposition: "promote_candidate",
    contractRisk: "low",
    sideEffectRisk: "low",
    reasons: [
      "Already dogfooded as a release-time documentation/index invariant.",
      "Uses local static evidence and does not execute external tools.",
    ],
    requiredEvidence: [
      "Freeze top-level JSON fields in docs/json-contract.md.",
      "Keep package-smoke or release-check evidence for installed CLI execution.",
      "Prove semantic freshness remains advisory rather than gateable.",
    ],
  },
  {
    surface: "release-integrity-check",
    command: "release check --gate",
    sourceFile: "src/release/integrity.ts",
    disposition: "promote_candidate",
    contractRisk: "medium",
    sideEffectRisk: "low",
    reasons: [
      "Already protects the publish path with trusted publishing and installer evidence.",
      "Local mode is deterministic; live mode must stay explicitly requested.",
    ],
    requiredEvidence: [
      "Freeze local-mode JSON fields separately from live-mode registry fields.",
      "Keep live checks opt-in and never required for offline release readiness.",
      "Add installed-package smoke for release check local mode.",
    ],
  },
  {
    surface: "lsp-diagnostics-check",
    command: "lsp check --gate",
    sourceFile: "src/lsp/project.ts",
    disposition: "promote_candidate",
    contractRisk: "medium",
    sideEffectRisk: "medium",
    reasons: [
      "Runs only explicit local diagnostics and does not start a protocol server.",
      "Unavailable, passed, failed, timeout, and output-bound branches are covered as stable output.",
    ],
    requiredEvidence: [
      "Keep unavailable/passed/failed JSON branches frozen in docs/json-contract.md.",
      "Keep timeout and output-bound behavior visible as stable fields.",
      "Keep protocol-server lifecycle and automatic LSP application explicitly deferred.",
    ],
  },
  {
    surface: "architecture-check",
    command: "architecture check --gate",
    sourceFile: "src/architecture/check.ts",
    disposition: "candidate_after_hardening",
    contractRisk: "medium",
    sideEffectRisk: "low",
    reasons: [
      "Forbidden-import facts are derivable and already share the static import scanner.",
      "Broad layering analysis remains deferred and must not be promoted with the first stable slice.",
    ],
    requiredEvidence: [
      "Freeze only the declared-policy forbidden-import subset.",
      "Keep scanAccuracy and computed dynamic import caveats visible.",
      "Document broad_layering_rule_deferred as outside the stable promotion.",
    ],
  },
];

const deferredDefinitions: CandidateDefinition[] = [
  {
    surface: "app-instance-launcher",
    command: "app instance start|stop",
    sourceFile: "src/app-instance/launcher.ts",
    disposition: "defer",
    contractRisk: "high",
    sideEffectRisk: "high",
    reasons: [
      "Live process lifecycle has real side effects.",
      "Ownership, health, cleanup, and worktree reuse evidence need more production history before stable promotion.",
    ],
    requiredEvidence: [
      "Longer dogfood evidence for owner identity, heartbeat, orphan handling, and stop safety.",
      "Stable lifecycle policy fields and installed-package smoke for start/stop failure modes.",
    ],
  },
  {
    surface: "autopilot-live-run",
    command: "autopilot run",
    sourceFile: "src/autopilot/contract.ts",
    disposition: "defer",
    contractRisk: "high",
    sideEffectRisk: "high",
    reasons: [
      "Live run is still explicitly deferred behind capability and policy start gates.",
    ],
    requiredEvidence: [
      "Worktree-owned execution, capability start-gate, and approval evidence.",
    ],
  },
  {
    surface: "active-relay-adapters",
    command: "autopilot relay active execution",
    sourceFile: "src/relay/artifacts.ts",
    disposition: "defer",
    contractRisk: "high",
    sideEffectRisk: "medium",
    reasons: [
      "Recorder/checker exists, but Codexus still does not spawn external review engines.",
    ],
    requiredEvidence: [
      "Descriptor-backed adapter evidence and proof that convergence never replaces verification.",
    ],
  },
  {
    surface: "desktop-app-server-attachment",
    command: "app-server live attachment",
    sourceFile: "src/experiments/app-server-discovery.ts",
    disposition: "defer",
    contractRisk: "high",
    sideEffectRisk: "high",
    reasons: [
      "Current evidence remains stdio-only; existing Desktop stdio pipes are not attach targets.",
    ],
    requiredEvidence: [
      "Non-disruptive observer bridge or explicit supported socket evidence.",
    ],
  },
  {
    surface: "update-notifications",
    command: "update check",
    sourceFile: "src/update/check.ts",
    disposition: "defer",
    contractRisk: "medium",
    sideEffectRisk: "low",
    reasons: [
      "Update checks exist, but richer CLI/chat notification UX is still experimental and non-authoritative.",
    ],
    requiredEvidence: [
      "TTL cache, opt-out, CI-off behavior, and proof that update checks cannot fail primary commands.",
      "Observed notification UX that remains advisory and never mutates installation.",
    ],
  },
  {
    surface: "codex-plugin-packaging",
    command: "plugin packaging",
    sourceFile: "src/plugin/package.ts",
    disposition: "defer",
    contractRisk: "medium",
    sideEffectRisk: "medium",
    reasons: [
      "Plugin packaging and package diagnostics exist, but installed-plugin state and always-on supervision remain unproven.",
    ],
    requiredEvidence: [
      "Doctor-diagnosable install state and observed heartbeat evidence before any always-on claim.",
    ],
  },
];

function findPackageRoot(cwd: string): string | null {
  let current = resolve(cwd);
  while (true) {
    if (existsSync(join(current, "package.json"))) return current;
    const next = dirname(current);
    if (next === current) return null;
    current = next;
  }
}

function safeRead(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

function currentStabilityFromSource(packageRoot: string, sourceFile: string): ContractCurrentStability {
  const text = safeRead(join(packageRoot, sourceFile));
  if (text === null) return "unknown";
  if (/\bstability:\s*"stable"|\bstability:\s*'stable'|stability:\s*"stable"\s+as const/.test(text)) return "stable";
  if (/\bstability:\s*"experimental"|\bstability:\s*'experimental'|stability:\s*"experimental"\s+as const/.test(text)) return "experimental";
  if (/\bstability:\s*"deferred"|\bstability:\s*'deferred'|stability:\s*"deferred"\s+as const/.test(text)) return "deferred";
  return "unknown";
}

function frozenFieldsDocumented(contractText: string | null, command: string): boolean {
  if (!contractText) return false;
  const frozenSection = /## Frozen In 0\.1\.x(?<body>[\s\S]*?)\n## Not Frozen/.exec(contractText)?.groups?.body;
  const searchable = frozenSection ?? contractText;
  const firstWord = command.split(/\s+/)[0];
  return searchable.includes(command) || searchable.includes(`${firstWord} output`) || searchable.includes(`${firstWord} check`);
}

function toCandidate(definition: CandidateDefinition, packageRoot: string, contractText: string | null): ContractPromotionCandidate {
  const currentStability = currentStabilityFromSource(packageRoot, definition.sourceFile);
  const documented = frozenFieldsDocumented(contractText, definition.command);
  const promotionStatus = definition.disposition === "defer"
    ? "deferred"
    : currentStability === "stable" && documented
      ? "promoted"
      : currentStability === "unknown"
        ? "unknown"
        : "not_promoted";
  const blockers: string[] = [];
  if (definition.disposition !== "defer") {
    if (currentStability !== "stable") blockers.push("current_output_not_stable");
    if (!documented) blockers.push("frozen_fields_not_documented");
  }
  if (definition.disposition === "defer") blockers.push("intentionally_deferred_from_0_2_promotion");
  return {
    ...definition,
    currentStability,
    frozenFieldsDocumented: documented,
    promotionStatus,
    blockers,
  };
}

function makeGate(
  requested: boolean,
  status: ContractPromotionStatus,
  evidenceGaps: ContractReadinessEvidenceGap[],
  blockingUnknowns: ContractReadinessUnknown[]
): ContractPromotionGate {
  if (!requested) {
    return {
      enabled: false,
      status: "not_requested",
      exitCode: 0,
      reason: `contract_readiness_${status}`,
    };
  }
  if (evidenceGaps.length > 0) {
    return {
      enabled: true,
      status: "failed",
      exitCode: 1,
      reason: `evidence_gaps:${evidenceGaps.length}`,
    };
  }
  if (blockingUnknowns.length > 0) {
    return {
      enabled: true,
      status: "blocked",
      exitCode: 1,
      reason: `blocking_unknowns:${blockingUnknowns.length}`,
    };
  }
  return {
    enabled: true,
    status: "passed",
    exitCode: 0,
    reason: `contract_readiness_${status}`,
  };
}

export function buildContractReadinessReport(cwd: string, options: ContractReadinessOptions = {}): ContractReadinessReport {
  if (options.targetVersion && options.targetVersion !== "0.2.0") {
    throw new Error(`unsupported_contract_target:${options.targetVersion}`);
  }
  const packageRoot = findPackageRoot(cwd);
  const evidenceGaps: ContractReadinessEvidenceGap[] = [];
  const derivableFacts: ContractReadinessDerivableFact[] = [];
  const blockingUnknowns: ContractReadinessUnknown[] = [];
  const informationalUnknowns: ContractReadinessUnknown[] = [];

  if (!packageRoot) {
    evidenceGaps.push({
      kind: "package_json_missing",
      gate: true,
      evidence: null,
      policy: "contract readiness must run from a package workspace",
      recommendation: "Run contract check from the Codexus package root or a child directory.",
    });
    return {
      schemaVersion: 1,
      stability: "experimental",
      command: "contract check",
      cwd: resolve(cwd),
      packageRoot: null,
      targetVersion: "0.2.0",
      policy: {
        source: "docs/json-contract.md",
        rule: "0.2.0 requires a stable promotion or a documented breaking change to frozen stable fields",
        stablePromotionRequired: true,
      },
      contractReadiness: { status: "unknown", promotedSurfaceCount: 0, candidateCount: 0, deferredSurfaceCount: 0 },
      candidates: [],
      deferredSurfaces: [],
      evidenceGaps,
      derivableFacts,
      heuristicClaims: [],
      blockingUnknowns,
      informationalUnknowns,
      gate: makeGate(options.gate === true, "unknown", evidenceGaps, blockingUnknowns),
    };
  }

  const contractPath = join(packageRoot, "docs", "json-contract.md");
  const contractText = safeRead(contractPath);
  if (!contractText) {
    evidenceGaps.push({
      kind: "json_contract_missing",
      gate: true,
      evidence: "docs/json-contract.md",
      policy: "0.2.0 promotion readiness requires the JSON contract document",
      recommendation: "Restore docs/json-contract.md before evaluating promotion readiness.",
      files: ["docs/json-contract.md"],
    });
  } else if (!/0\.2\.0[^.\n]+promotion point|promotion point[^.\n]+0\.2\.0/.test(contractText)) {
    evidenceGaps.push({
      kind: "json_contract_promotion_rule_missing",
      gate: true,
      evidence: "docs/json-contract.md",
      policy: "0.2.0 must be defined as a promotion or breaking-contract point",
      recommendation: "Document the 0.2.0 promotion rule in docs/json-contract.md.",
      files: ["docs/json-contract.md"],
    });
  } else {
    derivableFacts.push({
      kind: "json_contract_promotion_rule_present",
      gate: true,
      evidence: "docs/json-contract.md defines 0.2.0 as the promotion point for experimental evidence surfaces",
      files: ["docs/json-contract.md"],
    });
  }

  const candidates = candidateDefinitions.map((definition) => toCandidate(definition, packageRoot, contractText));
  const deferredSurfaces = deferredDefinitions.map((definition) => toCandidate(definition, packageRoot, contractText));

  for (const candidate of candidates) {
    derivableFacts.push({
      kind: "surface_current_stability",
      gate: true,
      evidence: `${candidate.sourceFile}: ${candidate.currentStability}`,
      surface: candidate.surface,
      command: candidate.command,
      currentStability: candidate.currentStability,
      files: [candidate.sourceFile],
    });
    derivableFacts.push({
      kind: "promotion_candidate_identified",
      gate: false,
      evidence: `${candidate.surface} is a ${candidate.disposition}`,
      surface: candidate.surface,
      command: candidate.command,
      files: [candidate.sourceFile],
    });
    if (candidate.currentStability === "unknown") {
      informationalUnknowns.push({
        kind: "candidate_source_unreadable",
        gate: false,
        evidence: candidate.sourceFile,
        recommendation: "Inspect the candidate source before promoting this surface.",
        surface: candidate.surface,
        files: [candidate.sourceFile],
      });
    }
  }

  for (const surface of deferredSurfaces) {
    derivableFacts.push({
      kind: "surface_deferred_from_promotion",
      gate: false,
      evidence: `${surface.surface}: ${surface.reasons[0]}`,
      surface: surface.surface,
      command: surface.command,
      currentStability: surface.currentStability,
      files: [surface.sourceFile],
    });
  }

  const promotedSurfaceCount = candidates.filter((candidate) => candidate.promotionStatus === "promoted").length;
  const candidatesMissingFrozenFields = candidates
    .filter((candidate) => candidate.currentStability === "stable" && !candidate.frozenFieldsDocumented)
    .map((candidate) => candidate.surface);
  if (candidatesMissingFrozenFields.length > 0) {
    evidenceGaps.push({
      kind: "candidate_frozen_fields_missing",
      gate: true,
      evidence: "docs/json-contract.md",
      policy: "stable-promoted surfaces must freeze named JSON fields",
      recommendation: "Add frozen field entries for promoted candidate surfaces.",
      surfaces: candidatesMissingFrozenFields,
      files: ["docs/json-contract.md"],
    });
  }
  if (promotedSurfaceCount === 0) {
    evidenceGaps.push({
      kind: "stable_promotion_missing",
      gate: true,
      evidence: "all audited promotion candidates still self-report non-stable output",
      policy: "0.2.0 should include at least one stable promotion or an explicit breaking contract change",
      recommendation: "Continue 0.1.x until at least one low-risk candidate is promoted and frozen in docs/json-contract.md.",
      surfaces: candidates.map((candidate) => candidate.surface),
    });
  }

  const status: ContractPromotionStatus = blockingUnknowns.length > 0
    ? "unknown"
    : evidenceGaps.length > 0
      ? "not_ready"
      : "ready";

  return {
    schemaVersion: 1,
    stability: "experimental",
    command: "contract check",
    cwd: resolve(cwd),
    packageRoot,
    targetVersion: "0.2.0",
    policy: {
      source: "docs/json-contract.md",
      rule: "0.2.0 requires a stable promotion or a documented breaking change to frozen stable fields",
      stablePromotionRequired: true,
    },
    contractReadiness: {
      status,
      promotedSurfaceCount,
      candidateCount: candidates.length,
      deferredSurfaceCount: deferredSurfaces.length,
    },
    candidates,
    deferredSurfaces,
    evidenceGaps,
    derivableFacts,
    heuristicClaims: [{
      kind: "promotion_candidate_prioritization",
      confidence: "medium",
      evidence: "Candidate ordering is based on current dogfood usage, side-effect risk, and local-only evidence boundaries.",
      recommendation: "Promote repo check or release check first; keep action surfaces experimental until longer owner/lifecycle evidence exists.",
      surfaces: candidates.map((candidate) => candidate.surface),
    }],
    blockingUnknowns,
    informationalUnknowns,
    gate: makeGate(options.gate === true, status, evidenceGaps, blockingUnknowns),
  };
}
