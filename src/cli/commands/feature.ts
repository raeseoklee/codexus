import { resolve } from "node:path";
import { loadConfig } from "../../config/loader.ts";
import { assertFeatureEnabled, featureStatus, type GuardedFeature } from "../../policy/feature-gates.ts";
import { sha256Text } from "../../util/hash.ts";
import { flagBool, flagString, type ParsedArgs } from "../args.ts";

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
        "automation.lock_acquired",
        "automation.dispatched",
        "automation.completed",
      ],
      reason: dryRun
        ? "dry-run only; no scheduler, gateway listener, or run ledger was mutated"
        : "live automation dispatch is still gated by the feature policy",
    };
    if (flagBool(args.flags, "json")) {
      console.log(JSON.stringify(plan, null, 2));
      process.exitCode = dryRun ? 0 : 1;
      return;
    }
    console.log(`${feature} ${topic}: ${plan.status}`);
    console.log(plan.reason);
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
