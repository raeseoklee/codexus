import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { loadConfig } from "../../config/loader.ts";
import { CodexAppServerDriver } from "../../drivers/codex-app-server.ts";
import { runAppServerDiscovery } from "../../experiments/app-server-discovery.ts";
import { superviseProcess } from "../../experiments/process-supervisor.ts";
import { runIsolatedRealStageA } from "../../experiments/app-server-stage-a.ts";
import { runLiveReadOnlyStageB } from "../../experiments/app-server-stage-b.ts";
import { harnessRoot } from "../../ledger/paths.ts";
import { ensureDir, writeJsonAtomic } from "../../util/fs.ts";
import { trimmedProcessOutput } from "../../util/process-output.ts";
import { readAppServerSchemaFixture } from "../../validation/schemas.ts";
import { flagBool, flagString, type ParsedArgs } from "../args.ts";

function liveEnabled(): boolean {
  return process.env.CODEXUS_ENABLE_APP_SERVER_LIVE === "1";
}

function isolatedRealEnabled(): boolean {
  return process.env.CODEXUS_ENABLE_APP_SERVER_ISOLATED === "1";
}

function desktopAttachEnabled(): boolean {
  return process.env.CODEXUS_ENABLE_DESKTOP_APP_SERVER_ATTACH === "1";
}

function supervisedAppServerHelpProbe(command: string, timeoutMs: number) {
  const startedAt = new Date().toISOString();
  const start = Date.now();
  const result = spawnSync(command, ["app-server", "--help"], {
    encoding: "utf8",
    timeout: timeoutMs,
  });
  const durationMs = Date.now() - start;
  const timedOut = result.error instanceof Error && (result.error as NodeJS.ErrnoException).code === "ETIMEDOUT";
  const stdout = trimmedProcessOutput(result.stdout);
  const stderr = trimmedProcessOutput(result.stderr);
  return {
    schemaVersion: 1,
    command,
    args: ["app-server", "--help"],
    startedAt,
    completedAt: new Date().toISOString(),
    durationMs,
    timeoutMs,
    status: timedOut ? "timed_out" : result.status === 0 ? "passed" : "failed",
    exitCode: result.status,
    signal: result.signal,
    error: result.error instanceof Error ? result.error.message : null,
    stdoutPreview: stdout.slice(0, 1000),
    stderrPreview: stderr.slice(0, 1000),
  };
}

