import { resolve } from "node:path";
import { assertAllowedFlags, assertMaxPositionals, flagBool, flagString, type ParsedArgs } from "../args.ts";
import { buildCodexusPluginPackageReport } from "../../plugin/package.ts";

export async function pluginCommand(args: ParsedArgs): Promise<void> {
  const subcommand = args.positionals[0] ?? "status";
  if (subcommand !== "status") throw new Error(`unsupported_plugin_command:${subcommand}`);
  assertMaxPositionals(args, 1);
  assertAllowedFlags(args, ["json", "cwd"]);
  const cwd = resolve(flagString(args.flags, "cwd") ?? process.cwd());
  const result = buildCodexusPluginPackageReport(cwd);

  if (flagBool(args.flags, "json")) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`Plugin package: ${result.pluginPackage.manifestValid ? "valid" : "invalid"}`);
  console.log(`Packaged skill count: ${result.pluginPackage.components.skills.count}`);
  console.log("Installed plugin state: deferred");
  console.log("Always-on proof: no");
}
