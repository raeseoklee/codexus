import { writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { assertAllowedFlags, assertMaxPositionals, flagArray, flagBool, flagString, type ParsedArgs } from "../args.ts";
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
import { deriveEvidenceModel } from "../../session/evidence.ts";
import { buildChangeEvidenceReport } from "../../session/change-evidence.ts";
import { computeWorkspaceFingerprint } from "../../session/workspace-fingerprint.ts";
import { detectVerifyCandidates } from "../../session/verify-detect.ts";
import { readSubagentArtifact, recordSubagentArtifact, summarizeSubagentClaims } from "../../session/subagents.ts";
import { ensureDir, writeJsonAtomic } from "../../util/fs.ts";

function statePath(cwd: string): string {
  return sessionPaths(cwd).state;
}

async function statusCommand(cwd: string, json: boolean): Promise<void> {
  const paths = sessionPaths(cwd);
  const stateRead = await readSessionStateWithMigration(cwd);
  const notifyHook = await inspectNotifyHookConfig(cwd);
  const state = stateRead.state ? await refreshSessionState(cwd, stateRead.state) : null;
  const detection = detectVerifyCandidates(cwd);
  const evidence = state
    ? deriveEvidenceModel(state, computeWorkspaceFingerprint(cwd), detection.recommended)
    : null;
  const changeEvidence = buildChangeEvidenceReport(cwd, state, {}).changeEvidence;
  const subagents = summarizeSubagentClaims(state);
  const result = {
    schemaVersion: 1,
    status: state ? "initialized" : "not_initialized",
    cwd,
    paths,
    evidence,
    changeEvidence,
    subagents,
    verifyDetection: detection,
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
  if (evidence) {
    console.log(`Verification: ${evidence.verification} (evidenceFresh: ${evidence.evidenceFresh})`);
    console.log(`Dirty since last verify: ${evidence.dirtySinceLastVerify}`);
    console.log(`Recommended verify: ${evidence.recommendedVerify ?? "none"}`);
  }
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

// Detect-and-recommend-only path. `cx session verify --auto --json` returns a
// recommendation from project signals and never executes anything.
async function verifyAutoRecommendCommand(cwd: string, json: boolean): Promise<void> {
  const detection = detectVerifyCandidates(cwd);
  const result = {
    schemaVersion: 1,
    mode: "recommend" as const,
    executed: false,
    detection,
    statePath: statePath(cwd),
  };
  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(detection.recommended
      ? `Recommended verification: ${detection.recommended}`
      : detection.candidates.length > 0
        ? `Verification candidates: ${detection.candidates.join(", ")}`
        : "No verification command could be inferred.");
    console.log(detection.reason);
    console.log(detection.recommended
      ? "Run `cx session verify --auto --execute` to actually verify."
      : "Choose one with `cx session verify --verify \"<cmd>\"` to actually verify.");
  }
}

async function verifyCommand(args: ParsedArgs, cwd: string, json: boolean): Promise<void> {
  assertMaxPositionals(args, 1);
  // Reject unknown flags so typos error loudly instead of being silently
  // ignored, matching the other command handlers. These are every flag this
  // path reads: json/cwd are consumed by sessionCommand, verify/auto/execute here.
  assertAllowedFlags(args, ["json", "cwd", "verify", "auto", "execute"]);
  const auto = flagBool(args.flags, "auto");
  const execute = flagBool(args.flags, "execute");
  const explicitCommands = flagArray(args.flags, "verify");

  // Resolve the commands to run. --auto --execute resolves the recommended
  // command; --auto alone (no --execute, no --verify) is detect/recommend only.
  let commands = explicitCommands;
  let detection: ReturnType<typeof detectVerifyCandidates> | null = null;
  if (auto) {
    detection = detectVerifyCandidates(cwd);
    if (!execute && explicitCommands.length === 0) {
      await verifyAutoRecommendCommand(cwd, json);
      return;
    }
    if (explicitCommands.length === 0) {
      if (!detection.recommended) {
        throw new Error(detection.candidates.length > 0
          ? "ambiguous_session_verification_command"
          : "missing_session_verification_command");
      }
      commands = [detection.recommended];
    }
  }
  if (commands.length === 0) throw new Error("missing_session_verification_command");

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
    // Policy-blocked: nothing ran. We append a verification record (with a real,
    // non-degraded workspace fingerprint) for the audit trail, but we do NOT
    // update lastVerifiedFingerprint. Because lastVerifiedFingerprint is the only
    // input the evidence model promotes to "fresh", no fresh evidence is produced
    // by a blocked run.
    const fingerprint = computeWorkspaceFingerprint(cwd);
    const createdAt = new Date().toISOString();
    const record = {
      id,
      createdAt,
      status: "blocked",
      commands,
      path: verificationPath,
      artifactsDir,
      workspaceFingerprint: fingerprint,
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
    const result = { schemaVersion: 1, mode: "execute" as const, executed: false, verification: record, policy, detection, statePath: statePath(cwd), state };
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
  // Compute the fingerprint immediately after the verification runs so it
  // describes the workspace whose content was actually verified.
  const fingerprint = computeWorkspaceFingerprint(cwd);
  const createdAt = new Date().toISOString();
  const record = {
    id,
    createdAt,
    status: verification.status,
    commands,
    path: verificationPath,
    artifactsDir,
    workspaceFingerprint: fingerprint,
  };
  const lastVerifiedFingerprint = {
    verificationId: id,
    status: verification.status,
    recordedAt: createdAt,
    fingerprint,
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
    lastVerifiedFingerprint,
  }));
  const result = { schemaVersion: 1, mode: "execute" as const, executed: true, verification: record, result: verification, detection, statePath: statePath(cwd), state };
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

async function subagentCommand(args: ParsedArgs, cwd: string, json: boolean): Promise<void> {
  const action = args.positionals[1] ?? "status";
  if (action === "record") {
    assertAllowedFlags(args, ["json", "cwd", "file"]);
    assertMaxPositionals(args, 2);
    const file = flagString(args.flags, "file");
    if (!file) throw new Error("missing_subagent_file");
    const result = await recordSubagentArtifact(cwd, { mode: "record", inputFile: file });
    if (json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    console.log(`Subagent result recorded: ${result.artifact.taskId}`);
    console.log(result.artifactPath);
    return;
  }
  if (action === "attach") {
    assertAllowedFlags(args, ["json", "cwd", "role", "claim-file"]);
    assertMaxPositionals(args, 2);
    const file = flagString(args.flags, "claim-file");
    if (!file) throw new Error("missing_subagent_file");
    const result = await recordSubagentArtifact(cwd, {
      mode: "attach",
      role: flagString(args.flags, "role") ?? "subagent",
      inputFile: file,
    });
    if (json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    console.log(`Subagent claims attached: ${result.artifact.taskId}`);
    console.log(result.artifactPath);
    return;
  }
  if (action === "status") {
    assertAllowedFlags(args, ["json", "cwd"]);
    const taskId = args.positionals[2];
    if (!taskId) throw new Error("missing_subagent_id");
    assertMaxPositionals(args, 3);
    const artifact = await readSubagentArtifact(cwd, taskId);
    if (json) {
      console.log(JSON.stringify({ schemaVersion: 1, artifact }, null, 2));
      return;
    }
    console.log(`Subagent ${artifact.taskId}: ${artifact.status}`);
    console.log(`Claims: ${artifact.claims.length}`);
    return;
  }
  throw new Error(`unsupported_session_subagent_command:${action}`);
}

async function slopCommand(args: ParsedArgs, cwd: string, json: boolean): Promise<void> {
  assertAllowedFlags(args, ["json", "cwd", "since", "scope"]);
  assertMaxPositionals(args, 1);
  const stateRead = await readSessionStateWithMigration(cwd);
  const state = stateRead.state ? await refreshSessionState(cwd, stateRead.state) : null;
  const report = {
    ...buildChangeEvidenceReport(cwd, state, {
      since: flagString(args.flags, "since"),
      scope: flagString(args.flags, "scope"),
    }),
    migration: stateRead.migration,
  };
  if (json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  console.log(`Change evidence: ${report.changeEvidence.status}`);
  console.log(`Verification: ${report.changeEvidence.verification}`);
  console.log(`Evidence gaps: ${report.evidenceGaps.length}`);
  console.log(`Derivable facts: ${report.derivableFacts.length}`);
  console.log(`Heuristic claims: ${report.heuristicClaims.length}`);
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
  if (subcommand === "subagent") {
    await subagentCommand(args, cwd, json);
    return;
  }
  if (subcommand === "slop") {
    await slopCommand(args, cwd, json);
    return;
  }
  if (subcommand === "migrate") {
    await migrateCommand(args, cwd, json);
    return;
  }
  throw new Error(`unsupported_session_command:${subcommand}`);
}
