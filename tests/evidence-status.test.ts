import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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

test("evidence check aggregates existing gates without becoming completion authority", async () => {
  const cwd = await tempDir();
  try {
    await writeFile(join(cwd, "package.json"), `${JSON.stringify({
      version: "0.0.0-test",
      scripts: { typecheck: "node -e \"process.exit(0)\"" },
      devDependencies: { typescript: "^5.0.0" },
    }, null, 2)}\n`);

    const result = runCli(cwd, ["evidence", "check", "--gate", "--json", "--timeout-ms", "10000"]);
    assert.equal(result.status, 1);
    const output = JSON.parse(result.stdout);
    assert.equal(output.command, "evidence check");
    assert.equal(output.stability, "experimental");
    assert.equal(output.gate.status, "failed");
    assert.equal(output.authority.sourceTruthAuthority, false);
    assert.equal(output.authority.healthAuthority, false);
    assert.equal(output.authority.cleanupAuthority, false);
    assert.equal(output.authority.completionAuthority, false);
    assert.deepEqual(output.surfaces.map((surface: { id: string }) => surface.id), ["repo", "wiki", "lsp", "release"]);
    assert.equal(output.surfaces.find((surface: { id: string }) => surface.id === "lsp").gate.status, "passed");
    assert.equal(output.evidenceGaps.some((gap: { source?: string }) => gap.source === "repo"), true);
    assert.equal(output.evidenceGaps.some((gap: { source?: string }) => gap.source === "wiki"), true);
    assert.equal(output.evidenceGaps.some((gap: { source?: string }) => gap.source === "release"), true);
    assert.equal(output.heuristicClaims.some((claim: { kind?: string }) => claim.kind === "evidence_check_is_aggregate_gate"), true);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("evidence export writes an explicit projection without source-truth authority", async () => {
  const cwd = await tempDir();
  try {
    await writeFile(join(cwd, "package.json"), `${JSON.stringify({
      version: "0.0.0-test",
      scripts: { typecheck: "node -e \"process.exit(0)\"" },
      devDependencies: { typescript: "^5.0.0" },
    }, null, 2)}\n`);

    const result = runCli(cwd, ["evidence", "export", "--target", "evidence-bundle", "--json", "--timeout-ms", "10000"]);
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.command, "evidence export");
    assert.equal(output.target, "evidence-bundle");
    assert.equal(output.gate.status, "not_requested");
    assert.equal(output.bundle.sourceTruthAuthority, false);
    assert.equal(output.bundle.completionAuthority, false);
    assert.equal(output.bundle.autoCommitted, false);
    assert.equal(output.authority.sourceTruthAuthority, false);
    assert.equal(output.authority.completionAuthority, false);
    const jsonPath = join(cwd, "evidence-bundle", "evidence.json");
    const markdownPath = join(cwd, "evidence-bundle", "evidence.md");
    assert.equal(existsSync(jsonPath), true);
    assert.equal(existsSync(markdownPath), true);
    const exportedJson = JSON.parse(await readFile(jsonPath, "utf8"));
    assert.equal(exportedJson.command, "evidence check");
    const markdown = await readFile(markdownPath, "utf8");
    assert.match(markdown, /Codexus Evidence Bundle/);
    assert.match(markdown, /not source truth/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
