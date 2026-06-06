import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { buildReleasePolicyReport } from "../src/release/policy.ts";

const root = resolve(".");
const cli = resolve("src/cli/main.ts");

async function tempDir(): Promise<string> {
  return await mkdtemp(join(tmpdir(), "codexus-release-policy-"));
}

async function writePolicyDocs(cwd: string): Promise<void> {
  await mkdir(join(cwd, "docs", "ko"), { recursive: true });
  await writeFile(join(cwd, "docs", "release-policy.md"), "# Release Policy\n");
  await writeFile(join(cwd, "docs", "ko", "release-policy.md"), "# Release Policy\n");
}

test("release policy reports the project cadence as executable evidence", () => {
  const report = buildReleasePolicyReport(root, { gate: true });
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.stability, "experimental");
  assert.equal(report.command, "release policy");
  assert.equal(report.releasePolicy.status, "pass");
  assert.equal(report.releasePolicy.cadence, "small_commits_large_releases");
  assert.equal(report.releasePolicy.defaultBundle.minimumSubstantiveSlices, 2);
  assert.deepEqual(report.releasePolicy.defaultBundle.preferredSubstantiveSlices, [3, 5]);
  assert.equal(report.releasePolicy.versioning.patch, "stable-contract-additive-or-experimental-surface");
  assert.equal(report.releasePolicy.versioning.minor, "stable-contract-promotion-or-breaking-change");
  assert.equal(report.gate.status, "passed");
  assert.ok(report.derivableFacts.some((fact) => fact.kind === "thematic_release_bundle_required"));
  assert.ok(report.derivableFacts.some((fact) => fact.kind === "hotfix_exception_allowed"));
});

test("release policy gate fails when policy docs are missing", async () => {
  const cwd = await tempDir();
  try {
    const report = buildReleasePolicyReport(cwd, { gate: true });
    assert.equal(report.releasePolicy.status, "fail");
    assert.equal(report.gate.status, "failed");
    assert.equal(report.gate.exitCode, 1);
    assert.ok(report.evidenceGaps.some((gap) => gap.kind === "release_policy_doc_missing"));
    assert.ok(report.evidenceGaps.some((gap) => gap.kind === "release_policy_korean_doc_missing"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("release policy gate passes when both policy docs exist", async () => {
  const cwd = await tempDir();
  try {
    await writePolicyDocs(cwd);
    const report = buildReleasePolicyReport(cwd, { gate: true });
    assert.equal(report.releasePolicy.status, "pass");
    assert.equal(report.gate.status, "passed");
    assert.equal(report.evidenceGaps.length, 0);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("release policy command emits experimental JSON and gate result", () => {
  const result = spawnSync(process.execPath, [cli, "release", "policy", "--gate", "--json"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.stability, "experimental");
  assert.equal(output.command, "release policy");
  assert.equal(output.releasePolicy.status, "pass");
  assert.equal(output.gate.status, "passed");
});

test("release command rejects unsupported subcommands with a release-specific hint", async () => {
  const cwd = await tempDir();
  try {
    const result = spawnSync(process.execPath, [cli, "release", "publish", "--json"], {
      cwd,
      encoding: "utf8",
    });
    assert.equal(result.status, 1);
    const output = JSON.parse(result.stdout);
    assert.equal(output.code, "unsupported_release_command");
    assert.equal(output.details.target, "publish");
    assert.match(output.hint, /release policy/);
    assert.match(output.hint, /release check/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
