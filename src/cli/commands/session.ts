import { writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { assertMaxPositionals, flagArray, flagBool, flagString, type ParsedArgs } from "../args.ts";
import { loadConfig } from "../../config/loader.ts";
import { runPolicyPreflight } from "../../policy/preflight.ts";
import { runVerification } from "../../verification/runner.ts";
import {
  createCheckpointId,
  createVerificationId,
  migrateSessionStateFile,
  overlayStatus,
  recordSessionHookEvent,
  readSessionStateWithMigration,
  refreshSessionState,
  sessionPaths,
  updateSessionState,
} from "../../session/state.ts";
import { inspectNotifyHookConfig } from "../../session/hook-config.ts";
import { ensureDir, writeJsonAtomic } from "../../util/fs.ts";

function statePath(cwd: string): string {
  return sessionPaths(cwd).state;
}

async function statusCommand(cwd: string, json: boolean): Promise<void> {
  const paths = sessionPaths(cwd);
  const stateRead = await readSessionStateWithMigration(cwd);
  const notifyHook = await inspectNotifyHookConfig(cwd);
  const state = stateRead.state ? await refreshSessionState(cwd, stateRead.state) : null;
  const result = {
    schemaVersion: 1,
    status: state ? "initialized" : "not_initialized",
    cwd,
    paths,
    overlays: {
      project: await overlayStatus(cwd, "project"),
      user: await overlayStatus(cwd, "user"),
    },
    notifyHook,
    notifyDispatch: state?.notifyDispatch ?? {
      status: notifyHook.installed ? "unobserved" : "not_configured",
      lastTurnEndedAt: null,
      lastObservedAt: null,
      runtimeSurface: "unknown",
      caveat: notifyHook.installed
        ? "Codexus notify is configured in Codex CLI config, but no session state exists yet and no real turn-ended dispatch has been observed."
        : "Codexus notify is not configured in Codex CLI config.",
    },
    migration: stateRead.migration,
    state,
  };
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`Codexus session: ${result.status}`);
  console.log(`State: ${statePath(cwd)}`);
  console.log(`Project overlay: ${result.overlays.project.installed ? "installed" : "missing"}`);
  console.log(`Notify hook: ${result.notifyHook.status}`);
}

async function migrateCommand(args: ParsedArgs, cwd: string, json: boolean): Promise<void> {
  assertMaxPositionals(args, 1);
  const result = await migrateSessionStateFile(cwd, {
    dryRun: flagBool(args.flags, "dry-run"),
  });
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`Session migration: ${result.status}`);
  console.log(result.statePath);
}

async function checkpointCommand(args: ParsedArgs, cwd: string, json: boolean): Promise<void> {
  const label = args.positionals.slice(1).join(" ").trim();
  if (!label) throw new Error("missing_session_checkpoint_label");
  const id = createCheckpointId();
  const paths = sessionPaths(cwd);
  const checkpointDir = join(paths.checkpointsDir, id);
  const markdownPath = join(checkpointDir, "checkpoint.md");
  const metadataPath = join(checkpointDir, "checkpoint.json");
  const createdAt = new Date().toISOString();
  await ensureDir(checkpointDir);
  const record = {
    id,
    label,
    createdAt,
    path: markdownPath,
    metadataPath,
  };
  const markdown = [
    `# ${label}`,
    "",
    `- id: ${id}`,
    `- createdAt: ${createdAt}`,
    `- cwd: ${cwd}`,
    "",
    "This checkpoint records an explicit Codexus session boundary. The active Codex conversation remains the primary source of narrative context.",
    "",
  ].join("\n");
  await writeFile(markdownPath, markdown);
  await writeJsonAtomic(metadataPath, {
    schemaVersion: 1,
    type: "codexus.session.checkpoint",
    ...record,
  });
  const state = await updateSessionState(cwd, "session checkpoint", (value) => ({
    ...value,
    checkpoints: [...value.checkpoints, record],
  }));
  const result = { schemaVersion: 1, checkpoint: record, statePath: statePath(cwd), state };
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`Checkpoint recorded: ${id}`);
  console.log(markdownPath);
}

