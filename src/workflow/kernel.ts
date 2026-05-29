import { readFile, writeFile } from "node:fs/promises";
import type { HarnessConfig } from "../config/schema.ts";
import { createDriver } from "../drivers/index.ts";
import type { DriverResult } from "../drivers/contract.ts";
import { classifyDriverFailure } from "../drivers/errors.ts";
import { appendMemoryEntry } from "../evolution/memory.ts";
import { appendEvent } from "../ledger/events.ts";
import { runPaths } from "../ledger/paths.ts";
import { writeRunReport } from "../ledger/report.ts";
import { terminal, transition, writeState } from "../ledger/state.ts";
import { redactSensitiveText } from "../policy/redaction.ts";
import { runPolicyPreflight } from "../policy/preflight.ts";
import type { HarnessPhase, RunState, TerminalOutcome } from "../types.ts";
import { ensureDir, writeJsonAtomic } from "../util/fs.ts";
import { sha256Text } from "../util/hash.ts";
import { createRunId } from "../util/id.ts";
import type { VerificationResult } from "../verification/runner.ts";
import { readCancelRequest, startRunOwnerHeartbeat, type CancelRequest } from "./run-control.ts";

export interface ExecuteRunOptions {
  cwd: string;
  prompt: string;
  config: HarnessConfig;
  signal?: AbortSignal;
}

export interface ExecuteRunResult {
  runId: string;
  outcome: TerminalOutcome;
  statePath: string;
  reportPath: string;
}

const LOG_TAIL_CHARS = 2_000;
const REPAIR_CONTEXT_MAX_CHARS = 6_000;

function outcomeFromDriver(status: string): TerminalOutcome {
  if (status === "blocked") return "blocked";
  if (status === "cancelled") return "cancelled";
  return status === "succeeded" ? "complete" : "failed";
}

function tailText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `[truncated ${text.length - maxChars} chars]\n${text.slice(-maxChars)}`;
}

async function readTail(path: string, maxChars = LOG_TAIL_CHARS): Promise<string> {
  try {
    return tailText(await readFile(path, "utf8"), maxChars);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `[unavailable: ${message}]`;
  }
}

function boundFailureContext(text: string): string {
  return tailText(redactSensitiveText(text.trim()), REPAIR_CONTEXT_MAX_CHARS);
}

async function verificationFailureContext(verification: VerificationResult): Promise<string | null> {
  const failed = verification.commands.find((command) => command.status !== "passed");
  if (!failed) return null;
  const stdout = await readTail(failed.stdoutPath);
  const stderr = await readTail(failed.stderrPath);
  return boundFailureContext(`Verification failure context

Command: ${failed.command}
Status: ${failed.status}
Exit code: ${failed.exitCode ?? "null"}
Summary: ${failed.summary}

STDOUT tail:
${stdout || "[empty]"}

STDERR tail:
${stderr || "[empty]"}`);
}

async function driverFailureContext(paths: { stdoutPath: string; stderrPath: string }, result: DriverResult): Promise<string> {
  const stdout = await readTail(paths.stdoutPath);
  const stderr = await readTail(paths.stderrPath);
  return boundFailureContext(`Driver failure context

Driver status: ${result.status}
Exit code: ${result.exitCode ?? "null"}
Error: ${result.error ?? "[none]"}

Raw stdout tail:
${stdout || "[empty]"}

Raw stderr tail:
${stderr || "[empty]"}`);
}

async function recordRepairContext(
  paths: ReturnType<typeof runPaths>,
  state: RunState,
  name: string,
  context: string | null,
): Promise<RunState> {
  if (!context) return state;
  const path = `${paths.artifactsDir}/${name}.md`;
  await writeFile(path, `${context}\n`);
  return state.artifacts.includes(path) ? state : { ...state, artifacts: [...state.artifacts, path] };
}

function verificationState(
  state: RunState,
  latestStatus: RunState["verification"]["latestStatus"],
  reason?: string,
): RunState["verification"] {
  return {
    required: state.verification.required,
    latestStatus,
    ...(reason ? { reason } : {}),
  };
}

