import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const cli = resolve("src/cli/main.ts");

async function tempDir(): Promise<string> {
  return await mkdtemp(join(tmpdir(), "codexus-session-"));
}

function runCli(cwd: string, args: string[], env: Record<string, string> = {}) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

function markerCount(text: string, marker: string): number {
  return text.split(marker).length - 1;
}

test("setup codex-session installs a marker-bounded project overlay idempotently", async () => {
  const cwd = await tempDir();
  const codexHome = await tempDir();
  try {
    const agentsPath = join(cwd, "AGENTS.md");
    await writeFile(agentsPath, "# Existing guidance\n\nKeep this line.\n");
    const first = runCli(cwd, ["setup", "codex-session", "--scope", "project", "--json"], { CODEX_HOME: codexHome });
    assert.equal(first.status, 0, first.stderr);
    const firstOutput = JSON.parse(first.stdout);
    assert.equal(firstOutput.setup, "codex-session");
    assert.equal(firstOutput.scope, "project");
    assert.equal(firstOutput.overlay.changed, true);
    assert.equal(firstOutput.overlay.installed, true);
    assert.ok(existsSync(firstOutput.statePath));

    const second = runCli(cwd, ["setup", "codex-session", "--scope", "project", "--json"], { CODEX_HOME: codexHome });
    assert.equal(second.status, 0, second.stderr);
    const secondOutput = JSON.parse(second.stdout);
    assert.equal(secondOutput.overlay.changed, false);

    const agents = await readFile(agentsPath, "utf8");
    assert.match(agents, /Keep this line/);
    assert.equal(markerCount(agents, "<!-- CODEXUS:RUNTIME:START -->"), 1);
    assert.equal(markerCount(agents, "<!-- CODEXUS:RUNTIME:END -->"), 1);
  } finally {
    await rm(cwd, { recursive: true, force: true });
    await rm(codexHome, { recursive: true, force: true });
  }
});

test("session status reports initialized state and overlay status", async () => {
  const cwd = await tempDir();
  const codexHome = await tempDir();
  try {
    const setup = runCli(cwd, ["setup", "codex-session", "--scope", "project", "--json"], { CODEX_HOME: codexHome });
    assert.equal(setup.status, 0, setup.stderr);

    const status = runCli(cwd, ["session", "status", "--json"], { CODEX_HOME: codexHome });
    assert.equal(status.status, 0, status.stderr);
    const output = JSON.parse(status.stdout);
    assert.equal(output.status, "initialized");
    assert.equal(output.overlays.project.installed, true);
    assert.equal(output.state.status, "initialized");
    assert.ok(output.paths.state.endsWith(".codex-harness/session/state.json"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
    await rm(codexHome, { recursive: true, force: true });
  }
});

test("session checkpoint writes artifacts and updates session state", async () => {
  const cwd = await tempDir();
  const codexHome = await tempDir();
  try {
    const checkpoint = runCli(cwd, ["session", "checkpoint", "after design review", "--json"], { CODEX_HOME: codexHome });
    assert.equal(checkpoint.status, 0, checkpoint.stderr);
    const output = JSON.parse(checkpoint.stdout);
    assert.equal(output.checkpoint.label, "after design review");
    assert.ok(existsSync(output.checkpoint.path));
    assert.ok(existsSync(output.checkpoint.metadataPath));
    assert.equal(output.state.checkpoints.length, 1);
    assert.equal(output.state.checkpoints[0].id, output.checkpoint.id);
  } finally {
    await rm(cwd, { recursive: true, force: true });
    await rm(codexHome, { recursive: true, force: true });
  }
});

test("session verify records verification artifacts and state", async () => {
  const cwd = await tempDir();
  const codexHome = await tempDir();
  try {
    const verify = runCli(cwd, ["session", "verify", "--verify", "node -e \"console.log('session-ok')\"", "--json"], { CODEX_HOME: codexHome });
    assert.equal(verify.status, 0, verify.stderr);
    const output = JSON.parse(verify.stdout);
    assert.equal(output.verification.status, "passed");
    assert.equal(output.result.status, "passed");
    assert.ok(existsSync(output.verification.path));
    assert.ok(existsSync(join(output.verification.artifactsDir, "verify_001.stdout.log")));
    assert.equal(output.state.verifications.length, 1);
    const stdout = await readFile(join(output.verification.artifactsDir, "verify_001.stdout.log"), "utf8");
    assert.match(stdout, /session-ok/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
    await rm(codexHome, { recursive: true, force: true });
  }
});

test("session verify blocks dangerous verification commands", async () => {
  const cwd = await tempDir();
  const codexHome = await tempDir();
  try {
    const verify = runCli(cwd, ["session", "verify", "--verify", "rm -rf /", "--json"], { CODEX_HOME: codexHome });
    assert.equal(verify.status, 1);
    const output = JSON.parse(verify.stdout);
    assert.equal(output.verification.status, "blocked");
    assert.equal(output.policy.status, "blocked");
    assert.ok(output.policy.findings.some((finding: { code: string }) => finding.code === "dangerous_root_delete"));
    assert.ok(existsSync(output.verification.path));
    assert.equal(output.state.verifications[0].status, "blocked");
  } finally {
    await rm(cwd, { recursive: true, force: true });
    await rm(codexHome, { recursive: true, force: true });
  }
});
