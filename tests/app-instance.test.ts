import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
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
  if (req.url === "/secret") {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("probe ok token=secret-value");
    return;
  }
  res.writeHead(200, { "content-type": "text/plain" });
  res.end("ok");
});

server.listen(port, host, () => {
  const address = server.address();
  const actualPort = address && typeof address !== "string" ? address.port : port;
  console.log(\`listening \${host}:\${actualPort}\`);
  console.log("startup token=secret-value");
  console.error("stderr ready");
  console.error("stderr password=hunter2");
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

async function writeHeartbeat(cwd: string, instanceId: string, heartbeat: Record<string, unknown>): Promise<string> {
  const path = join(cwd, ".codexus", "app-instances", instanceId, "heartbeat.json");
  await writeFile(path, `${JSON.stringify({
    schemaVersion: 1,
    type: "codexus.app.instance.heartbeat",
    instanceId,
    ownerTokenHash: "sha256:test",
    runnerPid: 123,
    runnerStartMarker: null,
    appPid: null,
    updatedAt: new Date().toISOString(),
    status: "running",
    exitCode: null,
    signal: null,
    ...heartbeat,
  }, null, 2)}\n`);
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
    assert.equal(output.instances[0].process.reason, "pid_dead");
    assert.equal(output.instances[0].process.lifecycle.state, "orphaned_dead_artifact");
    assert.equal(output.instances[0].process.lifecycle.cleanupPolicy, "manual_review");
    assert.equal(output.instances[0].process.lifecycle.cleanupAuthority, false);
    assert.equal(output.instances[0].process.lifecycle.stopPolicy, "unavailable");
    assert.equal(output.instances[0].process.lifecycle.healthAuthority, false);
    assert.equal(output.instances[0].process.lifecycle.completionAuthority, false);
  } finally {
    await cleanupInstances(cwd);
    await rm(cwd, { recursive: true, force: true });
  }
});

test("app instance status surfaces stale live heartbeats as orphaned without cleanup authority", async () => {
  const cwd = await tempDir();
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
  try {
    assert.ok(child.pid);
    const artifactPath = await writeInstance(cwd, "app_test");
    const artifact = JSON.parse(await readFile(artifactPath, "utf8"));
    artifact.owner.pid = child.pid;
    artifact.owner.processGroupId = null;
    artifact.owner.runnerStartMarker = null;
    await writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`);
    await writeHeartbeat(cwd, "app_test", {
      runnerPid: child.pid,
      appPid: child.pid,
      updatedAt: new Date(Date.now() - 60_000).toISOString(),
    });

    const result = runCli(cwd, ["app", "instance", "status", "--instance-id", "app_test", "--json"]);
    assert.equal(result.status, 0, result.stderr);
    const output = parseJson(result);
    const instance = output.instances[0];
    assert.equal(instance.process.status, "orphaned");
    assert.equal(instance.process.reason, "heartbeat_stale");
    assert.equal(instance.process.heartbeatFresh, false);
    assert.ok(instance.process.heartbeatAgeMs >= 8_000);
    assert.equal(instance.process.heartbeatStaleAfterMs, 8_000);
    assert.equal(instance.process.lifecycle.state, "orphaned_live_process");
    assert.equal(instance.process.lifecycle.stale, true);
    assert.equal(instance.process.lifecycle.staleReason, "heartbeat_stale");
    assert.equal(instance.process.lifecycle.cleanupPolicy, "manual_review");
    assert.equal(instance.process.lifecycle.cleanupAuthority, false);
    assert.equal(instance.process.lifecycle.stopPolicy, "unavailable");
    assert.equal(instance.process.lifecycle.healthAuthority, false);
    assert.equal(instance.health.status, "unknown");
    assert.equal(instance.heartbeat.fresh, false);
    assert.ok(instance.heartbeat.ageMs >= 8_000);
  } finally {
    child.kill("SIGKILL");
    await cleanupInstances(cwd);
    await rm(cwd, { recursive: true, force: true });
  }
});

