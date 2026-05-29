import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const cli = resolve("src/cli/main.ts");

test("doctor reports selected driver capabilities", () => {
  const result = spawnSync(process.execPath, [cli, "doctor", "--json"], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.ok, true);
  assert.equal(output.driverProbe.capabilities.supportsJsonl, true);
  assert.equal(typeof output.driverProbe.capabilities.supportsApprovalFlag, "boolean");
  assert.ok(output.checks.some((check: { id: string }) => check.id === "driver.codex-exec"));
});
