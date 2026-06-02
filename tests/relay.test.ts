import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const cli = resolve("src/cli/main.ts");

async function tempDir(): Promise<string> {
  return await mkdtemp(join(tmpdir(), "codexus-relay-"));
}

function runCli(cwd: string, args: string[]) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env },
  });
}

async function writeFixtureFiles(cwd: string): Promise<{ stage: string; author: string; review: string }> {
  await mkdir(join(cwd, "docs"), { recursive: true });
  const stage = join(cwd, "docs", "plan.md");
  const author = join(cwd, "author.json");
  const review = join(cwd, "review.json");
  await writeFile(stage, "# Plan\n\nImplement the parser fix.\n");
  await writeFile(author, `${JSON.stringify({ role: "author-engine", claims: [{ text: "Plan is ready" }] }, null, 2)}\n`);
  await writeFile(review, `${JSON.stringify({ role: "review-engine", findings: [] }, null, 2)}\n`);
  return { stage, author, review };
}

async function writeAgreement(cwd: string, hash: string, extra: Record<string, unknown> = {}): Promise<string> {
  const path = join(cwd, "agreement.json");
  await writeFile(path, `${JSON.stringify({
    schemaVersion: 1,
    stability: "experimental",
    type: "codexus.autopilot.convergence-agreement",
    stage: "plan",
    round: 1,
    declarations: [
      { role: "author-engine", engine: "codex", artifactHash: hash, declaredAt: "2026-06-01T00:00:00.000Z" },
      { role: "review-engine", engine: "external-reviewer", artifactHash: hash, declaredAt: "2026-06-01T00:01:00.000Z" },
    ],
    unresolvedHighFindings: 0,
    decisionNeeded: false,
    ...extra,
  }, null, 2)}\n`);
  return path;
}