async function verifyCommand(args: ParsedArgs, cwd: string, json: boolean): Promise<void> {
  const commands = flagArray(args.flags, "verify");
  if (commands.length === 0) throw new Error("missing_session_verification_command");
  assertMaxPositionals(args, 1);
  const { config } = loadConfig({ cwd });
  const id = createVerificationId();
  const paths = sessionPaths(cwd);
  const verificationDir = join(paths.verificationDir, id);
  const artifactsDir = join(verificationDir, "artifacts");
  const verificationPath = join(verificationDir, "verification.json");
  await ensureDir(verificationDir);
  const policy = runPolicyPreflight({
    cwd,
    prompt: "",
    verificationCommands: commands,
  });
  if (policy.status === "blocked") {
    const createdAt = new Date().toISOString();
    const record = {
      id,
      createdAt,
      status: "blocked",
      commands,
      path: verificationPath,
      artifactsDir,
    };
    await writeJsonAtomic(verificationPath, {
      schemaVersion: 1,
      type: "codexus.session.verification",
      ...record,
      policy,
      verification: { schemaVersion: 1, status: "error", commands: [] },
    });
    const state = await updateSessionState(cwd, "session verify", (value) => ({
      ...value,
      verifications: [...value.verifications, record],
    }));
    const result = { schemaVersion: 1, verification: record, policy, statePath: statePath(cwd), state };
    if (json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`Session verification blocked: ${id}`);
      console.log(verificationPath);
    }
    process.exitCode = 1;
    return;
  }
  const verification = await runVerification({
    cwd,
    commands,
    artifactsDir,
    timeoutMs: config.verification.timeoutMs,
  });
  const createdAt = new Date().toISOString();
  const record = {
    id,
    createdAt,
    status: verification.status,
    commands,
    path: verificationPath,
    artifactsDir,
  };
  await writeJsonAtomic(verificationPath, {
    schemaVersion: 1,
    type: "codexus.session.verification",
    ...record,
    policy,
    verification,
  });
  const state = await updateSessionState(cwd, "session verify", (value) => ({
    ...value,
    verifications: [...value.verifications, record],
  }));
  const result = { schemaVersion: 1, verification: record, result: verification, statePath: statePath(cwd), state };
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = verification.status === "passed" || verification.status === "skipped" ? 0 : 1;
    return;
  }
  console.log(`Session verification ${verification.status}: ${id}`);
  console.log(verificationPath);
  process.exitCode = verification.status === "passed" || verification.status === "skipped" ? 0 : 1;
}

async function notifyCommand(args: ParsedArgs, cwd: string, json: boolean): Promise<void> {
  assertMaxPositionals(args, 1);
  const event = flagString(args.flags, "event") ?? "turn-ended";
  const { record, state } = await recordSessionHookEvent(cwd, event);
  const result = {
    schemaVersion: 1,
    notification: record,
    statePath: statePath(cwd),
    state,
  };
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`Session notification recorded: ${record.id}`);
}

export async function sessionCommand(args: ParsedArgs): Promise<void> {
  const subcommand = args.positionals[0] ?? "status";
  const cwd = resolve(flagString(args.flags, "cwd") ?? process.cwd());
  const json = flagBool(args.flags, "json");
  if (subcommand === "status") {
    assertMaxPositionals(args, 1);
    await statusCommand(cwd, json);
    return;
  }
  if (subcommand === "checkpoint") {
    await checkpointCommand(args, cwd, json);
    return;
  }
  if (subcommand === "verify") {
    await verifyCommand(args, cwd, json);
    return;
  }
  if (subcommand === "notify") {
    await notifyCommand(args, cwd, json);
    return;
  }
  if (subcommand === "migrate") {
    await migrateCommand(args, cwd, json);
    return;
  }
  throw new Error(`unsupported_session_command:${subcommand}`);
}