function repairPrompt(originalPrompt: string, result: DriverResult, verificationStatus: string, failureContext?: string | null): string {
  return `Original task:
${originalPrompt}

The previous attempt completed, but verification failed with status: ${verificationStatus}.
${result.finalMessage ? `\nPrevious final message:\n${result.finalMessage}\n` : ""}
${failureContext ? `\nBounded failure context:\n${failureContext}\n` : ""}
Repair the work using the verification failure as the source of truth, then stop.`;
}

function driverFailureRepairPrompt(
  originalPrompt: string,
  result: DriverResult,
  classification: ReturnType<typeof classifyDriverFailure>,
  iteration: number,
  failureContext?: string | null,
): string {
  return `Driver failure repair attempt ${iteration}

Original task:
${originalPrompt}

The previous driver attempt failed before verification.
- Failure code: ${classification.code}
- Failure category: ${classification.category}
- Repairable: ${classification.repairable}
- Suggestion: ${classification.suggestion}
${result.finalMessage ? `\nPrevious final message:\n${result.finalMessage}\n` : ""}
${result.error ? `\nPrevious error:\n${result.error.slice(0, 2000)}\n` : ""}
${failureContext ? `\nBounded failure context:\n${failureContext}\n` : ""}
Repair the task by addressing the driver failure, then stop.`;
}

function failedRunError(result: DriverResult, verificationStatus: string, config: HarnessConfig): RunState["error"] {
  if (result.status === "succeeded" && ["failed", "timed_out", "error"].includes(verificationStatus)) {
    return {
      code: `verification_${verificationStatus}`,
      message: `Verification ended with status ${verificationStatus}.`,
      source: "verification",
      suggestion: "Inspect verification artifacts and repair against the failing command output.",
    };
  }
  const classification = classifyDriverFailure(result);
  return {
    code: classification.code,
    message: classification.message.slice(0, 500),
    source: config.driver,
    suggestion: classification.suggestion,
  };
}

function abortedDriverResult(signal: AbortSignal, cancelRequest: CancelRequest | null): DriverResult {
  const reason = cancelRequest
    ? `external cancel requested: ${cancelRequest.reason}`
    : signal.reason instanceof Error
      ? signal.reason.message
      : "run aborted";
  return {
    status: "cancelled",
    exitCode: 130,
    error: reason,
  };
}

