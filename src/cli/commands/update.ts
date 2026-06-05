import { assertAllowedFlags, assertMaxPositionals, flagBool, type ParsedArgs } from "../args.ts";
import { readCodexusVersionInfo } from "./version.ts";
import { buildUpdateSummary } from "../../update/check.ts";

export async function updateCommand(args: ParsedArgs): Promise<void> {
  const subcommand = args.positionals[0] ?? "check";
  if (subcommand !== "check") throw new Error(`unsupported_update_command:${subcommand}`);
  assertMaxPositionals(args, 1);
  assertAllowedFlags(args, ["json", "cwd"]);
  const info = readCodexusVersionInfo();
  const update = buildUpdateSummary({ currentVersion: info.version });
  if (flagBool(args.flags, "json")) {
    console.log(JSON.stringify(update, null, 2));
    return;
  }
  if (update.status === "available" && update.latestVersion) {
    console.log(`Codexus update available: ${update.currentVersion} -> ${update.latestVersion}`);
  } else if (update.status === "current") {
    console.log(`Codexus is current: ${update.currentVersion}`);
  } else if (update.status === "disabled") {
    console.log("Codexus update check disabled.");
  } else {
    console.log("Codexus update status unknown.");
  }
}
