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

test("contract readiness identifies 0.2.0 promotion candidates without claiming readiness", () => {
  const report = buildContractReadinessReport(root);
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.stability, "experimental");
  assert.equal(report.targetVersion, "0.2.0");
  assert.equal(report.contractReadiness.status, "not_ready");
  assert.equal(report.contractReadiness.promotedSurfaceCount, 0);
  assert.ok(report.candidates.some((candidate) => candidate.surface === "repo-knowledge-check"));
  assert.ok(report.candidates.some((candidate) => candidate.surface === "release-integrity-check"));
  assert.ok(report.candidates.every((candidate) => candidate.promotionStatus !== "promoted"));
  assert.ok(report.deferredSurfaces.some((surface) => surface.surface === "app-instance-launcher"));
  assert.ok(report.evidenceGaps.some((gap) => gap.kind === "stable_promotion_missing"));
  assert.ok(report.derivableFacts.some((fact) => fact.kind === "json_contract_promotion_rule_present"));
  assert.ok(report.heuristicClaims.some((claim) => claim.kind === "promotion_candidate_prioritization"));
  assert.equal(report.gate.status, "not_requested");
});

test("contract check --json is report-only by default", () => {
  const result = runCli(["contract", "check", "--json"]);
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.command, "contract check");
  assert.equal(output.contractReadiness.status, "not_ready");
  assert.equal(output.gate.status, "not_requested");
});

test("contract check --gate fails until at least one surface is promoted and frozen", () => {
  const result = runCli(["contract", "check", "--target", "0.2.0", "--gate", "--json"]);
  assert.equal(result.status, 1);
  const output = JSON.parse(result.stdout);
  assert.equal(output.gate.status, "failed");
  assert.ok(output.evidenceGaps.some((gap: { kind: string }) => gap.kind === "stable_promotion_missing"));
});

test("contract check rejects unsupported targets truthfully", () => {
  const result = runCli(["contract", "check", "--target", "0.3.0", "--json"]);
  assert.equal(result.status, 1);
  const output = JSON.parse(result.stdout);
  assert.equal(output.type, "error");
  assert.equal(output.code, "unsupported_contract_target");
});
