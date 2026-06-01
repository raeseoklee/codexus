import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { runPaths } from "../../ledger/paths.ts";
import { flagBool, flagString, type ParsedArgs } from "../args.ts";

export async function reportCommand(args: ParsedArgs): Promise<void> {
  const runId = args.positionals[0];
  if (!runId) throw new Error("missing_run_id");
  const cwd = resolve(flagString(args.flags, "cwd") ?? process.cwd());
  const chars = Number(flagString(args.flags, "chars") ?? "4000");
  const paths = runPaths(cwd, runId);
  if (!existsSync(paths.report)) throw new Error(`run_not_found:${runId}`);
  const text = await readFile(paths.report, "utf8");
  const preview = text.slice(0, Number.isInteger(chars) && chars > 0 ? chars : 4000);
  if (flagBool(args.flags, "json")) {
    console.log(JSON.stringify({ schemaVersion: 1, stability: "stable" as const, runId, path: paths.report, preview }, null, 2));
    return;
  }
  console.log(preview);
}
