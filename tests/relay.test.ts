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
  const stage = typeof extra.stage === "string" ? extra.stage : "plan";
  const path = join(cwd, "agreement.json");
  await writeFile(path, `${JSON.stringify({
    schemaVersion: 1,
    stability: "experimental",
    type: "codexus.autopilot.convergence-agreement",
    stage,
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

async function writeMatrix(cwd: string, rows: unknown[]): Promise<string> {
  const path = join(cwd, "matrix.json");
  await writeFile(path, `${JSON.stringify(rows, null, 2)}\n`);
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
    assert.equal(stageGateOutput.verificationMatrix.length, 0);
    assert.equal(stageGateOutput.heuristicClaims.some((claim: { kind: string }) => claim.kind === "verification_matrix_enforcement_deferred"), false);
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

test("implementation convergence requires verification matrix evidence", async () => {
  const cwd = await tempDir();
  try {
    const files = await writeFixtureFiles(cwd);
    const stageGate = runCli(cwd, [
      "autopilot",
      "relay",
      "stage-gate",
      "--stage",
      "implementation",
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
    const agreementPath = await writeAgreement(cwd, stageGateOutput.stageArtifactHash, { stage: "implementation" });

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
    assert.equal(output.relay.canComplete, false);
    assert.ok(output.evidenceGaps.some((gap: { kind: string }) => gap.kind === "verification_matrix_missing"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("implementation matrix rows must cite passing evidence or approved deferral", async () => {
  const cwd = await tempDir();
  try {
    const files = await writeFixtureFiles(cwd);
    const matrix = await writeMatrix(cwd, [
      {
        acceptanceCriterion: "AC-1",
        planStep: "Step 1",
        verification: "npm test -- parser.test.ts",
        status: "planned",
        evidencePath: null,
        deferredReason: null,
        deferredApproved: false,
      },
    ]);
    const stageGate = runCli(cwd, [
      "autopilot",
      "relay",
      "stage-gate",
      "--stage",
      "implementation",
      "--scope",
      "full-gate",
      "--artifact",
      files.stage,
      "--acceptance-criterion",
      "AC-1: parser tests pass",
      "--verification-matrix",
      matrix,
      "--verification-status",
      "passed",
      "--json",
    ]);
    assert.equal(stageGate.status, 0, stageGate.stderr);
    const stageGateOutput = JSON.parse(stageGate.stdout);
    const agreementPath = await writeAgreement(cwd, stageGateOutput.stageArtifactHash, { stage: "implementation" });

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
    assert.ok(output.evidenceGaps.some((gap: { kind: string }) => gap.kind === "verification_matrix_row_missing_evidence"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("implementation matrix evidence allows convergence when verification passes", async () => {
  const cwd = await tempDir();
  try {
    const files = await writeFixtureFiles(cwd);
    const evidencePath = join(cwd, "parser-test.log");
    await writeFile(evidencePath, "ok parser tests\n");
    const matrix = await writeMatrix(cwd, [
      {
        acceptanceCriterion: "AC-1",
        planStep: "Step 1",
        verification: "npm test -- parser.test.ts",
        status: "passed",
        evidencePath,
        deferredReason: null,
        deferredApproved: false,
      },
    ]);
    const stageGate = runCli(cwd, [
      "autopilot",
      "relay",
      "stage-gate",
      "--stage",
      "implementation",
      "--scope",
      "full-gate",
      "--artifact",
      files.stage,
      "--acceptance-criterion",
      "AC-1: parser tests pass",
      "--verification-matrix",
      matrix,
      "--verification-status",
      "passed",
      "--json",
    ]);
    assert.equal(stageGate.status, 0, stageGate.stderr);
    const stageGateOutput = JSON.parse(stageGate.stdout);
    assert.equal(stageGateOutput.acceptanceCriteria.length, 1);
    assert.equal(stageGateOutput.verificationMatrix.length, 1);
    const schema = runCli(cwd, ["schema", "validate", "--type", "stage-gate-evidence", "--file", stageGateOutput.artifactPath, "--json"]);
    assert.equal(schema.status, 0, schema.stderr);
    assert.equal(JSON.parse(schema.stdout).ok, true);
    const agreementPath = await writeAgreement(cwd, stageGateOutput.stageArtifactHash, { stage: "implementation" });

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
    assert.equal(check.status, 0, check.stderr);
    const output = JSON.parse(check.stdout);
    assert.equal(output.relay.convergence, "valid");
    assert.equal(output.relay.canComplete, true);
    assert.ok(output.derivableFacts.some((fact: { kind: string }) => fact.kind === "verification_matrix_present"));
    assert.ok(output.derivableFacts.some((fact: { kind: string }) => fact.kind === "verification_matrix_acceptance_covered"));
    assert.ok(output.derivableFacts.some((fact: { kind: string }) => fact.kind === "verification_matrix_rows_evidenced"));
    assert.deepEqual(output.evidenceGaps, []);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("implementation matrix evidence path must exist", async () => {
  const cwd = await tempDir();
  try {
    const files = await writeFixtureFiles(cwd);
    const matrix = await writeMatrix(cwd, [
      {
        acceptanceCriterion: "AC-1",
        planStep: "Step 1",
        verification: "npm test -- parser.test.ts",
        status: "passed",
        evidencePath: "missing-parser-test.log",
        deferredReason: null,
        deferredApproved: false,
      },
    ]);
    const stageGate = runCli(cwd, [
      "autopilot",
      "relay",
      "stage-gate",
      "--stage",
      "implementation",
      "--scope",
      "full-gate",
      "--artifact",
      files.stage,
      "--acceptance-criterion",
      "AC-1: parser tests pass",
      "--verification-matrix",
      matrix,
      "--verification-status",
      "passed",
      "--json",
    ]);
    assert.equal(stageGate.status, 0, stageGate.stderr);
    const stageGateOutput = JSON.parse(stageGate.stdout);
    const agreementPath = await writeAgreement(cwd, stageGateOutput.stageArtifactHash, { stage: "implementation" });

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
    assert.ok(output.evidenceGaps.some((gap: { kind: string }) => gap.kind === "verification_matrix_evidence_missing"));
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
