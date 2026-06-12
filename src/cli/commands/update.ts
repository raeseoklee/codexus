import { assertAllowedFlags, assertMaxPositionals, flagBool, flagString, type ParsedArgs } from "../args.ts";
import { readCodexusVersionInfo } from "./version.ts";
import { buildUpdateSummary, normalizeUpdateChannel } from "../../update/check.ts";

export async function updateCommand(args: ParsedArgs): Promise<void> {
  const subcommand = args.positionals[0] ?? "check";
  if (subcommand !== "check") throw new Error(`unsupported_update_command:${subcommand}`);
  assertMaxPositionals(args, 1);
  assertAllowedFlags(args, ["json", "cwd", "channel"]);
  if (args.flags.channel !== undefined && typeof args.flags.channel !== "string") {
    throw new Error("invalid_update_channel:missing");
  }
  const requestedChannel = flagString(args.flags, "channel");
  const channel = normalizeUpdateChannel(requestedChannel);
  if (!channel) throw new Error(`invalid_update_channel:${requestedChannel ?? ""}`);
  const info = readCodexusVersionInfo();
  const update = buildUpdateSummary({ currentVersion: info.version, channel });
  if (flagBool(args.flags, "json")) {
    console.log(JSON.stringify(update, null, 2));
    return;
  }
  if (update.status === "available" && update.latestVersion) {
    console.log(update.notification.message ?? `Codexus ${update.channel} update available: ${update.currentVersion} -> ${update.latestVersion}`);
  } else if (update.status === "current") {
    console.log(`Codexus ${update.channel} channel is current: ${update.currentVersion}`);
  } else if (update.status === "disabled") {
    console.log(`Codexus ${update.channel} update check disabled.`);
  } else {
    console.log(`Codexus ${update.channel} update status unknown.`);
  }
}
