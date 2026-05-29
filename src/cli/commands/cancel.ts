import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { appendEvent } from "../../ledger/events.ts";
import { runPaths } from "../../ledger/paths.ts";
import { writeRunReport } from "../../ledger/report.ts";
import { readState, terminal, writeState } from "../../ledger/state.ts";
import { inspectRunOwner, removeRunOwner, writeCancelRequest } from "../../workflow/run-control.ts";
import { assertAllowedFlags, assertMaxPositionals, flagBool, flagString, type ParsedArgs } from "../args.ts";

export async function cancelCommand(args: ParsedArgs): Promise<void> {
  assertAllowedFlags(args, ["json", "cwd", "reason"]);
  assertMaxPositionals(args, 1);
  const runId = args.positionals[0];
  if (!runId) throw new Error("missing_run_id");
  const cwd = resolve(flagString(args.flags, "cwd") ?? process.cwd());
  const json = flagBool(args.flags, "json");
  const reason = flagString(args.flags, "reason") ?? "external cancel requested";
  const paths = runPaths(cwd, runId);
  if (!existsSync(paths.state)) throw new Error(`run_not_found:${runId}`);
  const state = await readState(paths.state);

  if (state.status === "terminal") {
    const output = {
      runId,
      status: "already_terminal",
      outcome: state.outcome,
      statePath: paths.state,
    };
    if (json) {
      console.log(JSON.stringify(output, null, 2));
    } else {
      console.log(`${runId}: already terminal (${state.outcome})`);
    }
    return;
  }

  const owner = await inspectRunOwner(paths);
  const request = await writeCancelRequest(paths, runId, reason);

  if (owner.live) {
    const output = {
      runId,
      status: "requested",
      request,
      owner,
      statePath: paths.state,
    };
    if (json) {
      console.log(JSON.stringify(output, null, 2));
    } else {
      console.log(`${runId}: cancel requested`);
    }
    return;
  }

  await appendEvent(paths.events, {
    runId,
    phase: state.phase,
    type: "run.cancel_orphaned",
    source: "cancel",
    payload: {
      requestId: request.requestId,
      reason: request.reason,
      ownerStatus: owner.reason,
      owner: owner.owner,
      ownerError: owner.error,
    },
  });
  const next = terminal({
    ...state,
    verification: state.verification.latestStatus === "pending"
      ? { required: state.verification.required, latestStatus: "skipped", reason: "not_reached_cancelled" }
      : state.verification,
    error: {
      code: "external_cancel_orphaned",
      message: `Run was marked cancelled because its owner is not live (${owner.reason}).`,
      source: "cancel",
      suggestion: "Inspect the run events and owner metadata before resuming related work.",
    },
  }, "cancelled");
  await writeState(paths.state, next);
  await appendEvent(paths.events, {
    runId,
    phase: next.phase,
    type: "run.terminal",
    source: "cancel",
    payload: { outcome: "cancelled", driver: state.driver, reason: "owner_not_live" },
  });
  await writeRunReport(paths, next, "cancelled");
  await removeRunOwner(paths);

  const output = {
    runId,
    status: "cancelled",
    request,
    owner,
    statePath: paths.state,
    reportPath: paths.report,
  };
  if (json) {
    console.log(JSON.stringify(output, null, 2));
  } else {
    console.log(`${runId}: cancelled orphaned run`);
  }
}
