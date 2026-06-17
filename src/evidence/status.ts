import { lstat } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { summarizeAppInstanceEvidence } from "../app-instance/launcher.ts";
import { buildLspCheckReport, buildLspStatusReport } from "../lsp/project.ts";
import { buildReleaseIntegrityReport } from "../release/integrity.ts";
import { buildRepoKnowledgeReport } from "../repo-knowledge/check.ts";
import { ensureDir, writeTextAtomic } from "../util/fs.ts";
import { sha256CanonicalJson, sha256Text } from "../util/hash.ts";
import { checkWiki } from "../wiki/wiki.ts";

type EvidenceGateStatus = "not_requested" | "passed" | "failed" | "blocked";

function repoRelative(cwd: string, path: string): string {
  return relative(resolve(cwd), resolve(path)).replace(/\\/g, "/") || ".";
}

function normalizeRelative(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\/+/, "");
}

function isSafeRelativePath(path: string): boolean {
  const normalized = normalizeRelative(path);
  return normalized.length > 0
    && !path.startsWith("/")
    && !/^[a-z]:/i.test(path)
    && normalized !== ".."
    && !normalized.startsWith("../")
    && !normalized.includes("/../")
    && !normalized.includes("\0");
}

function resolveEvidenceExportTarget(cwd: string, target: string): { absolute: string; relative: string } {
  const trimmed = target.trim();
  if (!isSafeRelativePath(trimmed)) throw new Error("unsafe_evidence_export_target");
  const absolute = resolve(cwd, trimmed);
  const relativeTarget = repoRelative(cwd, absolute);
  if (!isSafeRelativePath(relativeTarget)) throw new Error("unsafe_evidence_export_target");
  if (relativeTarget === "." || relativeTarget === ".codexus" || relativeTarget.startsWith(".codexus/")) throw new Error("unsafe_evidence_export_target");
  if (relativeTarget === ".git" || relativeTarget.startsWith(".git/")) throw new Error("unsafe_evidence_export_target");
  if (relativeTarget === "node_modules" || relativeTarget.startsWith("node_modules/")) throw new Error("unsafe_evidence_export_target");
  return { absolute, relative: relativeTarget };
}

