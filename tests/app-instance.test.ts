import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
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

function parseJson(result: ReturnType<typeof runCli>) {
  return JSON.parse(result.stdout);
}

async function tempDir(): Promise<string> {
  return await mkdtemp(join(tmpdir(), "codexus-app-instance-test-"));
}

async function writeServer(cwd: string): Promise<string> {
  const path = join(cwd, "server.mjs");
  await writeFile(path, `#!/usr/bin/env node
import http from "node:http";

const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 0);

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  res.writeHead(200, { "content-type": "text/plain" });
  res.end("ok");
});

server.listen(port, host, () => {
  const address = server.address();
  const actualPort = address && typeof address !== "string" ? address.port : port;
  console.log(\`listening \${host}:\${actualPort}\`);
  console.error("stderr ready");
});

function shutdown() {
  server.close(() => process.exit(0));
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
`);
  return path;
}

async function writeDescriptor(cwd: string, command: string[]): Promise<string> {
  const path = join(cwd, "codexus.app-instances.json");
  await writeFile(path, `${JSON.stringify({
    schemaVersion: 1,
    stability: "experimental",
    profiles: [
      {
        name: "web",
        cwd: ".",
        command,
        port: { mode: "allocate", preferred: 5173 },
        health: { type: "http", url: "http://127.0.0.1:{port}/health", timeoutMs: 2000 },
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
      runnerStartMarker: "Fri Jun  2 12:00:00 2026",
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
      url: "http://127.0.0.1:5173/health",
      timeoutMs: 2000,
    },
    logs: { stdoutPath, stderrPath },
    status: "running",
  };
  const path = join(dir, "instance.json");
  await writeFile(path, `${JSON.stringify(artifact, null, 2)}\n`);
  return path;
}

async function waitFor(condition: () => Promise<boolean>, timeoutMs = 5_000, intervalMs = 100): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await condition()) return;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error("wait_for_timeout");
}

async function cleanupInstances(cwd: string): Promise<void> {
  const root = join(cwd, ".codexus", "app-instances");
  if (!existsSync(root)) return;
  const entries = await readdir(root);
  for (const entry of entries) {
    const artifactPath = join(root, entry, "instance.json");
    if (!existsSync(artifactPath)) continue;
    try {
      const artifact = JSON.parse(await readFile(artifactPath, "utf8")) as {
        owner?: { pid?: number | null; processGroupId?: number | null };
      };
      const processGroupId = artifact.owner?.processGroupId ?? null;
      const pid = artifact.owner?.pid ?? null;
      if (processGroupId && process.platform !== "win32") {
        try {
          process.kill(-processGroupId, "SIGKILL");
        } catch {}
      } else if (pid) {
        try {
          process.kill(pid, "SIGKILL");
        } catch {}
      }
    } catch {}
  }
}

test("app instance profile list reads descriptor and advertises live ownership support", async () => {
  const cwd = await tempDir();
  try {
    const serverPath = await writeServer(cwd);
    const descriptorPath = await writeDescriptor(cwd, [process.execPath, serverPath]);
    const result = runCli(cwd, ["app", "instance", "profile", "list", "--descriptor", descriptorPath, "--json"]);
    assert.equal(result.status, 0, result.stderr);
    const output = parseJson(result);
    assert.equal(output.stability, "experimental");
    assert.equal(output.descriptor.valid, true);
    assert.equal(output.profiles.length, 1);
    assert.equal(output.capabilities.liveStart, true);
    assert.equal(output.capabilities.liveStop, true);

    const schema = runCli(cwd, ["schema", "validate", "--type", "app-instance-descriptor", "--file", descriptorPath, "--json"]);
    assert.equal(schema.status, 0, schema.stderr);
    assert.equal(parseJson(schema).ok, true);
  } finally {
    await cleanupInstances(cwd);
    await rm(cwd, { recursive: true, force: true });
  }
});

test("app instance start dry-run resolves worktree plan without spawning", async () => {
  const cwd = await tempDir();
  try {
    const serverPath = await writeServer(cwd);
    const descriptorPath = await writeDescriptor(cwd, [process.execPath, serverPath]);
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
    const output = parseJson(result);
    assert.equal(output.mode, "dry-run");
    assert.equal(output.spawned, false);
    assert.equal(output.status, "planned");
    assert.equal(output.launchPlan.port, 5173);
    assert.equal(output.capabilities.liveStart, true);
    assert.equal(existsSync(output.wouldWrite.instancePath), false);
  } finally {
    await cleanupInstances(cwd);
    await rm(cwd, { recursive: true, force: true });
  }
});

test("app instance status does not promote passed health when the process is not running", async () => {
  const cwd = await tempDir();
  try {
    const artifactPath = await writeInstance(cwd, "app_test");
    const schema = runCli(cwd, ["schema", "validate", "--type", "app-instance", "--file", artifactPath, "--json"]);
    assert.equal(schema.status, 0, schema.stderr);
    const result = runCli(cwd, ["app", "instance", "status", "--instance-id", "app_test", "--json"]);
    assert.equal(result.status, 0, result.stderr);
    const output = parseJson(result);
    assert.equal(output.instances.length, 1);
    assert.equal(output.instances[0].health.rawStatus, "passed");
    assert.equal(output.instances[0].health.status, "unknown");
    assert.equal(output.instances[0].health.reason, "process_not_running");
    assert.equal(output.instances[0].process.status, "orphaned");
  } finally {
    await cleanupInstances(cwd);
    await rm(cwd, { recursive: true, force: true });
  }
});

test("app instance live start, status, logs, and stop manage one owned process per worktree", async () => {
  const cwd = await tempDir();
  try {
    const serverPath = await writeServer(cwd);
    const descriptorPath = await writeDescriptor(cwd, [process.execPath, serverPath]);

    const start = runCli(cwd, [
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
    assert.equal(start.status, 0, start.stderr);
    const started = parseJson(start);
    assert.equal(started.mode, "live");
    assert.equal(started.spawned, true);
    assert.equal(started.owned, true);
    assert.equal(started.status, "started");
    const instanceId = started.launch.instanceId;

    await waitFor(async () => {
      const status = runCli(cwd, ["app", "instance", "status", "--instance-id", instanceId, "--json"]);
      if (status.status !== 0) return false;
      const output = parseJson(status);
      return output.instances[0]?.process?.status === "running" && output.instances[0]?.health?.status === "passed";
    });

    const duplicate = runCli(cwd, [
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
    assert.equal(duplicate.status, 1);
    assert.equal(parseJson(duplicate).code, "app_instance_profile_already_running");

    const logs = runCli(cwd, ["app", "instance", "logs", "--instance-id", instanceId, "--tail", "20", "--json"]);
    assert.equal(logs.status, 0, logs.stderr);
    const logOutput = parseJson(logs);
    assert.ok(logOutput.stdout.lines.some((line: string) => line.includes("listening 127.0.0.1:")));
    assert.ok(logOutput.stderr.lines.some((line: string) => line.includes("stderr ready")));

    const stop = runCli(cwd, ["app", "instance", "stop", "--instance-id", instanceId, "--json"]);
    assert.equal(stop.status, 0, stop.stderr);
    const stopped = parseJson(stop);
    assert.equal(stopped.status, "stopped");
    assert.equal(stopped.stopped, true);

    await waitFor(async () => {
      const status = runCli(cwd, ["app", "instance", "status", "--instance-id", instanceId, "--json"]);
      if (status.status !== 0) return false;
      const output = parseJson(status);
      return output.instances[0]?.process?.status === "stopped";
    });
  } finally {
    await cleanupInstances(cwd);
    await rm(cwd, { recursive: true, force: true });
  }
});

test("app instance stop refuses unverifiable owner identity even when the process is still live", async () => {
  const cwd = await tempDir();
  try {
    const serverPath = await writeServer(cwd);
    const descriptorPath = await writeDescriptor(cwd, [process.execPath, serverPath]);

    const start = runCli(cwd, [
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
    assert.equal(start.status, 0, start.stderr);
    const started = parseJson(start);
    const instanceId = started.launch.instanceId;
    const artifactPath = join(cwd, ".codexus", "app-instances", instanceId, "instance.json");

    await waitFor(async () => {
      const status = runCli(cwd, ["app", "instance", "status", "--instance-id", instanceId, "--json"]);
      if (status.status !== 0) return false;
      const output = parseJson(status);
      return output.instances[0]?.process?.status === "running";
    });

    const artifact = JSON.parse(await readFile(artifactPath, "utf8"));
    artifact.owner.runnerStartMarker = "tampered-start-marker";
    await writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`);

    const stop = runCli(cwd, ["app", "instance", "stop", "--instance-id", instanceId, "--json"]);
    assert.equal(stop.status, 1, stop.stderr);
    const output = parseJson(stop);
    assert.equal(output.status, "unavailable");
    assert.equal(output.reason, "owner_identity_unverifiable");
  } finally {
    await cleanupInstances(cwd);
    await rm(cwd, { recursive: true, force: true });
  }
});
