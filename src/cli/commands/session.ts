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
import { listDecisionArtifacts, readDecisionArtifact, recordDecisionArtifact, summarizeDecisions } from "../../session/decisions.ts";
import { summarizeVerificationLoop } from "../../session/loop.ts";
import { computeWorkspaceFingerprint } from "../../session/workspace-fingerprint.ts";
import { detectVerifyCandidates } from "../../session/verify-detect.ts";
import { completeSubagentArtifact, createSubagentLaunchContract, probeSubagentBridge, readSubagentStatusArtifact, recordSubagentArtifact, summarizeSubagentClaims } from "../../session/subagents.ts";
import { addSessionTask, blockSessionTask, completeSessionTask, listSessionTasks, readSessionTasks, summarizeSessionTasks, updateSessionTask } from "../../session/tasks.ts";
import { buildControlPlaneSummary } from "../../control/control-plane.ts";
import { readCodexusVersionInfo } from "./version.ts";
import { buildUpdateSummary } from "../../update/check.ts";
import { ensureDir, writeJsonAtomic } from "../../util/fs.ts";
import { summarizeAppInstanceEvidence } from "../../app-instance/launcher.ts";
import { summarizeWikiContextApprovals } from "../../wiki/wiki.ts";
import { appServerObserverStatus } from "../../experiments/app-server-observer.ts";

function statePath(cwd: string): string {
  return sessionPaths(cwd).state;
}

async function sessionStatusProjection(cwd: string) {
  const paths = sessionPaths(cwd);
  const stateRead = await readSessionStateWithMigration(cwd);
  const notifyHook = await inspectNotifyHookConfig(cwd);
  const state = stateRead.state ? await refreshSessionState(cwd, stateRead.state) : null;
  const detection = detectVerifyCandidates(cwd);
  const evidence = state
    ? deriveEvidenceModel(state, computeWorkspaceFingerprint(cwd), detection.recommended)
    : null;
  const changeEvidenceReport = buildChangeEvidenceReport(cwd, state, {});
  const changeEvidence = changeEvidenceReport.changeEvidence;
  const riskSummary = {
    schemaVersion: 1 as const,
    status: changeEvidence.status,
    fileCount: changeEvidenceReport.diff.files.length,
    diffBase: changeEvidenceReport.diff.diffBase,
    includesStaged: changeEvidenceReport.diff.includesStaged,
    includesUntracked: changeEvidenceReport.diff.includesUntracked,
    areas: [...new Set(changeEvidenceReport.diff.files.map((file) => file.split("/")[0] || file))].sort(),
  };
  const decisions = await summarizeDecisions(cwd);
  const loop = summarizeVerificationLoop(state);
  const subagents = summarizeSubagentClaims(state);
  const controlPlane = buildControlPlaneSummary(cwd, state);
  const taskArtifact = await readSessionTasks(cwd);
  const tasks = summarizeSessionTasks(cwd, taskArtifact);
  const version = readCodexusVersionInfo();
  const update = buildUpdateSummary({ currentVersion: version.version, cacheOnly: true });
  const appInstances = await summarizeAppInstanceEvidence(cwd);
  const wikiContext = await summarizeWikiContextApprovals(cwd);
  const appServerObserver = await appServerObserverStatus(cwd);
  return {
    schemaVersion: 1,
    stability: "stable" as const,
    status: state ? "initialized" : "not_initialized",
    cwd,
    paths,
    evidence,
    changeEvidence,
    riskSummary,
    decisions,
    loop,
    subagents,
    tasks,
    controlPlane,
    evidenceLoop: {
      schemaVersion: 1,
      stability: "experimental" as const,
      appInstances,
      wikiContext,
      appServerObserver,
      completionAuthority: false as const,
    },
    update,
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
}

async function statusCommand(cwd: string, json: boolean): Promise<void> {
  const result = await sessionStatusProjection(cwd);
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`Codexus session: ${result.status}`);
  console.log(`State: ${statePath(cwd)}`);
  console.log(`Project overlay: ${result.overlays.project.installed ? "installed" : "missing"}`);
  console.log(`Notify hook: ${result.notifyHook.status}`);
  if (result.evidence) {
    console.log(`Verification: ${result.evidence.verification} (evidenceFresh: ${result.evidence.evidenceFresh})`);
    console.log(`Dirty since last verify: ${result.evidence.dirtySinceLastVerify}`);
    console.log(`Recommended verify: ${result.evidence.recommendedVerify ?? "none"}`);
  }
  console.log(`Decisions: ${result.decisions.count}`);
  console.log(`Loop: ${result.loop.status} (${result.loop.repeatedFailureCount}/${result.loop.threshold})`);
  console.log(`Tasks: ${result.tasks.status} (${result.tasks.counts.total})`);
  console.log(`Risk: ${result.riskSummary.status} (${result.riskSummary.fileCount} files)`);
  console.log(`Control plane: ${result.controlPlane.status}`);
  console.log(`Policy catalog: ${result.controlPlane.policyCatalog.status}`);
  console.log(`App evidence: ${result.evidenceLoop.appInstances.status} (${result.evidenceLoop.appInstances.observations.total} observations)`);
  console.log(`App-server observer: ${result.evidenceLoop.appServerObserver.observerBridge.status}`);
  console.log(`Wiki context approvals: ${result.evidenceLoop.wikiContext.status} (${result.evidenceLoop.wikiContext.approvals.total})`);
}