test("app instance evidence records observation without promoting control or health", async () => {
  const cwd = await tempDir();
  try {
    await writeInstance(cwd, "app_test");
    const evidencePath = join(cwd, "screenshot.txt");
    await writeFile(evidencePath, "fake screenshot evidence\n");

    const record = runCli(cwd, [
      "app",
      "instance",
      "evidence",
      "record",
      "--instance-id",
      "app_test",
      "--kind",
      "browser",
      "--source",
      "manual-smoke",
      "--url",
      "http://127.0.0.1:5173/",
      "--evidence-path",
      evidencePath,
      "--summary",
      "browser reached target",
      "--json",
    ]);
    assert.equal(record.status, 0, record.stderr);
    const output = parseJson(record);
    assert.equal(output.observation.instance.instanceId, "app_test");
    assert.equal(output.observation.observation.kind, "browser");
    assert.equal(output.observation.observation.status, "unavailable");
    assert.equal(output.observation.observation.reason, "instance_not_running:pid_dead");
    assert.equal(output.observation.authority.controlsInstance, false);
    assert.equal(output.observation.authority.healthAuthority, false);
    assert.equal(output.observation.authority.completionAuthority, false);

    const schema = runCli(cwd, ["schema", "validate", "--type", "app-instance-observation", "--file", output.path, "--json"]);
    assert.equal(schema.status, 0, schema.stderr);
    assert.equal(parseJson(schema).ok, true);

    const list = runCli(cwd, ["app", "instance", "evidence", "list", "--instance-id", "app_test", "--json"]);
    assert.equal(list.status, 0, list.stderr);
    const listed = parseJson(list);
    assert.equal(listed.observations.length, 1);
    assert.equal(listed.authority.completionAuthority, false);
  } finally {
    await cleanupInstances(cwd);
    await rm(cwd, { recursive: true, force: true });
  }
});

test("app instance HTTP probe records bounded redacted evidence for a running owned instance", async () => {
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

    await waitFor(async () => {
      const status = runCli(cwd, ["app", "instance", "status", "--instance-id", instanceId, "--json"]);
      if (status.status !== 0) return false;
      const output = parseJson(status);
      return output.instances[0]?.process?.status === "running" && output.instances[0]?.health?.status === "passed";
    });

    const probe = runCli(cwd, [
      "app",
      "instance",
      "evidence",
      "probe",
      "--instance-id",
      instanceId,
      "--url",
      `${started.launch.url}secret`,
      "--timeout-ms",
      "2000",
      "--json",
    ]);
    assert.equal(probe.status, 0, probe.stderr);
    const output = parseJson(probe);
    assert.equal(output.command, "app instance evidence probe");
    assert.equal(output.stability, "experimental");
    assert.equal(output.probe.status, "observed");
    assert.equal(output.probe.controlsInstance, false);
    assert.equal(output.probe.healthAuthority, false);
    assert.equal(output.probe.completionAuthority, false);
    assert.equal(output.observation.observation.kind, "dev-server");
    assert.equal(output.observation.observation.status, "observed");
    assert.equal(output.observation.observation.summary, "http_200");
    assert.equal(output.observation.authority.controlsInstance, false);
    assert.equal(output.observation.authority.healthAuthority, false);
    assert.equal(output.observation.authority.completionAuthority, false);

    const probeEvidence = JSON.parse(await readFile(output.probe.evidencePath, "utf8"));
    assert.equal(probeEvidence.status, "observed");
    assert.equal(probeEvidence.statusCode, 200);
    assert.equal(probeEvidence.body.truncated, false);
    assert.match(probeEvidence.body.preview, /\[REDACTED:possible-secret\]/);
    assert.doesNotMatch(probeEvidence.body.preview, /secret-value/);
    assert.equal(probeEvidence.authority.controlsInstance, false);
    assert.equal(probeEvidence.authority.healthAuthority, false);
    assert.equal(probeEvidence.authority.completionAuthority, false);

    const schema = runCli(cwd, ["schema", "validate", "--type", "app-instance-observation", "--file", output.path, "--json"]);
    assert.equal(schema.status, 0, schema.stderr);
    assert.equal(parseJson(schema).ok, true);

    const list = runCli(cwd, ["app", "instance", "evidence", "list", "--instance-id", instanceId, "--json"]);
    assert.equal(list.status, 0, list.stderr);
    const listed = parseJson(list);
    assert.equal(listed.observations.length, 1);
    assert.equal(listed.observations[0].observation.summary, "http_200");
  } finally {
    await cleanupInstances(cwd);
    await rm(cwd, { recursive: true, force: true });
  }
});

