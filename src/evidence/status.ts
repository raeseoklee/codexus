import { summarizeAppInstanceEvidence } from "../app-instance/launcher.ts";
import { buildLspStatusReport } from "../lsp/project.ts";
import { checkWiki } from "../wiki/wiki.ts";

export async function buildEvidenceStatus(cwd: string) {
  const [appInstances, wiki, lsp] = await Promise.all([
    summarizeAppInstanceEvidence(cwd),
    checkWiki(cwd, false),
    Promise.resolve(buildLspStatusReport(cwd)),
  ]);

  const evidenceGaps = [
    ...wiki.evidenceGaps.map((gap) => ({
      ...gap,
      source: "wiki",
      gate: false,
    })),
  ];

  const status = evidenceGaps.length > 0
    ? "findings" as const
    : appInstances.status === "observed" || wiki.wiki.status === "pass" || lsp.lsp.status !== "unavailable"
      ? "observed" as const
      : "empty" as const;

  return {
    schemaVersion: 1,
    stability: "experimental" as const,
    command: "evidence status" as const,
    cwd,
    status,
    surfaces: {
      appInstances: {
        status: appInstances.status,
        instances: appInstances.instances,
        observations: {
          total: appInstances.observations.total,
          observed: appInstances.observations.observed,
          failed: appInstances.observations.failed,
          unavailable: appInstances.observations.unavailable,
          latest: appInstances.observations.latest,
        },
        authority: appInstances.authority,
      },
      wiki: {
        status: wiki.wiki.status,
        pageCount: wiki.wiki.pageCount,
        freshCount: wiki.wiki.freshCount,
        staleCount: wiki.wiki.staleCount,
        evidenceGapCount: wiki.evidenceGaps.length,
        projectionAuthority: false as const,
        sourceTruth: false as const,
        completionAuthority: false as const,
      },
      lsp: {
        status: lsp.lsp.status,
        providerCount: lsp.lsp.providerCount,
        executableProviderCount: lsp.lsp.executableProviderCount,
        startsLanguageServer: lsp.autoApply.startsLanguageServer,
        completionAuthority: false as const,
      },
    },
    evidenceGaps,
    heuristicClaims: [
      {
        kind: "evidence_dashboard_is_projection",
        confidence: "high" as const,
        evidence: "Evidence status aggregates existing evidence surfaces; it does not make semantic quality or completion claims.",
        recommendation: "Use the underlying gate commands for release, wiki, LSP, or app-instance decisions.",
      },
    ],
    authority: {
      controlsInstance: false as const,
      healthAuthority: false as const,
      cleanupAuthority: false as const,
      sourceTruthAuthority: false as const,
      completionAuthority: false as const,
    },
  };
}