async function hudCommand(cwd: string, json: boolean): Promise<void> {
  const status = await sessionStatusProjection(cwd);
  const lastCheckpoint = status.state?.checkpoints.at(-1) ?? null;
  const lastVerification = status.state?.verifications.at(-1) ?? null;
  const result = {
    schemaVersion: 1,
    stability: "stable" as const,
    cwd,
    status: status.status,
    evidence: status.evidence
      ? {
        verification: status.evidence.verification,
        evidenceFresh: status.evidence.evidenceFresh,
        dirtySinceLastVerify: status.evidence.dirtySinceLastVerify,
        recommendedVerify: status.evidence.recommendedVerify,
      }
      : null,
    changeEvidence: status.changeEvidence,
    riskSummary: status.riskSummary,
    decisions: status.decisions,
    loop: status.loop,
    tasks: status.tasks,
    controlPlane: status.controlPlane,
    evidenceLoop: status.evidenceLoop,
    notifyDispatch: status.notifyDispatch,
    capabilities: status.state?.capabilities ?? null,
    counts: {
      checkpoints: status.state?.checkpoints.length ?? 0,
      verifications: status.state?.verifications.length ?? 0,
      subagentClaims: status.subagents.count,
      decisions: status.decisions.count,
      tasks: status.tasks.counts.total,
      deferredSelfReports: status.controlPlane.counts.deferredSelfReports,
      policyObserved: status.controlPlane.counts.policyObserved,
      policyAdvisory: status.controlPlane.counts.policyAdvisory,
      policyUnavailable: status.controlPlane.counts.policyUnavailable,
      appInstanceObservations: status.evidenceLoop.appInstances.observations.total,
      appServerObserverStageB: status.evidenceLoop.appServerObserver.counts.stageB,
      wikiContextApprovals: status.evidenceLoop.wikiContext.approvals.total,
      hookEvents: status.state?.hookEvents.length ?? 0,
    },
    lastDecision: status.decisions.lastDecision,
    lastCheckpoint,
    lastVerification,
  };
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`Codexus HUD: ${result.status}`);
  console.log(`Verification: ${result.evidence?.verification ?? "unknown"}`);
  console.log(`Change evidence: ${result.changeEvidence.status}`);
  console.log(`Risk: ${result.riskSummary.status}`);
  console.log(`Loop: ${result.loop.status}`);
  console.log(`Tasks: ${result.tasks.status} (${result.tasks.counts.total})`);
  console.log(`Decisions: ${result.counts.decisions}`);
  console.log(`Control plane: ${result.controlPlane.status}`);
  console.log(`Deferred self-reports: ${result.controlPlane.deferredSelfReports.status}`);
  console.log(`Policy catalog: ${result.controlPlane.policyCatalog.status}`);
  console.log(`App evidence: ${result.evidenceLoop.appInstances.status}`);
  console.log(`App-server observer: ${result.evidenceLoop.appServerObserver.observerBridge.status}`);
  console.log(`Wiki context approvals: ${result.evidenceLoop.wikiContext.status}`);
  console.log(`Notify: ${result.notifyDispatch.status}`);
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
  const result = { schemaVersion: 1, stability: "stable" as const, checkpoint: record, statePath: statePath(cwd), state };
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
    stability: "stable" as const,
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
    const result = { schemaVersion: 1, stability: "stable" as const, mode: "execute" as const, executed: false, verification: record, policy, detection, statePath: statePath(cwd), state };
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
  const result = { schemaVersion: 1, stability: "stable" as const, mode: "execute" as const, executed: true, verification: record, result: verification, detection, statePath: statePath(cwd), state };
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
    stability: "stable" as const,
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

