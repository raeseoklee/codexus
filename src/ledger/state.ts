import { readFile } from "node:fs/promises";
import { writeJsonAtomic } from "../util/fs.ts";
import type { HarnessPhase, RunState, TerminalOutcome } from "../types.ts";

export async function writeState(path: string, state: RunState): Promise<void> {
  await writeJsonAtomic(path, { ...state, updatedAt: new Date().toISOString() });
}

export async function readState(path: string): Promise<RunState> {
  return JSON.parse(await readFile(path, "utf8")) as RunState;
}

export function transition(state: RunState, phase: HarnessPhase): RunState {
  return { ...state, phase, updatedAt: new Date().toISOString() };
}

export function terminal(state: RunState, outcome: TerminalOutcome): RunState {
  return {
    ...state,
    status: "terminal",
    phase: outcome,
    outcome,
    updatedAt: new Date().toISOString(),
  };
}
