import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
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
  return await mkdtemp(join(tmpdir(), "codexus-app-instance-test-"));
}

async function writeDescriptor(cwd: string): Promise<string> {
  const path = join(cwd, "codexus.app-instances.json");
  await writeFile(path, `${JSON.stringify({
    schemaVersion: 1,
    stability: "experimental",
    profiles: [
      {
        name: "web",
        cwd: ".",
        command: ["npm", "run", "dev", "--", "--host", "127.0.0.1"],
        port: { mode: "allocate", preferred: 5173 },
        health: { type: "http", url: "http://127.0.0.1:{port}/", timeoutMs: 2000 },
        log: { stdout: true, stderr: true },
      },
    ],
  }, null, 2)}\n`);
  return path;
}

async function writeInstance(cwd: string, instanceId: string, healthEvidencePath: string | null = null): Promise<string> {
  const dir = join(cwd, ".codexus", "app-instances", instanceId);
  await mkdir(dir, { recursive: true });
  const stdoutPath = join(dir, "stdout.log");
  const stderrPath = join(dir, "stderr.log");
  await writeFile(stdoutPath, "one\ntwo\nthree\n");
  await writeFile(stderrPath, "err-one\nerr-two\n");
  const artifact = {
    schemaVersion: 1,
    stability: "experimental",
    type: "codexus.app.instance",
    instanceId,
    worktree: { path: cwd, branch: null, head: null },
    profile: "web",
    owner: {
      ownedByCodexus: true,
      ownerTokenHash: "sha256:test",
      pid: 123,
      processGroupId: 123,
      heartbeatPath: join(dir, "heartbeat.json"),
    },
    network: {
      host: "127.0.0.1",
      port: 5173,
      url: "http://127.0.0.1:5173/",
    },
    health: {
      status: "passed",
      lastCheckedAt: "2026-06-02T00:00:00.000Z",
      evidencePath: healthEvidencePath,
    },
    logs: { stdoutPath, stderrPath },
    status: "running",
  };
  const path = join(dir, "instance.json");
  await writeFile(path, `${JSON.stringify(artifact, null, 2)}\n`);
  return path;
}

test("app instance profile list reads descriptor without claiming live control", async () => {
  const cwd = await tempDir();
  try {
    const descriptorPath = await writeDescriptor(cwd);
    const result = runCli(cwd, ["app", "instance", "profile", "list", "--descriptor", descriptorPath, "--json"]);
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.stability, "experimental");
    assert.equal(output.descriptor.valid, true);
    assert.equal(output.profiles.length, 1);
    assert.equal(output.capabilities.liveStart, false);
    assert.equal(output.capabilities.liveStop, false);

    const schema = runCli(cwd, ["schema", "validate", "--type", "app-instance-descriptor", "--file", descriptorPath, "--json"]);
    assert.equal(schema.status, 0, schema.stderr);
    assert.equal(JSON.parse(schema.stdout).ok, true);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("app instance start dry-run resolves worktree plan without spawning", async () => {
  const cwd = await tempDir();
  try {
    const descriptorPath = await writeDescriptor(cwd);
    const result = runCli(cwd, [
      "app",
      "instance",
      "start",
      "--descriptor",
      descriptorPath,
      "--profile",
      "web",
      "--worktree",
      cwd,
      "--dry-run",
      "--json",
    ]);
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.mode, "dry-run");
    assert.equal(output.spawned, false);
    assert.equal(output.status, "planned");
    assert.equal(output.launchPlan.port, 5173);
    assert.equal(output.launchPlan.portCheck.status, "not_checked");
    assert.equal(output.capabilities.liveStart, false);
    assert.equal(existsSync(output.wouldWrite.instancePath), false);

    const live = runCli(cwd, [
      "app",
      "instance",
      "start",
      "--descriptor",
      descriptorPath,
      "--profile",
      "web",
      "--worktree",
      cwd,
      "--json",
    ]);
    assert.equal(live.status, 1);
    assert.equal(JSON.parse(live.stdout).code, "unsupported_feature");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("app instance status refuses to promote healthy without evidence", async () => {
  const cwd = await tempDir();
  try {
    const artifactPath = await writeInstance(cwd, "app_test");
    const schema = runCli(cwd, ["schema", "validate", "--type", "app-instance", "--file", artifactPath, "--json"]);
    assert.equal(schema.status, 0, schema.stderr);
    const result = runCli(cwd, ["app", "instance", "status", "--instance-id", "app_test", "--json"]);
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.instances.length, 1);
    assert.equal(output.instances[0].health.rawStatus, "passed");
    assert.equal(output.instances[0].health.status, "unknown");
    assert.equal(output.instances[0].health.reason, "passed_health_requires_existing_evidence_artifact");
    assert.equal(output.instances[0].process.status, "unknown");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("app instance status accepts passed health only with local evidence", async () => {
  const cwd = await tempDir();
  try {
    const evidencePath = join(cwd, ".codexus", "app-instances", "app_test", "health.json");
    await mkdir(join(cwd, ".codexus", "app-instances", "app_test"), { recursive: true });
    await writeFile(evidencePath, "{\"ok\":true}\n");
    await writeInstance(cwd, "app_test", evidencePath);
    const result = runCli(cwd, ["app", "instance", "status", "--instance-id", "app_test", "--json"]);
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.instances[0].health.status, "passed");
    assert.equal(output.instances[0].health.evidenceExists, true);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("app instance logs tail bounded stdout and stderr", async () => {
  const cwd = await tempDir();
  try {
    await writeInstance(cwd, "app_test", null);
    const result = runCli(cwd, ["app", "instance", "logs", "--instance-id", "app_test", "--tail", "2", "--json"]);
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.deepEqual(output.stdout.lines, ["two", "three"]);
    assert.deepEqual(output.stderr.lines, ["err-one", "err-two"]);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("app instance stop remains unavailable before live ownership slice", async () => {
  const cwd = await tempDir();
  try {
    await writeInstance(cwd, "app_test", null);
    const result = runCli(cwd, ["app", "instance", "stop", "--instance-id", "app_test", "--json"]);
    assert.equal(result.status, 1);
    const output = JSON.parse(result.stdout);
    assert.equal(output.status, "unavailable");
    assert.equal(output.stopped, false);
    assert.equal(output.capabilities.liveStop, false);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
