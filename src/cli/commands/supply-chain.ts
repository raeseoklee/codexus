import { resolve } from "node:path";
import { buildSupplyChainEvidenceReport } from "../../supply-chain/check.ts";
import { assertAllowedFlags, assertMaxPositionals, flagBool, flagString, type ParsedArgs } from "../args.ts";

export async function supplyChainCommand(args: ParsedArgs): Promise<void> {
  const subcommand = args.positionals[0] ?? "check";
  if (subcommand !== "check") throw new Error(`unsupported_supply_chain_command:${subcommand}`);
  assertMaxPositionals(args, 1);
  assertAllowedFlags(args, ["json", "cwd", "gate"]);
  const cwd = resolve(flagString(args.flags, "cwd") ?? process.cwd());
  const json = flagBool(args.flags, "json");
  const report = buildSupplyChainEvidenceReport(cwd, {
    gate: flagBool(args.flags, "gate"),
  });
  if (json) {
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.gate.exitCode;
    return;
  }
  console.log(`Supply-chain evidence: ${report.supplyChain.status}`);
  console.log(`Policy: ${report.supplyChain.policyMode}`);
  console.log(`Projection: ${report.projectionMode} lifecycleExecuted=${report.lifecycleExecuted}`);
  console.log(`Gate: ${report.gate.status}`);
  console.log(`Evidence gaps: ${report.evidenceGaps.length}`);
  console.log(`Blocking unknowns: ${report.blockingUnknowns.length}`);
  console.log(`Informational unknowns: ${report.informationalUnknowns.length}`);
  console.log(`Derivable facts: ${report.derivableFacts.length}`);
  console.log(`Heuristic claims: ${report.heuristicClaims.length}`);
  process.exitCode = report.gate.exitCode;
}
