import { resolve } from "node:path";
import { buildChangeEvidenceReport, type ChangeEvidenceReport, type RiskFact } from "../session/change-evidence.ts";
import type { CodexusSessionState } from "../session/state.ts";

export type PolicyCatalogRuleStatus = "clear" | "observed" | "advisory" | "unavailable";

export interface PolicyCatalogRuleResult {
  ruleId: string;
  category: "blast-radius" | "dependency-change" | "schema-change" | "migration-change" | "scope-boundary" | "driver-capability";
  severity: "low" | "medium" | "high";
  status: PolicyCatalogRuleStatus;
  capabilityRequirement: string | null;
  defaultAction: string;
  evidence: string;
  files?: string[];
}

export interface PolicyCatalogCheckResult {
  schemaVersion: 1;
  stability: "experimental";
  command: "policy catalog check";
  cwd: string;
  scope: string | null;
  changeEvidence: ChangeEvidenceReport["changeEvidence"];
  riskFacts: RiskFact[];
  rules: PolicyCatalogRuleResult[];
  policyCatalog: {
    status: "clear" | "findings";
    counts: Record<PolicyCatalogRuleStatus, number>;
  };
}

function hasRisk(kind: RiskFact["kind"], facts: RiskFact[]): RiskFact | undefined {
  return facts.find((fact) => fact.kind === kind);
}

function observedOrClear(
  ruleId: string,
  category: PolicyCatalogRuleResult["category"],
  severity: PolicyCatalogRuleResult["severity"],
  defaultAction: string,
  evidence: string,
  fact: RiskFact | undefined,
): PolicyCatalogRuleResult {
  return {
    ruleId,
    category,
    severity,
    status: fact ? "observed" : "clear",
    capabilityRequirement: null,
    defaultAction,
    evidence,
    ...(fact?.files ? { files: fact.files } : {}),
  };
}

export function buildPolicyCatalogCheck(
  cwd: string,
  state: CodexusSessionState | null,
  options: { since?: string; scope?: string } = {},
): PolicyCatalogCheckResult {
  const resolvedCwd = resolve(cwd);
  const report = buildChangeEvidenceReport(resolvedCwd, state, {
    since: options.since,
    scope: options.scope,
    includeHeuristics: true,
  });
  const riskFacts = report.riskFacts;
  const rules: PolicyCatalogRuleResult[] = [
    observedOrClear(
      "blast-radius.changed-files",
      "blast-radius",
      "medium",
      "review-or-boundary-stop",
      hasRisk("changed_file_count", riskFacts)
        ? `${hasRisk("changed_file_count", riskFacts)!.fileCount ?? 0} files changed`
        : "no changed files detected",
      hasRisk("changed_file_count", riskFacts),
    ),
    observedOrClear(
      "blast-radius.diff-lines",
      "blast-radius",
      "medium",
      "review-or-boundary-stop",
      hasRisk("diff_line_volume", riskFacts)
        ? `${(hasRisk("diff_line_volume", riskFacts)!.addedLines ?? 0) + (hasRisk("diff_line_volume", riskFacts)!.deletedLines ?? 0)} diff lines changed`
        : "no diff line volume detected",
      hasRisk("diff_line_volume", riskFacts),
    ),
    observedOrClear(
      "dependency.manifest-or-lockfile-touch",
      "dependency-change",
      "high",
      "review-dependency-change",
      hasRisk("dependency_or_lockfile_touched", riskFacts)
        ? "dependency manifest or lockfile changed"
        : "no dependency manifest or lockfile changes detected",
      hasRisk("dependency_or_lockfile_touched", riskFacts),
    ),
    observedOrClear(
      "schema.registry-touch",
      "schema-change",
      "medium",
      "review-schema-boundary",
      hasRisk("schema_file_touched", riskFacts)
        ? "schema files changed"
        : "no schema file changes detected",
      hasRisk("schema_file_touched", riskFacts),
    ),
    observedOrClear(
      "migration.touch",
      "migration-change",
      "high",
      "review-migration-boundary",
      hasRisk("migration_file_touched", riskFacts)
        ? "migration-like files changed"
        : "no migration-like files changed",
      hasRisk("migration_file_touched", riskFacts),
    ),
    options.scope
      ? observedOrClear(
        "scope.out-of-declared",
        "scope-boundary",
        "high",
        "boundary-stop-or-scope-update",
        hasRisk("out_of_scope_paths", riskFacts)
          ? "files outside the declared scope changed"
          : "all changed files stayed within the declared scope",
        hasRisk("out_of_scope_paths", riskFacts),
      )
      : {
        ruleId: "scope.out-of-declared",
        category: "scope-boundary",
        severity: "medium",
        status: "advisory",
        capabilityRequirement: null,
        defaultAction: "declare-a-scope-before-relying-on-surgicality",
        evidence: "no scope was declared for this policy catalog check",
      },
    {
      ruleId: "driver.command.preflight",
      category: "driver-capability",
      severity: "high",
      status: "unavailable",
      capabilityRequirement: "driver.command.preflight",
      defaultAction: "do-not-promote-to-live-blocking-without-driver-capability",
      evidence: "policy catalog check is a local repository scan and cannot prove active driver preflight enforcement",
    },
  ];

  const counts: Record<PolicyCatalogRuleStatus, number> = {
    clear: 0,
    observed: 0,
    advisory: 0,
    unavailable: 0,
  };
  for (const rule of rules) counts[rule.status] += 1;

  return {
    schemaVersion: 1,
    stability: "experimental",
    command: "policy catalog check",
    cwd: resolvedCwd,
    scope: options.scope ?? null,
    changeEvidence: report.changeEvidence,
    riskFacts,
    rules,
    policyCatalog: {
      status: counts.observed > 0 || counts.advisory > 0 || counts.unavailable > 0 ? "findings" : "clear",
      counts,
    },
  };
}