export async function executeRun(options: ExecuteRunOptions): Promise<ExecuteRunResult> {
  const { cwd, prompt, config, signal } = options;
  const runId = createRunId();
  const paths = runPaths(cwd, runId);
  await ensureDir(paths.rawDir);
  await ensureDir(paths.artifactsDir);
  const ownerHeartbeat = await startRunOwnerHeartbeat(paths, runId);

  const preflight = runPolicyPreflight({
    cwd,
    prompt,
    verificationCommands: config.verification.commands,
  });

  await writeJsonAtomic(paths.input, {
    schemaVersion: 1,
    runId,
    cwd,
    prompt,
    config,
    policy: preflight,
    createdAt: new Date().toISOString(),
  });

  let state: RunState = {
    schemaVersion: 1,
    runId,
    status: "running",
    phase: "intake",
    outcome: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    cwd,
    driver: config.driver,
    promptHash: sha256Text(prompt),
    repairIteration: 0,
    driverRepairIteration: 0,
    verification: {
      required: config.verification.commands.length > 0,
      latestStatus: config.verification.commands.length > 0 ? "pending" : "skipped",
    },
    artifacts: [],
  };
  await writeState(paths.state, state);
  await appendEvent(paths.events, { runId, phase: state.phase, type: "run.created", source: "kernel" });
  await appendEvent(paths.events, {
    runId,
    phase: state.phase,
    type: "permission.checked",
    source: "policy",
    payload: {
      driver: config.driver,
      sandbox: config.codex.sandbox,
      approval: config.codex.approval,
      status: "delegated_to_driver",
    },
  });
  for (const finding of preflight.findings) {
    await appendEvent(paths.events, {
      runId,
      phase: state.phase,
      type: finding.level === "block" ? "policy.blocked" : "policy.warning",
      source: "policy",
      payload: finding,
    });
  }

  const runAbortController = new AbortController();
  let cancelRequest: CancelRequest | null = null;
  let cancelPollInFlight = false;
  const abortRun = (reason: Error): void => {
    if (!runAbortController.signal.aborted) runAbortController.abort(reason);
  };
  const onSignalAbort = (): void => {
    abortRun(signal?.reason instanceof Error ? signal.reason : new Error("run aborted"));
  };
  if (signal?.aborted) {
    onSignalAbort();
  } else {
    signal?.addEventListener("abort", onSignalAbort, { once: true });
  }
  const pollCancelRequest = async (): Promise<void> => {
    if (cancelPollInFlight || cancelRequest || runAbortController.signal.aborted) return;
    cancelPollInFlight = true;
    try {
      const request = await readCancelRequest(paths);
      if (!request || request.runId !== runId) return;
      cancelRequest = request;
      await appendEvent(paths.events, {
        runId,
        phase: state.phase,
        type: "run.cancel_requested",
        source: "cancel",
        payload: {
          requestId: request.requestId,
          requestedAt: request.requestedAt,
          requestedBy: request.requestedBy,
          reason: request.reason,
        },
      });
      abortRun(new Error(`external cancel requested: ${request.reason}`));
    } finally {
      cancelPollInFlight = false;
    }
  };
  const cancelPoller = setInterval(() => {
    void pollCancelRequest();
  }, 250);
  cancelPoller.unref?.();

  let result: DriverResult = { status: "blocked", error: "policy blocked run before driver execution" };
  let outcome: TerminalOutcome = "blocked";
  let verificationStatus = state.verification.latestStatus;
  let verificationReason: string | undefined;
  let latestVerification: VerificationResult | null = null;
  const verificationHistory: VerificationResult[] = [];
  let lastDriverRawPaths: { stdoutPath: string; stderrPath: string } | null = null;

  if (preflight.status === "blocked") {
    if (state.verification.required && verificationStatus === "pending") {
      verificationStatus = "skipped";
      verificationReason = "not_reached_policy_blocked";
    }
    state = {
      ...state,
      error: {
        code: "policy_blocked",
        message: preflight.findings.filter((finding) => finding.level === "block").map((finding) => finding.message).join("; "),
        source: "policy",
        suggestion: "Remove or narrow the blocked command and rerun.",
      },
    };
    await appendEvent(paths.events, {
      runId,
      phase: state.phase,
      type: "approval.resolved",
      source: "policy",
      payload: { status: "not_requested", reason: "preflight_blocked" },
    });
  } else {
    state = transition(state, "execute");
    await writeState(paths.state, state);
    await appendEvent(paths.events, { runId, phase: state.phase, type: "phase.changed", source: "kernel" });

    const driver = await createDriver(config);

    const runDriverAttempt = async (attemptPrompt: string, attempt: number, eventPhase: HarnessPhase): Promise<DriverResult> => {
      const suffix = attempt === 0 ? "" : `-repair-${attempt}`;
      const rawStdoutPath = `${paths.rawDir}/${config.driver}${suffix}-stdout.jsonl`;
      const rawStderrPath = `${paths.rawDir}/${config.driver}${suffix}-stderr.log`;
      lastDriverRawPaths = { stdoutPath: rawStdoutPath, stderrPath: rawStderrPath };
      await pollCancelRequest();
      if (runAbortController.signal.aborted) return abortedDriverResult(runAbortController.signal, cancelRequest);
      const attemptResult = await driver.run({
        runId,
        cwd,
        prompt: attemptPrompt,
        config,
        context: {
          rawStdoutPath,
          rawStderrPath,
        },
      }, async (event) => {
        await appendEvent(paths.events, {
          runId,
          phase: eventPhase,
          type: event.type,
          source: event.source,
          payload: event.payload,
        });
      }, runAbortController.signal);
      await appendEvent(paths.events, {
        runId,
        phase: eventPhase,
        type: attemptResult.status === "succeeded" ? "driver.completed" : "driver.failed",
        source: config.driver,
        payload: {
          status: attemptResult.status,
          attempt,
          ...(attemptResult.exitCode !== undefined ? { exitCode: attemptResult.exitCode } : {}),
          ...(attemptResult.usage ? { usage: attemptResult.usage } : {}),
          ...(attemptResult.error ? { error: attemptResult.error.slice(0, 2000) } : {}),
        },
      });
      return attemptResult;
    };

    const runChecks = async (): Promise<VerificationResult> => {
      if (config.verification.commands.length === 0) {
        return { schemaVersion: 1, status: "skipped", commands: [] };
      }
      state = transition(state, "verify");
      await writeState(paths.state, state);
      await appendEvent(paths.events, {
        runId,
        phase: state.phase,
        type: "verification.started",
        source: "kernel",
        payload: { commands: config.verification.commands },
      });
      const { runVerification } = await import("../verification/runner.ts");
      const verification = await runVerification({
        cwd,
        commands: config.verification.commands,
        artifactsDir: paths.artifactsDir,
        timeoutMs: config.verification.timeoutMs,
        signal: runAbortController.signal,
      });
      verificationHistory.push(verification);
      await writeJsonAtomic(paths.verification, verification);
      await appendEvent(paths.events, {
        runId,
        phase: state.phase,
        type: "verification.completed",
        source: "kernel",
        payload: { status: verification.status },
      });
      return verification;
    };

    result = await runDriverAttempt(prompt, 0, "execute");

    outcome = outcomeFromDriver(result.status);
    if (runAbortController.signal.aborted && result.status !== "cancelled") {
      result = abortedDriverResult(runAbortController.signal, cancelRequest);
      outcome = "cancelled";
    }
    if (result.status !== "succeeded") {
      let classification = classifyDriverFailure(result);
      await appendEvent(paths.events, {
        runId,
        phase: state.phase,
        type: "driver.failure_classified",
        source: "kernel",
        payload: classification,
      });
      while (
        result.status === "failed" &&
        classification.repairable &&
        (state.driverRepairIteration ?? 0) < config.repair.maxDriverFailureIterations
      ) {
        const nextIteration = (state.driverRepairIteration ?? 0) + 1;
        state = {
          ...transition(state, "repair"),
          driverRepairIteration: nextIteration,
        };
        await writeState(paths.state, state);
        await appendEvent(paths.events, {
          runId,
          phase: state.phase,
          type: "driver.repair.started",
          source: "kernel",
          payload: { iteration: nextIteration, classification },
        });
        const failureContext = lastDriverRawPaths ? await driverFailureContext(lastDriverRawPaths, result) : null;
        state = await recordRepairContext(paths, state, `driver-repair-context-${String(nextIteration).padStart(3, "0")}`, failureContext);
        await writeState(paths.state, state);
        result = await runDriverAttempt(driverFailureRepairPrompt(prompt, result, classification, nextIteration, failureContext), nextIteration, "repair");
        await appendEvent(paths.events, {
          runId,
          phase: state.phase,
          type: "driver.repair.completed",
          source: "kernel",
          payload: { iteration: nextIteration, driverStatus: result.status },
        });
        outcome = outcomeFromDriver(result.status);
        if (result.status === "succeeded") break;
        classification = classifyDriverFailure(result);
        await appendEvent(paths.events, {
          runId,
          phase: state.phase,
          type: "driver.failure_classified",
          source: "kernel",
          payload: classification,
        });
      }
    }
    if (result.status === "succeeded" && config.verification.commands.length > 0) {
      latestVerification = await runChecks();
      verificationStatus = latestVerification.status;
      verificationReason = undefined;
      if (runAbortController.signal.aborted) {
        result = abortedDriverResult(runAbortController.signal, cancelRequest);
        outcome = "cancelled";
      } else {
        outcome = verificationStatus === "passed" ? "complete" : "failed";
      }
      while (outcome === "failed" && state.repairIteration < config.repair.maxIterations) {
        const nextIteration = state.repairIteration + 1;
        state = {
          ...transition(state, "repair"),
          repairIteration: nextIteration,
        };
        await writeState(paths.state, state);
        await appendEvent(paths.events, {
          runId,
          phase: state.phase,
          type: "repair.started",
          source: "kernel",
          payload: { iteration: nextIteration, verificationStatus },
        });
        const failureContext = latestVerification ? await verificationFailureContext(latestVerification) : null;
        state = await recordRepairContext(paths, state, `repair-context-${String(nextIteration).padStart(3, "0")}`, failureContext);
        await writeState(paths.state, state);
        result = await runDriverAttempt(repairPrompt(prompt, result, verificationStatus, failureContext), (state.driverRepairIteration ?? 0) + nextIteration, "repair");
        await appendEvent(paths.events, {
          runId,
          phase: state.phase,
          type: "repair.completed",
          source: "kernel",
          payload: { iteration: nextIteration, driverStatus: result.status },
        });
        outcome = outcomeFromDriver(result.status);
        if (result.status !== "succeeded") break;
        latestVerification = await runChecks();
        verificationStatus = latestVerification.status;
        verificationReason = undefined;
        if (runAbortController.signal.aborted) {
          result = abortedDriverResult(runAbortController.signal, cancelRequest);
          outcome = "cancelled";
        } else {
          outcome = verificationStatus === "passed" ? "complete" : "failed";
        }
      }
    } else if (result.status !== "succeeded" && state.verification.required && verificationStatus === "pending") {
      verificationStatus = "skipped";
      verificationReason = "not_reached_driver_failed";
    }

    if (result.finalMessage) {
      const finalPath = `${paths.artifactsDir}/final-message.md`;
      await writeFile(finalPath, result.finalMessage);
      if (!state.artifacts.includes(finalPath)) state.artifacts.push(finalPath);
    }

    state = {
      ...state,
      verification: verificationState(state, verificationStatus, verificationReason),
      ...(result.usage ? { usage: result.usage } : {}),
      ...(outcome === "cancelled" && result.error
        ? {
          error: {
            code: cancelRequest ? "external_cancel_requested" : "run_cancelled",
            message: result.error,
            source: cancelRequest ? "cancel" : config.driver,
            suggestion: "Inspect the run event ledger for the cancellation source.",
          },
        }
        : {}),
      ...(outcome === "failed"
        ? { error: failedRunError(result, verificationStatus, config) }
        : {}),
    };
  }

  state = {
    ...state,
    verification: verificationState(state, verificationStatus, verificationReason),
    ...(result.usage ? { usage: result.usage } : {}),
  };
  state = terminal(state, outcome);
  await writeState(paths.state, state);
  await appendEvent(paths.events, {
    runId,
    phase: state.phase,
    type: "run.terminal",
    source: "kernel",
    payload: { outcome, driver: result.status },
  });

  if (config.evolution.enabled) {
    const { writeExperience } = await import("../evolution/experience.ts");
    const experience = await writeExperience({
      paths,
      state,
      prompt,
      driverResult: result,
      verificationCommands: config.verification.commands,
      verificationHistory,
    });
    await appendEvent(paths.events, {
      runId,
      phase: "evolve",
      type: "evolution.experience_written",
      source: "evolution",
      payload: { path: paths.experience, reusableLessons: experience.reusableLessons.length },
    });
    for (let index = 0; index < experience.reusableLessons.length; index += 1) {
      const lesson = experience.reusableLessons[index];
      const memory = await appendMemoryEntry(cwd, {
        id: `mem_${runId}_${String(index + 1).padStart(3, "0")}`,
        sourceRunId: runId,
        kind: lesson.kind,
        text: lesson.summary,
        tags: [experience.task.shape, lesson.kind].filter((tag) => tag !== "unknown"),
        confidence: outcome === "complete" ? "medium" : "low",
      });
      await appendEvent(paths.events, {
        runId,
        phase: "evolve",
        type: "memory.entry_written",
        source: "evolution",
        payload: { id: memory.id, kind: memory.kind },
      });
    }
  }

  await writeRunReport(paths, state, outcome);
  clearInterval(cancelPoller);
  signal?.removeEventListener("abort", onSignalAbort);
  await ownerHeartbeat.stop();

  return {
    runId,
    outcome,
    statePath: paths.state,
    reportPath: paths.report,
  };
}
