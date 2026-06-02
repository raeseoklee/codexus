import { buildRepoKnowledgeReport } from "../repo-knowledge/check.ts";

export interface DeferredSelfReportControlSummary {
  schemaVersion: 1;
  stability: "experimental";
  status: "clear" | "findings" | "unknown";
  completionAuthority: false;
  sourceClaims: string[];
  documentedClaims: string[];
  undocumentedClaims: string[];
  unbackedClaims: string[];
  counts: {
    source: number;
    documented: number;
    undocumented: number;
    unbacked: number;
    blockingUnknowns: number;
  };
  evidenceGaps: Array<{
    kind: string;
    claims: string[];
    evidence: string | null;
    recommendation: string;
  }>;
  blockingUnknowns: Array<{
    kind: string;
    evidence: string | null;
    recommendation: string;
  }>;
  caveat: string;
}

export function summarizeDeferredSelfReports(cwd: string): DeferredSelfReportControlSummary {
  const report = buildRepoKnowledgeReport(cwd);
  const undocumentedClaims = report.evidenceGaps
    .filter((gap) => gap.kind === "deferred_self_report_undocumented")
    .flatMap((gap) => gap.claims ?? []);
  const unbackedClaims = report.evidenceGaps
    .filter((gap) => gap.kind === "deferred_self_report_unbacked")
    .flatMap((gap) => gap.claims ?? []);
  const evidenceGaps = report.evidenceGaps
    .filter((gap) => gap.kind === "deferred_self_report_undocumented" || gap.kind === "deferred_self_report_unbacked")
    .map((gap) => ({
      kind: gap.kind,
      claims: gap.claims ?? [],
      evidence: gap.evidence,
      recommendation: gap.recommendation,
    }));
  const blockingUnknowns = report.blockingUnknowns.map((unknown) => ({
    kind: unknown.kind,
    evidence: unknown.evidence,
    recommendation: unknown.recommendation,
  }));
  const status = blockingUnknowns.length > 0
    ? "unknown"
    : evidenceGaps.length > 0
      ? "findings"
      : "clear";
  return {
    schemaVersion: 1,
    stability: "experimental",
    status,
    completionAuthority: false,
    sourceClaims: report.deferredSelfReports.sourceClaims,
    documentedClaims: report.deferredSelfReports.documentedClaims,
    undocumentedClaims: [...new Set(undocumentedClaims)].sort(),
    unbackedClaims: [...new Set(unbackedClaims)].sort(),
    counts: {
      source: report.deferredSelfReports.sourceClaims.length,
      documented: report.deferredSelfReports.documentedClaims.length,
      undocumented: new Set(undocumentedClaims).size,
      unbacked: new Set(unbackedClaims).size,
      blockingUnknowns: blockingUnknowns.length,
    },
    evidenceGaps,
    blockingUnknowns,
    caveat: "Deferred self-report aggregation only proves source/docs alignment for *_deferred claims; it does not implement the deferred capabilities.",
  };
}
