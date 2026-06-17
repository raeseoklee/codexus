import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const cli = resolve("src/cli/main.ts");

function runCli(cwd: string, args: string[]) {
  return spawnSync(process.execPath, [cli, ...args, "--cwd", cwd], {
    cwd: resolve("."),
    encoding: "utf8",
  });
}

async function tempDir(): Promise<string> {
  return await mkdtemp(join(tmpdir(), "codexus-evidence-status-test-"));
}

test("evidence status aggregates app wiki and lsp evidence without authority", async () => {
  const cwd = await tempDir();
  try {
    await writeFile(join(cwd, "package.json"), `${JSON.stringify({
      scripts: { typecheck: "node -e \"process.exit(0)\"" },
      devDependencies: { typescript: "^5.0.0" },
    }, null, 2)}\n`);
    const appDir = join(cwd, ".codexus", "app-instances", "app_test");
    await mkdir(appDir, { recursive: true });
    await writeFile(join(appDir, "instance.json"), `${JSON.stringify({
      schemaVersion: 1,
      stability: "experimental",
      type: "codexus.app.instance",
      instanceId: "app_test",
      worktree: { path: cwd, branch: null, head: null },
      profile: "web",
      owner: {
        ownedByCodexus: true,
        ownerTokenHash: "sha256:test",
        pid: 123,
        processGroupId: 123,
        runnerStartMarker: null,
        heartbeatPath: join(appDir, "heartbeat.json"),
      },
      network: { host: "127.0.0.1", port: 5173, url: "http://127.0.0.1:5173/" },
      health: { status: "unknown", lastCheckedAt: null, evidencePath: null, url: null, timeoutMs: null },
      logs: { stdoutPath: null, stderrPath: null },
      status: "running",
    }, null, 2)}\n`);

    const result = runCli(cwd, ["evidence", "status", "--json"]);
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.command, "evidence status");
    assert.equal(output.stability, "experimental");
    assert.equal(output.status, "findings");
    assert.equal(output.surfaces.appInstances.instances.total, 1);
    assert.equal(output.surfaces.wiki.evidenceGapCount > 0, true);
    assert.equal(output.surfaces.wiki.completionAuthority, false);
    assert.equal(output.surfaces.lsp.startsLanguageServer, false);
    assert.equal(output.surfaces.lsp.completionAuthority, false);
    assert.equal(output.authority.controlsInstance, false);
    assert.equal(output.authority.healthAuthority, false);
    assert.equal(output.authority.cleanupAuthority, false);
    assert.equal(output.authority.sourceTruthAuthority, false);
    assert.equal(output.authority.completionAuthority, false);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
