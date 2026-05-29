import { flagBool, type ParsedArgs } from "../args.ts";
import { readOmxStatus } from "../../adapters/omx.ts";

export async function adaptOmxCommand(args: ParsedArgs): Promise<void> {
  const topic = args.positionals[0] ?? "status";
  if (topic !== "status") {
    throw new Error(`unsupported_adapt_omx_command:${topic}`);
  }
  const status = readOmxStatus();
  if (flagBool(args.flags, "json")) {
    console.log(JSON.stringify(status, null, 2));
    return;
  }
  console.log(`OMX: ${status.available ? status.version ?? "available" : "unavailable"}`);
  console.log(`features: explore=${status.features.explore} sparkshell=${status.features.sparkshell} team=${status.features.team} agents=${status.features.agents}`);
  for (const warning of status.warnings) {
    console.log(`WARN ${warning.code}: ${warning.message}`);
  }
}
