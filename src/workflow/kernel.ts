import { writeFile } from "node:fs/promises";
import type { HarnessConfig } from "../config/schema.ts";
import { createDriver } from "../drivers/index.ts";
import type { DriverResult } from "../drivers/contract.ts";
import { classifyDriverFailure } from "../drivers/errors.ts";
import { appendMemoryEntry } from "../evolution/memory.ts";
import { appendEvent } from "../ledger/events.ts";
import { runPaths } from "../ledger/paths.ts";
import { terminal, transition, writeState } from "../ledger/state.ts";
import { runPolicyPreflight } from "../policy/preflight.ts";
import type { RunState, TerminalOutcome } from "../types.ts";
import { ensureDir, writeJsonAtomic } from "../util/fs.ts";
import { sha256Text } from "../util/hash.ts";
import { createRunId } from "../util/id.ts";

export interface ExecuteRunOptions {
  cwd: string;
  prompt: string;
  config: HarnessConfig;
}

export interface ExecuteRunResult {
  runId: string;
  outcome: TerminalOutcome;
  statePath: string;
  reportPath: string;
}

function outcomeFromDriver(status: string): TerminalOutcome {
  if (status === "blocked") return "blocked";
  if (status === "cancelled") return "cancelled";
  return status === "succeeded" ? "complete" : "failed";
}

function repairPrompt(originalPrompt: string, result: DriverResult, verificationStatus: string): string {
  return `Original task:
${originalPrompt}

The previous attempt completed, but verification failed with status: ${verificationStatus}.
${result.finalMessage ? `\nPrevious final message:\n${result.finalMessage}\n` : ""}
Repair the work using the verification failure as the source of truth, then stop.`;
}

async function writeReport(paths: ReturnType<typeof runPaths>, state: RunState, outcome: TerminalOutcome): Promise<void> {
  const report = `# Run ${state.runId}

- Outcome: ${outcome}
- Driver: ${state.driver}
- Verification: ${state.verification.latestStatus}
- Repair iterations: ${state.repairIteration}
${state.error ? `- Error: ${state.error.message.split("\n")[0]}\n` : ""}
`;
  await writeFile(paths.report, report);
}

export async function executeRun(options: ExecuteRunOptions): Promise<ExecuteRunResult> {
  const { cwd, prompt, config } = options;
  const runId = createRunId();
  const paths = runPaths(cwd, runId);
  await ensureDir(paths.rawDir);
  await ensureDir(paths.artifactsDir);

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

  let result: DriverResult = { status: "blocked", error: "policy blocked run before driver execution" };
  let outcome: TerminalOutcome = "blocked";
  let verificationStatus = state.verification.latestStatus;

  if (preflight.status === "blocked") {
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

    const runDriverAttempt = async (attemptPrompt: string, attempt: number): Promise<DriverResult> => {
      const suffix = attempt === 0 ? "" : `-repair-${attempt}`;
      const attemptResult = await driver.run({
        runId,
        cwd,
        prompt: attemptPrompt,
        config,
        context: {
          rawStdoutPath: `${paths.rawDir}/${config.driver}${suffix}-stdout.jsonl`,
          rawStderrPath: `${paths.rawDir}/${config.driver}${suffix}-stderr.log`,
        },
      }, async (event) => {
        await appendEvent(paths.events, {
          runId,
          phase: state.phase,
          type: event.type,
          source: event.source,
          payload: event.payload,
        });
      });
      await appendEvent(paths.events, {
        runId,
        phase: state.phase,
        type: attemptResult.status === "succeeded" ? "driver.completed" : "driver.failed",
        source: config.driver,
        payload: {
          status: attemptResult.status,
          attempt,
          ...(attemptResult.exitCode !== undefined ? { exitCode: attemptResult.exitCode } : {}),
          ...(attemptResult.error ? { error: attemptResult.error.slice(0, 2000) } : {}),
        },
      });
      return attemptResult;
    };

    const runChecks = async (): Promise<string> => {
      if (config.verification.commands.length === 0) return "skipped";
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
      });
      await writeJsonAtomic(paths.verification, verification);
      await appendEvent(paths.events, {
        runId,
        phase: state.phase,
        type: "verification.completed",
        source: "kernel",
        payload: { status: verification.status },
      });
      return verification.status;
    };

    result = await runDriverAttempt(prompt, 0);

    outcome = outcomeFromDriver(result.status);
    if (result.status !== "succeeded") {
      const classification = classifyDriverFailure(result);
      await appendEvent(paths.events, {
        runId,
        phase: state.phase,
        type: "driver.failure_classified",
        source: "kernel",
        payload: classification,
      });
    }
    if (result.status === "succeeded" && config.verification.commands.length > 0) {
      verificationStatus = await runChecks();
      outcome = verificationStatus === "passed" ? "complete" : "failed";
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
        result = await runDriverAttempt(repairPrompt(prompt, result, verificationStatus), nextIteration);
        await appendEvent(paths.events, {
          runId,
          phase: state.phase,
          type: "repair.completed",
          source: "kernel",
          payload: { iteration: nextIteration, driverStatus: result.status },
        });
        outcome = outcomeFromDriver(result.status);
        if (result.status !== "succeeded") break;
        verificationStatus = await runChecks();
        outcome = verificationStatus === "passed" ? "complete" : "failed";
      }
    }

    if (result.finalMessage) {
      const finalPath = `${paths.artifactsDir}/final-message.md`;
      await writeFile(finalPath, result.finalMessage);
      if (!state.artifacts.includes(finalPath)) state.artifacts.push(finalPath);
    }

    state = {
      ...state,
      verification: {
        ...state.verification,
        latestStatus: verificationStatus,
      },
      ...(outcome === "failed"
        ? (() => {
          const classification = classifyDriverFailure(result);
          return {
            error: {
              code: classification.code,
              message: classification.message.slice(0, 500),
              source: config.driver,
              suggestion: classification.suggestion,
            },
          };
        })()
        : {}),
    };
  }

  state = {
    ...state,
    verification: {
      ...state.verification,
      latestStatus: verificationStatus,
    },
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

  await writeReport(paths, state, outcome);

  return {
    runId,
    outcome,
    statePath: paths.state,
    reportPath: paths.report,
  };
}
