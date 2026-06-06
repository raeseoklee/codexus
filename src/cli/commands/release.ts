import { resolve } from "node:path";
import { buildReleaseIntegrityReport } from "../../release/integrity.ts";
import { buildReleasePolicyReport } from "../../release/policy.ts";
import { assertAllowedFlags, assertMaxPositionals, flagBool, flagString, type ParsedArgs } from "../args.ts";

export async function releaseCommand(args: ParsedArgs): Promise<void> {
  const subcommand = args.positionals[0] ?? "check";
  if (subcommand !== "check" && subcommand !== "policy") throw new Error(`unsupported_release_command:${subcommand}`);
  assertMaxPositionals(args, 1);
  assertAllowedFlags(args, subcommand === "policy" ? ["json", "cwd", "gate"] : ["json", "cwd", "gate", "live", "version"]);
  const cwd = resolve(flagString(args.flags, "cwd") ?? process.cwd());
  const json = flagBool(args.flags, "json");
  if (subcommand === "policy") {
    const report = buildReleasePolicyReport(cwd, { gate: flagBool(args.flags, "gate") });
    if (json) {
      console.log(JSON.stringify(report, null, 2));
      process.exitCode = report.gate.exitCode;
      return;
    }
    console.log(`Release policy: ${report.releasePolicy.status}`);
    console.log(`Cadence: ${report.releasePolicy.cadence}`);
    console.log(`Minimum slices: ${report.releasePolicy.defaultBundle.minimumSubstantiveSlices}`);
    console.log(`Preferred slices: ${report.releasePolicy.defaultBundle.preferredSubstantiveSlices.join("-")}`);
    console.log(`Gate: ${report.gate.status}`);
    console.log(`Evidence gaps: ${report.evidenceGaps.length}`);
    console.log(`Derivable facts: ${report.derivableFacts.length}`);
    process.exitCode = report.gate.exitCode;
    return;
  }
  const report = buildReleaseIntegrityReport(cwd, {
    gate: flagBool(args.flags, "gate"),
    live: flagBool(args.flags, "live"),
    version: flagString(args.flags, "version"),
  });
  if (json) {
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.gate.exitCode;
    return;
  }
  console.log(`Release integrity: ${report.releaseIntegrity.status}`);
  console.log(`Version: ${report.version ?? "unknown"}`);
  console.log(`Live: ${report.live}`);
  console.log(`Installer: ${report.releaseIntegrity.installScript.defaultChannel}`);
  console.log(`Workflow installer asset: ${report.releaseIntegrity.workflow.installerAssetAttached}`);
  console.log(`Gate: ${report.gate.status}`);
  console.log(`Evidence gaps: ${report.evidenceGaps.length}`);
  console.log(`Blocking unknowns: ${report.blockingUnknowns.length}`);
  console.log(`Informational unknowns: ${report.informationalUnknowns.length}`);
  console.log(`Derivable facts: ${report.derivableFacts.length}`);
  process.exitCode = report.gate.exitCode;
}