export async function appServerCommand(args: ParsedArgs): Promise<void> {
  const topic = args.positionals[0] ?? "status";
  const json = flagBool(args.flags, "json");
  const cwd = resolve(flagString(args.flags, "cwd") ?? process.cwd());
  const { config } = loadConfig({ cwd });
  const fixture = await readAppServerSchemaFixture();

  if (topic === "status") {
    const probe = await new CodexAppServerDriver().probe();
    const status = {
      schemaVersion: 1,
      stability: "experimental" as const,
      cwd,
      feature: "codex-app-server",
      status: liveEnabled() ? "live_gate_enabled" : "dry_run_only",
      liveEnabled: liveEnabled(),
      probe,
      schemaFixture: fixture,
    };
    if (json) {
      console.log(JSON.stringify(status, null, 2));
      return;
    }
    console.log(`codex-app-server: ${status.status}`);
    console.log(`schema fixture: ${fixture.valid ? "valid" : "invalid"}`);
    return;
  }

  if (topic === "roundtrip") {
    const dryRun = flagBool(args.flags, "dry-run") || !flagBool(args.flags, "live");
    if (!dryRun && !liveEnabled()) throw new Error("unsupported_feature:codex-app-server-live-roundtrip");
    const result = {
      schemaVersion: 1,
      stability: "experimental" as const,
      cwd,
      mode: dryRun ? "dry-run" : "live",
      status: dryRun ? "passed" : "blocked",
      request: {
        method: "thread/start",
        paramsShape: "fixture-validated placeholder",
      },
      response: dryRun
        ? {
          wouldStartThread: true,
          wouldStartTurn: true,
          wouldReadThreadItems: true,
        }
        : {
          reason: "live app-server roundtrip remains an explicit experiment after process supervision is implemented",
        },
      schemaFixture: fixture,
    };
    if (json) {
      console.log(JSON.stringify(result, null, 2));
      process.exitCode = result.status === "passed" ? 0 : 1;
      return;
    }
    console.log(`app-server ${result.mode} roundtrip: ${result.status}`);
    process.exitCode = result.status === "passed" ? 0 : 1;
    return;
  }

  if (topic === "discover") {
    const timeoutMs = Number(flagString(args.flags, "timeout-ms") ?? "2000");
    if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) throw new Error("invalid_timeout_ms");
    const experimentId = `app_server_discovery_${Date.now()}`;
    const experimentDir = resolve(harnessRoot(cwd), "experiments", "app-server", experimentId);
    const { report } = await runAppServerDiscovery({
      cwd,
      command: config.codex.command,
      experimentDir,
      timeoutMs,
      record: flagBool(args.flags, "record"),
    });
    if (json) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }
    console.log(`app-server discovery: ${report.stageBReadiness.status}`);
    console.log(report.stageBReadiness.reason);
    return;
  }

  if (topic === "experiment") {
    if (flagBool(args.flags, "live-read-only")) {
      if (!desktopAttachEnabled()) throw new Error("unsupported_feature:codex-app-server-live-read-only");
      const socketPath = flagString(args.flags, "sock");
      if (!socketPath) throw new Error("missing_app_server_socket");
      const timeoutMs = Number(flagString(args.flags, "timeout-ms") ?? "30000");
      if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) throw new Error("invalid_timeout_ms");
      const observeMs = Number(flagString(args.flags, "observe-ms") ?? "5000");
      if (!Number.isInteger(observeMs) || observeMs <= 0 || observeMs > timeoutMs) {
        throw new Error("invalid_observe_ms");
      }
      const experimentId = `app_server_live_read_only_${Date.now()}`;
      const experimentDir = resolve(harnessRoot(cwd), "experiments", "app-server", experimentId);
      const { manifest } = await runLiveReadOnlyStageB({
        cwd,
        experimentDir,
        experimentId,
        timeoutMs,
        observeMs,
        socketPath,
        record: flagBool(args.flags, "record"),
      });
      if (json) {
        console.log(JSON.stringify(manifest, null, 2));
        return;
      }
      console.log(`app-server experiment live-read-only: event=${manifest.eventObservation.status} runtime=${manifest.eventObservation.runtimeSurface}`);
      return;
    }
    if (flagBool(args.flags, "isolated-real")) {
      if (!isolatedRealEnabled()) throw new Error("unsupported_feature:codex-app-server-isolated-real");
      const timeoutMs = Number(flagString(args.flags, "timeout-ms") ?? "30000");
      if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) throw new Error("invalid_timeout_ms");
      const experimentId = `app_server_isolated_${Date.now()}`;
      const experimentDir = resolve(harnessRoot(cwd), "experiments", "app-server", experimentId);
      const { manifest } = await runIsolatedRealStageA({
        command: config.codex.command,
        cwd,
        experimentDir,
        experimentId,
        timeoutMs,
        fixtureMethods: fixture.methods,
        record: flagBool(args.flags, "record"),
      });
      if (json) {
        console.log(JSON.stringify(manifest, null, 2));
        return;
      }
      console.log(`app-server experiment isolated-real: observerAttach=${manifest.observerAttach.observerAttach} capability=${manifest.conservativeCapability}`);
      return;
    }
    const dryRun = flagBool(args.flags, "dry-run") || !flagBool(args.flags, "live");
    if (!dryRun && !liveEnabled()) throw new Error("unsupported_feature:codex-app-server-live-experiment");
    if (!dryRun && flagBool(args.flags, "supervise-fake")) throw new Error("unsupported_feature:codex-app-server-live-fake-supervision");
    const timeoutMs = Number(flagString(args.flags, "timeout-ms") ?? "30000");
    if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) throw new Error("invalid_timeout_ms");
    const experimentId = `app_server_${Date.now()}`;
    const experimentDir = resolve(harnessRoot(cwd), "experiments", "app-server", experimentId);
    const supervised = flagBool(args.flags, "supervise-fake")
      ? await superviseProcess({
        command: process.execPath,
        args: ["-e", "console.log('codexus-fake-app-server-ready'); setInterval(() => {}, 1000);"],
        cwd,
        timeoutMs,
      })
      : null;
    const manifest = {
      schemaVersion: 1,
      stability: "experimental" as const,
      experimentId,
      mode: dryRun ? "dry-run" : "live",
      status: dryRun ? "planned" : "prepared",
      cwd,
      experimentDir,
      timeoutMs,
      cleanup: {
        required: true,
        removesExperimentProcess: true,
        preservesManifest: true,
      },
      lifecycleIntent: [
        "prepare_temp_workspace",
        "start_codex_app_server",
        "send_thread_start",
        "send_turn_start",
        "read_thread_items",
        "stop_process",
        "write_manifest",
      ],
      actualLifecycle: supervised
        ? [
          "start_fake_app_server_process",
          "readiness_output_observed",
          "stop_fake_process",
          "record_cleanup",
          "write_manifest",
        ]
        : [
          "write_manifest",
        ],
      schemaFixture: fixture,
      process: {
        supervised: supervised !== null,
        reason: dryRun
          ? supervised
            ? "dry-run records deterministic fake process supervision without starting codex app-server"
            : "dry-run records lifecycle intent without starting a process"
          : "live experiment currently prepares a sandbox manifest only",
        probe: flagBool(args.flags, "probe-process")
          ? supervisedAppServerHelpProbe(config.codex.command, timeoutMs)
          : null,
        supervisor: supervised,
      },
    };
    const shouldRecord = !dryRun || flagBool(args.flags, "record");
    if (shouldRecord) {
      await ensureDir(experimentDir);
      await writeJsonAtomic(resolve(experimentDir, "manifest.json"), manifest);
    }
    if (json) {
      console.log(JSON.stringify(manifest, null, 2));
      return;
    }
    console.log(`app-server experiment ${manifest.mode}: ${manifest.status}`);
    return;
  }

  throw new Error(`unsupported_app_server_command:${topic}`);
}
