import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const cli = resolve("src/cli/main.ts");

async function tempDir(): Promise<string> {
  return await mkdtemp(join(tmpdir(), "codexus-autopilot-"));
}

function runCli(cwd: string, args: string[]) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env },
  });
}

function git(cwd: string, args: string[]): void {
  const result = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8" });
  assert.equal(result.status, 0, `git ${args.join(" ")} failed: ${result.stderr}`);
}

async function initGitRepo(cwd: string): Promise<void> {
  git(cwd, ["init", "--quiet"]);
  git(cwd, ["config", "user.email", "test@codexus.local"]);
  git(cwd, ["config", "user.name", "Codexus Test"]);
  git(cwd, ["config", "commit.gpgsign", "false"]);
  await writeFile(join(cwd, "README.md"), "initial\n");
  git(cwd, ["add", "README.md"]);
  git(cwd, ["commit", "--quiet", "-m", "initial"]);
}

async function writePlanSource(cwd: string): Promise<string> {
  await mkdir(join(cwd, "docs"), { recursive: true });
  const path = join(cwd, "docs", "PRD.md");
  await writeFile(path, [
    "# Parser Work",
    "",
    "Touch `src/parser.ts` and `tests/parser.test.ts`.",
    "",
    "## Acceptance Criteria",
    "- Parser trims leading whitespace.",
    "- Parser preserves internal punctuation.",
    "",
  ].join("\n"));
  return path;
}

async function writePackage(cwd: string): Promise<void> {
  await writeFile(join(cwd, "package.json"), `${JSON.stringify({
    name: "fixture",
    version: "1.0.0",
    type: "module",
    scripts: {
      test: "node --test",
      typecheck: "node -e \"console.log('ok')\"",
      lint: "node -e \"console.log('lint')\"",
    },
  }, null, 2)}\n`);
}

