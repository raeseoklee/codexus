import { resolve } from "node:path";
import { buildRepoKnowledgeReport } from "../../repo-knowledge/check.ts";
import { assertAllowedFlags, assertMaxPositionals, flagBool, flagString, type ParsedArgs } from "../args.ts";

export async function repoCommand(args: ParsedArgs): Promise<void> {
  const subcommand = args.positionals[0] ?? "check";
  if (subcommand !== "check" && subcommand !== "map") throw new Error(`unsupported_repo_command:${subcommand}`);
  assertMaxPositionals(args, 1);
  assertAllowedFlags(args, ["json", "cwd", "gate"]);
  const cwd = resolve(flagString(args.flags, "cwd") ?? process.cwd());
  const json = flagBool(args.flags, "json");
  const report = buildRepoKnowledgeReport(cwd, {
    gate: subcommand === "check" ? flagBool(args.flags, "gate") : false,
  });
  if (json) {
    console.log(JSON.stringify({ ...report, command: subcommand }, null, 2));
    process.exitCode = subcommand === "check" ? report.gate.exitCode : 0;
    return;
  }
  console.log(`Repo knowledge: ${report.repoKnowledge.status}`);
  console.log(`Command: ${subcommand}`);
  console.log(`Scan: ${report.scanMode} accuracy=${report.scanAccuracy}`);
  console.log(`Documents: ${report.repoKnowledge.documentCount}`);
  console.log(`Index links: ${report.repoKnowledge.indexLinkCount}`);
  console.log(`Gate: ${subcommand === "check" ? report.gate.status : "not_requested"}`);
  console.log(`Evidence gaps: ${report.evidenceGaps.length}`);
  console.log(`Blocking unknowns: ${report.blockingUnknowns.length}`);
  console.log(`Informational unknowns: ${report.informationalUnknowns.length}`);
  console.log(`Derivable facts: ${report.derivableFacts.length}`);
  console.log(`Heuristic claims: ${report.heuristicClaims.length}`);
  process.exitCode = subcommand === "check" ? report.gate.exitCode : 0;
}
