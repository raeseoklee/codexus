import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runPolicyPreflight } from "../src/policy/preflight.ts";

async function tempDir(): Promise<string> {
  return await mkdtemp(join(tmpdir(), "chx-policy-"));
}

test("policy preflight blocks destructive verification commands", async () => {
  const cwd = await tempDir();
  try {
    const result = runPolicyPreflight({
      cwd,
      prompt: "verify cleanup",
      verificationCommands: ["rm -rf /"],
    });
    assert.equal(result.status, "blocked");
    assert.ok(result.findings.some((finding) => finding.code === "dangerous_root_delete"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