test("app instance log evidence records a redacted snapshot without authority", async () => {
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

    await waitFor(async () => {
      const status = runCli(cwd, ["app", "instance", "status", "--instance-id", instanceId, "--json"]);
      if (status.status !== 0) return false;
      const output = parseJson(status);
      return output.instances[0]?.process?.status === "running";
    });

    const logs = runCli(cwd, [
      "app",
      "instance",
      "evidence",
      "logs",
      "--instance-id",
      instanceId,
      "--tail",
      "20",
      "--json",
    ]);
    assert.equal(logs.status, 0, logs.stderr);
    const output = parseJson(logs);
    assert.equal(output.command, "app instance evidence logs");
    assert.equal(output.stability, "experimental");
    assert.equal(output.logSnapshot.status, "observed");
    assert.equal(output.logSnapshot.controlsInstance, false);
    assert.equal(output.logSnapshot.healthAuthority, false);
    assert.equal(output.logSnapshot.completionAuthority, false);
    assert.equal(output.observation.observation.kind, "log");
    assert.equal(output.observation.observation.source, "log-snapshot");
    assert.equal(output.observation.authority.controlsInstance, false);
    assert.equal(output.observation.authority.healthAuthority, false);
    assert.equal(output.observation.authority.completionAuthority, false);

    const logEvidence = JSON.parse(await readFile(output.logSnapshot.evidencePath, "utf8"));
    assert.equal(logEvidence.type, "codexus.app.instance.log-snapshot");
    assert.equal(logEvidence.status, "observed");
    assert.equal(logEvidence.authority.controlsInstance, false);
    assert.equal(logEvidence.authority.healthAuthority, false);
    assert.equal(logEvidence.authority.completionAuthority, false);
    assert.ok(logEvidence.stdout.lines.some((line: string) => line.includes("[REDACTED:possible-secret]")));
    assert.ok(logEvidence.stderr.lines.some((line: string) => line.includes("[REDACTED:possible-secret]")));
    assert.doesNotMatch(JSON.stringify(logEvidence), /secret-value|hunter2/);

    const schema = runCli(cwd, ["schema", "validate", "--type", "app-instance-observation", "--file", output.path, "--json"]);
    assert.equal(schema.status, 0, schema.stderr);
    assert.equal(parseJson(schema).ok, true);
  } finally {
    await cleanupInstances(cwd);
    await rm(cwd, { recursive: true, force: true });
  }
});

test("app instance HTTP probe does not request when the instance is not running", async () => {
  const cwd = await tempDir();
  try {
    await writeInstance(cwd, "app_test");

    const probe = runCli(cwd, [
      "app",
      "instance",
      "evidence",
      "probe",
      "--instance-id",
      "app_test",
      "--url",
      "http://127.0.0.1:5173/",
      "--json",
    ]);
    assert.equal(probe.status, 0, probe.stderr);
    const output = parseJson(probe);
    assert.equal(output.probe.status, "unavailable");
    assert.equal(output.observation.observation.status, "unavailable");
    assert.equal(output.observation.observation.reason, "instance_not_running:pid_dead");
    assert.equal(output.observation.authority.controlsInstance, false);
    assert.equal(output.observation.authority.healthAuthority, false);
    assert.equal(output.observation.authority.completionAuthority, false);

    const probeEvidence = JSON.parse(await readFile(output.probe.evidencePath, "utf8"));
    assert.equal(probeEvidence.status, "unavailable");
    assert.equal(probeEvidence.requestAttempted, false);
    assert.equal(probeEvidence.authority.controlsInstance, false);
    assert.equal(probeEvidence.authority.healthAuthority, false);
    assert.equal(probeEvidence.authority.completionAuthority, false);
  } finally {
    await cleanupInstances(cwd);
    await rm(cwd, { recursive: true, force: true });
  }
});

test("app instance HTTP probe rejects non-loopback URLs", async () => {
  const cwd = await tempDir();
  try {
    await writeInstance(cwd, "app_test");
    const probe = runCli(cwd, [
      "app",
      "instance",
      "evidence",
      "probe",
      "--instance-id",
      "app_test",
      "--url",
      "https://example.com/",
      "--json",
    ]);
    assert.equal(probe.status, 1);
    assert.equal(parseJson(probe).code, "invalid_app_instance_probe_url");
  } finally {
    await cleanupInstances(cwd);
    await rm(cwd, { recursive: true, force: true });
  }
});

test("app instance HTTP probe rejects unbounded timeout values", async () => {
  const cwd = await tempDir();
  try {
    await writeInstance(cwd, "app_test");
    const probe = runCli(cwd, [
      "app",
      "instance",
      "evidence",
      "probe",
      "--instance-id",
      "app_test",
      "--url",
      "http://127.0.0.1:5173/",
      "--timeout-ms",
      "30001",
      "--json",
    ]);
    assert.equal(probe.status, 1);
    assert.equal(parseJson(probe).code, "invalid_app_instance_probe_timeout");
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
