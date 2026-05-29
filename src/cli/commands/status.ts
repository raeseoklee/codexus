import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { runPaths } from "../../ledger/paths.ts";
import { readState } from "../../ledger/state.ts";
import { assertSchemaValue } from "../../validation/schemas.ts";
import { assertAllowedFlags, assertMaxPositionals, flagBool, flagString, type ParsedArgs } from "../args.ts";

async function readJsonIfExists(path: string): Promise<unknown | null> {
  if (!existsSync(path)) return null;
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

async function readEventTail(path: string, limit = 10): Promise<unknown[]> {
  if (!existsSync(path)) return [];
  const raw = await readFile(path, "utf8");
  return raw.split("\n").filter(Boolean).slice(-limit).map((line) => {
    const event = JSON.parse(line) as unknown;
    assertSchemaValue("event", event);
    return event;
  });
}

export async function statusCommand(args: ParsedArgs): Promise<void> {
  assertAllowedFlags(args, ["json", "cwd"]);
  assertMaxPositionals(args, 1);
  const runId = args.positionals[0];
  if (!runId) throw new Error("missing_run_id");
  const cwd = resolve(flagString(args.flags, "cwd") ?? process.cwd());
  const json = flagBool(args.flags, "json");
  const paths = runPaths(cwd, runId);
  if (!existsSync(paths.state)) throw new Error(`run_not_found:${runId}`);
  const state = await readState(paths.state);
  const verification = await readJsonIfExists(paths.verification);
  const experience = await readJsonIfExists(paths.experience);
  const eventTail = await readEventTail(paths.events);
  if (json) {
    console.log(JSON.stringify({ state, paths, verification, experience, eventTail }, null, 2));
    return;
  }
  console.log(`${state.runId}: ${state.outcome ?? state.phase}`);
  console.log(`verification: ${state.verification.latestStatus}`);
  console.log(`events: ${eventTail.length}`);
  console.log(`state: ${paths.state}`);
}
