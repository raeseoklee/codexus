import { resolve } from "node:path";
import { loadConfig } from "../../config/loader.ts";
import { featureStatus, type GuardedFeature } from "../../policy/feature-gates.ts";
import { flagBool, flagString, type ParsedArgs } from "../args.ts";

export async function featureCommand(args: ParsedArgs, feature: GuardedFeature): Promise<void> {
  const topic = args.positionals[0] ?? "status";
  if (topic !== "status") throw new Error(`unsupported_feature:${feature}`);
  const cwd = resolve(flagString(args.flags, "cwd") ?? process.cwd());
  const { config } = loadConfig({ cwd });
  const status = featureStatus(config, feature);
  if (flagBool(args.flags, "json")) {
    console.log(JSON.stringify(status, null, 2));
    return;
  }
  console.log(`${feature}: ${status.status}`);
  console.log(status.reason);
}
