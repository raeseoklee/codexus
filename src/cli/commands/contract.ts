import { resolve } from "node:path";
import { buildContractReadinessReport } from "../../contract/readiness.ts";
import { assertAllowedFlags, assertMaxPositionals, flagBool, flagString, type ParsedArgs } from "../args.ts";

export async function contractCommand(args: ParsedArgs): Promise<void> {
  const subcommand = args.positionals[0] ?? "check";
  if (subcommand !== "check") throw new Error(`unsupported_contract_command:${subcommand}`);
  assertMaxPositionals(args, 1);
  assertAllowedFlags(args, ["json", "cwd", "gate", "target"]);
  const cwd = resolve(flagString(args.flags, "cwd") ?? process.cwd());
  const json = flagBool(args.flags, "json");
  const report = buildContractReadinessReport(cwd, {
    gate: flagBool(args.flags, "gate"),
    targetVersion: flagString(args.flags, "target"),
  });
  if (json) {
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.gate.exitCode;
    return;
  }
  console.log(`Contract readiness: ${report.contractReadiness.status}`);
  console.log(`Target: ${report.targetVersion}`);
  console.log(`Promoted surfaces: ${report.contractReadiness.promotedSurfaceCount}`);
  console.log(`Promotion candidates: ${report.contractReadiness.candidateCount}`);
  console.log(`Deferred surfaces: ${report.contractReadiness.deferredSurfaceCount}`);
  console.log(`Gate: ${report.gate.status}`);
  console.log(`Evidence gaps: ${report.evidenceGaps.length}`);
  console.log(`Blocking unknowns: ${report.blockingUnknowns.length}`);
  console.log(`Informational unknowns: ${report.informationalUnknowns.length}`);
  process.exitCode = report.gate.exitCode;
}
