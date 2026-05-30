import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { hostname, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { lockPath } from "../src/util/lock.ts";
import { validateSchemaArtifactValue, validateSchemaValue } from "../src/validation/schemas.ts";

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

function git(cwd: string, args: string[]): void {
  const result = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8" });
  assert.equal(result.status, 0, `git ${args.join(" ")} failed: ${result.stderr}`);
}

async function initGitRepo(cwd: string): Promise<void> {
  git(cwd, ["init", "--quiet"]);
  git(cwd, ["config", "user.email", "test@codexus.local"]);
  git(cwd, ["config", "user.name", "Codexus Test"]);
  git(cwd, ["config", "commit.gpgsign", "false"]);
  await writeFile(join(cwd, "tracked.txt"), "initial\n");
  git(cwd, ["add", "tracked.txt"]);
  git(cwd, ["commit", "--quiet", "-m", "initial"]);
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

test("setup codex-session chains an existing notify hook behind Codexus", async () => {
  const cwd = await tempDir();
  const codexHome = await tempDir();
  try {
    const previousScript = join(cwd, "previous-notify.mjs");
    const previousLog = join(cwd, "previous-notify.log");
    await writeFile(previousScript, `import { writeFileSync } from "node:fs"; writeFileSync(${JSON.stringify(previousLog)}, "previous\\n");\n`);
    await writeFile(join(codexHome, "config.toml"), [
      `notify = ${JSON.stringify([process.execPath, previousScript])}`,
      "",
      `[projects.${JSON.stringify(resolve(cwd))}]`,
      'trust_level = "trusted"',
      "",
    ].join("\n"));

    const setup = runCli(cwd, ["setup", "codex-session", "--scope", "project", "--enable-notify-hook", "--json"], { CODEX_HOME: codexHome });
    assert.equal(setup.status, 0, setup.stderr);
    const output = JSON.parse(setup.stdout);
    assert.equal(output.notifyHook.status, "installed");
    assert.equal(output.notifyHook.changed, true);
    assert.equal(output.notifyHook.backupPath, join(codexHome, "config.toml.codexus.bak"));
    assert.deepEqual(output.notifyHook.previousNotify, [process.execPath, previousScript]);
    assert.equal(output.state.capabilities.hooks, "configured");
    assert.equal(output.state.notifyDispatch.status, "unobserved");
    assert.equal(output.state.notifyDispatch.lastTurnEndedAt, null);

    const config = await readFile(join(codexHome, "config.toml"), "utf8");
    assert.match(config, /codexus-notify-hook\.mjs/);
    assert.equal(await readFile(join(codexHome, "config.toml.codexus.bak"), "utf8"), [
      `notify = ${JSON.stringify([process.execPath, previousScript])}`,
      "",
      `[projects.${JSON.stringify(resolve(cwd))}]`,
      'trust_level = "trusted"',
      "",
    ].join("\n"));

    const hook = spawnSync(process.execPath, [
      output.notifyHook.scriptPath,
      "--event",
      "turn-ended",
      "--previous-notify",
      JSON.stringify([process.execPath, previousScript]),
    ], {
      cwd,
      encoding: "utf8",
      env: { ...process.env, CODEX_HOME: codexHome },
    });
    assert.equal(hook.status, 0, hook.stderr);
    assert.equal(await readFile(previousLog, "utf8"), "previous\n");

    const status = runCli(cwd, ["session", "status", "--json"], { CODEX_HOME: codexHome });
    assert.equal(status.status, 0, status.stderr);
    const statusOutput = JSON.parse(status.stdout);
    assert.equal(statusOutput.state.capabilities.hooks, "available");
    assert.equal(statusOutput.notifyDispatch.status, "observed");
    assert.equal(statusOutput.notifyDispatch.lastTurnEndedAt, statusOutput.state.hookEvents.at(-1).observedAt);
    assert.equal(statusOutput.notifyDispatch.runtimeSurface, "cli-tui");
    assert.equal(statusOutput.state.capabilities.statusline, "unavailable");
    assert.equal(statusOutput.state.hookEvents.at(-1).event, "turn-ended");
    assert.equal(statusOutput.state.hookEvents.at(-1).runtimeSurface, "cli-tui");
    assert.equal(typeof statusOutput.state.hookEvents.at(-1).process.pid, "number");

    const schema = runCli(cwd, ["schema", "validate", "--type", "session-state", "--file", output.statePath, "--json"], { CODEX_HOME: codexHome });
    assert.equal(schema.status, 0, schema.stderr);
    assert.equal(JSON.parse(schema.stdout).ok, true);

    const disabled = runCli(cwd, ["setup", "codex-session", "--disable-notify-hook", "--json"], { CODEX_HOME: codexHome });
    assert.equal(disabled.status, 0, disabled.stderr);
    const disabledOutput = JSON.parse(disabled.stdout);
    assert.equal(disabledOutput.notifyHook.changed, true);
    assert.equal(disabledOutput.notifyHook.installed, false);
    assert.deepEqual(disabledOutput.notifyHook.command, [process.execPath, previousScript]);
    assert.equal(await readFile(join(codexHome, "config.toml"), "utf8"), [
      `notify = ${JSON.stringify([process.execPath, previousScript])}`,
      "",
      `[projects.${JSON.stringify(resolve(cwd))}]`,
      'trust_level = "trusted"',
      "",
    ].join("\n"));
    assert.equal(await readFile(join(codexHome, "config.toml.codexus.bak"), "utf8"), [
      `notify = ${JSON.stringify([process.execPath, previousScript])}`,
      "",
      `[projects.${JSON.stringify(resolve(cwd))}]`,
      'trust_level = "trusted"',
      "",
    ].join("\n"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
    await rm(codexHome, { recursive: true, force: true });
  }
});

test("disable notify hook removes a Codexus-only notify line", async () => {
  const cwd = await tempDir();
  const codexHome = await tempDir();
  try {
    await writeFile(join(codexHome, "config.toml"), [
      `notify = ${JSON.stringify([process.execPath, join(cwd, "codexus-notify-hook.mjs"), "--event", "turn-ended"])}`,
      "",
      `[projects.${JSON.stringify(resolve(cwd))}]`,
      'trust_level = "trusted"',
      "",
    ].join("\n"));

    const disabled = runCli(cwd, ["setup", "codex-session", "--disable-notify-hook", "--json"], { CODEX_HOME: codexHome });
    assert.equal(disabled.status, 0, disabled.stderr);
    const output = JSON.parse(disabled.stdout);
    assert.equal(output.overlay.changed, false);
    assert.equal(output.overlay.installed, false);
    const config = await readFile(join(codexHome, "config.toml"), "utf8");
    assert.doesNotMatch(config, /codexus-notify-hook/);
    assert.match(config, /trust_level = "trusted"/);
    assert.equal(existsSync(join(cwd, "AGENTS.md")), false);
  } finally {
    await rm(cwd, { recursive: true, force: true });
    await rm(codexHome, { recursive: true, force: true });
  }
});

test("setup codex-session refuses notify hook install when project is not trusted", async () => {
  const cwd = await tempDir();
  const codexHome = await tempDir();
  try {
    await mkdir(codexHome, { recursive: true });
    await writeFile(join(codexHome, "config.toml"), "");
    const setup = runCli(cwd, ["setup", "codex-session", "--enable-notify-hook", "--json"], { CODEX_HOME: codexHome });
    assert.equal(setup.status, 1);
    const output = JSON.parse(setup.stdout);
    assert.equal(output.notifyHook.status, "blocked");
    assert.equal(output.notifyHook.reason, "project_not_found");
    assert.equal(output.notifyHook.installed, false);
    assert.doesNotMatch(await readFile(join(codexHome, "config.toml"), "utf8"), /codexus-notify-hook/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
    await rm(codexHome, { recursive: true, force: true });
  }
});

test("manual notify smoke does not mark dispatch observed without turn-ended", async () => {
  const cwd = await tempDir();
  const codexHome = await tempDir();
  try {
    await writeFile(join(codexHome, "config.toml"), [
      `[projects.${JSON.stringify(resolve(cwd))}]`,
      'trust_level = "trusted"',
      "",
    ].join("\n"));
    const setup = runCli(cwd, ["setup", "codex-session", "--enable-notify-hook", "--json"], { CODEX_HOME: codexHome });
    assert.equal(setup.status, 0, setup.stderr);

    const notify = runCli(cwd, ["session", "notify", "--event", "codexus-manual-smoke", "--json"], {
      CODEX_HOME: codexHome,
      CODEXUS_NOTIFY_RUNTIME_SURFACE: "cli-tui",
    });
    assert.equal(notify.status, 0, notify.stderr);

    const status = runCli(cwd, ["session", "status", "--json"], { CODEX_HOME: codexHome });
    assert.equal(status.status, 0, status.stderr);
    const output = JSON.parse(status.stdout);
    assert.equal(output.state.hookEvents.at(-1).event, "codexus-manual-smoke");
    assert.equal(output.state.hookEvents.at(-1).runtimeSurface, "cli-tui");
    assert.equal(output.notifyDispatch.status, "unobserved");
    assert.equal(output.notifyDispatch.lastTurnEndedAt, null);
    assert.equal(output.notifyDispatch.lastObservedAt, output.state.hookEvents.at(-1).observedAt);
    assert.equal(output.state.capabilities.hooks, "configured");
  } finally {
    await rm(cwd, { recursive: true, force: true });
    await rm(codexHome, { recursive: true, force: true });
  }
});

test("setup codex-session writes a one-time backup and survives damaged markers", async () => {
  const cwd = await tempDir();
  const codexHome = await tempDir();
  try {
    const agentsPath = join(cwd, "AGENTS.md");
    const damaged = [
      "# Existing guidance",
      "<!-- CODEXUS:RUNTIME:END -->",
      "Keep this line.",
      "<!-- CODEXUS:RUNTIME:START -->",
      "",
    ].join("\n");
    await writeFile(agentsPath, damaged);
    const first = runCli(cwd, ["setup", "codex-session", "--scope", "project", "--json"], { CODEX_HOME: codexHome });
    assert.equal(first.status, 0, first.stderr);
    assert.equal(JSON.parse(first.stdout).overlay.installed, true);
    assert.equal(await readFile(`${agentsPath}.codexus.bak`, "utf8"), damaged);

    const agents = await readFile(agentsPath, "utf8");
    assert.match(agents, /Keep this line/);
    assert.equal(markerCount(agents, "<!-- CODEXUS:RUNTIME:START -->"), 2);
    assert.equal(markerCount(agents, "<!-- CODEXUS:RUNTIME:END -->"), 2);

    const second = runCli(cwd, ["setup", "codex-session", "--scope", "project", "--json"], { CODEX_HOME: codexHome });
    assert.equal(second.status, 0, second.stderr);
    assert.equal(await readFile(`${agentsPath}.codexus.bak`, "utf8"), damaged);
    const updated = await readFile(agentsPath, "utf8");
    assert.match(updated, /Keep this line/);
    assert.equal(markerCount(updated, "<!-- CODEXUS:RUNTIME:START -->"), 2);
    assert.equal(markerCount(updated, "<!-- CODEXUS:RUNTIME:END -->"), 2);
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
    assert.ok(output.paths.state.endsWith(".codexus/session/state.json"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
    await rm(codexHome, { recursive: true, force: true });
  }
});

test("session status rejects malformed session state", async () => {
  const cwd = await tempDir();
  const codexHome = await tempDir();
  try {
    await mkdir(join(cwd, ".codexus", "session"), { recursive: true });
    await writeFile(join(cwd, ".codexus", "session", "state.json"), "{ \"schemaVersion\": 1 }\n");
    const status = runCli(cwd, ["session", "status", "--json"], { CODEX_HOME: codexHome });
    assert.equal(status.status, 1);
    const output = JSON.parse(status.stdout);
    assert.equal(output.code, "session_state_corrupt");
    assert.match(output.message, /corrupt/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
    await rm(codexHome, { recursive: true, force: true });
  }
});

test("session migrate reports and persists explicit session-state migrations", async () => {
  const cwd = await tempDir();
  const codexHome = await tempDir();
  const statePath = join(cwd, ".codexus", "session", "state.json");
  const legacyState = {
    schemaVersion: 1,
    sessionId: "session_legacy",
    cwd: resolve(cwd),
    status: "initialized",
    createdAt: "2026-05-30T00:00:00.000Z",
    updatedAt: "2026-05-30T00:00:00.000Z",
    lastCommand: null,
    checkpoints: [],
    verifications: [],
    linkedRunIds: [],
    capabilities: {
      tmux: "unavailable",
      hooks: "unavailable",
      statusline: "unavailable",
    },
    overlays: {
      project: {
        scope: "project",
        path: join(cwd, "AGENTS.md"),
        installed: false,
        markerStart: "<!-- CODEXUS:RUNTIME:START -->",
        markerEnd: "<!-- CODEXUS:RUNTIME:END -->",
      },
      user: {
        scope: "user",
        path: join(codexHome, "AGENTS.md"),
        installed: false,
        markerStart: "<!-- CODEXUS:RUNTIME:START -->",
        markerEnd: "<!-- CODEXUS:RUNTIME:END -->",
      },
    },
  };
  try {
    await mkdir(join(cwd, ".codexus", "session"), { recursive: true });
    await writeFile(statePath, `${JSON.stringify(legacyState, null, 2)}\n`);

    const dryRun = runCli(cwd, ["session", "migrate", "--dry-run", "--json"], { CODEX_HOME: codexHome });
    assert.equal(dryRun.status, 0, dryRun.stderr);
    const dryRunOutput = JSON.parse(dryRun.stdout);
    assert.equal(dryRunOutput.status, "migrated");
    assert.equal(dryRunOutput.dryRun, true);
    assert.deepEqual(dryRunOutput.migration.applied, [
      "session_state_v1.add_hook_events",
      "session_state_v2.add_notify_dispatch",
      "session_state_v3.add_workspace_fingerprint",
    ]);
    assert.equal(Object.hasOwn(JSON.parse(await readFile(statePath, "utf8")), "hookEvents"), false);

    const migrate = runCli(cwd, ["session", "migrate", "--json"], { CODEX_HOME: codexHome });
    assert.equal(migrate.status, 0, migrate.stderr);
    const migrateOutput = JSON.parse(migrate.stdout);
    assert.equal(migrateOutput.status, "migrated");
    assert.equal(migrateOutput.dryRun, false);
    const migratedState = JSON.parse(await readFile(statePath, "utf8"));
    assert.equal(migratedState.schemaVersion, 3);
    assert.deepEqual(migratedState.hookEvents, []);
    assert.equal(migratedState.notifyDispatch.status, "not_configured");
    assert.equal(migratedState.lastVerifiedFingerprint, null);

    const status = runCli(cwd, ["session", "status", "--json"], { CODEX_HOME: codexHome });
    assert.equal(status.status, 0, status.stderr);
    assert.equal(JSON.parse(status.stdout).migration.migrated, false);
  } finally {
    await rm(cwd, { recursive: true, force: true });
    await rm(codexHome, { recursive: true, force: true });
  }
});

test("session migrate rejects unsupported future session-state versions", async () => {
  const cwd = await tempDir();
  const codexHome = await tempDir();
  try {
    await mkdir(join(cwd, ".codexus", "session"), { recursive: true });
    await writeFile(join(cwd, ".codexus", "session", "state.json"), "{ \"schemaVersion\": 4 }\n");
    const migrate = runCli(cwd, ["session", "migrate", "--json"], { CODEX_HOME: codexHome });
    assert.equal(migrate.status, 1);
    const output = JSON.parse(migrate.stdout);
    assert.equal(output.code, "session_state_corrupt");
    assert.match(output.details.target, /unsupported_schema_version:4/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
    await rm(codexHome, { recursive: true, force: true });
  }
});

test("doctor reports malformed session state as a failed check", async () => {
  const cwd = await tempDir();
  const codexHome = await tempDir();
  try {
    await mkdir(join(cwd, ".codexus", "session"), { recursive: true });
    await writeFile(join(cwd, ".codexus", "session", "state.json"), "{ \"schemaVersion\": 1 }\n");
    const doctor = runCli(cwd, ["doctor", "--json"], { CODEX_HOME: codexHome });
    assert.equal(doctor.status, 0, doctor.stderr);
    const output = JSON.parse(doctor.stdout);
    const check = output.checks.find((item: { id: string }) => item.id === "codexus.session_state");
    assert.equal(check.status, "fail");
    assert.match(check.summary, /session_state_corrupt/);
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

test("session state updates honor the session lock instead of clobbering writes", async () => {
  const cwd = await tempDir();
  const codexHome = await tempDir();
  try {
    const activeLock = lockPath(cwd, "session");
    await mkdir(activeLock, { recursive: true });
    await writeFile(join(activeLock, "owner.json"), `${JSON.stringify({
      schemaVersion: 1,
      name: "session",
      pid: process.pid,
      hostname: hostname(),
      createdAt: new Date().toISOString(),
      ttlMs: 60_000,
      operation: "test-held-lock",
    }, null, 2)}\n`);
    const checkpoint = runCli(cwd, ["session", "checkpoint", "concurrent checkpoint", "--json"], { CODEX_HOME: codexHome });
    assert.equal(checkpoint.status, 1);
    assert.equal(JSON.parse(checkpoint.stdout).code, "lock_unavailable");
  } finally {
    await rm(cwd, { recursive: true, force: true });
    await rm(codexHome, { recursive: true, force: true });
  }
});

test("session-state focused validator and schema artifact reject the same critical drift cases", async () => {
  const cwd = await tempDir();
  const codexHome = await tempDir();
  try {
    const checkpoint = runCli(cwd, ["session", "checkpoint", "schema drift baseline", "--json"], { CODEX_HOME: codexHome });
    assert.equal(checkpoint.status, 0, checkpoint.stderr);
    const baseline = JSON.parse(await readFile(JSON.parse(checkpoint.stdout).statePath, "utf8"));
    const invalidCases = [
      ["missing_hook_events", (value: Record<string, unknown>) => { delete value.hookEvents; }],
      ["bad_status", (value: Record<string, unknown>) => { value.status = "running"; }],
      ["bad_capabilities_hooks", (value: Record<string, unknown>) => {
        (value.capabilities as Record<string, unknown>).hooks = "enabled";
      }],
      ["missing_notify_dispatch", (value: Record<string, unknown>) => { delete value.notifyDispatch; }],
      ["bad_notify_dispatch_status", (value: Record<string, unknown>) => {
        (value.notifyDispatch as Record<string, unknown>).status = "installed";
      }],
      ["missing_last_verified_fingerprint", (value: Record<string, unknown>) => { delete value.lastVerifiedFingerprint; }],
      ["bad_last_verified_fingerprint_shape", (value: Record<string, unknown>) => {
        value.lastVerifiedFingerprint = {
          verificationId: "verification_x",
          status: "passed",
          recordedAt: "2026-05-30T00:00:00.000Z",
          fingerprint: { schemaVersion: 1, isGit: true },
        };
      }],
      ["bad_verification_fingerprint", (value: Record<string, unknown>) => {
        value.verifications = [{
          id: "verification_x",
          createdAt: "2026-05-30T00:00:00.000Z",
          status: "passed",
          commands: ["npm test"],
          path: "/tmp/verification.json",
          artifactsDir: "/tmp/artifacts",
          workspaceFingerprint: { schemaVersion: 2 },
        }];
      }],
      ["missing_verification_fingerprint_field", (value: Record<string, unknown>) => {
        value.verifications = [{
          id: "verification_x",
          createdAt: "2026-05-30T00:00:00.000Z",
          status: "passed",
          commands: ["npm test"],
          path: "/tmp/verification.json",
          artifactsDir: "/tmp/artifacts",
        }];
      }],
    ] as const;
    for (const [name, mutate] of invalidCases) {
      const candidate = structuredClone(baseline) as Record<string, unknown>;
      mutate(candidate);
      const focused = validateSchemaValue("session-state", candidate);
      const artifact = await validateSchemaArtifactValue("session-state", candidate);
      assert.equal(focused.valid, false, `${name}: focused validator should reject`);
      assert.equal(artifact.valid, false, `${name}: schema artifact should reject`);
    }
  } finally {
    await rm(cwd, { recursive: true, force: true });
    await rm(codexHome, { recursive: true, force: true });
  }
});

test("session verify stores a workspace fingerprint and last-verified evidence", async () => {
  const cwd = await tempDir();
  const codexHome = await tempDir();
  try {
    await initGitRepo(cwd);
    const verify = runCli(cwd, ["session", "verify", "--verify", "node -e \"console.log('ok')\"", "--json"], { CODEX_HOME: codexHome });
    assert.equal(verify.status, 0, verify.stderr);
    const output = JSON.parse(verify.stdout);
    assert.equal(output.executed, true);
    const fingerprint = output.verification.workspaceFingerprint;
    assert.equal(fingerprint.degraded, false);
    assert.equal(fingerprint.isGit, true);
    assert.ok(fingerprint.head, "expected a HEAD commit");
    assert.equal(output.state.lastVerifiedFingerprint.status, "passed");
    assert.equal(output.state.lastVerifiedFingerprint.verificationId, output.verification.id);
    assert.equal(output.state.lastVerifiedFingerprint.fingerprint.unstagedDiffHash, fingerprint.unstagedDiffHash);

    // The persisted state must validate against the v3 schema artifact.
    const schema = runCli(cwd, ["schema", "validate", "--type", "session-state", "--file", output.statePath, "--json"], { CODEX_HOME: codexHome });
    assert.equal(schema.status, 0, schema.stderr);
    assert.equal(JSON.parse(schema.stdout).ok, true);
  } finally {
    await rm(cwd, { recursive: true, force: true });
    await rm(codexHome, { recursive: true, force: true });
  }
});

test("session status reports evidenceFresh after verify and stale after a real change", async () => {
  const cwd = await tempDir();
  const codexHome = await tempDir();
  try {
    await initGitRepo(cwd);
    const setup = runCli(cwd, ["setup", "codex-session", "--scope", "project", "--json"], { CODEX_HOME: codexHome });
    assert.equal(setup.status, 0, setup.stderr);

    // Before any verification: missing.
    const initial = runCli(cwd, ["session", "status", "--json"], { CODEX_HOME: codexHome });
    assert.equal(initial.status, 0, initial.stderr);
    const initialOutput = JSON.parse(initial.stdout);
    assert.equal(initialOutput.evidence.verification, "missing");
    assert.equal(initialOutput.evidence.evidenceFresh, false);
    assert.equal(initialOutput.evidence.dirtySinceLastVerify, true);

    const verify = runCli(cwd, ["session", "verify", "--verify", "node -e \"console.log('ok')\"", "--json"], { CODEX_HOME: codexHome });
    assert.equal(verify.status, 0, verify.stderr);

    // Immediately after a passing verify with no changes: fresh.
    const fresh = runCli(cwd, ["session", "status", "--json"], { CODEX_HOME: codexHome });
    assert.equal(fresh.status, 0, fresh.stderr);
    const freshOutput = JSON.parse(fresh.stdout);
    assert.equal(freshOutput.evidence.verification, "passed");
    assert.equal(freshOutput.evidence.evidenceFresh, true);
    assert.equal(freshOutput.evidence.dirtySinceLastVerify, false);

    // A real content change makes the evidence stale and dirty.
    await writeFile(join(cwd, "tracked.txt"), "initial\nnew work\n");
    const stale = runCli(cwd, ["session", "status", "--json"], { CODEX_HOME: codexHome });
    assert.equal(stale.status, 0, stale.stderr);
    const staleOutput = JSON.parse(stale.stdout);
    assert.equal(staleOutput.evidence.verification, "stale");
    assert.equal(staleOutput.evidence.evidenceFresh, false);
    assert.equal(staleOutput.evidence.dirtySinceLastVerify, true);
  } finally {
    await rm(cwd, { recursive: true, force: true });
    await rm(codexHome, { recursive: true, force: true });
  }
});

test("a failed verification then a workspace change reports stale, not a now-untrue failed", async () => {
  const cwd = await tempDir();
  const codexHome = await tempDir();
  try {
    await initGitRepo(cwd);
    // Failing verification on a clean workspace -> verification: "failed".
    const verify = runCli(cwd, ["session", "verify", "--verify", "false", "--json"], { CODEX_HOME: codexHome });
    assert.equal(JSON.parse(verify.stdout).verification.status, "failed");
    const failed = JSON.parse(runCli(cwd, ["session", "status", "--json"], { CODEX_HOME: codexHome }).stdout).evidence;
    assert.equal(failed.verification, "failed");
    assert.equal(failed.dirtySinceLastVerify, false);
    assert.equal(failed.lastVerification.status, "failed");
    // After an edit the failed verdict no longer describes the current workspace
    // -> stale (dirty precedes failed); lastVerification.status still shows it.
    await writeFile(join(cwd, "fix.txt"), "an edit after the failure\n");
    const stale = JSON.parse(runCli(cwd, ["session", "status", "--json"], { CODEX_HOME: codexHome }).stdout).evidence;
    assert.equal(stale.verification, "stale");
    assert.equal(stale.evidenceFresh, false);
    assert.equal(stale.dirtySinceLastVerify, true);
    assert.equal(stale.lastVerification.status, "failed");
  } finally {
    await rm(cwd, { recursive: true, force: true });
    await rm(codexHome, { recursive: true, force: true });
  }
});

test("session status never claims evidenceFresh in a non-git (degraded) workspace", async () => {
  const cwd = await tempDir();
  const codexHome = await tempDir();
  try {
    // Not a git repo: fingerprints are degraded and cannot prove freshness even
    // after a passing verification.
    const verify = runCli(cwd, ["session", "verify", "--verify", "node -e \"console.log('ok')\"", "--json"], { CODEX_HOME: codexHome });
    assert.equal(verify.status, 0, verify.stderr);
    const verifyOutput = JSON.parse(verify.stdout);
    assert.equal(verifyOutput.verification.workspaceFingerprint.degraded, true);

    const status = runCli(cwd, ["session", "status", "--json"], { CODEX_HOME: codexHome });
    assert.equal(status.status, 0, status.stderr);
    const output = JSON.parse(status.stdout);
    assert.equal(output.evidence.evidenceFresh, false);
    assert.equal(output.evidence.verification, "stale");
    assert.equal(output.evidence.fingerprintReliable, false);
  } finally {
    await rm(cwd, { recursive: true, force: true });
    await rm(codexHome, { recursive: true, force: true });
  }
});

test("session verify --auto recommends without executing and --execute runs", async () => {
  const cwd = await tempDir();
  const codexHome = await tempDir();
  try {
    await initGitRepo(cwd);
    const setup = runCli(cwd, ["setup", "codex-session", "--scope", "project", "--json"], { CODEX_HOME: codexHome });
    assert.equal(setup.status, 0, setup.stderr);
    // Single strong candidate: a package.json with only a test script.
    await writeFile(join(cwd, "package.json"), `${JSON.stringify({
      name: "fixture",
      scripts: { test: "node -e \"console.log('auto-ok')\"" },
    }, null, 2)}\n`);

    const recommend = runCli(cwd, ["session", "verify", "--auto", "--json"], { CODEX_HOME: codexHome });
    assert.equal(recommend.status, 0, recommend.stderr);
    const recommendOutput = JSON.parse(recommend.stdout);
    assert.equal(recommendOutput.mode, "recommend");
    assert.equal(recommendOutput.executed, false);
    assert.equal(recommendOutput.detection.recommended, "npm test");
    // Detect-and-recommend-only must not record a verification.
    const afterRecommend = runCli(cwd, ["session", "status", "--json"], { CODEX_HOME: codexHome });
    assert.equal(JSON.parse(afterRecommend.stdout).state.verifications.length, 0);

    const execute = runCli(cwd, ["session", "verify", "--auto", "--execute", "--json"], { CODEX_HOME: codexHome });
    assert.equal(execute.status, 0, execute.stderr);
    const executeOutput = JSON.parse(execute.stdout);
    assert.equal(executeOutput.executed, true);
    assert.deepEqual(executeOutput.verification.commands, ["npm test"]);
    assert.equal(executeOutput.state.verifications.length, 1);
  } finally {
    await rm(cwd, { recursive: true, force: true });
    await rm(codexHome, { recursive: true, force: true });
  }
});

test("session verify --auto --execute still enforces the policy preflight danger block", async () => {
  const cwd = await tempDir();
  const codexHome = await tempDir();
  try {
    await initGitRepo(cwd);
    // An explicit dangerous command via --auto --execute must still be blocked.
    const verify = runCli(cwd, ["session", "verify", "--auto", "--execute", "--verify", "rm -rf /", "--json"], { CODEX_HOME: codexHome });
    assert.equal(verify.status, 1);
    const output = JSON.parse(verify.stdout);
    assert.equal(output.verification.status, "blocked");
    assert.equal(output.policy.status, "blocked");
    // Blocked path records a fingerprint but must NOT promote lastVerifiedFingerprint.
    assert.ok(output.verification.workspaceFingerprint);
    assert.equal(output.state.lastVerifiedFingerprint, null);
  } finally {
    await rm(cwd, { recursive: true, force: true });
    await rm(codexHome, { recursive: true, force: true });
  }
});
