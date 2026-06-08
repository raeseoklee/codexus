import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { buildContractReadinessReport } from "../src/contract/readiness.ts";

const root = resolve(".");
const cli = resolve("src/cli/main.ts");

function runCli(args: string[]) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env },
  });
}

test("contract readiness reports all 0.2 promotion candidates as stable promotions", () => {
  const report = buildContractReadinessReport(root);
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.stability, "experimental");
  assert.equal(report.targetVersion, "0.2.0");
  assert.equal(report.contractReadiness.status, "ready");
  assert.equal(report.contractReadiness.promotedSurfaceCount, 5);
  assert.equal(report.contractReadiness.candidateCount, 5);
  const repoCandidate = report.candidates.find((candidate) => candidate.surface === "repo-knowledge-check");
  assert.equal(repoCandidate?.currentStability, "stable");
  assert.equal(repoCandidate?.frozenFieldsDocumented, true);
  assert.equal(repoCandidate?.promotionStatus, "promoted");
  assert.deepEqual(repoCandidate?.blockers, []);
  const releaseCandidate = report.candidates.find((candidate) => candidate.surface === "release-integrity-check");
  assert.equal(releaseCandidate?.currentStability, "stable");
  assert.equal(releaseCandidate?.frozenFieldsDocumented, true);
  assert.equal(releaseCandidate?.promotionStatus, "promoted");
  assert.deepEqual(releaseCandidate?.blockers, []);
  const lspCandidate = report.candidates.find((candidate) => candidate.surface === "lsp-diagnostics-check");
  assert.equal(lspCandidate?.currentStability, "stable");
  assert.equal(lspCandidate?.frozenFieldsDocumented, true);
  assert.equal(lspCandidate?.promotionStatus, "promoted");
  assert.deepEqual(lspCandidate?.blockers, []);
  const architectureCandidate = report.candidates.find((candidate) => candidate.surface === "architecture-check");
  assert.equal(architectureCandidate?.currentStability, "stable");
  assert.equal(architectureCandidate?.frozenFieldsDocumented, true);
  assert.equal(architectureCandidate?.promotionStatus, "promoted");
  assert.deepEqual(architectureCandidate?.blockers, []);
  const wikiCandidate = report.candidates.find((candidate) => candidate.surface === "compiled-wiki-context");
  assert.equal(wikiCandidate?.currentStability, "stable");
  assert.equal(wikiCandidate?.frozenFieldsDocumented, true);
  assert.equal(wikiCandidate?.promotionStatus, "promoted");
  assert.deepEqual(wikiCandidate?.blockers, []);
  assert.equal(report.candidates.some((candidate) => candidate.promotionStatus === "not_promoted"), false);
  assert.ok(report.deferredSurfaces.some((surface) => surface.surface === "app-instance-launcher"));
  const appHealthSurface = report.deferredSurfaces.find((surface) => surface.surface === "app-instance-health-modeling");
  assert.equal(appHealthSurface?.currentStability, "deferred");
  const lspProtocolSurface = report.deferredSurfaces.find((surface) => surface.surface === "lsp-protocol-server-lifecycle");
  assert.equal(lspProtocolSurface?.currentStability, "deferred");
  const injectionSurface = report.deferredSurfaces.find((surface) => surface.surface === "automatic-context-injection");
  assert.equal(injectionSurface?.currentStability, "deferred");
  const pluginAlwaysOnSurface = report.deferredSurfaces.find((surface) => surface.surface === "plugin-always-on-supervision");
  assert.equal(pluginAlwaysOnSurface?.currentStability, "deferred");
  const updateSurface = report.deferredSurfaces.find((surface) => surface.surface === "update-notifications");
  assert.equal(updateSurface?.currentStability, "experimental");
  assert.match(updateSurface?.reasons.join(" ") ?? "", /exist/);
  const pluginSurface = report.deferredSurfaces.find((surface) => surface.surface === "codex-plugin-packaging");
  assert.equal(pluginSurface?.currentStability, "experimental");
  assert.match(pluginSurface?.reasons.join(" ") ?? "", /diagnostics exist/);
  assert.equal(report.evidenceGaps.some((gap) => gap.kind === "stable_promotion_missing"), false);
  assert.ok(report.derivableFacts.some((fact) => fact.kind === "json_contract_promotion_rule_present"));
  assert.ok(report.heuristicClaims.some((claim) => claim.kind === "promotion_candidate_prioritization"));
  assert.equal(report.gate.status, "not_requested");
});

test("contract check --json is report-only by default", () => {
  const result = runCli(["contract", "check", "--json"]);
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.command, "contract check");
  assert.equal(output.contractReadiness.status, "ready");
  assert.equal(output.contractReadiness.promotedSurfaceCount, 5);
  assert.equal(output.gate.status, "not_requested");
});

test("contract check --gate passes once a stable surface is promoted and frozen", () => {
  const result = runCli(["contract", "check", "--target", "0.2.0", "--gate", "--json"]);
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.gate.status, "passed");
  assert.equal(output.contractReadiness.status, "ready");
  assert.equal(output.contractReadiness.promotedSurfaceCount, 5);
  assert.equal(output.evidenceGaps.some((gap: { kind: string }) => gap.kind === "stable_promotion_missing"), false);
});

test("contract check rejects unsupported targets truthfully", () => {
  const result = runCli(["contract", "check", "--target", "0.3.0", "--json"]);
  assert.equal(result.status, 1);
  const output = JSON.parse(result.stdout);
  assert.equal(output.type, "error");
  assert.equal(output.code, "unsupported_contract_target");
});
