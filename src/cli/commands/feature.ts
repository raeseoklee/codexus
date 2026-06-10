import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { loadConfig } from "../../config/loader.ts";
import { executeRun } from "../../workflow/kernel.ts";
import { harnessRoot } from "../../ledger/paths.ts";
import { featureStatus, type GuardedFeature } from "../../policy/feature-gates.ts";
import { withFileLock } from "../../util/lock.ts";
import { writeJsonAtomic } from "../../util/fs.ts";
import { sha256Text } from "../../util/hash.ts";
import { createEventId } from "../../util/id.ts";
import { flagBool, flagString, type ParsedArgs } from "../args.ts";

interface AutomationDryRunRecord {
  schemaVersion: 1;
  dryRunId: string;
  recordedAt: string;
  plan: Record<string, unknown>;
  ledgerEvents: Array<{ type: string; dryRun: true; payload?: Record<string, unknown> }>;
  path: string;
}

interface AutomationDispatchRecord {
  schemaVersion: 1;
  dispatchId: string;
  recordedAt: string;
  plan: Record<string, unknown>;
  ledgerEvents: Array<{ type: string; dryRun: false; payload?: Record<string, unknown> }>;
  path: string;
}

interface AutomationRecoveryCandidate {
  dispatchId: string;
  path: string;
  recordedAt: string;
  planStatus: string | null;
  action: string | null;
  mode: string | null;
  runId: string | null;
  runOutcome: string | null;
  boundaryReason: string | null;
  needsManualReview: boolean;
  recoveryHint: string;
}

const liveDispatchImplemented = true;
const automationBoundaryContractVersion = "automation-boundary-v1";
const automationActionAuthorityContractVersion = "automation-action-authority-v1";
const automationSchedulerOwnershipContractVersion = "automation-scheduler-ownership-v1";

type AutomationBoundaryReason = "feature_gate_disabled" | "approval_missing" | "lock_unavailable";

function automationBoundaryPayload(feature: GuardedFeature, reason: AutomationBoundaryReason, requiredApproval: boolean, extra: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    contractVersion: automationBoundaryContractVersion,
    feature,
    reason,
    control_boundary: true,
    required_approval: requiredApproval,
    completionAuthority: false,
    ...extra,
  };
}

function automationPolicyContract(feature: GuardedFeature, enabled: boolean, dryRun: boolean, approvalPresent: boolean) {
  const dispatchAllowed = enabled && !dryRun && liveDispatchImplemented && approvalPresent;
  return {
    schemaVersion: 1,
    contractVersion: "policy-reviewed-live-dispatch-v1",
    feature,
    featureGateEnabled: enabled,
    liveDispatcherImplemented: liveDispatchImplemented,
    dispatchAllowed,
    dryRunLiveContractCompatible: true,
    approvalRequiredForLive: true,
    requestedMode: dryRun ? "dry-run" : "live",
    decision: dryRun
      ? "dry_run_allowed"
      : !enabled
        ? "live_blocked_by_feature_gate"
        : !approvalPresent
          ? "live_blocked_by_missing_approval"
          : "live_dispatch_allowed",
    reason: dryRun
      ? "dry-run can record policy evidence without dispatching work"
      : !enabled
        ? "feature gate is disabled in config"
        : !approvalPresent
          ? "feature gate is enabled but live dispatch still requires explicit approval"
          : "feature gate is enabled and the live dispatcher can run with explicit approval",
    requiredBeforeLive: [
      "permission.checked",
      "approval.requested",
      "approval.resolved",
      "automation.lock_acquired",
      "automation.dispatched",
      "automation.completed",
    ],
  };
}

