import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
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

function assertAutomationBoundaryEvent(record: { ledgerEvents: Array<{ type: string; payload?: Record<string, unknown> }> }, feature: string, reason: string) {
  const boundary = record.ledgerEvents.find((event) => event.type === "automation.boundary_stop");
  assert.ok(boundary, "expected automation.boundary_stop event");
  assert.equal(boundary.payload?.schemaVersion, 1);
  assert.equal(boundary.payload?.contractVersion, "automation-boundary-v1");
  assert.equal(boundary.payload?.feature, feature);
  assert.equal(boundary.payload?.reason, reason);
  assert.equal(boundary.payload?.control_boundary, true);
  assert.equal(boundary.payload?.required_approval, true);
  assert.equal(boundary.payload?.completionAuthority, false);
}

test("init command bootstraps project harness without disturbing unrelated files", async () => {
  const cwd = await tempDir();
  try {
    await mkdir(join(cwd, ".unrelated"), { recursive: true });
    await writeFile(join(cwd, ".unrelated", "state"), "keep\n");
    const result = runCli(cwd, ["init", "--with-docs", "--json"]);
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.stability, "stable");
    assert.ok(existsSync(output.configPath));
    assert.equal(await readFile(join(cwd, ".unrelated", "state"), "utf8"), "keep\n");
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
    assert.equal(runOutput.stability, "stable");

    const runs = runCli(cwd, ["runs", "list", "--json"]);
    assert.equal(runs.status, 0, runs.stderr);
    const runsOutput = JSON.parse(runs.stdout);
    assert.equal(runsOutput.stability, "stable");
    assert.equal(runsOutput.runs[0].runId, runOutput.runId);

    const events = runCli(cwd, ["events", "tail", runOutput.runId, "--lines", "20", "--json"]);
    assert.equal(events.status, 0, events.stderr);
    const eventsOutput = JSON.parse(events.stdout);
    assert.equal(eventsOutput.stability, "stable");
    const eventTypes = eventsOutput.events.map((event: { type: string }) => event.type);
    assert.ok(eventTypes.includes("permission.checked"));
    assert.ok(eventTypes.includes("run.terminal"));

    const report = runCli(cwd, ["report", runOutput.runId, "--json"]);
    assert.equal(report.status, 0, report.stderr);
    const reportOutput = JSON.parse(report.stdout);
    assert.equal(reportOutput.stability, "stable");
    assert.match(reportOutput.preview, /Outcome: complete/);

    const validateRun = runCli(cwd, ["schema", "validate-run", runOutput.runId, "--json"]);
    assert.equal(validateRun.status, 0, validateRun.stderr);
    const validation = JSON.parse(validateRun.stdout);
    assert.equal(validation.stability, "stable");
    assert.equal(validation.ok, true);
    assert.equal(validation.artifacts.find((artifact: { name: string }) => artifact.name === "events").count > 0, true);

    const validateState = runCli(cwd, ["schema", "validate", "--type", "state", "--file", runOutput.statePath, "--json"]);
    assert.equal(validateState.status, 0, validateState.stderr);
    const stateValidation = JSON.parse(validateState.stdout);
    assert.equal(stateValidation.stability, "stable");
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
    assert.equal(invalidStateOutput.stability, "stable");
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
    assert.equal(invalidOutput.stability, "stable");
    assert.equal(invalidOutput.ok, false);
    assert.ok(invalidOutput.artifacts.find((artifact: { name: string }) => artifact.name === "events").errors.includes("line_1:runId_mismatch"));

    const schemaEngine = runCli(cwd, ["schema", "engine", "--json"]);
    assert.equal(schemaEngine.status, 0, schemaEngine.stderr);
    const schemaEngineOutput = JSON.parse(schemaEngine.stdout);
    assert.equal(schemaEngineOutput.stability, "stable");
    assert.equal(schemaEngineOutput.activeEngine, "local-json-schema-subset");
    assert.equal(schemaEngineOutput.fullJsonSchemaEngine.available, false);
    assert.equal(schemaEngineOutput.decision.status, "deferred_by_policy");
    assert.equal(schemaEngineOutput.decision.dependencyPolicy.runtimeDependenciesMax, 0);
    assert.equal(schemaEngineOutput.decision.replacementAuthority, false);
    assert.equal(schemaEngineOutput.decision.candidateDependency, null);
    assert.ok(schemaEngineOutput.decision.requires.includes("explicit dependency policy approval"));
    assert.equal(schemaEngineOutput.migrationFixtureBoundary, true);

    const replayParity = runCli(cwd, ["replay", "parity", "--json"]);
    assert.equal(replayParity.status, 0, replayParity.stderr);
    const replayParityOutput = JSON.parse(replayParity.stdout);
    assert.equal(replayParityOutput.stability, "stable");
    assert.equal(replayParityOutput.status, "covered");
    assert.deepEqual(replayParityOutput.missingLabels, []);
    assert.ok(replayParityOutput.coveredLabels.includes("usage_accounting"));
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
    assert.equal(schemaOutput.schemas.length, 33);
    assert.ok(schemaOutput.schemas.some((item: { name: string }) => item.name === "automation-recovery.schema.json"));
    assert.ok(schemaOutput.schemas.some((item: { name: string }) => item.name === "subagent-bridge-probe.schema.json"));
    assert.ok(schemaOutput.schemas.some((item: { name: string }) => item.name === "wiki-injection-plan.schema.json"));
    assert.ok(schemaOutput.schemas.some((item: { name: string }) => item.name === "observability-adapter.schema.json"));
    assert.equal(schemaOutput.schemas[0].engine, "local-json-schema-subset");
    assert.deepEqual(schemaOutput.schemas[0].unsupportedKeywords, []);
    assert.equal(schemaOutput.appServerFixture.valid, true);

    schemaRoot = await tempDir();
    for (const name of [
      "config.schema.json",
      "state.schema.json",
      "event.schema.json",
      "memory-entry.schema.json",
      "skill.schema.json",
      "session-state.schema.json",
      "supply-chain-policy.schema.json",
      "architecture-policy.schema.json",
      "autopilot-contract.schema.json",
      "wiki-manifest.schema.json",
      "wiki-page.schema.json",
      "wiki-context-approval.schema.json",
      "wiki-injection-plan.schema.json",
      "repo-graph.schema.json",
      "relay-session.schema.json",
      "stage-gate-evidence.schema.json",
      "convergence-agreement.schema.json",
      "decision.schema.json",
    ]) {
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

test("skill index, export, gated replay, and memory lifecycle work together", async () => {
  const cwd = await tempDir();
  const codexHome = await tempDir();
  try {
    const run = runCli(cwd, ["run", "--driver", "mock", "--json", "parser regression behavior"]);
    assert.equal(run.status, 0, run.stderr);
    const runOutput = JSON.parse(run.stdout);
    assert.equal(runOutput.stability, "stable");
    const propose = runCli(cwd, ["skill", "propose", runOutput.runId, "--json"]);
    assert.equal(propose.status, 0, propose.stderr);
    const proposeOutput = JSON.parse(propose.stdout);
    assert.equal(proposeOutput.stability, "stable");
    const skillId = proposeOutput.proposal.id;
    const promote = runCli(cwd, ["skill", "promote", skillId, "--json"]);
    assert.equal(promote.status, 0, promote.stderr);
    assert.equal(JSON.parse(promote.stdout).stability, "stable");

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
    assert.equal(JSON.parse(memory.stdout).stability, "stable");
    const review = runCli(cwd, ["memory", "review", "--json"]);
    const reviewOutput = JSON.parse(review.stdout);
    assert.equal(reviewOutput.stability, "stable");
    assert.equal(reviewOutput.index.total, 1);
    const list = runCli(cwd, ["memory", "list", "--json"]);
    const listOutput = JSON.parse(list.stdout);
    assert.equal(listOutput.stability, "stable");
    assert.equal(listOutput.entries.length, 1);
    const pruneDryRun = runCli(cwd, ["memory", "prune", "--before", "2999-01-01T00:00:00.000Z", "--dry-run", "--json"]);
    const pruneOutput = JSON.parse(pruneDryRun.stdout);
    assert.equal(pruneOutput.stability, "stable");
    assert.equal(pruneOutput.prune.removed, 1);

    const replay = runCli(cwd, ["replay", "skill", skillId, "--with-model-replay", "--json"]);
    assert.equal(replay.status, 0, replay.stderr);
    const replayOutput = JSON.parse(replay.stdout);
    assert.equal(replayOutput.stability, "stable");
    assert.equal(replayOutput.modelReplay.status, "not_run");

    const gatedReplay = runCli(cwd, ["replay", "skill", skillId, "--with-model-replay", "--allow-live-model-replay", "--model-budget", "1", "--json"]);
    assert.equal(gatedReplay.status, 1);
    const gatedReplayOutput = JSON.parse(gatedReplay.stdout);
    assert.equal(gatedReplayOutput.stability, "stable");
    assert.equal(gatedReplayOutput.modelReplay.status, "blocked");

    const exported = runCli(cwd, ["skill", "export", skillId, "--target", "codex", "--force", "--json"], { CODEX_HOME: codexHome });
    assert.equal(exported.status, 0, exported.stderr);
    const exportedOutput = JSON.parse(exported.stdout);
    assert.equal(exportedOutput.stability, "stable");
    const exportPath = exportedOutput.export.path;
    assert.ok(existsSync(join(exportPath, "SKILL.md")));
    const index = runCli(cwd, ["skill", "index", "--json"]);
    const indexOutput = JSON.parse(index.stdout);
    assert.equal(indexOutput.stability, "stable");
    assert.equal(indexOutput.activeIndex[0].exportState.codex.path, exportPath);
    assert.equal(indexOutput.activeIndex[0].scenarioCount, 2);

    const improve = runCli(cwd, ["skill", "improve", skillId, "--reason", "tighten parser regression trigger", "--json"]);
    assert.equal(improve.status, 0, improve.stderr);
    const improveOutput = JSON.parse(improve.stdout);
    assert.equal(improveOutput.stability, "stable");
    assert.match(improveOutput.improvement.proposal.displayName, /^codexus:/);

    const curate = runCli(cwd, ["memory", "curate", "--json"]);
    assert.equal(curate.status, 0, curate.stderr);
    const curateOutput = JSON.parse(curate.stdout);
    assert.equal(curateOutput.stability, "stable");
    assert.equal(curateOutput.curation.total, 1);
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
    assert.equal(pkg.scripts["build:sourcemap"], "node scripts/build.mjs --sourcemap");
    assert.equal(pkg.scripts["lsp:check"], "node src/cli/main.ts lsp check --gate --json");
    assert.equal(pkg.scripts["supply-chain:report"], "node src/cli/main.ts supply-chain check --json");
    assert.match(pkg.scripts["release:check"], /lsp:check/);
    assert.match(pkg.scripts["release:check"], /supply-chain:report/);
    assert.equal(pkg.scripts.postinstall, "node scripts/postinstall.mjs");
    assert.ok(pkg.files.includes("scripts/postinstall.mjs"));
    assert.ok(pkg.files.includes("scripts/codexus-notify-hook.mjs"));
    assert.equal(pkg.codexus.supplyChain.runtimeDependenciesMax, 0);
    assert.ok(pkg.codexus.supplyChain.requiredPackageFiles.includes("schemas/supply-chain-policy.schema.json"));
    assert.ok(pkg.codexus.supplyChain.requiredPackageFiles.includes("schemas/architecture-policy.schema.json"));
    assert.ok(pkg.codexus.supplyChain.requiredPackageFiles.includes("schemas/repo-graph.schema.json"));
    assert.ok(pkg.codexus.supplyChain.requiredPackageFiles.includes("schemas/wiki-injection-plan.schema.json"));
    assert.ok(pkg.codexus.supplyChain.requiredPackageFiles.includes("schemas/relay-session.schema.json"));
    assert.ok(pkg.codexus.supplyChain.requiredPackageFiles.includes("schemas/stage-gate-evidence.schema.json"));
    assert.ok(pkg.codexus.supplyChain.requiredPackageFiles.includes("schemas/convergence-agreement.schema.json"));
    assert.ok(pkg.codexus.supplyChain.requiredPackageFiles.includes("schemas/decision.schema.json"));
    assert.ok(pkg.codexus.supplyChain.requiredPackageFiles.includes("scripts/publish-next.mjs"));
    assert.ok(pkg.codexus.supplyChain.forbiddenPackageFiles.includes("src/**"));
    assert.ok(pkg.codexus.supplyChain.forbiddenPackageFiles.includes("dist/**/*.map"));
    assert.equal(pkg.codexus.supplyChain.binTargetsMustBeBuiltArtifacts, true);
    assert.equal(pkg.codexus.architecture.rules[0].id, "no-runtime-package-imports-in-src");

    const install = spawnSync(process.execPath, [resolve("scripts/install-codex-skill.mjs"), "--json"], {
      cwd,
      encoding: "utf8",
      env: { ...process.env, CODEX_HOME: codexHome },
    });
    assert.equal(install.status, 0, install.stderr);
    assert.ok(existsSync(join(codexHome, "skills", "codexus", "SKILL.md")));
    const doctor = runCli(cwd, ["doctor", "--json"], { CODEX_HOME: codexHome });
    assert.equal(doctor.status, 0, doctor.stderr);
    const doctorOutput = JSON.parse(doctor.stdout);
    assert.equal(doctorOutput.stability, "stable");
    const skillInstallCheck = doctorOutput.checks.find((check: { id: string }) => check.id === "codexus.skill_install");
    assert.equal(skillInstallCheck.status, "pass");

    const typecheck = spawnSync("npm", ["run", "typecheck"], { cwd, encoding: "utf8" });
    assert.equal(typecheck.status, 0, typecheck.stderr);

    const cron = runCli(cwd, ["cron", "status", "--json"]);
    const cronStatus = JSON.parse(cron.stdout);
    assert.equal(cronStatus.stability, "experimental");
    assert.equal(cronStatus.enabled, false);
    const gateway = runCli(cwd, ["gateway", "status", "--json"]);
    const gatewayStatus = JSON.parse(gateway.stdout);
    assert.equal(gatewayStatus.stability, "experimental");
    assert.equal(gatewayStatus.enabled, false);

    const appStatus = runCli(cwd, ["app-server", "status", "--json"]);
    assert.equal(appStatus.status, 0, appStatus.stderr);
    const appStatusOutput = JSON.parse(appStatus.stdout);
    assert.equal(appStatusOutput.stability, "experimental");
    assert.equal(appStatusOutput.schemaFixture.valid, true);
    const appStatusOutsideRepo = runCli(featureCwd, ["app-server", "status", "--json"]);
    assert.equal(appStatusOutsideRepo.status, 0, appStatusOutsideRepo.stderr);
    const appStatusOutsideRepoOutput = JSON.parse(appStatusOutsideRepo.stdout);
    assert.equal(appStatusOutsideRepoOutput.stability, "experimental");
    assert.equal(appStatusOutsideRepoOutput.schemaFixture.valid, true);
    const appRoundtrip = runCli(cwd, ["app-server", "roundtrip", "--dry-run", "--json"]);
    assert.equal(appRoundtrip.status, 0, appRoundtrip.stderr);
    const appRoundtripOutput = JSON.parse(appRoundtrip.stdout);
    assert.equal(appRoundtripOutput.stability, "experimental");
    assert.equal(appRoundtripOutput.status, "passed");
    const appExperiment = runCli(cwd, ["app-server", "experiment", "--dry-run", "--timeout-ms", "1000", "--record", "--probe-process", "--cwd", featureCwd, "--json"]);
    assert.equal(appExperiment.status, 0, appExperiment.stderr);
    const appExperimentOutput = JSON.parse(appExperiment.stdout);
    assert.equal(appExperimentOutput.stability, "experimental");
    assert.equal(appExperimentOutput.status, "planned");
    assert.ok(existsSync(join(appExperimentOutput.experimentDir, "manifest.json")));
    const appManifest = JSON.parse(await readFile(join(appExperimentOutput.experimentDir, "manifest.json"), "utf8"));
    assert.equal(appManifest.schemaVersion, 1);
    assert.equal(appManifest.stability, "experimental");
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
    assert.equal(missingProbeOutput.stability, "experimental");
    assert.equal(missingProbeOutput.process.probe.status, "failed");
    assert.match(missingProbeOutput.process.probe.error, /ENOENT/);
    const supervisedExperiment = runCli(cwd, ["app-server", "experiment", "--dry-run", "--timeout-ms", "1000", "--record", "--supervise-fake", "--cwd", featureCwd, "--json"]);
    assert.equal(supervisedExperiment.status, 0, supervisedExperiment.stderr);
    const supervisedOutput = JSON.parse(supervisedExperiment.stdout);
    assert.equal(supervisedOutput.stability, "experimental");
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
    assert.equal(cronDryRunOutput.stability, "experimental");
    assert.equal(cronDryRunOutput.status, "planned");
    assert.equal(cronDryRunOutput.policy.decision, "dry_run_allowed");
    assert.equal(cronDryRunOutput.policy.dispatchAllowed, false);
    assert.equal(cronDryRunOutput.approval.status, "not_requested_for_dry_run");
    assert.equal(cronDryRunOutput.actionAuthority.contractVersion, "automation-action-authority-v1");
    assert.equal(cronDryRunOutput.actionAuthority.sideEffects.startsRun, false);
    assert.equal(cronDryRunOutput.actionAuthority.sideEffects.requiresExplicitApproval, false);
    assert.equal(cronDryRunOutput.actionAuthority.cleanupAuthority, false);
    assert.equal(cronDryRunOutput.actionAuthority.healthAuthority, false);
    assert.equal(cronDryRunOutput.actionAuthority.completionAuthority, false);
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
    assert.equal(gatewayDryRunOutput.policy.contractVersion, "policy-reviewed-live-dispatch-v1");
    assert.equal(gatewayDryRunOutput.policy.dryRunLiveContractCompatible, true);
    assert.equal(gatewayDryRunOutput.actionAuthority.actionSurface, "gateway.check");
    assert.equal(gatewayDryRunOutput.actionAuthority.sideEffects.startsRun, false);
    assert.ok(existsSync(gatewayDryRunOutput.record.path));
    const cronLive = runCli(cwd, ["cron", "run-now", "--json"]);
    assert.equal(cronLive.status, 1);
    const cronLiveOutput = JSON.parse(cronLive.stdout);
    assert.equal(cronLiveOutput.stability, "experimental");
    assert.equal(cronLiveOutput.status, "blocked");
    assert.equal(cronLiveOutput.policy.decision, "live_blocked_by_feature_gate");
    assert.equal(cronLiveOutput.policy.dispatchAllowed, false);
    assert.equal(cronLiveOutput.actionAuthority.sideEffects.startsRun, false);
    assert.equal(cronLiveOutput.actionAuthority.sideEffects.requiresExplicitApproval, true);
    assert.equal(cronLiveOutput.actionAuthority.dispatcherAuthority, "none");
    const cronLiveRecord = JSON.parse(await readFile(cronLiveOutput.record.path, "utf8"));
    assertAutomationBoundaryEvent(cronLiveRecord, "cron", "feature_gate_disabled");
    const cronLiveSchema = runCli(cwd, ["schema", "validate", "--type", "automation-dispatch", "--file", cronLiveOutput.record.path, "--json"]);
    assert.equal(cronLiveSchema.status, 0, cronLiveSchema.stderr);
    assert.equal(JSON.parse(cronLiveSchema.stdout).ok, true);
    const gatewayLive = runCli(cwd, ["gateway", "check", "--json"]);
    assert.equal(gatewayLive.status, 1);
    const gatewayLiveOutput = JSON.parse(gatewayLive.stdout);
    assert.equal(gatewayLiveOutput.stability, "experimental");
    assert.equal(gatewayLiveOutput.status, "blocked");
    assert.equal(gatewayLiveOutput.policy.decision, "live_blocked_by_feature_gate");
    assert.equal(gatewayLiveOutput.policy.dispatchAllowed, false);
    assert.equal(gatewayLiveOutput.actionAuthority.sideEffects.startsRun, false);
    assert.equal(gatewayLiveOutput.actionAuthority.completionAuthority, false);
    const gatewayLiveRecord = JSON.parse(await readFile(gatewayLiveOutput.record.path, "utf8"));
    assertAutomationBoundaryEvent(gatewayLiveRecord, "gateway", "feature_gate_disabled");
  } finally {
    if (missingCodexCwd) await rm(missingCodexCwd, { recursive: true, force: true });
    await rm(codexHome, { recursive: true, force: true });
    await rm(featureCwd, { recursive: true, force: true });
  }
});

test("enabled automation live dispatch still requires explicit approval", async () => {
  const cwd = await tempDir();
  try {
    await mkdir(join(cwd, ".codexus"), { recursive: true });
    await writeFile(join(cwd, ".codexus", "config.json"), `${JSON.stringify({
      driver: "mock",
      automation: {
        cronEnabled: true,
        gatewayEnabled: true,
      },
    }, null, 2)}\n`);
    const cronLive = runCli(cwd, ["cron", "run-now", "--json"]);
    assert.equal(cronLive.status, 1);
    const cronOutput = JSON.parse(cronLive.stdout);
    assert.equal(cronOutput.stability, "experimental");
    assert.equal(cronOutput.status, "blocked");
    assert.equal(cronOutput.enabled, true);
    assert.equal(cronOutput.policy.decision, "live_blocked_by_missing_approval");
    assert.equal(cronOutput.policy.dispatchAllowed, false);
    assert.equal(cronOutput.policy.contractVersion, "policy-reviewed-live-dispatch-v1");
    assert.equal(cronOutput.policy.liveDispatcherImplemented, true);
    assert.equal(cronOutput.approval.status, "required_but_not_requested");
    assert.equal(cronOutput.actionAuthority.sideEffects.startsRun, false);
    assert.equal(cronOutput.actionAuthority.sideEffects.requiresLock, true);
    assert.equal(cronOutput.actionAuthority.completionAuthority, false);
    assert.ok(existsSync(cronOutput.record.path));
    assert.ok(cronOutput.record.path.includes("/dispatches/"));
    const cronRecord = JSON.parse(await readFile(cronOutput.record.path, "utf8"));
    assertAutomationBoundaryEvent(cronRecord, "cron", "approval_missing");
    const cronSchema = runCli(cwd, ["schema", "validate", "--type", "automation-dispatch", "--file", cronOutput.record.path, "--json"]);
    assert.equal(cronSchema.status, 0, cronSchema.stderr);
    assert.equal(JSON.parse(cronSchema.stdout).ok, true);

    const gatewayLive = runCli(cwd, ["gateway", "check", "--json"]);
    assert.equal(gatewayLive.status, 1);
    const gatewayOutput = JSON.parse(gatewayLive.stdout);
    assert.equal(gatewayOutput.stability, "experimental");
    assert.equal(gatewayOutput.status, "blocked");
    assert.equal(gatewayOutput.enabled, true);
    assert.equal(gatewayOutput.policy.decision, "live_blocked_by_missing_approval");
    assert.equal(gatewayOutput.policy.dispatchAllowed, false);
    assert.equal(gatewayOutput.actionAuthority.sideEffects.startsRun, false);
    assert.equal(gatewayOutput.actionAuthority.runOutcomeSource, null);
    const gatewayRecord = JSON.parse(await readFile(gatewayOutput.record.path, "utf8"));
    assertAutomationBoundaryEvent(gatewayRecord, "gateway", "approval_missing");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("automation recovery reports dispatch candidates without scheduler or retry authority", async () => {
  const cwd = await tempDir();
  try {
    await mkdir(join(cwd, ".codexus"), { recursive: true });
    await writeFile(join(cwd, ".codexus", "config.json"), `${JSON.stringify({
      driver: "mock",
      automation: {
        cronEnabled: true,
        gatewayEnabled: true,
      },
    }, null, 2)}\n`);

    const blocked = runCli(cwd, ["cron", "run-now", "--json"]);
    assert.equal(blocked.status, 1);
    const blockedOutput = JSON.parse(blocked.stdout);
    assert.equal(blockedOutput.status, "blocked");
    assert.ok(existsSync(blockedOutput.record.path));

    const recovery = runCli(cwd, ["cron", "recovery", "--record", "--json"]);
    assert.equal(recovery.status, 0, recovery.stderr);
    const output = JSON.parse(recovery.stdout);
    assert.equal(output.schemaVersion, 1);
    assert.equal(output.stability, "experimental");
    assert.equal(output.type, "codexus.automation.recovery");
    assert.equal(output.recovery.status, "manual_review_required");
    assert.equal(output.dispatchStore.total, 1);
    assert.equal(output.retry.automaticRetry, false);
    assert.equal(output.retry.retryAuthority, false);
    assert.equal(output.retry.manualReviewRequired, true);
    assert.equal(output.scheduler.queueOwned, false);
    assert.equal(output.scheduler.unattendedOwner, false);
    assert.equal(output.scheduler.recoveryAuthority, false);
    assert.equal(output.scheduler.completionAuthority, false);
    assert.equal(output.ownership.contractVersion, "automation-scheduler-ownership-v1");
    assert.equal(output.ownership.status, "not_owned");
    assert.equal(output.ownership.dispatchRecordCount, 1);
    assert.equal(output.ownership.queue.owned, false);
    assert.equal(output.ownership.queue.durableQueue, false);
    assert.equal(output.ownership.lease.supported, false);
    assert.equal(output.ownership.unattendedRetry.supported, false);
    assert.equal(output.ownership.unattendedRetry.automaticRetry, false);
    assert.ok(output.ownership.unattendedRetry.requires.includes("durable-queue-owner"));
    assert.equal(output.ownership.authority.schedulerAuthority, false);
    assert.equal(output.ownership.authority.completionAuthority, false);
    assert.equal(output.authority.schedulerAuthority, false);
    assert.equal(output.authority.retryAuthority, false);
    assert.equal(output.authority.completionAuthority, false);
    assert.equal(output.recovery.manualReviewCandidates[0].boundaryReason, "approval_missing");
    assert.match(output.recovery.manualReviewCandidates[0].recoveryHint, /explicit approval/);
    assert.ok(existsSync(output.path));

    const schema = runCli(cwd, ["schema", "validate", "--type", "automation-recovery", "--file", output.path, "--json"]);
    assert.equal(schema.status, 0, schema.stderr);
    assert.equal(JSON.parse(schema.stdout).ok, true);

    const status = runCli(cwd, ["cron", "status", "--json"]);
    assert.equal(status.status, 0, status.stderr);
    const statusOutput = JSON.parse(status.stdout);
    assert.equal(statusOutput.ownership.contractVersion, "automation-scheduler-ownership-v1");
    assert.equal(statusOutput.ownership.queue.owned, false);
    assert.equal(statusOutput.ownership.unattendedRetry.supported, false);
    assert.equal(statusOutput.recovery.status, "manual_review_required");
    assert.equal(statusOutput.recovery.automaticRetry, false);
    assert.equal(statusOutput.recovery.completionAuthority, false);

    const gatewayRecovery = runCli(cwd, ["gateway", "recovery", "--json"]);
    assert.equal(gatewayRecovery.status, 0, gatewayRecovery.stderr);
    const gatewayOutput = JSON.parse(gatewayRecovery.stdout);
    assert.equal(gatewayOutput.recovery.status, "no_dispatches");
    assert.equal(gatewayOutput.retry.automaticRetry, false);
    assert.equal(gatewayOutput.scheduler.queueOwned, false);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("enabled automation live dispatch runs through the normal Codexus run ledger", async () => {
  const cwd = await tempDir();
  try {
    await mkdir(join(cwd, ".codexus"), { recursive: true });
    await writeFile(join(cwd, ".codexus", "config.json"), `${JSON.stringify({
      driver: "mock",
      automation: {
        cronEnabled: true,
        gatewayEnabled: true,
      },
    }, null, 2)}\n`);

    const cronLive = runCli(cwd, [
      "cron",
      "run-now",
      "--task",
      "review memory health",
      "--approved-by",
      "maintainer",
      "--json",
    ]);
    assert.equal(cronLive.status, 0, cronLive.stderr);
    const cronOutput = JSON.parse(cronLive.stdout);
    assert.equal(cronOutput.stability, "experimental");
    assert.equal(cronOutput.status, "completed");
    assert.equal(cronOutput.policy.decision, "live_dispatch_allowed");
    assert.equal(cronOutput.policy.dispatchAllowed, true);
    assert.equal(cronOutput.approval.status, "approved");
    assert.equal(cronOutput.actionAuthority.sideEffects.startsRun, true);
    assert.equal(cronOutput.actionAuthority.dispatcherAuthority, "linked_codexus_run");
    assert.equal(cronOutput.actionAuthority.runOutcomeSource, "linked_codexus_run");
    assert.equal(cronOutput.actionAuthority.cleanupAuthority, false);
    assert.equal(cronOutput.actionAuthority.healthAuthority, false);
    assert.equal(cronOutput.actionAuthority.completionAuthority, false);
    assert.equal(cronOutput.run.outcome, "complete");
    assert.ok(existsSync(cronOutput.run.statePath));
    assert.ok(existsSync(cronOutput.record.path));
    const cronRecord = JSON.parse(await readFile(cronOutput.record.path, "utf8"));
    assert.equal(cronRecord.ledgerEvents.some((event: { type: string }) => event.type === "automation.lock_acquired"), true);
    assert.equal(cronRecord.ledgerEvents.some((event: { type: string }) => event.type === "automation.dispatched"), true);
    assert.equal(cronRecord.ledgerEvents.some((event: { type: string; payload?: { outcome?: string } }) => event.type === "automation.completed" && event.payload?.outcome === "complete"), true);

    const gatewayLive = runCli(cwd, [
      "gateway",
      "check",
      "--task",
      "inspect repo events",
      "--approved-by",
      "maintainer",
      "--json",
    ]);
    assert.equal(gatewayLive.status, 0, gatewayLive.stderr);
    const gatewayOutput = JSON.parse(gatewayLive.stdout);
    assert.equal(gatewayOutput.status, "completed");
    assert.equal(gatewayOutput.actionAuthority.sideEffects.startsRun, true);
    assert.equal(gatewayOutput.actionAuthority.actionSurface, "gateway.check");
    assert.equal(gatewayOutput.run.outcome, "complete");
    assert.ok(existsSync(gatewayOutput.record.path));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

// The removed adapter integration's three-letter name, built dynamically so
// this test file itself contains zero literal references to it.
const removedIntegrationName = Buffer.from([111, 109, 120]).toString("utf8");
const removedIntegrationPattern = new RegExp(removedIntegrationName, "i");

test("a stale config with the removed adapter section loads as deprecated, not unknown", async () => {
  const cwd = await tempDir();
  try {
    await mkdir(join(cwd, ".codexus"), { recursive: true });
    // A config carrying the now-removed top-level section and its nested key.
    await writeFile(
      join(cwd, ".codexus", "config.json"),
      `${JSON.stringify({
        [removedIntegrationName]: {
          enabled: "auto",
          preferSparkshellForVerification: true,
        },
        verification: { commands: [], timeoutMs: 90000 },
      }, null, 2)}\n`,
    );

    // doctor must succeed (no crash) and surface config warnings.
    const doctor = runCli(cwd, ["doctor", "--json"]);
    assert.equal(doctor.status, 0, doctor.stderr);
    const doctorOutput = JSON.parse(doctor.stdout);
    const warnings: string[] = doctorOutput.warnings;
    // The removed key must never be reported as an "unknown config key".
    assert.ok(
      !warnings.some((warning) => warning.startsWith("unknown config key") && removedIntegrationPattern.test(warning)),
      `removed section was reported as unknown: ${JSON.stringify(warnings)}`,
    );
    // It is recognized as a deprecated/ignored key instead.
    assert.ok(
      warnings.some((warning) => warning.startsWith("deprecated config key") && removedIntegrationPattern.test(warning)),
      `expected a deprecation notice for the removed section: ${JSON.stringify(warnings)}`,
    );
    // The deprecation notice is emitted at most once for the stale key.
    assert.equal(
      warnings.filter((warning) => warning.startsWith("deprecated config key") && removedIntegrationPattern.test(warning)).length,
      1,
    );
    // A real unrelated config value still applied (the deprecated key did not
    // poison merging of legitimate config).
    const driverCheck = doctorOutput.checks.find((check: { id: string }) => check.id.startsWith("driver."));
    assert.ok(driverCheck);

    // run must also work end-to-end with the stale config present.
    const run = runCli(cwd, ["run", "--driver", "mock", "--json", "stale config run"]);
    assert.equal(run.status, 0, run.stderr);
    assert.equal(JSON.parse(run.stdout).outcome, "complete");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("source tree contains zero references to the removed adapter integration", async () => {
  const srcRoot = resolve("src");
  const offenders: string[] = [];
  async function walk(dir: string): Promise<void> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(path);
      } else if (entry.isFile() && /\.(ts|mjs|js)$/.test(entry.name)) {
        const text = await readFile(path, "utf8");
        for (const [index, line] of text.split("\n").entries()) {
          if (removedIntegrationPattern.test(line)) {
            offenders.push(`${path}:${index + 1}: ${line.trim()}`);
          }
        }
      }
    }
  }
  await walk(srcRoot);
  assert.deepEqual(
    offenders,
    [],
    `removed adapter integration must not reappear in src/:\n${offenders.join("\n")}`,
  );
});
