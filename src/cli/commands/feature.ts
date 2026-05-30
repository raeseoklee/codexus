import { resolve } from "node:path";
import { loadConfig } from "../../config/loader.ts";
import { harnessRoot } from "../../ledger/paths.ts";
import { featureStatus, type GuardedFeature } from "../../policy/feature-gates.ts";
import { writeJsonAtomic } from "../../util/fs.ts";
import { sha256Text } from "../../util/hash.ts";
import { flagBool, flagString, type ParsedArgs } from "../args.ts";

interface AutomationDryRunRecord {
  schemaVersion: 1;
  dryRunId: string;
  recordedAt: string;
  plan: Record<string, unknown>;
  ledgerEvents: Array<{ type: string; dryRun: true; payload?: Record<string, unknown> }>;
  path: string;
}

const liveDispatchImplemented = false;

function automationPolicyContract(feature: GuardedFeature, enabled: boolean, dryRun: boolean) {
  const dispatchAllowed = enabled && !dryRun && liveDispatchImplemented;
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
    decision: dryRun ? "dry_run_allowed" : enabled ? "live_requires_unimplemented_dispatcher" : "live_blocked_by_feature_gate",
    reason: dryRun
      ? "dry-run can record policy evidence without dispatching work"
      : enabled
        ? "feature gate is enabled, but live dispatch remains unimplemented in this contract"
        : "feature gate is disabled in config",
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

function automationApprovalContract(dryRun: boolean) {
  return {
    schemaVersion: 1,
    requiredForLive: true,
    status: dryRun ? "not_requested_for_dry_run" : "required_but_not_requested",
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

export async function featureCommand(args: ParsedArgs, feature: GuardedFeature): Promise<void> {
  const topic = args.positionals[0] ?? "status";
  const cwd = resolve(flagString(args.flags, "cwd") ?? process.cwd());
  const { config } = loadConfig({ cwd });
  const status = featureStatus(config, feature);
  if (topic !== "status") {
    const expectedTopic = feature === "cron" ? "run-now" : "check";
    if (topic !== expectedTopic) throw new Error(`unsupported_feature:${feature}`);
    const dryRun = flagBool(args.flags, "dry-run");
    const prompt = flagString(args.flags, "task") ?? args.positionals.slice(1).join(" ").trim();
    const policy = automationPolicyContract(feature, status.enabled, dryRun);
    const plan = {
      schemaVersion: 1,
      feature,
      action: topic,
      mode: dryRun ? "dry-run" : "live",
      status: dryRun ? "planned" : "blocked",
      enabled: status.enabled,
      promptHash: prompt ? sha256Text(prompt) : null,
      lockName: `automation-${feature}`,
      policy,
      approval: automationApprovalContract(dryRun),
      ledgerEvents: [
        "automation.requested",
        "automation.policy_checked",
        "approval.resolved",
        "automation.lock_planned",
        "automation.dispatch_skipped",
        "automation.completed",
      ],
      reason: dryRun
        ? "dry-run only; no scheduler, gateway listener, or run ledger was mutated"
        : policy.reason,
    };
    const record = dryRun && flagBool(args.flags, "record")
      ? await recordAutomationDryRun(cwd, plan)
      : null;
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