test("schema validate supports autopilot contract artifacts", async () => {
  const cwd = await tempDir();
  try {
    const valid = join(cwd, "autopilot.json");
    await writeFile(valid, `${JSON.stringify({
      schemaVersion: 1,
      stability: "experimental",
      type: "codexus.autopilot.contract",
      status: "draft",
      autonomyPreset: "contracted",
      sourceDocs: [{ path: "docs/PRD.md", sha256: "sha256:test" }],
      autopilot: {
        scope: { allow: ["src/**"], forbiddenChanges: ["package.json"] },
        acceptanceCriteria: ["Parser trims whitespace."],
        verificationRequired: ["npm test"],
        commandAllowlist: ["npm test", "npm run typecheck"],
        networkPolicy: { mode: "none", requiresDriverEnforcement: true },
        maxRuntimeMs: 3600000,
        maxRepairIterations: 3,
        maxChangedFiles: 40,
        maxDiffLines: 2000,
        approval: "enforced-never-with-isolation",
        stopOnPolicyViolation: true
      }
    }, null, 2)}\n`);

    const validResult = runCli(cwd, ["schema", "validate", "--type", "autopilot-contract", "--file", valid, "--json"]);
    assert.equal(validResult.status, 0, validResult.stderr);
    assert.equal(JSON.parse(validResult.stdout).ok, true);

    const invalid = join(cwd, "invalid-autopilot.json");
    await writeFile(invalid, `${JSON.stringify({
      schemaVersion: 1,
      stability: "experimental",
      type: "codexus.autopilot.contract",
      status: "draft",
      autonomyPreset: "contracted",
      sourceDocs: [{ path: "docs/PRD.md", sha256: "sha256:test" }],
      mystery: true,
      autopilot: {
        scope: { allow: [], forbiddenChanges: ["package.json"] },
        acceptanceCriteria: [],
        verificationRequired: [],
        commandAllowlist: [],
        networkPolicy: { mode: "none", requiresDriverEnforcement: true },
        maxRuntimeMs: 3600000,
        maxRepairIterations: 3,
        maxChangedFiles: 40,
        maxDiffLines: 2000,
        approval: "enforced-never-with-isolation",
        stopOnPolicyViolation: true
      }
    }, null, 2)}\n`);
    const invalidResult = runCli(cwd, ["schema", "validate", "--type", "autopilot-contract", "--file", invalid, "--json"]);
    assert.equal(invalidResult.status, 1);
    const invalidOutput = JSON.parse(invalidResult.stdout);
    assert.equal(invalidOutput.ok, false);
    assert.ok(invalidOutput.validation.errors.includes("mystery:unknown_key"));
    assert.ok(invalidOutput.validation.errors.includes("autopilot.scope.allow:expected_non_empty_string_array"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("autopilot plan writes a draft contract artifact", async () => {
  const cwd = await tempDir();
  try {
    await writePackage(cwd);
    const prd = await writePlanSource(cwd);
    const result = runCli(cwd, ["autopilot", "plan", "--from", prd, "--json"]);
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.stability, "experimental");
    assert.equal(output.command, "autopilot plan");
    assert.equal(output.contract.status, "draft");
    assert.equal(output.contract.autonomyPreset, "contracted");
    assert.equal(output.draftRequiresApproval, true);
    assert.equal(existsSync(output.artifactPath), true);
    assert.equal(output.contract.sourceDocs.length, 1);
    assert.equal(output.contract.autopilot.scope.allow.includes("src/**"), true);
    assert.equal(output.contract.autopilot.scope.allow.includes("tests/**"), true);
    assert.equal(output.contract.autopilot.acceptanceCriteria.length, 2);
    assert.ok(output.contract.autopilot.verificationRequired.includes("npm test"));
    assert.ok(output.heuristicClaims.some((claim: { kind: string }) => claim.kind === "draft_requires_human_approval"));

    const schema = runCli(cwd, ["schema", "validate", "--type", "autopilot-contract", "--file", output.artifactPath, "--json"]);
    assert.equal(schema.status, 0, schema.stderr);
    assert.equal(JSON.parse(schema.stdout).ok, true);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("autopilot presets list reports the supported autonomy presets", async () => {
  const cwd = await tempDir();
  try {
    const result = runCli(cwd, ["autopilot", "presets", "list", "--json"]);
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.command, "autopilot presets list");
    assert.equal(output.defaultPreset, "contracted");
    assert.deepEqual(
      output.presets.map((preset: { name: string }) => preset.name),
      ["manual", "guided", "contracted", "gated-auto", "extended-auto"],
    );
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("autopilot plan accepts an explicit preset", async () => {
  const cwd = await tempDir();
  try {
    await writePackage(cwd);
    const prd = await writePlanSource(cwd);
    const result = runCli(cwd, ["autopilot", "plan", "--from", prd, "--preset", "gated-auto", "--json"]);
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.contract.autonomyPreset, "gated-auto");
    assert.ok(output.derivableFacts.some((fact: { kind: string }) => fact.kind === "autonomy_preset_declared"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("autopilot contract approve writes approval record and approved contract", async () => {
  const cwd = await tempDir();
  try {
    await writePackage(cwd);
    const prd = await writePlanSource(cwd);
    const draft = JSON.parse(runCli(cwd, ["autopilot", "plan", "--from", prd, "--json"]).stdout);
    const approve = runCli(cwd, [
      "autopilot",
      "contract",
      "approve",
      draft.artifactPath,
      "--approved-by",
      "maintainer",
      "--json",
    ]);
    assert.equal(approve.status, 0, approve.stderr);
    const output = JSON.parse(approve.stdout);
    assert.equal(output.contract.status, "approved");
    assert.equal(existsSync(output.approvalRecordPath), true);
    const validate = runCli(cwd, ["autopilot", "contract", "validate", output.artifactPath, "--json"]);
    assert.equal(validate.status, 0, validate.stderr);
    const validated = JSON.parse(validate.stdout);
    assert.equal(validated.ok, true);
    assert.equal(validated.validation.subjectHashMatches, true);
    assert.equal(validated.approvalRecordExists, true);

    const tampered = JSON.parse(await readFile(output.artifactPath, "utf8"));
    tampered.autonomyPreset = "extended-auto";
    await writeFile(output.artifactPath, `${JSON.stringify(tampered, null, 2)}\n`);
    const tamperedValidate = runCli(cwd, ["autopilot", "contract", "validate", output.artifactPath, "--json"]);
    assert.equal(tamperedValidate.status, 1);
    const tamperedOutput = JSON.parse(tamperedValidate.stdout);
    assert.equal(tamperedOutput.validation.subjectHashMatches, false);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("autopilot run-gate reports pre-run readiness without starting a run", async () => {
  const cwd = await tempDir();
  try {
    await initGitRepo(cwd);
    await writePackage(cwd);
    const prd = await writePlanSource(cwd);
    const draft = JSON.parse(runCli(cwd, ["autopilot", "plan", "--from", prd, "--json"]).stdout);
    const approve = runCli(cwd, [
      "autopilot",
      "contract",
      "approve",
      draft.artifactPath,
      "--approved-by",
      "maintainer",
      "--json",
    ]);
    assert.equal(approve.status, 0, approve.stderr);
    const approved = JSON.parse(approve.stdout);

    const result = runCli(cwd, ["autopilot", "run-gate", "--policy", approved.artifactPath, "--json"]);
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.schemaVersion, 1);
    assert.equal(output.stability, "experimental");
    assert.equal(output.command, "autopilot run-gate");
    assert.equal(output.runSupported, false);
    assert.equal(output.contractStatus, "approved");
    assert.equal(output.approvalRecordExists, true);
    assert.equal(output.actionAuthority.contractVersion, "autopilot-run-gate-v1");
    assert.equal(output.actionAuthority.sideEffects.startsRun, false);
    assert.equal(output.actionAuthority.sideEffects.requiresWorktreeIsolation, true);
    assert.equal(output.actionAuthority.sideEffects.requiresFreshVerification, true);
    assert.equal(output.actionAuthority.driverAuthority, "none");
    assert.equal(output.actionAuthority.completionAuthority, false);
    assert.equal(output.executionGate.status, "blocked");
    assert.equal(output.executionGate.exitCode, 1);
    assert.equal(output.gate.status, "not_requested");
    assert.equal(output.gate.exitCode, 0);
    assert.ok(output.derivableFacts.some((fact: { kind: string }) => fact.kind === "autopilot_run_authority_deferred"));

    const artifact = join(cwd, "run-gate.json");
    await writeFile(artifact, `${JSON.stringify(output, null, 2)}\n`);
    const schema = runCli(cwd, ["schema", "validate", "--type", "autopilot-run-gate", "--file", artifact, "--json"]);
    assert.equal(schema.status, 0, schema.stderr);
    assert.equal(JSON.parse(schema.stdout).ok, true);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("autopilot run-gate can gate readiness while live execution remains blocked", async () => {
  const cwd = await tempDir();
  try {
    await initGitRepo(cwd);
    await writePackage(cwd);
    const prd = await writePlanSource(cwd);
    const draft = JSON.parse(runCli(cwd, ["autopilot", "plan", "--from", prd, "--json"]).stdout);
    const approve = JSON.parse(runCli(cwd, [
      "autopilot",
      "contract",
      "approve",
      draft.artifactPath,
      "--approved-by",
      "maintainer",
      "--json",
    ]).stdout);

    const result = runCli(cwd, ["autopilot", "run-gate", "--policy", approve.artifactPath, "--gate", "--json"]);
    assert.equal(result.status, 1);
    const output = JSON.parse(result.stdout);
    assert.equal(output.runSupported, false);
    assert.ok(["failed", "blocked"].includes(output.gate.status));
    assert.equal(output.executionGate.status, "blocked");
    assert.equal(output.actionAuthority.sideEffects.startsRun, false);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("autopilot contract scope-check reports forbidden and out-of-scope changes", async () => {
  const cwd = await tempDir();
  try {
    await initGitRepo(cwd);
    await writePackage(cwd);
    await writePlanSource(cwd);
    await mkdir(join(cwd, "src"), { recursive: true });
    await writeFile(join(cwd, "src", "parser.ts"), "export const parse = (value) => value.trim();\n");
    await writeFile(join(cwd, "README.md"), "changed outside scope\n");

    const contractPath = join(cwd, "autopilot.json");
    await writeFile(contractPath, `${JSON.stringify({
      schemaVersion: 1,
      stability: "experimental",
      type: "codexus.autopilot.contract",
      status: "draft",
      autonomyPreset: "contracted",
      sourceDocs: [{ path: "docs/PRD.md", sha256: "sha256:test" }],
      autopilot: {
        scope: {
          allow: ["src/**"],
          forbiddenChanges: ["README.md", "package.json"]
        },
        acceptanceCriteria: [],
        verificationRequired: ["npm test"],
        commandAllowlist: ["npm test"],
        networkPolicy: { mode: "none", requiresDriverEnforcement: true },
        maxRuntimeMs: 3600000,
        maxRepairIterations: 3,
        maxChangedFiles: 40,
        maxDiffLines: 2000,
        approval: "enforced-never-with-isolation",
        stopOnPolicyViolation: true
      }
    }, null, 2)}\n`);

    const result = runCli(cwd, ["autopilot", "contract", "scope-check", contractPath, "--gate", "--json"]);
    assert.equal(result.status, 1);
    const output = JSON.parse(result.stdout);
    assert.equal(output.gate.status, "failed");
    assert.ok(output.evidenceGaps.some((gap: { kind: string }) => gap.kind === "out_of_declared_scope"));
    assert.ok(output.evidenceGaps.some((gap: { kind: string }) => gap.kind === "forbidden_change_touched"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("autopilot run stays honestly deferred", async () => {
  const cwd = await tempDir();
  try {
    const result = runCli(cwd, ["autopilot", "run", "--policy", "autopilot.json", "--json"]);
    assert.equal(result.status, 1);
    const output = JSON.parse(result.stdout);
    assert.equal(output.code, "autopilot_run_deferred");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
