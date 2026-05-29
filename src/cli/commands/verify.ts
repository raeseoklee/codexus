import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { HarnessConfig } from "../../config/schema.ts";
import { appendEvent } from "../../ledger/events.ts";
import { runPaths } from "../../ledger/paths.ts";
import { readState, writeState } from "../../ledger/state.ts";
import { runPolicyPreflight } from "../../policy/preflight.ts";
import { writeJsonAtomic } from "../../util/fs.ts";
import { runVerification } from "../../verification/runner.ts";
import { flagArray, flagBool, flagString, type ParsedArgs } from "../args.ts";

interface RunInputRecord {
  config?: HarnessConfig;
  prompt?: string;
}

async function readRunInput(path: string): Promise<RunInputRecord> {
  if (!existsSync(path)) return {};
  return JSON.parse(await readFile(path, "utf8")) as RunInputRecord;
}

export async function verifyCommand(args: ParsedArgs): Promise<void> {
  const runId = args.positionals[0];
  if (!runId) throw new Error("missing_run_id");
  const cwd = resolve(flagString(args.flags, "cwd") ?? process.cwd());
  const json = flagBool(args.flags, "json");
  const paths = runPaths(cwd, runId);
  if (!existsSync(paths.state)) throw new Error(`run_not_found:${runId}`);

  const state = await readState(paths.state);
  const input = await readRunInput(paths.input);
  const commands = flagArray(args.flags, "verify");
  const verificationCommands = commands.length > 0 ? commands : (input.config?.verification.commands ?? []);
  const timeoutMs = input.config?.verification.timeoutMs ?? 120_000;
  const preflight = runPolicyPreflight({
    cwd: state.cwd,
    prompt: input.prompt ?? "",
    verificationCommands,
  });
  for (const finding of preflight.findings) {
    await appendEvent(paths.events, {
      runId,
      phase: "verify",
      type: finding.level === "block" ? "policy.blocked" : "policy.warning",
      source: "policy",
      payload: finding,
    });
  }
  if (preflight.status === "blocked") {
    const next = {
      ...state,
      verification: { ...state.verification, latestStatus: "error" as const },
      error: {
        code: "policy_blocked",
        message: preflight.findings.filter((finding) => finding.level === "block").map((finding) => finding.message).join("; "),
        source: "policy",
      },
    };
    await writeState(paths.state, next);
    if (json) {
      console.log(JSON.stringify({ runId, status: "blocked", findings: preflight.findings, statePath: paths.state }, null, 2));
      return;
    }
    console.log(`${runId}: blocked`);
    process.exitCode = 1;
    return;
  }

  await appendEvent(paths.events, {
    runId,
    phase: "verify",
    type: "verification.started",
    source: "kernel",
    payload: { commands: verificationCommands, rerun: true },
  });
  const verification = await runVerification({
    cwd: state.cwd,
    commands: verificationCommands,
    artifactsDir: paths.artifactsDir,
    timeoutMs,
  });
  await writeJsonAtomic(paths.verification, verification);
  const next = {
    ...state,
    verification: {
      required: verificationCommands.length > 0,
      latestStatus: verification.status,
    },
    updatedAt: new Date().toISOString(),
  };
  await writeState(paths.state, next);
  await appendEvent(paths.events, {
    runId,
    phase: "verify",
    type: "verification.completed",
    source: "kernel",
    payload: { status: verification.status, rerun: true },
  });

  if (json) {
    console.log(JSON.stringify({ runId, status: verification.status, verificationPath: paths.verification }, null, 2));
  } else {
    console.log(`${runId}: verification ${verification.status}`);
    console.log(paths.verification);
  }
  process.exitCode = verification.status === "passed" || verification.status === "skipped" ? 0 : 1;
}
