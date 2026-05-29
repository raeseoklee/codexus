import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { harnessRoot, runPaths } from "../../ledger/paths.ts";
import { readState } from "../../ledger/state.ts";
import { flagBool, flagString, type ParsedArgs } from "../args.ts";

export async function runsCommand(args: ParsedArgs): Promise<void> {
  const subcommand = args.positionals[0] ?? "list";
  if (subcommand !== "list") throw new Error(`unsupported_runs_command:${subcommand}`);
  const cwd = resolve(flagString(args.flags, "cwd") ?? process.cwd());
  const limit = Number(flagString(args.flags, "limit") ?? "20");
  if (!Number.isInteger(limit) || limit <= 0) throw new Error("invalid_memory_limit");
  const runsRoot = join(harnessRoot(cwd), "runs");
  const entries = existsSync(runsRoot) ? await readdir(runsRoot, { withFileTypes: true }) : [];
  const runs = [];
  for (const entry of entries.filter((item) => item.isDirectory()).sort((left, right) => right.name.localeCompare(left.name)).slice(0, limit)) {
    const paths = runPaths(cwd, entry.name);
    try {
      const state = await readState(paths.state);
      runs.push({ runId: entry.name, outcome: state.outcome, phase: state.phase, updatedAt: state.updatedAt, statePath: paths.state });
    } catch {
      runs.push({ runId: entry.name, outcome: null, phase: "unknown", updatedAt: null, statePath: paths.state });
    }
  }
  if (flagBool(args.flags, "json")) {
    console.log(JSON.stringify({ runs }, null, 2));
    return;
  }
  for (const run of runs) console.log(`${run.runId}: ${run.outcome ?? run.phase}`);
}
