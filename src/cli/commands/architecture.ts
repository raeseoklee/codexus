import { resolve } from "node:path";
import { buildArchitectureEvidenceReport } from "../../architecture/check.ts";
import { assertAllowedFlags, assertMaxPositionals, flagBool, flagString, type ParsedArgs } from "../args.ts";

export async function architectureCommand(args: ParsedArgs): Promise<void> {
  const subcommand = args.positionals[0] ?? "check";
  if (subcommand !== "check") throw new Error(`unsupported_architecture_command:${subcommand}`);
  assertMaxPositionals(args, 1);
  assertAllowedFlags(args, ["json", "cwd", "gate", "policy"]);
  const cwd = resolve(flagString(args.flags, "cwd") ?? process.cwd());
  const json = flagBool(args.flags, "json");
  const report = buildArchitectureEvidenceReport(cwd, {
    gate: flagBool(args.flags, "gate"),
    policyPath: flagString(args.flags, "policy"),
  });
  if (json) {
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.gate.exitCode;
    return;
  }
  console.log(`Architecture evidence: ${report.architecture.status}`);
  console.log(`Policy: ${report.architecture.policyMode}`);
  console.log(`Scan: ${report.scanMode} accuracy=${report.scanAccuracy}`);
  console.log(`Gate: ${report.gate.status}`);
  console.log(`Evidence gaps: ${report.evidenceGaps.length}`);
  console.log(`Blocking unknowns: ${report.blockingUnknowns.length}`);
  console.log(`Informational unknowns: ${report.informationalUnknowns.length}`);
  console.log(`Derivable facts: ${report.derivableFacts.length}`);
  console.log(`Heuristic claims: ${report.heuristicClaims.length}`);
  process.exitCode = report.gate.exitCode;
}