async function decisionCommand(args: ParsedArgs, cwd: string, json: boolean): Promise<void> {
  const action = args.positionals[1] ?? "list";
  if (action === "record") {
    assertAllowedFlags(args, ["json", "cwd", "kind", "summary", "rationale", "constraint", "rejected", "evidence-link"]);
    const positionalSummary = args.positionals.slice(2).join(" ").trim();
    const result = await recordDecisionArtifact(cwd, {
      kind: flagString(args.flags, "kind"),
      summary: flagString(args.flags, "summary") ?? positionalSummary,
      rationale: flagString(args.flags, "rationale") ?? null,
      constraints: flagArray(args.flags, "constraint"),
      rejectedAlternatives: flagArray(args.flags, "rejected"),
      evidenceLinks: flagArray(args.flags, "evidence-link"),
    });
    if (json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    console.log(`Decision recorded: ${result.decision.decisionId}`);
    console.log(result.artifactPath);
    return;
  }
  if (action === "list") {
    assertAllowedFlags(args, ["json", "cwd"]);
    assertMaxPositionals(args, 2);
    const decisions = await listDecisionArtifacts(cwd);
    const result = {
      schemaVersion: 1,
      stability: "experimental" as const,
      cwd,
      decisions,
      summary: await summarizeDecisions(cwd),
    };
    if (json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    console.log(`Decisions: ${result.summary.count}`);
    for (const entry of result.summary.recent) {
      console.log(`${entry.decisionId} ${entry.kind}: ${entry.summary}`);
    }
    return;
  }
  if (action === "status") {
    assertAllowedFlags(args, ["json", "cwd"]);
    const decisionId = args.positionals[2];
    if (!decisionId) throw new Error("missing_decision_id");
    assertMaxPositionals(args, 3);
    const result = {
      schemaVersion: 1,
      stability: "experimental" as const,
      kind: "decision" as const,
      ...(await readDecisionArtifact(cwd, decisionId)),
    };
    if (json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    console.log(`Decision ${result.artifact.decisionId}: ${result.artifact.summary}`);
    console.log(result.artifactPath);
    return;
  }
  throw new Error(`unsupported_session_decision_command:${action}`);
}

async function loopCommand(args: ParsedArgs, cwd: string, json: boolean): Promise<void> {
  assertAllowedFlags(args, ["json", "cwd"]);
  assertMaxPositionals(args, 1);
  const stateRead = await readSessionStateWithMigration(cwd);
  const state = stateRead.state ? await refreshSessionState(cwd, stateRead.state) : null;
  const result = {
    schemaVersion: 1,
    stability: "experimental" as const,
    cwd,
    loop: summarizeVerificationLoop(state),
    migration: stateRead.migration,
  };
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`Session loop: ${result.loop.status}`);
  console.log(result.loop.reason);
}

async function subagentCommand(args: ParsedArgs, cwd: string, json: boolean): Promise<void> {
  const action = args.positionals[1] ?? "status";
  if (action === "probe") {
    assertAllowedFlags(args, ["json", "cwd", "record"]);
    assertMaxPositionals(args, 2);
    const result = await probeSubagentBridge(cwd, { record: flagBool(args.flags, "record") });
    if (json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    console.log(`Subagent bridge: ${result.probe.outcome}`);
    console.log(result.probe.caveat);
    if (result.artifactPath) console.log(result.artifactPath);
    return;
  }
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
  if (action === "launch") {
    assertAllowedFlags(args, ["json", "cwd", "role", "task"]);
    assertMaxPositionals(args, 2);
    const task = flagString(args.flags, "task");
    if (!task) throw new Error("missing_subagent_task");
    const result = await createSubagentLaunchContract(cwd, {
      role: flagString(args.flags, "role") ?? "subagent",
      task,
    });
    if (json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    console.log(`Subagent launch unavailable; contract recorded: ${result.launch.taskId}`);
    console.log(result.artifactPath);
    console.log(result.launch.launcher.recoveryHint);
    return;
  }
  if (action === "complete") {
    assertAllowedFlags(args, [
      "json",
      "cwd",
      "role",
      "task-id",
      "claim",
      "limitation",
      "evidence-link",
      "confidence",
      "assumptions-surfaced",
      "simplest-sufficient-change",
      "surgical-scope",
      "verification-evidence-present",
    ]);
    assertMaxPositionals(args, 2);
    const result = await completeSubagentArtifact(cwd, {
      role: flagString(args.flags, "role"),
      taskId: flagString(args.flags, "task-id"),
      claims: flagArray(args.flags, "claim"),
      limitations: flagArray(args.flags, "limitation"),
      evidenceLinks: flagArray(args.flags, "evidence-link"),
      confidence: flagString(args.flags, "confidence"),
      assumptionsSurfaced: flagString(args.flags, "assumptions-surfaced"),
      simplestSufficientChange: flagString(args.flags, "simplest-sufficient-change"),
      surgicalScope: flagString(args.flags, "surgical-scope"),
      verificationEvidencePresent: flagString(args.flags, "verification-evidence-present"),
    });
    if (json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    console.log(`Subagent completion claims recorded: ${result.artifact.taskId}`);
    console.log(result.artifactPath);
    return;
  }
  if (action === "status") {
    assertAllowedFlags(args, ["json", "cwd"]);
    const taskId = args.positionals[2];
    if (!taskId) throw new Error("missing_subagent_id");
    assertMaxPositionals(args, 3);
    const status = await readSubagentStatusArtifact(cwd, taskId);
    if (json) {
      const stability = status.kind === "launch" ? "deferred" : "stable";
      console.log(JSON.stringify({ schemaVersion: 1, stability, ...status }, null, 2));
      return;
    }
    if (status.kind === "result") {
      console.log(`Subagent ${status.artifact.taskId}: ${status.artifact.status}`);
      console.log(`Claims: ${status.artifact.claims.length}`);
      return;
    }
    console.log(`Subagent ${status.launch.taskId}: launch ${status.launch.status}`);
    console.log(status.launch.launcher.reason);
    return;
  }
  throw new Error(`unsupported_session_subagent_command:${action}`);
}

async function slopCommand(args: ParsedArgs, cwd: string, json: boolean): Promise<void> {
  assertAllowedFlags(args, ["json", "cwd", "since", "scope", "review", "gate"]);
  assertMaxPositionals(args, 1);
  const stateRead = await readSessionStateWithMigration(cwd);
  const state = stateRead.state ? await refreshSessionState(cwd, stateRead.state) : null;
  const report = {
    ...buildChangeEvidenceReport(cwd, state, {
      since: flagString(args.flags, "since"),
      scope: flagString(args.flags, "scope"),
      reviews: flagArray(args.flags, "review"),
      gate: flagBool(args.flags, "gate"),
    }),
    migration: stateRead.migration,
  };
  if (json) {
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.gate.exitCode;
    return;
  }
  console.log(`Change evidence: ${report.changeEvidence.status}`);
  console.log(`Gate: ${report.gate.status}`);
  console.log(`Verification: ${report.changeEvidence.verification}`);
  console.log(`Evidence gaps: ${report.evidenceGaps.length}`);
  console.log(`Derivable facts: ${report.derivableFacts.length}`);
  console.log(`Heuristic claims: ${report.heuristicClaims.length}`);
  process.exitCode = report.gate.exitCode;
}

async function workersCommand(args: ParsedArgs, cwd: string, json: boolean): Promise<void> {
  const action = args.positionals[1] ?? "status";
  if (action !== "status") throw new Error(`unsupported_session_workers_command:${action}`);
  assertAllowedFlags(args, ["json", "cwd"]);
  assertMaxPositionals(args, 2);
  const projection = await sessionStatusProjection(cwd);
  const tmux = projection.state?.capabilities.tmux ?? "unavailable";
  const result = {
    schemaVersion: 1,
    stability: "deferred" as const,
    status: tmux === "available" ? "gated" : "unavailable",
    tmux,
    workerLaunchSupported: false,
    reason: tmux === "available"
      ? "tmux is present, but Codexus tmux-backed worker launch remains gated until the session protocol is stable."
      : "tmux is not available; Codexus worker launch remains unavailable.",
  };
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`Session workers: ${result.status}`);
  console.log(result.reason);
}

async function tasksCommand(args: ParsedArgs, cwd: string, json: boolean): Promise<void> {
  const action = args.positionals[1] ?? "list";
  if (action === "list") {
    assertAllowedFlags(args, ["json", "cwd"]);
    assertMaxPositionals(args, 2);
    const result = await listSessionTasks(cwd);
    if (json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    console.log(`Session tasks: ${result.summary.status} (${result.summary.counts.total})`);
    for (const task of result.artifact.tasks) {
      console.log(`${task.taskId} [${task.status}] ${task.title}`);
    }
    return;
  }
  if (action === "add") {
    assertAllowedFlags(args, ["json", "cwd", "title", "status", "kind", "source"]);
    assertMaxPositionals(args, 2);
    const title = flagString(args.flags, "title") ?? args.positionals.slice(2).join(" ").trim();
    const result = await addSessionTask(cwd, {
      title,
      status: flagString(args.flags, "status"),
      kind: flagString(args.flags, "kind"),
      source: flagString(args.flags, "source"),
    });
    if (json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    console.log(`Session task added: ${result.task?.taskId}`);
    console.log(result.artifactPath);
    return;
  }
  if (action === "update") {
    assertAllowedFlags(args, ["json", "cwd", "title", "status", "kind", "source"]);
    const taskId = args.positionals[2];
    assertMaxPositionals(args, 3);
    const result = await updateSessionTask(cwd, taskId, {
      title: flagString(args.flags, "title"),
      status: flagString(args.flags, "status"),
      kind: flagString(args.flags, "kind"),
      source: flagString(args.flags, "source"),
    });
    if (json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    console.log(`Session task updated: ${result.task?.taskId}`);
    console.log(result.artifactPath);
    return;
  }
  if (action === "complete") {
    assertAllowedFlags(args, ["json", "cwd", "evidence", "evidence-link"]);
    const taskId = args.positionals[2];
    assertMaxPositionals(args, 3);
    const result = await completeSessionTask(cwd, taskId, {
      evidence: flagString(args.flags, "evidence") ?? flagString(args.flags, "evidence-link"),
    });
    if (json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    console.log(`Session task completed: ${result.task?.taskId}`);
    console.log(result.artifactPath);
    return;
  }
  if (action === "block") {
    assertAllowedFlags(args, ["json", "cwd", "reason"]);
    const taskId = args.positionals[2];
    assertMaxPositionals(args, 3);
    const result = await blockSessionTask(cwd, taskId, flagString(args.flags, "reason") ?? "");
    if (json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    console.log(`Session task blocked: ${result.task?.taskId}`);
    console.log(result.artifactPath);
    return;
  }
  throw new Error(`unsupported_session_tasks_command:${action}`);
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
  if (subcommand === "hud") {
    assertMaxPositionals(args, 1);
    await hudCommand(cwd, json);
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
  if (subcommand === "decision") {
    await decisionCommand(args, cwd, json);
    return;
  }
  if (subcommand === "loop") {
    await loopCommand(args, cwd, json);
    return;
  }
  if (subcommand === "subagent") {
    await subagentCommand(args, cwd, json);
    return;
  }
  if (subcommand === "tasks") {
    await tasksCommand(args, cwd, json);
    return;
  }
  if (subcommand === "workers") {
    await workersCommand(args, cwd, json);
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
