import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { runPaths } from "../../ledger/paths.ts";
import { flagBool, flagString, type ParsedArgs } from "../args.ts";

export async function eventsCommand(args: ParsedArgs): Promise<void> {
  const subcommand = args.positionals[0] ?? "tail";
  if (subcommand !== "tail") throw new Error(`unsupported_events_command:${subcommand}`);
  const runId = args.positionals[1];
  if (!runId) throw new Error("missing_run_id");
  const cwd = resolve(flagString(args.flags, "cwd") ?? process.cwd());
  const lines = Number(flagString(args.flags, "lines") ?? "20");
  if (!Number.isInteger(lines) || lines <= 0) throw new Error("invalid_event_tail_lines");
  const paths = runPaths(cwd, runId);
  if (!existsSync(paths.events)) throw new Error(`run_not_found:${runId}`);
  const events = (await readFile(paths.events, "utf8")).split("\n").filter(Boolean).slice(-lines).map((line) => JSON.parse(line) as unknown);
  if (flagBool(args.flags, "json")) {
    console.log(JSON.stringify({ runId, events }, null, 2));
    return;
  }
  for (const event of events as Array<{ type?: string; timestamp?: string }>) console.log(`${event.timestamp ?? ""} ${event.type ?? "event"}`.trim());
}
