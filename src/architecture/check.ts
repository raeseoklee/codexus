import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { matchesPattern } from "../util/glob.ts";
import { scanStaticImports, type StaticImportEdge } from "../util/static-import-scan.ts";
import { readArchitecturePolicy, type ArchitecturePolicyResolution } from "./policy.ts";

export type ArchitectureEvidenceStatus = "pass" | "fail" | "unknown";

export interface ArchitectureEvidenceGap {
  kind: "policy_invalid" | "forbidden_import";
  gate: true;
  evidence: string | null;
  policy: string;
  recommendation: string;
  files?: string[];
  imports?: string[];
}

export interface ArchitectureDerivableFact {
  kind:
    | "policy_declared"
    | "policy_missing_report_only"
    | "import_scan"
    | "forbidden_imports_absent";
  gate: boolean;
  evidence: string;
  ruleId?: string;
  files?: string[];
  imports?: string[];
  count?: number;
}

export interface ArchitectureHeuristicClaim {
  kind: "broad_layering_rule_deferred";
  confidence: "low" | "medium" | "high";
  evidence: string;
  recommendation: string;
}

export interface ArchitectureUnknown {
  kind:
    | "package_json_missing"
    | "package_json_unreadable"
    | "policy_invalid"
    | "unsupported_rule_kind"
    | "computed_dynamic_import";
  gate: boolean;
  evidence: string | null;
  recommendation: string;
  files?: string[];
}

export interface ArchitectureGate {
  enabled: boolean;
  status: "not_requested" | "passed" | "failed" | "blocked";
  exitCode: 0 | 1;
  reason: string;
}

export type ImportEdge = StaticImportEdge;

export interface ArchitectureEvidenceReport {
  schemaVersion: 1;
  stability: "experimental";
  cwd: string;
  packageRoot: string | null;
  packageJsonPath: string | null;
  scanMode: "static";
  scanAccuracy: "best_effort";
  policy: ArchitecturePolicyResolution;
  importGraph: {
    filesScanned: number;
    edges: ImportEdge[];
  };
  evidenceGaps: ArchitectureEvidenceGap[];
  derivableFacts: ArchitectureDerivableFact[];
  heuristicClaims: ArchitectureHeuristicClaim[];
  blockingUnknowns: ArchitectureUnknown[];
  informationalUnknowns: ArchitectureUnknown[];
  architecture: {
    status: ArchitectureEvidenceStatus;
    policyMode: "declared" | "report_only" | "invalid";
  };
  gate: ArchitectureGate;
}

export interface ArchitectureCheckOptions {
  gate?: boolean;
  policyPath?: string;
}

function findPackageRoot(cwd: string): string | null {
  let current = resolve(cwd);
  while (true) {
    if (existsSync(join(current, "package.json"))) return current;
    const next = dirname(current);
    if (next === current) return null;
    current = next;
  }
}

function architectureGateFor(status: ArchitectureEvidenceStatus, enabled: boolean, hasBlockingUnknowns: boolean): ArchitectureGate {
  if (!enabled) {
    return {
      enabled,
      status: "not_requested",
      exitCode: 0,
      reason: "pass --gate to make architecture.status affect the process exit code",
    };
  }
  if (hasBlockingUnknowns) {
    return {
      enabled,
      status: "blocked",
      exitCode: 1,
      reason: "blocking unknowns prevent a trustworthy architecture gate decision",
    };
  }
  if (status === "fail") {
    return {
      enabled,
      status: "failed",
      exitCode: 1,
      reason: "gateable architecture evidence gaps are present",
    };
  }
  return {
    enabled,
    status: "passed",
    exitCode: 0,
    reason: "no gateable architecture evidence gaps or blocking unknowns",
  };
}