test("autopilot relay record persists import-only author and review artifacts", async () => {
  const cwd = await tempDir();
  try {
    const files = await writeFixtureFiles(cwd);
    const result = runCli(cwd, [
      "autopilot",
      "relay",
      "record",
      "--stage",
      "plan",
      "--artifact",
      files.stage,
      "--author-file",
      files.author,
      "--review-file",
      files.review,
      "--review-engine",
      "claude-code",
      "--json",
    ]);
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.stability, "experimental");
    assert.equal(output.recordOnly, true);
    assert.equal(output.reviewEngine.driverId, "external-relay");
    assert.equal(output.reviewEngine.capabilities.spawn, false);
    assert.ok(output.derivableFacts.some((fact: { kind: string }) => fact.kind === "review_engine_import_only"));
    assert.ok(existsSync(output.artifactPath));

    const schema = runCli(cwd, ["schema", "validate", "--type", "relay-session", "--file", output.artifactPath, "--json"]);
    assert.equal(schema.status, 0, schema.stderr);
    assert.equal(JSON.parse(schema.stdout).ok, true);

    const status = runCli(cwd, ["autopilot", "relay", "status", output.relayId, "--json"]);
    assert.equal(status.status, 0, status.stderr);
    assert.equal(JSON.parse(status.stdout).relay.relayId, output.relayId);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("valid convergence remains unable to complete when verification fails", async () => {
  const cwd = await tempDir();
  try {
    const files = await writeFixtureFiles(cwd);
    const stageGate = runCli(cwd, [
      "autopilot",
      "relay",
      "stage-gate",
      "--stage",
      "plan",
      "--scope",
      "full-gate",
      "--artifact",
      files.stage,
      "--verification-status",
      "passed",
      "--json",
    ]);
    assert.equal(stageGate.status, 0, stageGate.stderr);
    const stageGateOutput = JSON.parse(stageGate.stdout);
    assert.ok(stageGateOutput.heuristicClaims.some((claim: { kind: string }) => claim.kind === "verification_matrix_enforcement_deferred"));
    const agreementPath = await writeAgreement(cwd, stageGateOutput.stageArtifactHash);

    const schema = runCli(cwd, ["schema", "validate", "--type", "stage-gate-evidence", "--file", stageGateOutput.artifactPath, "--json"]);
    assert.equal(schema.status, 0, schema.stderr);
    assert.equal(JSON.parse(schema.stdout).ok, true);

    const agreementSchema = runCli(cwd, ["schema", "validate", "--type", "convergence-agreement", "--file", agreementPath, "--json"]);
    assert.equal(agreementSchema.status, 0, agreementSchema.stderr);
    assert.equal(JSON.parse(agreementSchema.stdout).ok, true);

    const check = runCli(cwd, [
      "autopilot",
      "relay",
      "check-agreement",
      "--agreement",
      agreementPath,
      "--stage-gate",
      stageGateOutput.artifactPath,
      "--verification-status",
      "failed",
      "--gate",
      "--json",
    ]);
    assert.equal(check.status, 1);
    const output = JSON.parse(check.stdout);
    assert.equal(output.relay.convergence, "valid");
    assert.equal(output.relay.canComplete, false);
    assert.equal(output.relay.convergenceIsCompletionAuthority, false);
    assert.ok(output.evidenceGaps.some((gap: { kind: string }) => gap.kind === "verification_failed_blocks_completion"));
    assert.equal(output.gate.status, "failed");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("convergence declarations must reference the same artifact hash", async () => {
  const cwd = await tempDir();
  try {
    const files = await writeFixtureFiles(cwd);
    const stageGate = runCli(cwd, [
      "autopilot",
      "relay",
      "stage-gate",
      "--stage",
      "plan",
      "--scope",
      "full-gate",
      "--artifact",
      files.stage,
      "--json",
    ]);
    assert.equal(stageGate.status, 0, stageGate.stderr);
    const stageGateOutput = JSON.parse(stageGate.stdout);
    const agreementPath = await writeAgreement(cwd, stageGateOutput.stageArtifactHash, {
      declarations: [
        { role: "author-engine", engine: "codex", artifactHash: stageGateOutput.stageArtifactHash, declaredAt: "2026-06-01T00:00:00.000Z" },
        { role: "review-engine", engine: "external-reviewer", artifactHash: "sha256:different", declaredAt: "2026-06-01T00:01:00.000Z" },
      ],
    });

    const check = runCli(cwd, [
      "autopilot",
      "relay",
      "check-agreement",
      "--agreement",
      agreementPath,
      "--stage-gate",
      stageGateOutput.artifactPath,
      "--verification-status",
      "passed",
      "--gate",
      "--json",
    ]);
    assert.equal(check.status, 1);
    const output = JSON.parse(check.stdout);
    assert.equal(output.relay.convergence, "invalid");
    assert.ok(output.evidenceGaps.some((gap: { kind: string }) => gap.kind === "artifact_hash_mismatch"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("delta-check stage evidence cannot establish convergence", async () => {
  const cwd = await tempDir();
  try {
    const files = await writeFixtureFiles(cwd);
    const stageGate = runCli(cwd, [
      "autopilot",
      "relay",
      "stage-gate",
      "--stage",
      "plan",
      "--scope",
      "delta-check",
      "--artifact",
      files.stage,
      "--json",
    ]);
    assert.equal(stageGate.status, 0, stageGate.stderr);
    const stageGateOutput = JSON.parse(stageGate.stdout);
    const agreementPath = await writeAgreement(cwd, stageGateOutput.stageArtifactHash);

    const check = runCli(cwd, [
      "autopilot",
      "relay",
      "check-agreement",
      "--agreement",
      agreementPath,
      "--stage-gate",
      stageGateOutput.artifactPath,
      "--verification-status",
      "passed",
      "--gate",
      "--json",
    ]);
    assert.equal(check.status, 1);
    const output = JSON.parse(check.stdout);
    assert.equal(output.relay.convergence, "invalid");
    assert.ok(output.evidenceGaps.some((gap: { kind: string }) => gap.kind === "stage_gate_not_full_gate"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
