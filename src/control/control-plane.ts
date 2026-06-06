import type { CodexusSessionState } from "../session/state.ts";
import { buildPolicyCatalogCheck, type PolicyCatalogCheckResult, type PolicyCatalogRuleStatus } from "./policy-catalog.ts";
import { summarizeDeferredSelfReports, type DeferredSelfReportControlSummary } from "./deferred-self-reports.ts";

export interface ControlPlanePolicyCatalogSummary {
  schemaVersion: 1;
  stability: "experimental";
  status: PolicyCatalogCheckResult["policyCatalog"]["status"];
  completionAuthority: false;
  counts: Record<PolicyCatalogRuleStatus, number>;
  observedRules: string[];
  advisoryRules: string[];
  unavailableRules: string[];
  caveat: string;
}

export interface ControlPlaneSummary {
  schemaVersion: 1;
  stability: "experimental";
  status: "clear" | "findings" | "unknown";
  completionAuthority: false;
  deferredSelfReports: DeferredSelfReportControlSummary;
  policyCatalog: ControlPlanePolicyCatalogSummary;
  counts: {
    deferredSelfReports: number;
    deferredEvidenceGaps: number;
    deferredBlockingUnknowns: number;
    policyObserved: number;
    policyAdvisory: number;
    policyUnavailable: number;
  };
  caveat: string;
}

function summarizePolicyCatalog(report: PolicyCatalogCheckResult): ControlPlanePolicyCatalogSummary {
  return {
    schemaVersion: 1,
    stability: "experimental",
    status: report.policyCatalog.status,
    completionAuthority: false,
    counts: report.policyCatalog.counts,
    observedRules: report.rules.filter((rule) => rule.status === "observed").map((rule) => rule.ruleId).sort(),
    advisoryRules: report.rules.filter((rule) => rule.status === "advisory").map((rule) => rule.ruleId).sort(),
    unavailableRules: report.rules.filter((rule) => rule.status === "unavailable").map((rule) => rule.ruleId).sort(),
    caveat: "Policy catalog aggregation reports observed/advisory/unavailable control signals; it does not enforce policy or prove active driver preflight.",
  };
}

export function buildControlPlaneSummary(cwd: string, state: CodexusSessionState | null): ControlPlaneSummary {
  const deferredSelfReports = summarizeDeferredSelfReports(cwd);
  const policyCatalog = summarizePolicyCatalog(buildPolicyCatalogCheck(cwd, state));
  const status = deferredSelfReports.status === "unknown"
    ? "unknown"
    : deferredSelfReports.status === "findings" || policyCatalog.status === "findings"
      ? "findings"
      : "clear";
  return {
    schemaVersion: 1,
    stability: "experimental",
    status,
    completionAuthority: false,
    deferredSelfReports,
    policyCatalog,
    counts: {
      deferredSelfReports: deferredSelfReports.counts.source,
      deferredEvidenceGaps: deferredSelfReports.evidenceGaps.length,
      deferredBlockingUnknowns: deferredSelfReports.blockingUnknowns.length,
      policyObserved: policyCatalog.counts.observed,
      policyAdvisory: policyCatalog.counts.advisory,
      policyUnavailable: policyCatalog.counts.unavailable,
    },
    caveat: "Control-plane aggregation is a read-only dashboard over evidence/control metadata; completion authority remains with verification and explicit gates.",
  };
}
