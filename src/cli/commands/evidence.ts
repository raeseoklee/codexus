import { resolve } from "node:path";
import { buildEvidenceStatus } from "../../evidence/status.ts";
import { assertAllowedFlags, assertMaxPositionals, flagBool, flagString, type ParsedArgs } from "../args.ts";

export async function evidenceCommand(args: ParsedArgs): Promise<void> {
  const subcommand = args.positionals[0] ?? "status";
  if (subcommand !== "status") throw new Error(`unsupported_evidence_command:${subcommand}`);
  assertMaxPositionals(args, 1);
  assertAllowedFlags(args, ["cwd", "json"]);
  const cwd = resolve(flagString(args.flags, "cwd") ?? process.cwd());
  const result = await buildEvidenceStatus(cwd);
  if (flagBool(args.flags, "json")) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`Evidence: ${result.status}`);
  console.log(`App observations: ${result.surfaces.appInstances.observations.total}`);
  console.log(`Wiki: ${result.surfaces.wiki.status}`);
  console.log(`LSP: ${result.surfaces.lsp.status}`);
}
