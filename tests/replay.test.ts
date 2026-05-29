import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { evaluateReplaySpec, readReplaySpec } from "../src/evolution/replay.ts";

const cli = resolve("src/cli/main.ts");

test("fixture-backed replay exposes parity coverage", async () => {
  const replayPath = resolve("fixtures/replay/deterministic-pass/replay.json");
  const skillPath = resolve("fixtures/replay/deterministic-pass/skill.json");
  const spec = await readReplaySpec(replayPath);
  assert.ok(spec);
  const skill = JSON.parse(await readFile(skillPath, "utf8"));
  const result = evaluateReplaySpec(spec, skill);
  assert.equal(result.status, "passed");
  assert.deepEqual(result.coverage.parityCases, ["permission_branch", "tool_success"]);

  const cliResult = spawnSync(process.execPath, [cli, "replay", replayPath, "--json"], {
    cwd: resolve("."),
    encoding: "utf8",
  });
  assert.equal(cliResult.status, 0, cliResult.stderr);
  const output = JSON.parse(cliResult.stdout);
  assert.deepEqual(output.replay.coverage.parityCases, result.coverage.parityCases);
});

test("fixture-backed replay exposes failure coverage and CLI failure status", async () => {
  const replayPath = resolve("fixtures/replay/failure-cases/replay.json");
  const skillPath = resolve("fixtures/replay/failure-cases/skill.json");
  const spec = await readReplaySpec(replayPath);
  assert.ok(spec);
  const skill = JSON.parse(await readFile(skillPath, "utf8"));
  const result = evaluateReplaySpec(spec, skill);
  assert.equal(result.status, "failed");
  assert.deepEqual(result.coverage.parityCases, ["large_output", "multi_tool_turn", "tool_denial", "usage_accounting"]);
  const failures = result.scenarios.flatMap((scenario) => scenario.failures);
  assert.ok(failures.includes("skill_id_mismatch"));
  assert.ok(failures.includes("verification_not_required"));
  assert.ok(failures.some((failure) => failure.startsWith("missing_required_test:")));
  assert.ok(failures.some((failure) => failure.startsWith("missing_forbidden_action:")));

  const cliResult = spawnSync(process.execPath, [cli, "replay", replayPath, "--json"], {
    cwd: resolve("."),
    encoding: "utf8",
  });
  assert.equal(cliResult.status, 1);
  const output = JSON.parse(cliResult.stdout);
  assert.equal(output.replay.status, "failed");
  assert.deepEqual(output.replay.coverage.parityCases, result.coverage.parityCases);
});

test("extended replay fixture covers skill, file, shell, and interruption labels", async () => {
  const replayPath = resolve("fixtures/replay/extended-pass/replay.json");
  const skillPath = resolve("fixtures/replay/extended-pass/skill.json");
  const spec = await readReplaySpec(replayPath);
  assert.ok(spec);
  const skill = JSON.parse(await readFile(skillPath, "utf8"));
  const result = evaluateReplaySpec(spec, skill);
  assert.equal(result.status, "passed");
  assert.deepEqual(result.coverage.parityCases, ["file_tool_roundtrip", "interruption", "shell_output", "skill_path"]);

  const cliResult = spawnSync(process.execPath, [cli, "replay", replayPath, "--json"], {
    cwd: resolve("."),
    encoding: "utf8",
  });
  assert.equal(cliResult.status, 0, cliResult.stderr);
  assert.deepEqual(JSON.parse(cliResult.stdout).replay.coverage.parityCases, result.coverage.parityCases);
});

test("replay spec read path rejects invalid fixture shape", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "codexus-replay-"));
  try {
    const replayPath = join(cwd, "replay.json");
    await writeFile(replayPath, `${JSON.stringify({
      schemaVersion: 1,
      skillId: "skill_bad",
      scenarios: [
        {
          id: "bad_case",
          driver: "mock",
          parityCase: "not_a_case",
          input: { task: "bad", files: [] },
          expected: { mentionsVerification: true, requiresTests: [], forbids: [] },
        },
      ],
    })}\n`);
    await assert.rejects(() => readReplaySpec(replayPath), /replay_schema_invalid/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
