import { resolve } from "node:path";
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

const liveDispatchImplemented = true;
const automationBoundaryContractVersion = "automation-boundary-v1";
const automationActionAuthorityContractVersion = "automation-action-authority-v1";

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

export async function featureCommand(args: ParsedArgs, feature: GuardedFeature): Promise<void> {
  const topic = args.positionals[0] ?? "status";
  const cwd = resolve(flagString(args.flags, "cwd") ?? process.cwd());
  const { config } = loadConfig({ cwd });
  const driver = flagString(args.flags, "driver");
  if (driver === "mock" || driver === "codex-exec" || driver === "codex-app-server") {
    config.driver = driver;
  }
  const status = featureStatus(config, feature);
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
    console.log(JSON.stringify(status, null, 2));
    return;
  }
  console.log(`${feature}: ${status.status}`);
  console.log(status.reason);
}