async function assertNoSymlinkComponents(cwd: string, relativeTarget: string): Promise<void> {
  let current = resolve(cwd);
  for (const part of relativeTarget.split("/")) {
    if (!part) continue;
    current = join(current, part);
    try {
      const stat = await lstat(current);
      if (stat.isSymbolicLink()) throw new Error("unsafe_evidence_export_target");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
  }
}

function prefixedList(items: Array<Record<string, unknown>>, source: string): Array<Record<string, unknown>> {
  return items.map((item) => ({ ...item, source }));
}

function surfaceGate(gate: { status: EvidenceGateStatus; exitCode: number; reason: string }) {
  return {
    status: gate.status,
    exitCode: gate.exitCode,
    reason: gate.reason,
  };
}

function gateFor(enabled: boolean, surfaces: Array<{ gate: { status: EvidenceGateStatus; exitCode: number; reason: string } }>) {
  if (!enabled) {
    return {
      enabled: false as const,
      status: "not_requested" as const,
      exitCode: 0 as const,
      reason: "pass --gate to make aggregated evidence gaps affect the process exit code",
    };
  }
  const failed = surfaces.filter((surface) => surface.gate.exitCode !== 0 || surface.gate.status === "failed" || surface.gate.status === "blocked");
  if (failed.length > 0) {
    const blocked = failed.some((surface) => surface.gate.status === "blocked");
    return {
      enabled: true as const,
      status: blocked ? "blocked" as const : "failed" as const,
      exitCode: 1 as const,
      reason: blocked ? `evidence_surface_blocked:${failed.length}` : `evidence_surface_gaps:${failed.length}`,
    };
  }
  return {
    enabled: true as const,
    status: "passed" as const,
    exitCode: 0 as const,
    reason: "all aggregated evidence gates passed",
  };
}

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

export async function buildEvidenceCheck(cwd: string, options: { gate: boolean; timeoutMs?: number }) {
  const [status, repo, wiki, lsp, release] = await Promise.all([
    buildEvidenceStatus(cwd),
    Promise.resolve(buildRepoKnowledgeReport(cwd, { gate: true })),
    checkWiki(cwd, true),
    Promise.resolve(buildLspCheckReport(cwd, { gate: true, timeoutMs: options.timeoutMs })),
    Promise.resolve(buildReleaseIntegrityReport(cwd, { gate: true, live: false })),
  ]);
  const surfaces = [
    {
      id: "repo" as const,
      command: "repo check --gate" as const,
      stability: repo.stability,
      status: repo.repoKnowledge.status,
      gate: surfaceGate(repo.gate),
      counts: {
        evidenceGaps: repo.evidenceGaps.length,
        derivableFacts: repo.derivableFacts.length,
        heuristicClaims: repo.heuristicClaims.length,
        blockingUnknowns: repo.blockingUnknowns.length,
        informationalUnknowns: repo.informationalUnknowns.length,
      },
    },
    {
      id: "wiki" as const,
      command: "wiki check --gate" as const,
      stability: wiki.stability,
      status: wiki.wiki.status,
      gate: surfaceGate(wiki.gate),
      counts: {
        evidenceGaps: wiki.evidenceGaps.length,
        derivableFacts: wiki.derivableFacts.length,
        heuristicClaims: wiki.heuristicClaims.length,
        blockingUnknowns: wiki.blockingUnknowns.length,
        informationalUnknowns: wiki.informationalUnknowns.length,
      },
    },
    {
      id: "lsp" as const,
      command: "lsp check --gate" as const,
      stability: lsp.stability,
      status: lsp.lsp.status,
      gate: surfaceGate(lsp.gate),
      counts: {
        evidenceGaps: lsp.evidenceGaps.length,
        derivableFacts: lsp.derivableFacts.length,
        heuristicClaims: lsp.heuristicClaims.length,
        blockingUnknowns: lsp.blockingUnknowns.length,
        informationalUnknowns: lsp.informationalUnknowns.length,
      },
    },
    {
      id: "release" as const,
      command: "release check --gate" as const,
      stability: release.stability,
      status: release.releaseIntegrity.status,
      gate: surfaceGate(release.gate),
      counts: {
        evidenceGaps: release.evidenceGaps.length,
        derivableFacts: release.derivableFacts.length,
        heuristicClaims: release.heuristicClaims.length,
        blockingUnknowns: release.blockingUnknowns.length,
        informationalUnknowns: release.informationalUnknowns.length,
      },
    },
  ];
  const gate = gateFor(options.gate, surfaces);
  const evidenceGaps = [
    ...prefixedList(repo.evidenceGaps, "repo"),
    ...prefixedList(wiki.evidenceGaps, "wiki"),
    ...prefixedList(lsp.evidenceGaps, "lsp"),
    ...prefixedList(release.evidenceGaps, "release"),
  ];
  const blockingUnknowns = [
    ...prefixedList(repo.blockingUnknowns, "repo"),
    ...prefixedList(wiki.blockingUnknowns, "wiki"),
    ...prefixedList(lsp.blockingUnknowns, "lsp"),
    ...prefixedList(release.blockingUnknowns, "release"),
  ];
  const informationalUnknowns = [
    ...prefixedList(repo.informationalUnknowns, "repo"),
    ...prefixedList(wiki.informationalUnknowns, "wiki"),
    ...prefixedList(lsp.informationalUnknowns, "lsp"),
    ...prefixedList(release.informationalUnknowns, "release"),
  ];
  const derivableFacts = [
    ...prefixedList(repo.derivableFacts, "repo"),
    ...prefixedList(wiki.derivableFacts, "wiki"),
    ...prefixedList(lsp.derivableFacts, "lsp"),
    ...prefixedList(release.derivableFacts, "release"),
  ];
  const heuristicClaims = [
    ...prefixedList(status.heuristicClaims, "evidence"),
    ...prefixedList(repo.heuristicClaims, "repo"),
    ...prefixedList(wiki.heuristicClaims, "wiki"),
    ...prefixedList(lsp.heuristicClaims, "lsp"),
    ...prefixedList(release.heuristicClaims, "release"),
    {
      kind: "evidence_check_is_aggregate_gate",
      source: "evidence",
      confidence: "high",
      evidence: "Evidence check aggregates existing gate results and does not evaluate semantic quality or task completion itself.",
      recommendation: "Use individual surface outputs when a failed aggregate gate needs root-cause details.",
    },
  ];
  const failedSurfaces = surfaces.filter((surface) => surface.gate.exitCode !== 0 || surface.gate.status === "failed" || surface.gate.status === "blocked");
  const statusValue = failedSurfaces.length === 0
    ? "pass" as const
    : failedSurfaces.some((surface) => surface.gate.status === "blocked")
      ? "blocked" as const
      : "fail" as const;
  return {
    schemaVersion: 1,
    stability: "experimental" as const,
    command: "evidence check" as const,
    cwd,
    status: statusValue,
    dashboard: {
      status: status.status,
      surfaces: status.surfaces,
      authority: status.authority,
    },
    surfaces,
    evidenceGaps,
    derivableFacts,
    heuristicClaims,
    blockingUnknowns,
    informationalUnknowns,
    counts: {
      surfaces: surfaces.length,
      failedSurfaces: surfaces.filter((surface) => surface.gate.exitCode !== 0).length,
      evidenceGaps: evidenceGaps.length,
      derivableFacts: derivableFacts.length,
      heuristicClaims: heuristicClaims.length,
      blockingUnknowns: blockingUnknowns.length,
      informationalUnknowns: informationalUnknowns.length,
    },
    authority: {
      sourceTruthAuthority: false as const,
      healthAuthority: false as const,
      cleanupAuthority: false as const,
      completionAuthority: false as const,
    },
    gate,
  };
}

function renderEvidenceMarkdown(check: Awaited<ReturnType<typeof buildEvidenceCheck>>): string {
  const lines = [
    "# Codexus Evidence Bundle",
    "",
    "This file is an explicit projection over Codexus evidence surfaces.",
    "It is not source truth and it is not completion authority.",
    "",
    `- Status: ${check.status}`,
    `- Gate: ${check.gate.status}`,
    `- Surfaces: ${check.counts.surfaces}`,
    `- Evidence gaps: ${check.counts.evidenceGaps}`,
    `- Blocking unknowns: ${check.counts.blockingUnknowns}`,
    `- Informational unknowns: ${check.counts.informationalUnknowns}`,
    `- Bundle hash: ${sha256CanonicalJson(check)}`,
    "",
    "## Surfaces",
    "",
    "| Surface | Command | Status | Gate | Gaps | Unknowns |",
    "| --- | --- | --- | --- | ---: | ---: |",
    ...check.surfaces.map((surface) => `| ${surface.id} | \`${surface.command}\` | ${surface.status} | ${surface.gate.status} | ${surface.counts.evidenceGaps} | ${surface.counts.blockingUnknowns} |`),
    "",
    "## Authority Boundary",
    "",
    "- `sourceTruthAuthority`: false",
    "- `healthAuthority`: false",
    "- `cleanupAuthority`: false",
    "- `completionAuthority`: false",
    "",
    "Use the JSON bundle next to this file for machine-readable details.",
    "",
  ];
  return `${lines.join("\n")}`;
}

export async function exportEvidenceBundle(cwd: string, options: { target: string; gate: boolean; timeoutMs?: number }) {
  const resolved = resolveEvidenceExportTarget(cwd, options.target);
  await assertNoSymlinkComponents(cwd, resolved.relative);
  const check = await buildEvidenceCheck(cwd, { gate: options.gate, timeoutMs: options.timeoutMs });
  await ensureDir(resolved.absolute);
  const jsonPath = join(resolved.absolute, "evidence.json");
  const markdownPath = join(resolved.absolute, "evidence.md");
  const json = `${JSON.stringify(check, null, 2)}\n`;
  const markdown = renderEvidenceMarkdown(check);
  await writeTextAtomic(jsonPath, json);
  await ensureDir(dirname(markdownPath));
  await writeTextAtomic(markdownPath, markdown);
  return {
    schemaVersion: 1,
    stability: "experimental" as const,
    command: "evidence export" as const,
    cwd,
    target: resolved.relative,
    exportedFiles: [repoRelative(cwd, jsonPath), repoRelative(cwd, markdownPath)].sort(),
    bundle: {
      status: check.status,
      gate: check.gate.status,
      evidenceGapCount: check.counts.evidenceGaps,
      blockingUnknownCount: check.counts.blockingUnknowns,
      jsonSha256: sha256Text(json),
      markdownSha256: sha256Text(markdown),
      sourceTruthAuthority: false as const,
      completionAuthority: false as const,
      autoCommitted: false as const,
    },
    authority: {
      sourceTruthAuthority: false as const,
      healthAuthority: false as const,
      cleanupAuthority: false as const,
      completionAuthority: false as const,
    },
    gate: options.gate
      ? check.gate
      : { enabled: false as const, status: "not_requested" as const, exitCode: 0 as const, reason: "export writes a projection; pass --gate to mirror aggregate check failures" },
  };
}
