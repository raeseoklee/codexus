import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const cli = resolve("src/cli/main.ts");

async function tempDir(): Promise<string> {
  return await mkdtemp(join(tmpdir(), "codexus-remaining-"));
}

function runCli(cwd: string, args: string[], env: Record<string, string> = {}) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

function sha256Text(text: string): string {
  return `sha256:${createHash("sha256").update(text).digest("hex")}`;
}

test("init command bootstraps project harness without mutating omx state", async () => {
  const cwd = await tempDir();
  try {
    await mkdir(join(cwd, ".omx"), { recursive: true });
    await writeFile(join(cwd, ".omx", "state"), "keep\n");
    const result = runCli(cwd, ["init", "--with-docs", "--json"]);
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.ok(existsSync(output.configPath));
    assert.equal(await readFile(join(cwd, ".omx", "state"), "utf8"), "keep\n");
    assert.ok(existsSync(join(cwd, ".codexus", "README.md")));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("observability commands list runs, tail events, and read reports", async () => {
  const cwd = await tempDir();
  try {
    const run = runCli(cwd, ["run", "--driver", "mock", "--json", "observability run"]);
    assert.equal(run.status, 0, run.stderr);
    const runOutput = JSON.parse(run.stdout);

    const runs = runCli(cwd, ["runs", "list", "--json"]);
    assert.equal(runs.status, 0, runs.stderr);
    assert.equal(JSON.parse(runs.stdout).runs[0].runId, runOutput.runId);

    const events = runCli(cwd, ["events", "tail", runOutput.runId, "--lines", "20", "--json"]);
    assert.equal(events.status, 0, events.stderr);
    const eventTypes = JSON.parse(events.stdout).events.map((event: { type: string }) => event.type);
    assert.ok(eventTypes.includes("permission.checked"));
    assert.ok(eventTypes.includes("run.terminal"));

    const report = runCli(cwd, ["report", runOutput.runId, "--json"]);
    assert.equal(report.status, 0, report.stderr);
    assert.match(JSON.parse(report.stdout).preview, /Outcome: complete/);

    const validateRun = runCli(cwd, ["schema", "validate-run", runOutput.runId, "--json"]);
    assert.equal(validateRun.status, 0, validateRun.stderr);
    const validation = JSON.parse(validateRun.stdout);
    assert.equal(validation.ok, true);
    assert.equal(validation.artifacts.find((artifact: { name: string }) => artifact.name === "events").count > 0, true);

    const validateState = runCli(cwd, ["schema", "validate", "--type", "state", "--file", runOutput.statePath, "--json"]);
    assert.equal(validateState.status, 0, validateState.stderr);
    const stateValidation = JSON.parse(validateState.stdout);
    assert.equal(stateValidation.ok, true);
    assert.equal(stateValidation.artifactValidation.engine, "local-json-schema-subset");
    assert.equal(stateValidation.artifactValidation.valid, true);

    const invalidStatePath = join(cwd, "invalid-state.json");
    const invalidStateRecord = JSON.parse(await readFile(runOutput.statePath, "utf8"));
    delete invalidStateRecord.runId;
    await writeFile(invalidStatePath, `${JSON.stringify(invalidStateRecord, null, 2)}\n`);
    const invalidState = runCli(cwd, ["schema", "validate", "--type", "state", "--file", invalidStatePath, "--json"]);
    assert.equal(invalidState.status, 1);
    const invalidStateOutput = JSON.parse(invalidState.stdout);
    assert.equal(invalidStateOutput.ok, false);
    assert.ok(invalidStateOutput.validation.errors.includes("runId:missing_string"));
    assert.ok(invalidStateOutput.artifactValidation.errors.includes("$.runId:required"));

    const eventPath = join(cwd, ".codexus", "runs", runOutput.runId, "events.jsonl");
    await writeFile(eventPath, `${JSON.stringify({
      schemaVersion: 1,
      eventId: "evt_bad",
      runId: "run_other",
      timestamp: "2026-05-29T00:00:00.000Z",
      phase: "complete",
      type: "run.terminal",
      source: "test",
      payload: { outcome: "complete" },
    })}\n`);
    const invalidRun = runCli(cwd, ["schema", "validate-run", runOutput.runId, "--json"]);
    assert.equal(invalidRun.status, 1);
    const invalidOutput = JSON.parse(invalidRun.stdout);
    assert.equal(invalidOutput.ok, false);
    assert.ok(invalidOutput.artifacts.find((artifact: { name: string }) => artifact.name === "events").errors.includes("line_1:runId_mismatch"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("remaining P0 json errors cover unexpected args, corrupt state, and disabled driver", async () => {
  const cwd = await tempDir();
  try {
    const unexpected = runCli(cwd, ["status", "run_x", "extra", "--json"]);
    assert.equal(unexpected.status, 1);
    assert.equal(JSON.parse(unexpected.stdout).code, "unexpected_argument");

    const runDir = join(cwd, ".codexus", "runs", "run_bad");
    await mkdir(runDir, { recursive: true });
    await writeFile(join(runDir, "state.json"), "{ bad json");
    const corrupt = runCli(cwd, ["status", "run_bad", "--json"]);
    assert.equal(corrupt.status, 1);
    assert.equal(JSON.parse(corrupt.stdout).code, "state_corrupt");

    const disabled = runCli(cwd, ["run", "--driver", "codex-app-server", "--json", "disabled app server"]);
    assert.equal(disabled.status, 1);
    assert.equal(JSON.parse(disabled.stdout).code, "unsupported_feature");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("driver failures are classified and written to the run ledger", async () => {
  const cwd = await tempDir();
  try {
    const run = runCli(cwd, ["run", "--driver", "mock", "--json", "MOCK_FAIL"]);
    assert.equal(run.status, 1);
    const runOutput = JSON.parse(run.stdout);
    const state = JSON.parse(await readFile(runOutput.statePath, "utf8"));
    assert.equal(state.error.code, "driver_task_failed");
    const events = await readFile(join(cwd, ".codexus", "runs", runOutput.runId, "events.jsonl"), "utf8");
    assert.match(events, /driver\.failure_classified/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("stale locks can be inspected and cleared while schema artifacts validate", async () => {
  const cwd = await tempDir();
  let schemaRoot: string | null = null;
  try {
    const lockRoot = join(cwd, ".codexus", "locks");
    const staleDir = join(lockRoot, "memory.lock");
    const activeDir = join(lockRoot, "active.lock");
    await mkdir(staleDir, { recursive: true });
    await mkdir(activeDir, { recursive: true });
    await writeFile(join(staleDir, "owner.json"), `${JSON.stringify({
      schemaVersion: 1,
      name: "memory",
      pid: 1,
      hostname: "test",
      createdAt: "2000-01-01T00:00:00.000Z",
      ttlMs: 1,
      operation: "test",
    })}\n`);
    await writeFile(join(activeDir, "owner.json"), `${JSON.stringify({
      schemaVersion: 1,
      name: "active",
      pid: process.pid,
      hostname: "test",
      createdAt: new Date().toISOString(),
      ttlMs: 600_000,
      operation: "test",
    })}\n`);

    const list = runCli(cwd, ["locks", "list", "--json"]);
    assert.equal(list.status, 0, list.stderr);
    const locks = JSON.parse(list.stdout).locks;
    assert.equal(locks.find((lock: { name: string }) => lock.name === "memory").stale, true);
    assert.equal(locks.find((lock: { name: string }) => lock.name === "active").stale, false);

    const clear = runCli(cwd, ["locks", "clear", "memory", "--stale-only", "--json"]);
    assert.equal(clear.status, 0, clear.stderr);
    assert.equal(JSON.parse(clear.stdout).lock.exists, false);

    const activeClear = runCli(cwd, ["locks", "clear", "active", "--stale-only", "--json"]);
    assert.equal(activeClear.status, 1);
    assert.equal(JSON.parse(activeClear.stdout).code, "lock_not_stale");

    const schema = runCli(resolve("."), ["schema", "check", "--json"]);
    assert.equal(schema.status, 0, schema.stderr);
    const schemaOutput = JSON.parse(schema.stdout);
    assert.equal(schemaOutput.ok, true);
    assert.equal(schemaOutput.schemas.length, 6);
    assert.equal(schemaOutput.schemas[0].engine, "local-json-schema-subset");
    assert.deepEqual(schemaOutput.schemas[0].unsupportedKeywords, []);
    assert.equal(schemaOutput.appServerFixture.valid, true);

    schemaRoot = await tempDir();
    for (const name of ["config.schema.json", "state.schema.json", "event.schema.json", "memory-entry.schema.json", "skill.schema.json", "session-state.schema.json"]) {
      await writeFile(join(schemaRoot, name), await readFile(resolve("schemas", name), "utf8"));
    }
    const unsupportedConfig = JSON.parse(await readFile(join(schemaRoot, "config.schema.json"), "utf8"));
    unsupportedConfig.additionalProperties = false;
    await writeFile(join(schemaRoot, "config.schema.json"), `${JSON.stringify(unsupportedConfig, null, 2)}\n`);
    const unsupportedSchema = runCli(resolve("."), ["schema", "check", "--schema-root", schemaRoot, "--json"]);
    assert.equal(unsupportedSchema.status, 1);
    const unsupportedSchemaOutput = JSON.parse(unsupportedSchema.stdout);
    assert.equal(unsupportedSchemaOutput.ok, false);
    assert.ok(unsupportedSchemaOutput.schemas.find((item: { name: string }) => item.name === "config.schema.json").unsupportedKeywords.includes("$:additionalProperties"));
  } finally {
    if (schemaRoot) await rm(schemaRoot, { recursive: true, force: true });
    await rm(cwd, { recursive: true, force: true });
  }
});

test("repairable driver failures can be retried behind an explicit driver-repair budget", async () => {
  const cwd = await tempDir();
  try {
    const run = runCli(cwd, ["run", "--driver", "mock", "--max-driver-repairs", "1", "--json", "MOCK_DRIVER_REPAIR"]);
    assert.equal(run.status, 0, run.stderr);
    const runOutput = JSON.parse(run.stdout);
    assert.equal(runOutput.outcome, "complete");
    const state = JSON.parse(await readFile(runOutput.statePath, "utf8"));
    assert.equal(state.driverRepairIteration, 1);
    const events = await readFile(join(cwd, ".codexus", "runs", runOutput.runId, "events.jsonl"), "utf8");
    assert.match(events, /driver\.repair\.started/);
    assert.match(events, /driver\.repair\.completed/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("skill index, export, adapter context, gated replay, and memory lifecycle work together", async () => {
  const cwd = await tempDir();
  const codexHome = await tempDir();
  try {
    const run = runCli(cwd, ["run", "--driver", "mock", "--json", "parser regression behavior"]);
    assert.equal(run.status, 0, run.stderr);
    const runOutput = JSON.parse(run.stdout);
    const propose = runCli(cwd, ["skill", "propose", runOutput.runId, "--json"]);
    assert.equal(propose.status, 0, propose.stderr);
    const skillId = JSON.parse(propose.stdout).proposal.id;
    const promote = runCli(cwd, ["skill", "promote", skillId, "--json"]);
    assert.equal(promote.status, 0, promote.stderr);

    const memory = runCli(cwd, [
      "memory",
      "add",
      "--kind",
      "workflow_lesson",
      "--tags",
      "parser",
      "--json",
      "Parser regression work should retrieve active parser skills.",
    ]);
    assert.equal(memory.status, 0, memory.stderr);
    const review = runCli(cwd, ["memory", "review", "--json"]);
    assert.equal(JSON.parse(review.stdout).index.total, 1);
    const list = runCli(cwd, ["memory", "list", "--json"]);
    assert.equal(JSON.parse(list.stdout).entries.length, 1);
    const pruneDryRun = runCli(cwd, ["memory", "prune", "--before", "2999-01-01T00:00:00.000Z", "--dry-run", "--json"]);
    assert.equal(JSON.parse(pruneDryRun.stdout).prune.removed, 1);

    const retrieve = runCli(cwd, ["adapt", "omx", "retrieve", "--task", "parser regression", "--json"]);
    assert.equal(retrieve.status, 0, retrieve.stderr);
    const retrieveOutput = JSON.parse(retrieve.stdout);
    assert.equal(retrieveOutput.skills[0].id, skillId);
    assert.equal(retrieveOutput.memories[0].id, JSON.parse(memory.stdout).entry.id);

    const context = runCli(cwd, ["adapt", "omx", "context", "--task", "parser regression", "--max-chars", "1600", "--json"]);
    assert.equal(context.status, 0, context.stderr);
    const contextOutput = JSON.parse(context.stdout);
    assert.match(contextOutput.contextBlock, /codexus:/);
    assert.equal(contextOutput.skills[0].replayStatus, "passed");
    assert.ok(contextOutput.budget.usedChars <= 1600);

    const approvedContext = runCli(cwd, ["adapt", "omx", "context", "--task", "parser regression", "--approve", "--json"]);
    assert.equal(approvedContext.status, 0, approvedContext.stderr);
    const approvedOutput = JSON.parse(approvedContext.stdout);
    assert.equal(approvedOutput.artifact.status, "approved");
    assert.equal(approvedOutput.artifact.approval.injectedAutomatically, false);
    assert.ok(existsSync(approvedOutput.artifact.paths.markdown));
    const approvedMarkdown = await readFile(approvedOutput.artifact.paths.markdown, "utf8");
    const approvedJson = JSON.parse(await readFile(approvedOutput.artifact.paths.json, "utf8"));
    assert.equal(approvedJson.schemaVersion, 1);
    assert.equal(approvedJson.context.contextBlock, approvedMarkdown);
    assert.equal(approvedOutput.artifact.approval.contextHash, sha256Text(approvedMarkdown));

    const replay = runCli(cwd, ["replay", "skill", skillId, "--with-model-replay", "--json"]);
    assert.equal(replay.status, 0, replay.stderr);
    assert.equal(JSON.parse(replay.stdout).modelReplay.status, "not_run");

    const gatedReplay = runCli(cwd, ["replay", "skill", skillId, "--with-model-replay", "--allow-live-model-replay", "--model-budget", "1", "--json"]);
    assert.equal(gatedReplay.status, 1);
    assert.equal(JSON.parse(gatedReplay.stdout).modelReplay.status, "blocked");

    const exported = runCli(cwd, ["skill", "export", skillId, "--target", "codex", "--force", "--json"], { CODEX_HOME: codexHome });
    assert.equal(exported.status, 0, exported.stderr);
    const exportPath = JSON.parse(exported.stdout).export.path;
    assert.ok(existsSync(join(exportPath, "SKILL.md")));
    const index = runCli(cwd, ["skill", "index", "--json"]);
    const indexOutput = JSON.parse(index.stdout);
    assert.equal(indexOutput.activeIndex[0].exportState.codex.path, exportPath);
    assert.equal(indexOutput.activeIndex[0].scenarioCount, 2);

    const improve = runCli(cwd, ["skill", "improve", skillId, "--reason", "tighten parser regression trigger", "--json"]);
    assert.equal(improve.status, 0, improve.stderr);
    assert.match(JSON.parse(improve.stdout).improvement.proposal.displayName, /^codexus:/);

    const curate = runCli(cwd, ["memory", "curate", "--json"]);
    assert.equal(curate.status, 0, curate.stderr);
    assert.equal(JSON.parse(curate.stdout).curation.total, 1);
  } finally {
    await rm(cwd, { recursive: true, force: true });
    await rm(codexHome, { recursive: true, force: true });
  }
});

test("packaging metadata, adapter install, typecheck, and guarded features are exposed", async () => {
  const cwd = resolve(".");
  const codexHome = await tempDir();
  const featureCwd = await tempDir();
  let missingCodexCwd: string | null = null;
  try {
    const pkg = JSON.parse(await readFile(resolve("package.json"), "utf8"));
    assert.equal(pkg.bin.cx, "dist/cli/main.js");
    assert.equal(pkg.bin.codexus, "dist/cli/main.js");
    assert.equal(Object.hasOwn(pkg.bin, "chx"), false);
    assert.equal(pkg.engines.node, ">=22");
    assert.ok(pkg.files.includes("dist"));
    assert.ok(pkg.files.includes("fixtures/app-server"));
    assert.equal(pkg.files.includes("src"), false);
    assert.equal(pkg.files.includes("fixtures"), false);
    assert.equal(pkg.scripts.prepublishOnly, "npm run release:check");
    assert.equal(pkg.scripts.postinstall, "node scripts/postinstall.mjs");
    assert.ok(pkg.files.includes("scripts/postinstall.mjs"));
    assert.ok(pkg.files.includes("scripts/codexus-notify-hook.mjs"));

    const install = spawnSync(process.execPath, [resolve("scripts/install-codex-skill.mjs"), "--json"], {
      cwd,
      encoding: "utf8",
      env: { ...process.env, CODEX_HOME: codexHome },
    });
    assert.equal(install.status, 0, install.stderr);
    assert.ok(existsSync(join(codexHome, "skills", "codexus", "SKILL.md")));
    const doctor = runCli(cwd, ["doctor", "--json"], { CODEX_HOME: codexHome });
    assert.equal(doctor.status, 0, doctor.stderr);
    const skillInstallCheck = JSON.parse(doctor.stdout).checks.find((check: { id: string }) => check.id === "codexus.skill_install");
    assert.equal(skillInstallCheck.status, "pass");

    const typecheck = spawnSync("npm", ["run", "typecheck"], { cwd, encoding: "utf8" });
    assert.equal(typecheck.status, 0, typecheck.stderr);

    const cron = runCli(cwd, ["cron", "status", "--json"]);
    assert.equal(JSON.parse(cron.stdout).enabled, false);
    const gateway = runCli(cwd, ["gateway", "status", "--json"]);
    assert.equal(JSON.parse(gateway.stdout).enabled, false);

    const appStatus = runCli(cwd, ["app-server", "status", "--json"]);
    assert.equal(appStatus.status, 0, appStatus.stderr);
    assert.equal(JSON.parse(appStatus.stdout).schemaFixture.valid, true);
    const appStatusOutsideRepo = runCli(featureCwd, ["app-server", "status", "--json"]);
    assert.equal(appStatusOutsideRepo.status, 0, appStatusOutsideRepo.stderr);
    assert.equal(JSON.parse(appStatusOutsideRepo.stdout).schemaFixture.valid, true);
    const appRoundtrip = runCli(cwd, ["app-server", "roundtrip", "--dry-run", "--json"]);
    assert.equal(appRoundtrip.status, 0, appRoundtrip.stderr);
    assert.equal(JSON.parse(appRoundtrip.stdout).status, "passed");
    const appExperiment = runCli(cwd, ["app-server", "experiment", "--dry-run", "--timeout-ms", "1000", "--record", "--probe-process", "--cwd", featureCwd, "--json"]);
    assert.equal(appExperiment.status, 0, appExperiment.stderr);
    const appExperimentOutput = JSON.parse(appExperiment.stdout);
    assert.equal(appExperimentOutput.status, "planned");
    assert.ok(existsSync(join(appExperimentOutput.experimentDir, "manifest.json")));
    const appManifest = JSON.parse(await readFile(join(appExperimentOutput.experimentDir, "manifest.json"), "utf8"));
    assert.equal(appManifest.schemaVersion, 1);
    assert.equal(appManifest.process.supervised, false);
    assert.equal(appManifest.process.probe.command, "codex");
    assert.ok(["passed", "failed", "timed_out"].includes(appManifest.process.probe.status));
    assert.ok(appManifest.lifecycleIntent.includes("start_codex_app_server"));
    assert.deepEqual(appManifest.actualLifecycle, ["write_manifest"]);
    missingCodexCwd = await tempDir();
    await mkdir(join(missingCodexCwd, ".codexus"), { recursive: true });
    await writeFile(join(missingCodexCwd, ".codexus", "config.json"), JSON.stringify({
      codex: { command: "definitely-not-a-command-codexus-test" },
    }));
    const missingProbe = runCli(cwd, ["app-server", "experiment", "--dry-run", "--probe-process", "--cwd", missingCodexCwd, "--json"]);
    assert.equal(missingProbe.status, 0, missingProbe.stderr);
    const missingProbeOutput = JSON.parse(missingProbe.stdout);
    assert.equal(missingProbeOutput.process.probe.status, "failed");
    assert.match(missingProbeOutput.process.probe.error, /ENOENT/);
    const supervisedExperiment = runCli(cwd, ["app-server", "experiment", "--dry-run", "--timeout-ms", "1000", "--record", "--supervise-fake", "--cwd", featureCwd, "--json"]);
    assert.equal(supervisedExperiment.status, 0, supervisedExperiment.stderr);
    const supervisedOutput = JSON.parse(supervisedExperiment.stdout);
    assert.equal(supervisedOutput.process.supervised, true);
    assert.equal(supervisedOutput.process.supervisor.status, "stopped");
    assert.equal(supervisedOutput.process.supervisor.cleanup.completed, true);
    assert.match(supervisedOutput.process.supervisor.stdoutPreview, /codexus-fake-app-server-ready/);
    assert.ok(supervisedOutput.actualLifecycle.includes("start_fake_app_server_process"));
    const fakeLive = runCli(cwd, ["app-server", "experiment", "--live", "--supervise-fake", "--json"], { CODEXUS_ENABLE_APP_SERVER_LIVE: "1" });
    assert.equal(fakeLive.status, 1);
    assert.equal(JSON.parse(fakeLive.stdout).code, "unsupported_feature");
    const appLive = runCli(cwd, ["app-server", "roundtrip", "--live", "--json"]);
    assert.equal(appLive.status, 1);
    assert.equal(JSON.parse(appLive.stdout).code, "unsupported_feature");

    const cronDryRun = runCli(cwd, ["cron", "run-now", "--dry-run", "--record", "--cwd", featureCwd, "--task", "memory review", "--json"]);
    assert.equal(cronDryRun.status, 0, cronDryRun.stderr);
    const cronDryRunOutput = JSON.parse(cronDryRun.stdout);
    assert.equal(cronDryRunOutput.status, "planned");
    assert.equal(cronDryRunOutput.policy.decision, "dry_run_allowed");
    assert.equal(cronDryRunOutput.policy.dispatchAllowed, false);
    assert.equal(cronDryRunOutput.approval.status, "not_requested_for_dry_run");
    assert.ok(existsSync(cronDryRunOutput.record.path));
    assert.ok(cronDryRunOutput.ledgerEvents.includes("automation.policy_checked"));
    assert.ok(cronDryRunOutput.ledgerEvents.includes("approval.resolved"));
    const cronRecord = JSON.parse(await readFile(cronDryRunOutput.record.path, "utf8"));
    assert.equal(cronRecord.schemaVersion, 1);
    assert.equal(cronRecord.ledgerEvents.some((event: { type: string }) => event.type === "automation.dispatch_skipped"), true);
    assert.equal(cronRecord.ledgerEvents.some((event: { type: string; payload?: { status?: string } }) => event.type === "approval.resolved" && event.payload?.status === "not_requested"), true);
    assert.deepEqual(cronRecord.plan.policy, cronDryRunOutput.policy);
    const gatewayDryRun = runCli(cwd, ["gateway", "check", "--dry-run", "--record", "--cwd", featureCwd, "--task", "repo event", "--json"]);
    assert.equal(gatewayDryRun.status, 0, gatewayDryRun.stderr);
    const gatewayDryRunOutput = JSON.parse(gatewayDryRun.stdout);
    assert.equal(gatewayDryRunOutput.status, "planned");
    assert.equal(gatewayDryRunOutput.policy.decision, "dry_run_allowed");
    assert.ok(existsSync(gatewayDryRunOutput.record.path));
    const cronLive = runCli(cwd, ["cron", "run-now", "--json"]);
    assert.equal(cronLive.status, 1);
    const cronLiveOutput = JSON.parse(cronLive.stdout);
    assert.equal(cronLiveOutput.status, "blocked");
    assert.equal(cronLiveOutput.policy.decision, "live_blocked_by_feature_gate");
    assert.equal(cronLiveOutput.policy.dispatchAllowed, false);
    const gatewayLive = runCli(cwd, ["gateway", "check", "--json"]);
    assert.equal(gatewayLive.status, 1);
    const gatewayLiveOutput = JSON.parse(gatewayLive.stdout);
    assert.equal(gatewayLiveOutput.status, "blocked");
    assert.equal(gatewayLiveOutput.policy.decision, "live_blocked_by_feature_gate");
    assert.equal(gatewayLiveOutput.policy.dispatchAllowed, false);
  } finally {
    if (missingCodexCwd) await rm(missingCodexCwd, { recursive: true, force: true });
    await rm(codexHome, { recursive: true, force: true });
    await rm(featureCwd, { recursive: true, force: true });
  }
});

test("enabled automation gates still block live dispatch until dispatcher exists", async () => {
  const cwd = await tempDir();
  try {
    await mkdir(join(cwd, ".codexus"), { recursive: true });
    await writeFile(join(cwd, ".codexus", "config.json"), `${JSON.stringify({
      automation: {
        cronEnabled: true,
        gatewayEnabled: true,
      },
    }, null, 2)}\n`);
    const cronLive = runCli(cwd, ["cron", "run-now", "--json"]);
    assert.equal(cronLive.status, 1);
    const cronOutput = JSON.parse(cronLive.stdout);
    assert.equal(cronOutput.status, "blocked");
    assert.equal(cronOutput.enabled, true);
    assert.equal(cronOutput.policy.decision, "live_requires_unimplemented_dispatcher");
    assert.equal(cronOutput.policy.dispatchAllowed, false);
    assert.equal(cronOutput.approval.status, "required_but_not_requested");
    assert.ok(cronOutput.ledgerEvents.includes("automation.dispatch_skipped"));

    const gatewayLive = runCli(cwd, ["gateway", "check", "--json"]);
    assert.equal(gatewayLive.status, 1);
    const gatewayOutput = JSON.parse(gatewayLive.stdout);
    assert.equal(gatewayOutput.status, "blocked");
    assert.equal(gatewayOutput.enabled, true);
    assert.equal(gatewayOutput.policy.decision, "live_requires_unimplemented_dispatcher");
    assert.equal(gatewayOutput.policy.dispatchAllowed, false);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