export function buildArchitectureEvidenceReport(cwd: string, options: ArchitectureCheckOptions = {}): ArchitectureEvidenceReport {
  const packageRoot = findPackageRoot(cwd);
  const packageJsonPath = packageRoot ? join(packageRoot, "package.json") : null;
  if (!packageRoot) {
    const blockingUnknowns: ArchitectureUnknown[] = [{
      kind: "package_json_missing",
      gate: true,
      evidence: null,
      recommendation: "Run architecture check from a package workspace containing package.json.",
    }];
    const status: ArchitectureEvidenceStatus = "unknown";
    return {
      schemaVersion: 1,
      stability: "experimental",
      cwd,
      packageRoot: null,
      packageJsonPath: null,
      scanMode: "static",
      scanAccuracy: "best_effort",
      policy: {
        declared: false,
        source: null,
        path: null,
        validation: { schemaVersion: 1, valid: false, errors: ["package_json_missing"], policy: null },
      },
      importGraph: { filesScanned: 0, edges: [] },
      evidenceGaps: [],
      derivableFacts: [],
      heuristicClaims: [],
      blockingUnknowns,
      informationalUnknowns: [],
      architecture: { status, policyMode: "report_only" },
      gate: architectureGateFor(status, options.gate === true, true),
    };
  }

  const policy = readArchitecturePolicy(packageRoot, options.policyPath);
  const evidenceGaps: ArchitectureEvidenceGap[] = [];
  const derivableFacts: ArchitectureDerivableFact[] = [];
  const heuristicClaims: ArchitectureHeuristicClaim[] = [{
    kind: "broad_layering_rule_deferred",
    confidence: "high",
    evidence: "Architecture check currently gates only declared forbidden-import facts from the static import scan.",
    recommendation: "Keep broad layering, type-aware graph claims, and design-quality judgments advisory until a separate stable contract is implemented.",
  }];
  const blockingUnknowns: ArchitectureUnknown[] = [];
  const effectivePolicy = policy.validation.valid ? policy.validation.policy : null;
  const scanScopes = effectivePolicy && effectivePolicy.rules.length > 0
    ? [...new Set(effectivePolicy.rules.flatMap((rule) => rule.from))].sort()
    : null;
  const scan = scanStaticImports(packageRoot, scanScopes);
  const informationalUnknowns: ArchitectureUnknown[] = scan.computedDynamicImports.map((item) => ({
    kind: "computed_dynamic_import",
    gate: false,
    evidence: `${item.file}:${item.line}`,
    recommendation: "Review computed dynamic import manually; static best-effort scan cannot derive its module specifier.",
    files: [item.file],
  }));

  if (policy.validation.errors.some((error) => error.startsWith("package_json_unreadable:"))) {
    blockingUnknowns.push({
      kind: "package_json_unreadable",
      gate: true,
      evidence: policy.path,
      recommendation: "Fix package.json so architecture policy can be read.",
    });
  }

  if (policy.declared) {
    derivableFacts.push({
      kind: "policy_declared",
      gate: false,
      evidence: policy.path ?? policy.source ?? "architecture policy declared",
    });
  } else {
    derivableFacts.push({
      kind: "policy_missing_report_only",
      gate: false,
      evidence: "no codexus.architecture policy declared; report-only mode",
    });
  }

  if (policy.declared && !policy.validation.valid) {
    blockingUnknowns.push({
      kind: "policy_invalid",
      gate: true,
      evidence: policy.path,
      recommendation: `Fix codexus.architecture policy: ${policy.validation.errors.join(", ")}`,
    });
    evidenceGaps.push({
      kind: "policy_invalid",
      gate: true,
      evidence: policy.path,
      policy: "codexus.architecture must validate before facts can be promoted to gateable findings",
      recommendation: "Fix the architecture policy shape or remove it to return to report-only mode.",
    });
  }

  derivableFacts.push({
    kind: "import_scan",
    gate: false,
    evidence: `static best-effort import scan read ${scan.filesScanned} source files and found ${scan.edges.length} import edges`,
    count: scan.edges.length,
  });

  for (const rule of effectivePolicy?.rules ?? []) {
    if (rule.kind !== "forbidden-import") {
      blockingUnknowns.push({
        kind: "unsupported_rule_kind",
        gate: true,
        evidence: rule.id,
        recommendation: `Remove unsupported architecture rule kind from ${rule.id}.`,
      });
      continue;
    }
    const matches: ImportEdge[] = [];
    for (const edge of scan.edges) {
      const fileInScope = rule.from.some((pattern) => matchesPattern(edge.file, pattern));
      if (!fileInScope) continue;
      const allowed = (rule.allow ?? []).some((pattern) => matchesPattern(edge.specifier, pattern, { stripLeadingDotSlash: false }));
      if (allowed) continue;
      const forbidden = rule.forbidden.some((pattern) => matchesPattern(edge.specifier, pattern, { stripLeadingDotSlash: false }));
      if (forbidden) matches.push(edge);
    }
    if (matches.length > 0) {
      evidenceGaps.push({
        kind: "forbidden_import",
        gate: true,
        evidence: rule.id,
        policy: rule.id,
        recommendation: "Remove the forbidden import or update the declared architecture policy intentionally.",
        files: [...new Set(matches.map((edge) => edge.file))].sort(),
        imports: [...new Set(matches.map((edge) => edge.specifier))].sort(),
      });
    } else {
      derivableFacts.push({
        kind: "forbidden_imports_absent",
        gate: true,
        evidence: `rule ${rule.id} matched no forbidden import edges`,
        ruleId: rule.id,
      });
    }
  }

  const status: ArchitectureEvidenceStatus = evidenceGaps.length > 0
    ? "fail"
    : blockingUnknowns.length > 0
      ? "unknown"
      : "pass";

  return {
    schemaVersion: 1,
    stability: "experimental",
    cwd,
    packageRoot,
    packageJsonPath,
    scanMode: "static",
    scanAccuracy: "best_effort",
    policy,
    importGraph: {
      filesScanned: scan.filesScanned,
      edges: scan.edges,
    },
    evidenceGaps,
    derivableFacts,
    heuristicClaims,
    blockingUnknowns,
    informationalUnknowns,
    architecture: {
      status,
      policyMode: policy.declared ? policy.validation.valid ? "declared" : "invalid" : "report_only",
    },
    gate: architectureGateFor(status, options.gate === true, blockingUnknowns.length > 0),
  };
}
