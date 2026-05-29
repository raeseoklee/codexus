import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(".");
const wrapper = resolve("codex/skills/codexus/scripts/cx.mjs");

async function tempDir(): Promise<string> {
  return await mkdtemp(join(tmpdir(), "codexus-adapter-"));
}

test("codexus skill wrapper discovers repository root from repo cwd", () => {
  const result = spawnSync(process.execPath, [wrapper, "--print-root"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), root);
});

test("codexus skill wrapper honors CODEXUS_HOME outside the repo", async () => {
  const cwd = await tempDir();
  try {
    const result = spawnSync(process.execPath, [wrapper, "--print-root"], {
      cwd,
      encoding: "utf8",
      env: { ...process.env, CODEXUS_HOME: root },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), root);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
