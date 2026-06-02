#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createWriteStream, existsSync } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function ensureDir(path) {
  await mkdir(path, { recursive: true });
}

async function writeJsonAtomic(path, value) {
  await ensureDir(dirname(path));
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`);
  await rename(tmp, path);
}

function pidLive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return isRecord(error) && error.code === "EPERM";
  }
}

function nowIso() {
  return new Date().toISOString();
}

async function readProcessStartMarker(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return null;
  return await new Promise((resolve) => {
    const probe = spawn("ps", ["-o", "lstart=", "-p", String(pid)], {
      stdio: ["ignore", "pipe", "ignore"],
    });
    const chunks = [];
    probe.stdout.on("data", (chunk) => chunks.push(chunk));
    probe.on("close", (code) => {
      if (code !== 0) {
        resolve(null);
        return;
      }
      const output = Buffer.concat(chunks).toString("utf8").trim();
      resolve(output.length > 0 ? output : null);
    });
    probe.on("error", () => resolve(null));
  });
}

function readConfig(value) {
  if (!isRecord(value)) throw new Error("config_not_object");
  if (value.schemaVersion !== 1) throw new Error("config_schema_invalid");
  if (!Array.isArray(value.command) || value.command.some((item) => typeof item !== "string" || item.trim() === "")) {
    throw new Error("config_command_invalid");
  }
  if (typeof value.cwd !== "string" || !value.cwd) throw new Error("config_cwd_invalid");
  if (typeof value.instanceId !== "string" || !value.instanceId) throw new Error("config_instance_id_invalid");
  if (typeof value.worktreePath !== "string" || !value.worktreePath) throw new Error("config_worktree_invalid");
  if (typeof value.artifactPath !== "string" || !value.artifactPath) throw new Error("config_artifact_path_invalid");
  if (typeof value.heartbeatPath !== "string" || !value.heartbeatPath) throw new Error("config_heartbeat_path_invalid");
  if (typeof value.resultPath !== "string" || !value.resultPath) throw new Error("config_result_path_invalid");
  if (typeof value.ownerTokenHash !== "string" || !value.ownerTokenHash) throw new Error("config_owner_token_hash_invalid");
  if (typeof value.profile !== "string" || !value.profile) throw new Error("config_profile_invalid");
  if (!isRecord(value.network)) throw new Error("config_network_invalid");
  if (value.network.host !== "127.0.0.1") throw new Error("config_network_host_invalid");
  if (!(value.network.port === null || Number.isInteger(value.network.port))) throw new Error("config_network_port_invalid");
  if (!(value.network.url === null || typeof value.network.url === "string")) throw new Error("config_network_url_invalid");
  if (!isRecord(value.health)) throw new Error("config_health_invalid");
  if (!(value.health.url === null || typeof value.health.url === "string")) throw new Error("config_health_url_invalid");
  if (!(value.health.timeoutMs === null || Number.isInteger(value.health.timeoutMs))) throw new Error("config_health_timeout_invalid");
  if (!isRecord(value.logs)) throw new Error("config_logs_invalid");
  if (!(value.logs.stdoutPath === null || typeof value.logs.stdoutPath === "string")) throw new Error("config_stdout_path_invalid");
  if (!(value.logs.stderrPath === null || typeof value.logs.stderrPath === "string")) throw new Error("config_stderr_path_invalid");
  if (!(value.env === null || isRecord(value.env))) throw new Error("config_env_invalid");
  return {
    schemaVersion: 1,
    command: value.command,
    cwd: value.cwd,
    instanceId: value.instanceId,
    worktreePath: value.worktreePath,
    worktreeBranch: typeof value.worktreeBranch === "string" ? value.worktreeBranch : null,
    worktreeHead: typeof value.worktreeHead === "string" ? value.worktreeHead : null,
    profile: value.profile,
    artifactPath: value.artifactPath,
    heartbeatPath: value.heartbeatPath,
    resultPath: value.resultPath,
    ownerTokenHash: value.ownerTokenHash,
    network: {
      host: "127.0.0.1",
      port: value.network.port === null ? null : value.network.port,
      url: value.network.url === null ? null : value.network.url,
    },
    health: {
      url: value.health.url === null ? null : value.health.url,
      timeoutMs: value.health.timeoutMs === null ? null : value.health.timeoutMs,
      evidencePath: typeof value.health.evidencePath === "string" ? value.health.evidencePath : null,
    },
    logs: {
      stdoutPath: value.logs.stdoutPath === null ? null : value.logs.stdoutPath,
      stderrPath: value.logs.stderrPath === null ? null : value.logs.stderrPath,
    },
    env: value.env === null ? null : value.env,
    heartbeatIntervalMs: Number.isInteger(value.heartbeatIntervalMs) && value.heartbeatIntervalMs > 0 ? value.heartbeatIntervalMs : 1000,
  };
}

async function readLaunchConfig(configPath) {
  const parsed = JSON.parse(await readFile(configPath, "utf8"));
  return readConfig(parsed);
}

function buildArtifact(config, appPid, status, runnerStartMarker) {
  return {
    schemaVersion: 1,
    stability: "experimental",
    type: "codexus.app.instance",
    instanceId: config.instanceId,
    worktree: {
      path: config.worktreePath,
      branch: config.worktreeBranch,
      head: config.worktreeHead,
    },
    profile: config.profile,
    owner: {
      ownedByCodexus: true,
      ownerTokenHash: config.ownerTokenHash,
      pid: appPid,
      processGroupId: process.pid,
      runnerStartMarker,
      heartbeatPath: config.heartbeatPath,
    },
    network: {
      host: config.network.host,
      port: config.network.port,
      url: config.network.url,
    },
    health: {
      status: config.health.url ? "unknown" : "unavailable",
      lastCheckedAt: null,
      evidencePath: config.health.evidencePath,
      url: config.health.url,
      timeoutMs: config.health.timeoutMs,
    },
    logs: {
      stdoutPath: config.logs.stdoutPath,
      stderrPath: config.logs.stderrPath,
    },
    status,
  };
}

function buildHeartbeat(config, appPid, status, runnerStartMarker, exitCode = null, signal = null) {
  return {
    schemaVersion: 1,
    type: "codexus.app.instance.heartbeat",
    instanceId: config.instanceId,
    ownerTokenHash: config.ownerTokenHash,
    runnerPid: process.pid,
    runnerStartMarker,
    appPid,
    updatedAt: nowIso(),
    status,
    exitCode,
    signal,
  };
}

async function writeResult(path, result) {
  await writeJsonAtomic(path, {
    schemaVersion: 1,
    type: "codexus.app.instance.launch-result",
    recordedAt: nowIso(),
    ...result,
  });
}

async function removeLaunchConfig(configPath) {
  await rm(configPath, { force: true });
}

async function main() {
  const configPath = process.argv[2];
  if (!configPath) {
    console.error("missing launch config path");
    process.exit(2);
  }

  let config;
  try {
    config = await readLaunchConfig(configPath);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(2);
  }

  await ensureDir(dirname(config.artifactPath));
  await ensureDir(dirname(config.heartbeatPath));
  await ensureDir(dirname(config.resultPath));
  if (config.logs.stdoutPath) await ensureDir(dirname(config.logs.stdoutPath));
  if (config.logs.stderrPath) await ensureDir(dirname(config.logs.stderrPath));

  const stdout = config.logs.stdoutPath ? createWriteStream(config.logs.stdoutPath, { flags: "a" }) : null;
  const stderr = config.logs.stderrPath ? createWriteStream(config.logs.stderrPath, { flags: "a" }) : null;

  let child;
  try {
    child = spawn(config.command[0], config.command.slice(1), {
      cwd: config.cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        ...(config.env ?? {}),
      },
    });
  } catch (error) {
    await writeResult(config.resultPath, {
      status: "failed",
      instanceId: config.instanceId,
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }

  let finalized = false;
  let heartbeatTimer = null;
  const runnerStartMarker = await readProcessStartMarker(process.pid);

  const closeStreams = async () => {
    await Promise.all([
      stdout ? new Promise((resolve) => stdout.end(resolve)) : Promise.resolve(),
      stderr ? new Promise((resolve) => stderr.end(resolve)) : Promise.resolve(),
    ]);
  };

  const updateRunningHeartbeat = async () => {
    if (!child.pid || finalized) return;
    if (!pidLive(child.pid)) return;
    await writeJsonAtomic(config.heartbeatPath, buildHeartbeat(config, child.pid, "running", runnerStartMarker));
  };

  const finalize = async (status, exitCode, signal) => {
    if (finalized) return;
    finalized = true;
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    if (child.pid) {
      await writeJsonAtomic(config.heartbeatPath, buildHeartbeat(config, child.pid, status, runnerStartMarker, exitCode, signal));
      await writeJsonAtomic(config.artifactPath, buildArtifact(config, child.pid, "stopped", runnerStartMarker));
    }
    await closeStreams();
    await removeLaunchConfig(configPath);
  };

  child.on("error", async (error) => {
    await writeResult(config.resultPath, {
      status: "failed",
      instanceId: config.instanceId,
      error: error instanceof Error ? error.message : String(error),
    });
    await closeStreams();
    process.exit(1);
  });

  if (!child.pid) {
    await writeResult(config.resultPath, {
      status: "failed",
      instanceId: config.instanceId,
      error: "spawn_returned_no_pid",
    });
    await closeStreams();
    process.exit(1);
  }

  if (stdout && child.stdout) child.stdout.pipe(stdout);
  if (stderr && child.stderr) child.stderr.pipe(stderr);
  if (!stdout && child.stdout) child.stdout.resume();
  if (!stderr && child.stderr) child.stderr.resume();

  await writeJsonAtomic(config.artifactPath, buildArtifact(config, child.pid, "running", runnerStartMarker));
  await writeJsonAtomic(config.heartbeatPath, buildHeartbeat(config, child.pid, "running", runnerStartMarker));
  await writeResult(config.resultPath, {
    status: "ready",
    instanceId: config.instanceId,
    appPid: child.pid,
    processGroupId: process.pid,
  });

  heartbeatTimer = setInterval(() => {
    void updateRunningHeartbeat().catch(() => {});
  }, config.heartbeatIntervalMs);
  heartbeatTimer.unref?.();

  const forwardSignal = (signal) => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill(signal);
    }
  };

  process.on("SIGTERM", () => {
    forwardSignal("SIGTERM");
  });
  process.on("SIGINT", () => {
    forwardSignal("SIGTERM");
  });

  child.on("close", async (code, signal) => {
    await finalize(signal ? "stopped" : code === 0 ? "stopped" : "failed", code, signal);
    process.exit(code ?? 0);
  });
}

await main();
