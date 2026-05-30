import { resolve } from "node:path";
import { buildChangeEvidenceReport } from "../../session/change-evidence.ts";
import { readSessionStateWithMigration, refreshSessionState } from "../../session/state.ts";
import { assertAllowedFlags, assertMaxPositionals, flagArray, flagBool, flagString, type ParsedArgs } from "../args.ts";

export async function slopCommand(args: ParsedArgs): Promise<void> {
  const subcommand = args.positionals[0] ?? "check";
  if (subcommand !== "check") throw new Error(`unsupported_slop_command:${subcommand}`);
  assertMaxPositionals(args, 1);
  assertAllowedFlags(args, ["json", "cwd", "since", "scope", "review"]);
  const cwd = resolve(flagString(args.flags, "cwd") ?? process.cwd());
  const json = flagBool(args.flags, "json");
  const stateRead = await readSessionStateWithMigration(cwd);
  const state = stateRead.state ? await refreshSessionState(cwd, stateRead.state) : null;
  const report = {
    ...buildChangeEvidenceReport(cwd, state, {
      since: flagString(args.flags, "since"),
      scope: flagString(args.flags, "scope"),
      reviews: flagArray(args.flags, "review"),
    }),
    migration: stateRead.migration,
  };
  if (json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  console.log(`Change evidence: ${report.changeEvidence.status}`);
  console.log(`Verification: ${report.changeEvidence.verification}`);
  console.log(`Evidence gaps: ${report.evidenceGaps.length}`);
  console.log(`Derivable facts: ${report.derivableFacts.length}`);
  console.log(`Heuristic claims: ${report.heuristicClaims.length}`);
}
