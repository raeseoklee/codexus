import { writeJsonAtomic } from "../util/fs.ts";
import type { DriverResult } from "../drivers/contract.ts";
import type { RunPaths } from "../ledger/paths.ts";
import type { RunState } from "../types.ts";

export interface ExperienceRecord {
  schemaVersion: 1;
  runId: string;
  createdAt: string;
  task: {
    summary: string;
    shape: "unknown" | "bugfix" | "feature" | "verification" | "docs";
    domains: string[];
  };
  context: {
    cwd: string;
    artifacts: string[];
  };
  driver: {
    status: DriverResult["status"];
    exitCode?: number;
    error?: string;
  };
  verification: {
    status: RunState["verification"]["latestStatus"];
    commands: string[];
  };
  decisions: Array<{
    summary: string;
    reason: string;
    evidence: string[];
  }>;
  failures: Array<{
    summary: string;
    lesson: string;
    evidence: string[];
  }>;
  reusableLessons: Array<{
    kind: "workflow_lesson" | "verification_pattern";
    summary: string;
  }>;
  sources: string[];
}

export interface WriteExperienceOptions {
  paths: RunPaths;
  state: RunState;
  prompt: string;
  driverResult: DriverResult;
  verificationCommands?: string[];
}

function summarizeTask(prompt: string): string {
  const compact = prompt.replace(/\s+/g, " ").trim();
  return compact.length > 160 ? `${compact.slice(0, 157)}...` : compact;
}

function inferShape(prompt: string): ExperienceRecord["task"]["shape"] {
  const lowered = prompt.toLowerCase();
  if (/(fix|bug|failing|error|regression)/.test(lowered)) return "bugfix";
  if (/(test|verify|lint|typecheck)/.test(lowered)) return "verification";
  if (/(doc|readme|design|plan)/.test(lowered)) return "docs";
  if (/(build|implement|add|create)/.test(lowered)) return "feature";
  return "unknown";
}

export function buildExperience(options: WriteExperienceOptions): ExperienceRecord {
  const lessons: ExperienceRecord["reusableLessons"] = [];
  const decisions: ExperienceRecord["decisions"] = [];
  const failures: ExperienceRecord["failures"] = [];
  if (options.state.verification.latestStatus === "passed") {
    lessons.push({
      kind: "verification_pattern",
      summary: "This task reached completion with verification evidence recorded in the run ledger.",
    });
    decisions.push({
      summary: "Completion was gated on required verification.",
      reason: "The harness only marked the run complete after verification passed.",
      evidence: [options.paths.verification],
    });
  }
  if (options.driverResult.status !== "succeeded") {
    lessons.push({
      kind: "workflow_lesson",
      summary: "Driver failure should be inspected before reusing this run as a success pattern.",
    });
    failures.push({
      summary: `Driver ended with status ${options.driverResult.status}.`,
      lesson: "Do not reuse failed driver runs as success patterns without manual review.",
      evidence: [options.paths.events, options.paths.state],
    });
  }
  if (["failed", "timed_out", "error"].includes(options.state.verification.latestStatus)) {
    failures.push({
      summary: `Verification ended with status ${options.state.verification.latestStatus}.`,
      lesson: "Verification failure should be treated as the source of truth for repair or follow-up.",
      evidence: [options.paths.verification],
    });
  }
  if (options.state.repairIteration > 0) {
    decisions.push({
      summary: "Repair loop was used after verification failed.",
      reason: "A bounded repair iteration was allowed by the configured repair budget.",
      evidence: [options.paths.events, options.paths.verification],
    });
  }

  return {
    schemaVersion: 1,
    runId: options.state.runId,
    createdAt: new Date().toISOString(),
    task: {
      summary: summarizeTask(options.prompt),
      shape: inferShape(options.prompt),
      domains: [],
    },
    context: {
      cwd: options.state.cwd,
      artifacts: options.state.artifacts,
    },
    driver: {
      status: options.driverResult.status,
      ...(options.driverResult.exitCode !== undefined ? { exitCode: options.driverResult.exitCode } : {}),
      ...(options.driverResult.error ? { error: options.driverResult.error } : {}),
    },
    verification: {
      status: options.state.verification.latestStatus,
      commands: options.verificationCommands ?? [],
    },
    decisions,
    failures,
    reusableLessons: lessons,
    sources: [
      options.paths.input,
      options.paths.events,
      options.paths.state,
      ...(options.state.verification.latestStatus !== "skipped" ? [options.paths.verification] : []),
    ],
  };
}

export async function writeExperience(options: WriteExperienceOptions): Promise<ExperienceRecord> {
  const experience = buildExperience(options);
  await writeJsonAtomic(options.paths.experience, experience);
  return experience;
}