function automationActionAuthority(feature: GuardedFeature, action: string, dryRun: boolean, dispatchAllowed: boolean) {
  return {
    schemaVersion: 1,
    contractVersion: automationActionAuthorityContractVersion,
    feature,
    actionSurface: `${feature}.${action}`,
    mode: dryRun ? "dry-run" : "live",
    sideEffects: {
      startsRun: dispatchAllowed,
      mutatesScheduler: false,
      mutatesGatewayListener: false,
      requiresLock: !dryRun,
      requiresExplicitApproval: !dryRun,
    },
    dispatcherAuthority: dispatchAllowed ? "linked_codexus_run" : "none",
    runOutcomeSource: dispatchAllowed ? "linked_codexus_run" : null,
    cleanupAuthority: false,
    healthAuthority: false,
    completionAuthority: false,
    caveat: "Automation dispatch can start a linked supervised Codexus run when approved, but the dispatcher does not own scheduler state, health, cleanup, or completion authority.",
  };
}

function automationSchedulerOwnership(feature: GuardedFeature, dispatchStorePath: string, dispatchRecordCount: number) {
  return {
    schemaVersion: 1,
    contractVersion: automationSchedulerOwnershipContractVersion,
    feature,
    status: "not_owned" as const,
    dispatchStorePath,
    dispatchRecordCount,
    queue: {
      owned: false as const,
      durableQueue: false as const,
      path: null as string | null,
      reason: "Codexus records foreground dispatch artifacts but does not own an unattended scheduler queue in this slice.",
    },
    lease: {
      supported: false as const,
      active: false as const,
      ownerId: null as string | null,
      heartbeat: false as const,
      reason: "No scheduler lease or heartbeat exists for unattended ownership.",
    },
    unattendedRetry: {
      supported: false as const,
      automaticRetry: false as const,
      requires: [
        "durable-queue-owner",
        "lease-heartbeat",
        "retry-policy",
        "fresh-explicit-approval-or-declared-policy",
        "recovery-proof",
      ],
    },
    authority: {
      schedulerAuthority: false as const,
      retryAuthority: false as const,
      cleanupAuthority: false as const,
      healthAuthority: false as const,
      completionAuthority: false as const,
    },
  };
}

function automationApprovalContract(dryRun: boolean, approvedBy: string | null) {
  const approvedAt = !dryRun && approvedBy ? new Date().toISOString() : null;
  return {
    schemaVersion: 1,
    requiredForLive: true,
    status: dryRun ? "not_requested_for_dry_run" : approvedBy ? "approved" : "required_but_not_requested",
    approvedBy,
    approvedAt,
    events: dryRun ? ["approval.resolved"] : ["approval.requested", "approval.resolved"],
  };
}

async function recordAutomationDryRun(cwd: string, plan: Record<string, unknown>): Promise<AutomationDryRunRecord> {
  const recordedAt = new Date().toISOString();
  const dryRunId = `automation_${plan.feature}_${Date.now()}`;
  const path = resolve(harnessRoot(cwd), "automation", String(plan.feature), "dry-runs", `${dryRunId}.json`);
  const record = {
    schemaVersion: 1,
    dryRunId,
    recordedAt,
    plan,
    ledgerEvents: [
      { type: "automation.requested", dryRun: true },
      { type: "automation.policy_checked", dryRun: true, payload: { policy: plan.policy as Record<string, unknown> } },
      { type: "approval.resolved", dryRun: true, payload: { status: "not_requested", reason: "dry_run" } },
      { type: "automation.lock_planned", dryRun: true },
      { type: "automation.dispatch_skipped", dryRun: true },
      { type: "automation.completed", dryRun: true },
    ],
    path,
  };
  await writeJsonAtomic(path, record);
  return record;
}

