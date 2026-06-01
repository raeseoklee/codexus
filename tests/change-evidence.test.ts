import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const cli = resolve("src/cli/main.ts");

async function tempDir(): Promise<string> {
  return await mkdtemp(join(tmpdir(), "codexus-change-evidence-"));
}

function runCli(cwd: string, args: string[], env: Record<string, string> = {}) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...env },
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

test("slop check reports unknown without session state and separates derivable facts", async () => {
  const cwd = await tempDir();
  try {
    await initGitRepo(cwd);
    await writeFile(join(cwd, "parser.ts"), "export const value = 1;\n");

    const result = runCli(cwd, ["slop", "check", "--json"]);
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.changeEvidence.status, "unknown");
    assert.equal(output.changeEvidence.verification, "unknown");
    assert.equal(output.changeEvidence.includesUntracked, true);
    assert.deepEqual(output.evidenceGaps, []);
    const sourceFact = output.derivableFacts.find((fact: { kind: string }) => fact.kind === "source_without_test_diff");
    assert.equal(sourceFact.gate, false);
    assert.equal(output.heuristicClaims[0].kind, "behavior_change_likely_needs_test");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("slop check passes when current dirty workspace has fresh passing verification", async () => {
  const cwd = await tempDir();
  try {
    await initGitRepo(cwd);
    await writeFile(join(cwd, "parser.ts"), "export const value = 1;\n");

    const verify = runCli(cwd, ["session", "verify", "--verify", "node -e \"console.log('ok')\"", "--json"]);
    assert.equal(verify.status, 0, verify.stderr);

    const result = runCli(cwd, ["slop", "check", "--json"]);
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.changeEvidence.status, "pass");
    assert.equal(output.changeEvidence.verification, "passed");
    assert.deepEqual(output.evidenceGaps, []);
    assert.equal(output.derivableFacts.find((fact: { kind: string }) => fact.kind === "source_without_test_diff").gate, false);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("slop check fails on stale verification after workspace change", async () => {
  const cwd = await tempDir();
  try {
    await initGitRepo(cwd);
    const verify = runCli(cwd, ["session", "verify", "--verify", "node -e \"console.log('ok')\"", "--json"]);
    assert.equal(verify.status, 0, verify.stderr);
    await writeFile(join(cwd, "parser.ts"), "export const value = 2;\n");

    const result = runCli(cwd, ["slop", "check", "--json"]);
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.changeEvidence.status, "fail");
    assert.equal(output.changeEvidence.verification, "stale");
    assert.equal(output.evidenceGaps[0].kind, "stale_verification");
    const sourceFact = output.derivableFacts.find((fact: { kind: string }) => fact.kind === "source_without_test_diff");
    assert.equal(sourceFact.gate, false);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("slop check --gate turns evidence status into an automation exit code", async () => {
  const cwd = await tempDir();
  try {
    await initGitRepo(cwd);
    await writeFile(join(cwd, "parser.ts"), "export const value = 1;\n");

    const unknown = runCli(cwd, ["slop", "check", "--gate", "--json"]);
    assert.equal(unknown.status, 1);
    const unknownOutput = JSON.parse(unknown.stdout);
    assert.equal(unknownOutput.changeEvidence.status, "unknown");
    assert.equal(unknownOutput.gate.status, "blocked");
    assert.equal(unknownOutput.gate.exitCode, 1);
    assert.deepEqual(unknownOutput.evidenceGaps, []);

    const verify = runCli(cwd, ["session", "verify", "--verify", "node -e \"console.log('ok')\"", "--json"]);
    assert.equal(verify.status, 0, verify.stderr);

    const passed = runCli(cwd, ["slop", "check", "--gate", "--json"]);
    assert.equal(passed.status, 0, passed.stderr);
    const passedOutput = JSON.parse(passed.stdout);
    assert.equal(passedOutput.changeEvidence.status, "pass");
    assert.equal(passedOutput.gate.status, "passed");

    await writeFile(join(cwd, "parser.ts"), "export const value = 2;\n");

    const failed = runCli(cwd, ["session", "slop", "--gate", "--json"]);
    assert.equal(failed.status, 1);
    const failedOutput = JSON.parse(failed.stdout);
    assert.equal(failedOutput.changeEvidence.status, "fail");
    assert.equal(failedOutput.gate.status, "failed");
    assert.equal(failedOutput.evidenceGaps[0].kind, "stale_verification");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("slop check --gate ignores heuristic claims when evidence is fresh", async () => {
  const cwd = await tempDir();
  try {
    await initGitRepo(cwd);
    await writeFile(join(cwd, "parser.ts"), [
      "export class Manager {",
      "  parse(value: string) { return value.trim(); }",
      "}",
      "",
    ].join("\n"));
    git(cwd, ["add", "parser.ts"]);

    const verify = runCli(cwd, ["session", "verify", "--verify", "node -e \"console.log('ok')\"", "--json"]);
    assert.equal(verify.status, 0, verify.stderr);

    const result = runCli(cwd, ["slop", "check", "--gate", "--json"]);
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.changeEvidence.status, "pass");
    assert.equal(output.gate.status, "passed");
    assert.equal(output.evidenceGaps.length, 0);
    assert.equal(output.heuristicClaims.some((claim: { kind: string }) => claim.kind === "suspicious_abstraction"), true);
    assert.equal(output.heuristicClaims.some((claim: { kind: string }) => claim.kind === "behavior_change_likely_needs_test"), true);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("slop check --since inspects a committed range without staged or untracked scope", async () => {
  const cwd = await tempDir();
  try {
    await initGitRepo(cwd);
    await writeFile(join(cwd, "parser.ts"), "export const value = 1;\n");
    git(cwd, ["add", "parser.ts"]);
    git(cwd, ["commit", "--quiet", "-m", "add parser"]);

    const result = runCli(cwd, ["slop", "check", "--since", "HEAD~1", "--json"]);
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.diff.diffBase, "since:HEAD~1");
    assert.equal(output.diff.includesStaged, false);
    assert.equal(output.diff.includesUntracked, false);
    assert.ok(output.diff.files.includes("parser.ts"));
    assert.equal(output.derivableFacts.some((fact: { kind: string }) => fact.kind === "source_without_test_diff"), true);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("slop check --scope fails when the diff escapes the declared scope", async () => {
  const cwd = await tempDir();
  try {
    await initGitRepo(cwd);
    await writeFile(join(cwd, "parser.ts"), "export const value = 1;\n");
    await writeFile(join(cwd, "README.md"), "outside scope\n");

    const result = runCli(cwd, ["slop", "check", "--scope", "src/**", "--json"]);
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.changeEvidence.status, "fail");
    assert.equal(output.changeEvidence.scope, "src/**");
    const gap = output.evidenceGaps.find((item: { kind: string }) => item.kind === "out_of_declared_scope");
    assert.equal(gap.gate, true);
    assert.ok(gap.files.includes("parser.ts"));
    assert.ok(gap.files.includes("README.md"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("slop check records surgicality and verification facts without promoting them to gates", async () => {
  const cwd = await tempDir();
  try {
    await initGitRepo(cwd);
    await mkdir(join(cwd, "src"), { recursive: true });
    await mkdir(join(cwd, "tests"), { recursive: true });
    await writeFile(join(cwd, "src/parser.ts"), "export const parse = (value: string) => value.trim();\n");
    await writeFile(join(cwd, "tests/parser.test.ts"), "import test from 'node:test';\n");

    const verify = runCli(cwd, ["session", "verify", "--verify", "node -e \"console.log('ok')\"", "--json"]);
    assert.equal(verify.status, 0, verify.stderr);

    const result = runCli(cwd, ["slop", "check", "--scope", "src/**,tests/**", "--gate", "--json"]);
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.changeEvidence.status, "pass");
    assert.equal(output.gate.status, "passed");
    assert.deepEqual(output.evidenceGaps, []);
    assert.equal(output.derivableFacts.some((fact: { kind: string }) => fact.kind === "declared_scope_respected" && fact.gate === false), true);
    assert.equal(output.derivableFacts.some((fact: { kind: string }) => fact.kind === "test_diff_present" && fact.gate === false), true);
    assert.equal(output.derivableFacts.some((fact: { kind: string }) => fact.kind === "verification_artifact_linked" && fact.gate === false), true);
    assert.equal(output.derivableFacts.some((fact: { kind: string }) => fact.kind === "diff_surface_area" && fact.gate === false), true);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("slop check keeps assumption and simplicity lanes advisory under a fresh gate", async () => {
  const cwd = await tempDir();
  try {
    await initGitRepo(cwd);
    for (let index = 0; index < 5; index += 1) {
      await writeFile(join(cwd, `module-${index}.ts`), [
        `export function value${index}() {`,
        "  const marker = 'TODO: replace placeholder after review';",
        "  return marker;",
        "}",
        "",
      ].join("\n"));
    }

    const verify = runCli(cwd, ["session", "verify", "--verify", "node -e \"console.log('ok')\"", "--json"]);
    assert.equal(verify.status, 0, verify.stderr);

    const result = runCli(cwd, ["slop", "check", "--gate", "--json"]);
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.changeEvidence.status, "pass");
    assert.equal(output.gate.status, "passed");
    assert.deepEqual(output.evidenceGaps, []);
    assert.equal(output.heuristicClaims.some((claim: { kind: string }) => claim.kind === "unresolved_assumption_marker"), true);
    assert.equal(output.heuristicClaims.some((claim: { kind: string }) => claim.kind === "simplicity_review_suggested"), true);
    assert.equal(output.heuristicClaims.some((claim: { kind: string }) => claim.kind === "multi_area_change_without_scope"), true);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("session slop is the Codex-session alias for the same evidence report", async () => {
  const cwd = await tempDir();
  try {
    await initGitRepo(cwd);
    await writeFile(join(cwd, "parser.ts"), "export const value = 1;\n");

    const result = runCli(cwd, ["session", "slop", "--json"]);
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.schemaVersion, 1);
    assert.equal(output.changeEvidence.status, "unknown");
    assert.equal(output.derivableFacts.some((fact: { kind: string }) => fact.kind === "source_without_test_diff"), true);
    assert.equal(output.migration.reason, "not_initialized");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("slop check can link explicit review artifacts as derivable evidence", async () => {
  const cwd = await tempDir();
  try {
    await initGitRepo(cwd);
    const reviewPath = join(cwd, "review.json");
    await writeFile(join(cwd, "parser.ts"), "export const value = 1;\n");
    await writeFile(reviewPath, "{\"status\":\"reviewed\"}\n");

    const linked = runCli(cwd, ["slop", "check", "--review", reviewPath, "--json"]);
    assert.equal(linked.status, 0, linked.stderr);
    const linkedOutput = JSON.parse(linked.stdout);
    assert.equal(linkedOutput.derivableFacts.some((fact: { kind: string }) => fact.kind === "explicit_review_linked"), true);

    const missing = runCli(cwd, ["slop", "check", "--review", "missing-review.json", "--json"]);
    assert.equal(missing.status, 0, missing.stderr);
    const missingOutput = JSON.parse(missing.stdout);
    assert.equal(missingOutput.changeEvidence.status, "fail");
    assert.equal(missingOutput.evidenceGaps.some((gap: { kind: string }) => gap.kind === "missing_review_artifact"), true);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
