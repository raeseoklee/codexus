import { resolve } from "node:path";
import { loadConfig } from "../../config/loader.ts";
import { harnessRoot } from "../../ledger/paths.ts";
import { assertFeatureEnabled, featureStatus, type GuardedFeature } from "../../policy/feature-gates.ts";
import { writeJsonAtomic } from "../../util/fs.ts";
import { sha256Text } from "../../util/hash.ts";
import { flagBool, flagString, type ParsedArgs } from "../args.ts";

interface AutomationDryRunRecord {
  schemaVersion: 1;
  dryRunId: string;
  recordedAt: string;
  plan: Record<string, unknown>;
  ledgerEvents: Array<{ type: string; dryRun: true }>;
  path: string;
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
      { type: "automation.policy_checked", dryRun: true },
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
    if (!dryRun) assertFeatureEnabled(config, feature);
    const prompt = flagString(args.flags, "task") ?? args.positionals.slice(1).join(" ").trim();
    const plan = {
      schemaVersion: 1,
      feature,
      action: topic,
      mode: dryRun ? "dry-run" : "live",
      status: dryRun ? "planned" : "blocked",
      enabled: status.enabled,
      promptHash: prompt ? sha256Text(prompt) : null,
      lockName: `automation-${feature}`,
      ledgerEvents: [
        "automation.requested",
        "automation.policy_checked",
        "automation.lock_planned",
        "automation.dispatch_skipped",
        "automation.completed",
      ],
      reason: dryRun
        ? "dry-run only; no scheduler, gateway listener, or run ledger was mutated"
        : "live automation dispatch is still gated by the feature policy",
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
