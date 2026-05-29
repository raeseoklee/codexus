import test from "node:test";
import assert from "node:assert/strict";
import { buildOmxStatus, detectFeature } from "../src/adapters/omx.ts";

test("detectFeature finds command names in help text", () => {
  const help = "Usage:\n  omx explore\n  omx sparkshell <command>\n";
  assert.equal(detectFeature(help, "explore"), true);
  assert.equal(detectFeature(help, "team"), false);
});

test("buildOmxStatus warns for older researched baseline", () => {
  const status = buildOmxStatus("oh-my-codex v0.11.9", "  omx explore\n  omx team\n");
  assert.equal(status.available, true);
  assert.equal(status.version, "0.11.9");
  assert.equal(status.features.explore, true);
  assert.equal(status.features.team, true);
  assert.equal(status.warnings[0].code, "omx_older_than_research_baseline");
});
