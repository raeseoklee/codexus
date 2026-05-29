import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadConfig } from "../../config/loader.ts";
import type { HarnessConfig } from "../../config/schema.ts";
import { runPaths } from "../../ledger/paths.ts";
import { readState } from "../../ledger/state.ts";
import { executeRun } from "../../workflow/kernel.ts";
import { flagBool, flagString, type ParsedArgs } from "../args.ts";

interface RunInputRecord {
  prompt?: string;
  config?: HarnessConfig;
}

async function readRunInput(path: string): Promise<RunInputRecord> {
  if (!existsSync(path)) return {};
  return JSON.parse(await readFile(path, "utf8")) as RunInputRecord;
}

function buildResumePrompt(originalPrompt: string, runId: string, outcome: string | null, followup: string): string {
  return `Resume harness run ${runId}.

Original task:
${originalPrompt || "(missing original prompt)"}

Previous outcome: ${outcome ?? "unknown"}

Follow-up instruction:
${followup || "Inspect the existing run ledger, continue the work if needed, and preserve verification evidence."}`;
}

export async function resumeCommand(args: ParsedArgs): Promise<void> {
  const runId = args.positionals[0];
  if (!runId) throw new Error("missing_run_id");
  const cwd = resolve(flagString(args.flags, "cwd") ?? process.cwd());
  const json = flagBool(args.flags, "json");
  const paths = runPaths(cwd, runId);
  if (!existsSync(paths.state)) throw new Error(`run_not_found:${runId}`);
  const state = await readState(paths.state);
  const input = await readRunInput(paths.input);
  const loaded = loadConfig({ cwd });
  const config = input.config ?? loaded.config;
  const followup = args.positionals.slice(1).join(" ").trim();
  const result = await executeRun({
    cwd,
    config,
    prompt: buildResumePrompt(input.prompt ?? "", runId, state.outcome, followup),
  });

  if (json) {
    console.log(JSON.stringify({ resumedFrom: runId, ...result }, null, 2));
  } else {
    console.log(`${result.runId}: ${result.outcome} (resumed from ${runId})`);
    console.log(result.reportPath);
  }
  process.exitCode = result.outcome === "complete" ? 0 : 1;
}