async function recordAutomationDispatch(cwd: string, plan: Record<string, unknown>, ledgerEvents: AutomationDispatchRecord["ledgerEvents"]): Promise<AutomationDispatchRecord> {
  const recordedAt = new Date().toISOString();
  const dispatchId = createEventId().replace(/^evt_/, "dispatch_");
  const path = resolve(harnessRoot(cwd), "automation", String(plan.feature), "dispatches", `${dispatchId}.json`);
  const record = {
    schemaVersion: 1,
    dispatchId,
    recordedAt,
    plan,
    ledgerEvents,
    path,
  };
  await writeJsonAtomic(path, record);
  return record;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

async function readAutomationDispatchRecords(cwd: string, feature: GuardedFeature) {
  const dir = join(harnessRoot(cwd), "automation", feature, "dispatches");
  if (!existsSync(dir)) return { dir, records: [] as Array<{ path: string; record: AutomationDispatchRecord | null; errors: string[] }> };
  const entries = (await readdir(dir)).filter((entry) => entry.endsWith(".json")).sort();
  const records = await Promise.all(entries.map(async (entry) => {
    const path = join(dir, entry);
    try {
      const parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
      if (!isRecord(parsed)) return { path, record: null, errors: ["dispatch_record:not_object"] };
      const record = parsed as AutomationDispatchRecord;
      const errors: string[] = [];
      if (record.schemaVersion !== 1) errors.push("schemaVersion:not_1");
      if (typeof record.dispatchId !== "string") errors.push("dispatchId:missing");
      if (typeof record.recordedAt !== "string") errors.push("recordedAt:missing");
      if (!Array.isArray(record.ledgerEvents)) errors.push("ledgerEvents:not_array");
      if (!isRecord(record.plan)) errors.push("plan:not_object");
      return { path, record: errors.length === 0 ? { ...record, path } : null, errors };
    } catch (error) {
      return { path, record: null, errors: [`json_unreadable:${error instanceof Error ? error.message : String(error)}`] };
    }
  }));
  return { dir, records };
}

function automationRecoveryCandidate(record: AutomationDispatchRecord): AutomationRecoveryCandidate {
  const boundary = record.ledgerEvents.find((event) => event.type === "automation.boundary_stop");
  const completed = record.ledgerEvents.find((event) => event.type === "automation.completed");
  const dispatched = record.ledgerEvents.find((event) => event.type === "automation.dispatched");
  const boundaryReason = isRecord(boundary?.payload) ? stringOrNull(boundary.payload.reason) : null;
  const runId = isRecord(dispatched?.payload)
    ? stringOrNull(dispatched.payload.runId)
    : isRecord(completed?.payload)
      ? stringOrNull(completed.payload.runId)
      : null;
  const runOutcome = isRecord(completed?.payload)
    ? stringOrNull(completed.payload.outcome) ?? stringOrNull(completed.payload.status)
    : null;
  const planStatus = isRecord(record.plan) ? stringOrNull(record.plan.status) : null;
  const action = isRecord(record.plan) ? stringOrNull(record.plan.action) : null;
  const mode = isRecord(record.plan) ? stringOrNull(record.plan.mode) : null;
  const needsManualReview = boundaryReason !== null || (runOutcome !== null && runOutcome !== "complete") || planStatus === "blocked";
  const recoveryHint = boundaryReason !== null
    ? `Resolve boundary '${boundaryReason}', then rerun with explicit approval if still desired.`
    : runOutcome !== null && runOutcome !== "complete"
      ? `Inspect linked run '${runId ?? "unknown"}' before any manual retry.`
      : needsManualReview
        ? "Inspect this dispatch record before any manual retry."
        : "No recovery action is implied by this dispatch record.";
  return {
    dispatchId: record.dispatchId,
    path: record.path,
    recordedAt: record.recordedAt,
    planStatus,
    action,
    mode,
    runId,
    runOutcome,
    boundaryReason,
    needsManualReview,
    recoveryHint,
  };
}

async function automationRecoveryProjection(cwd: string, feature: GuardedFeature, record: boolean) {
  const loaded = await readAutomationDispatchRecords(cwd, feature);
  const readable = loaded.records.filter((item): item is { path: string; record: AutomationDispatchRecord; errors: string[] } => item.record !== null);
  const candidates = readable.map((item) => automationRecoveryCandidate(item.record));
  const manualReviewCandidates = candidates.filter((candidate) => candidate.needsManualReview);
  const recordedAt = new Date().toISOString();
  const projection = {
    schemaVersion: 1,
    stability: "experimental" as const,
    type: "codexus.automation.recovery" as const,
    feature,
    command: `${feature} recovery` as const,
    cwd,
    recordedAt,
    dispatchStore: {
      path: loaded.dir,
      total: loaded.records.length,
      readable: readable.length,
      unreadable: loaded.records.length - readable.length,
      latestRecordedAt: candidates.map((candidate) => candidate.recordedAt).sort().at(-1) ?? null,
    },
    scheduler: {
      status: "foreground_dispatch_only" as const,
      queueOwned: false as const,
      unattendedOwner: false as const,
      mutatesScheduler: false as const,
      recoveryAuthority: false as const,
      completionAuthority: false as const,
      caveat: "Codexus can inspect foreground dispatch records, but it does not own an unattended scheduler queue in this slice.",
    },
    ownership: automationSchedulerOwnership(feature, loaded.dir, loaded.records.length),
    retry: {
      automaticRetry: false as const,
      retryAuthority: false as const,
      manualReviewRequired: manualReviewCandidates.length > 0,
      candidateCount: manualReviewCandidates.length,
      caveat: "Recovery candidates are advisory. Codexus will not retry automation dispatch without a fresh explicit command and approval.",
    },
    recovery: {
      status: loaded.records.length === 0
        ? "no_dispatches" as const
        : manualReviewCandidates.length > 0
          ? "manual_review_required" as const
          : "clear" as const,
      candidates,
      manualReviewCandidates,
      unreadableArtifacts: loaded.records
        .filter((item) => item.record === null)
        .map((item) => ({ path: item.path, errors: item.errors })),
      cleanupAuthority: false as const,
      healthAuthority: false as const,
      completionAuthority: false as const,
    },
    authority: {
      schedulerAuthority: false as const,
      retryAuthority: false as const,
      cleanupAuthority: false as const,
      healthAuthority: false as const,
      completionAuthority: false as const,
    },
    path: null as string | null,
  };
  if (!record) return projection;
  const recoveryId = `recovery_${feature}_${Date.now()}`;
  const path = join(harnessRoot(cwd), "automation", feature, "recovery", `${recoveryId}.json`);
  const recordedProjection = { ...projection, path };
  await writeJsonAtomic(path, recordedProjection);
  return recordedProjection;
}

export async function featureCommand(args: ParsedArgs, feature: GuardedFeature): Promise<void> {
  const topic = args.positionals[0] ?? "status";
  const cwd = resolve(flagString(args.flags, "cwd") ?? process.cwd());
  const { config } = loadConfig({ cwd });
  const driver = flagString(args.flags, "driver");
  if (driver === "mock" || driver === "codex-exec" || driver === "codex-app-server") {
    config.driver = driver;
  }
  const status = featureStatus(config, feature);
  if (topic === "recovery") {
    const result = await automationRecoveryProjection(cwd, feature, flagBool(args.flags, "record"));
    if (flagBool(args.flags, "json")) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    console.log(`${feature} recovery: ${result.recovery.status}`);
    return;
  }
  if (topic !== "status") {
    const expectedTopic = feature === "cron" ? "run-now" : "check";
    if (topic !== expectedTopic) throw new Error(`unsupported_feature:${feature}`);
    const dryRun = flagBool(args.flags, "dry-run");
    const prompt = flagString(args.flags, "task") ?? args.positionals.slice(1).join(" ").trim();
    const approvedBy = flagString(args.flags, "approved-by") ?? null;
    const approval = automationApprovalContract(dryRun, approvedBy);
    const policy = automationPolicyContract(feature, status.enabled, dryRun, approval.status === "approved");
    const actionAuthority = automationActionAuthority(feature, topic, dryRun, policy.dispatchAllowed);
    const plan = {
      schemaVersion: 1,
      stability: "experimental" as const,
      feature,
      action: topic,
      mode: dryRun ? "dry-run" : "live",
      status: dryRun ? "planned" : "blocked",
      enabled: status.enabled,
      promptHash: prompt ? sha256Text(prompt) : null,
      lockName: `automation-${feature}`,
      policy,
      approval,
      actionAuthority,
      ledgerEvents: [
        "automation.requested",
        "automation.policy_checked",
        "approval.requested",
        "approval.resolved",
        "automation.completed",
      ],
      reason: dryRun
        ? "dry-run only; no scheduler, gateway listener, or run ledger was mutated"
        : policy.reason,
    };
    const record = dryRun && flagBool(args.flags, "record")
      ? await recordAutomationDryRun(cwd, plan)
      : null;
    if (!dryRun) {
      if (!status.enabled) {
        const blocked = {
          ...plan,
          status: "blocked" as const,
          ledgerEvents: ["automation.requested", "automation.policy_checked", "approval.requested", "approval.resolved", "automation.completed"],
          reason: "feature gate is disabled in config",
        };
        const blockedRecord = await recordAutomationDispatch(cwd, blocked, [
          { type: "automation.requested", dryRun: false },
          { type: "automation.policy_checked", dryRun: false, payload: { policy } },
          { type: "approval.requested", dryRun: false, payload: { required: true } },
          { type: "approval.resolved", dryRun: false, payload: { status: "not_requested", reason: "feature_disabled" } },
          { type: "automation.boundary_stop", dryRun: false, payload: automationBoundaryPayload(feature, "feature_gate_disabled", true) },
          { type: "automation.completed", dryRun: false, payload: { status: "blocked", ...automationBoundaryPayload(feature, "feature_gate_disabled", true) } },
        ]);
        if (flagBool(args.flags, "json")) {
          console.log(JSON.stringify({ ...blocked, record: blockedRecord }, null, 2));
          process.exitCode = 1;
          return;
        }
        console.log(`${feature} ${topic}: blocked`);
        console.log(blocked.reason);
        console.log(`dispatch record: ${blockedRecord.path}`);
        process.exitCode = 1;
        return;
      }
      if (!approvedBy) {
        const blocked = {
          ...plan,
          status: "blocked" as const,
          reason: "live dispatch requires explicit approval identity",
        };
        const blockedRecord = await recordAutomationDispatch(cwd, blocked, [
          { type: "automation.requested", dryRun: false },
          { type: "automation.policy_checked", dryRun: false, payload: { policy } },
          { type: "approval.requested", dryRun: false, payload: { required: true } },
          { type: "approval.resolved", dryRun: false, payload: { status: "required_but_not_requested" } },
          { type: "automation.boundary_stop", dryRun: false, payload: automationBoundaryPayload(feature, "approval_missing", true) },
          { type: "automation.completed", dryRun: false, payload: { status: "blocked", ...automationBoundaryPayload(feature, "approval_missing", true) } },
        ]);
        if (flagBool(args.flags, "json")) {
          console.log(JSON.stringify({ ...blocked, record: blockedRecord }, null, 2));
          process.exitCode = 1;
          return;
        }
        console.log(`${feature} ${topic}: blocked`);
        console.log(blocked.reason);
        console.log(`dispatch record: ${blockedRecord.path}`);
        process.exitCode = 1;
        return;
      }
      if (!prompt) throw new Error("missing_automation_task");
      const lockName = `automation-${feature}`;
      const requestedAt = new Date().toISOString();
      try {
        const dispatchResult = await withFileLock(cwd, lockName, async () => {
          const runResult = await executeRun({ cwd, prompt, config });
          const finalStatus = runResult.outcome === "complete"
            ? "completed"
            : runResult.outcome === "cancelled"
              ? "cancelled"
              : runResult.outcome;
          const completedPlan = {
            ...plan,
            status: finalStatus,
            requestedAt,
            reason: `automation dispatched through ${config.driver}`,
            run: runResult,
          };
          const completedRecord = await recordAutomationDispatch(cwd, completedPlan, [
            { type: "automation.requested", dryRun: false },
            { type: "automation.policy_checked", dryRun: false, payload: { policy } },
            { type: "approval.requested", dryRun: false, payload: { required: true } },
            { type: "approval.resolved", dryRun: false, payload: { status: "approved", approvedBy, approvedAt: approval.approvedAt } },
            { type: "automation.lock_acquired", dryRun: false, payload: { lockName } },
            { type: "automation.dispatched", dryRun: false, payload: { driver: config.driver, runId: runResult.runId } },
            { type: "automation.completed", dryRun: false, payload: { outcome: runResult.outcome, runId: runResult.runId } },
          ]);
          return { completedPlan, completedRecord, runResult };
        }, {
          operation: `${feature}-dispatch`,
        });
        if (flagBool(args.flags, "json")) {
          console.log(JSON.stringify({ ...dispatchResult.completedPlan, record: dispatchResult.completedRecord }, null, 2));
          process.exitCode = dispatchResult.runResult.outcome === "complete" ? 0 : 1;
          return;
        }
        console.log(`${feature} ${topic}: ${dispatchResult.completedPlan.status}`);
        console.log(`dispatch record: ${dispatchResult.completedRecord.path}`);
        console.log(`run: ${dispatchResult.runResult.runId}`);
        process.exitCode = dispatchResult.runResult.outcome === "complete" ? 0 : 1;
        return;
      } catch (error) {
        if (!(error instanceof Error) || !error.message.startsWith("lock_unavailable:")) throw error;
        const blocked = {
          ...plan,
          status: "blocked" as const,
          requestedAt,
          reason: `automation lock is already held for ${feature}`,
        };
        const blockedRecord = await recordAutomationDispatch(cwd, blocked, [
          { type: "automation.requested", dryRun: false },
          { type: "automation.policy_checked", dryRun: false, payload: { policy } },
          { type: "approval.requested", dryRun: false, payload: { required: true } },
          { type: "approval.resolved", dryRun: false, payload: { status: "approved", approvedBy, approvedAt: approval.approvedAt } },
          { type: "automation.lock_unavailable", dryRun: false, payload: { lockName } },
          { type: "automation.boundary_stop", dryRun: false, payload: automationBoundaryPayload(feature, "lock_unavailable", true, { lockName }) },
          { type: "automation.completed", dryRun: false, payload: { status: "blocked", ...automationBoundaryPayload(feature, "lock_unavailable", true, { lockName }) } },
        ]);
        if (flagBool(args.flags, "json")) {
          console.log(JSON.stringify({ ...blocked, record: blockedRecord }, null, 2));
          process.exitCode = 1;
          return;
        }
        console.log(`${feature} ${topic}: blocked`);
        console.log(blocked.reason);
        console.log(`dispatch record: ${blockedRecord.path}`);
        process.exitCode = 1;
        return;
      }
    }
    if (flagBool(args.flags, "json")) {
      console.log(JSON.stringify({ ...plan, record }, null, 2));
      process.exitCode = dryRun ? 0 : 1;
      return;
    }
    console.log(`${feature} ${topic}: ${plan.status}`);
    console.log(plan.reason);
    if (record) console.log(`dry-run record: ${record.path}`);
    process.exitCode = dryRun ? 0 : 1;
    return;
  }
  if (flagBool(args.flags, "json")) {
    const recovery = await automationRecoveryProjection(cwd, feature, false);
    console.log(JSON.stringify({
      ...status,
      scheduler: recovery.scheduler,
      ownership: recovery.ownership,
      recovery: {
        status: recovery.recovery.status,
        manualReviewCandidates: recovery.retry.candidateCount,
        automaticRetry: recovery.retry.automaticRetry,
        cleanupAuthority: recovery.recovery.cleanupAuthority,
        completionAuthority: recovery.recovery.completionAuthority,
      },
    }, null, 2));
    return;
  }
  console.log(`${feature}: ${status.status}`);
  console.log(status.reason);
}
