import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
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
