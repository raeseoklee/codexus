import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { defaultConfig } from "../config/schema.ts";
import { CodexExecDriver } from "../drivers/codex-exec.ts";
import type { DriverResult } from "../drivers/contract.ts";

export const replayParityCaseLabels = [
  "deterministic_pass",
  "streaming_text",
  "tool_success",
  "tool_denial",
  "permission_branch",
  "permission_approved",
  "permission_denied",
  "multi_tool_turn",
  "skill_path",
  "file_tool_roundtrip",
  "shell_output",
  "interruption",
  "compaction",
  "large_output",
  "usage_accounting",
] as const;

const replayParityCases = new Set(replayParityCaseLabels);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(record: Record<string, unknown>, key: string, errors: string[], path: string): void {
  if (typeof record[key] !== "string" || !(record[key] as string).trim()) errors.push(`${path}.${key}:missing_string`);
}

function requireStringArray(record: Record<string, unknown>, key: string, errors: string[], path: string): void {
  if (!Array.isArray(record[key]) || (record[key] as unknown[]).some((item) => typeof item !== "string")) {
    errors.push(`${path}.${key}:missing_string_array`);
  }
}

function validateReplaySpec(value: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(value)) return ["replay:not_object"];
  if (value.schemaVersion !== 1) errors.push("schemaVersion:not_1");
  requireString(value, "skillId", errors, "replay");
  if (!Array.isArray(value.scenarios) || value.scenarios.length === 0) {
    errors.push("replay.scenarios:missing_nonempty_array");
    return errors;
  }
  value.scenarios.forEach((scenario, index) => {
    const path = `replay.scenarios.${index}`;
    if (!isRecord(scenario)) {
      errors.push(`${path}:not_object`);
      return;
    }
    requireString(scenario, "id", errors, path);
    if (scenario.driver !== "mock") errors.push(`${path}.driver:unsupported`);
    if (scenario.parityCase !== undefined && (typeof scenario.parityCase !== "string" || !replayParityCases.has(scenario.parityCase))) {
      errors.push(`${path}.parityCase:unsupported`);
    }
    if (!isRecord(scenario.input)) {
      errors.push(`${path}.input:not_object`);
    } else {
      requireString(scenario.input, "task", errors, `${path}.input`);
      requireStringArray(scenario.input, "files", errors, `${path}.input`);
    }
    if (!isRecord(scenario.expected)) {
      errors.push(`${path}.expected:not_object`);
    } else {
      if (typeof scenario.expected.mentionsVerification !== "boolean") errors.push(`${path}.expected.mentionsVerification:missing_boolean`);
      requireStringArray(scenario.expected, "requiresTests", errors, `${path}.expected`);
      requireStringArray(scenario.expected, "forbids", errors, `${path}.expected`);
    }
  });
  return errors;
}

export interface ReplayScenario {
  id: string;
  driver: "mock";
  parityCase?: typeof replayParityCaseLabels[number];
  input: {
    task: string;
    files: string[];
  };
  expected: {
    mentionsVerification: boolean;
    requiresTests: string[];
    forbids: string[];
  };
}

export interface ReplaySpec {
  schemaVersion: 1;
  skillId: string;
  scenarios: ReplayScenario[];
}

export interface ReplayScenarioResult {
  id: string;
  status: "passed" | "failed";
  failures: string[];
}

export interface ReplayResult {
  schemaVersion: 1;
  skillId: string;
  status: "passed" | "failed" | "missing";
  scenarios: ReplayScenarioResult[];
  coverage: {
    parityCases: string[];
    scenarioCount: number;
  };
}

export interface ModelReplayResult {
  schemaVersion: 1;
  status: "not_run" | "blocked" | "passed" | "failed" | "error";
  reason: string;
  budget: number | null;
  evidence?: {
    driver: "codex-exec";
    finalMessage: string | null;
    exitCode: number | null;
  };
}

export function buildDefaultReplaySpec(skillId: string, task: string): ReplaySpec {
  return {
    schemaVersion: 1,
    skillId,
    scenarios: [
      {
        id: "default_scope_and_verification",
        driver: "mock",
        parityCase: "deterministic_pass",
        input: {
          task,
          files: [],
        },
        expected: {
          mentionsVerification: true,
          requiresTests: [],
          forbids: ["promote without replay validation"],
        },
      },
      {
        id: "default_permission_and_promotion_safety",
        driver: "mock",
        parityCase: "permission_branch",
        input: {
          task,
          files: [],
        },
        expected: {
          mentionsVerification: true,
          requiresTests: [],
          forbids: ["promote without replay validation"],
        },
      },
    ],
  };
}

export function evaluateReplaySpec(spec: ReplaySpec, skill: {
  id: string;
  procedure: string[];
  safety: { requiresVerification: boolean; forbiddenActions: string[] };
}): ReplayResult {
  const scenarios = spec.scenarios.map((scenario): ReplayScenarioResult => {
    const failures: string[] = [];
    if (spec.skillId !== skill.id) failures.push("skill_id_mismatch");
    if (scenario.expected.mentionsVerification && !skill.safety.requiresVerification) {
      failures.push("verification_not_required");
    }
    const procedureText = skill.procedure.join("\n").toLowerCase();
    for (const required of scenario.expected.requiresTests) {
      if (!procedureText.includes(required.toLowerCase())) {
        failures.push(`missing_required_test:${required}`);
      }
    }
    for (const forbidden of scenario.expected.forbids) {
      if (!skill.safety.forbiddenActions.some((action) => action.toLowerCase().includes(forbidden.toLowerCase()))) {
        failures.push(`missing_forbidden_action:${forbidden}`);
      }
    }
    return {
      id: scenario.id,
      status: failures.length === 0 ? "passed" : "failed",
      failures,
    };
  });
  return {
    schemaVersion: 1,
    skillId: spec.skillId,
    status: scenarios.every((scenario) => scenario.status === "passed") ? "passed" : "failed",
    scenarios,
    coverage: {
      parityCases: [...new Set(spec.scenarios.map((scenario) => scenario.parityCase ?? scenario.id))].sort(),
      scenarioCount: spec.scenarios.length,
    },
  };
}

export async function readReplaySpec(path: string): Promise<ReplaySpec | null> {
  if (!existsSync(path)) return null;
  const parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
  const errors = validateReplaySpec(parsed);
  if (errors.length > 0) throw new Error(`replay_schema_invalid:${path}:${errors.join(",")}`);
  return parsed as ReplaySpec;
}

function modelReplayPrompt(replay: ReplayResult): string {
  return `You are validating a Codexus skill replay result.

Return compact JSON only, with this shape:
{"status":"passed"|"failed","reason":"short reason"}

Skill id: ${replay.skillId}
Deterministic replay status: ${replay.status}
Scenario results:
${replay.scenarios.map((scenario) => `- ${scenario.id}: ${scenario.status}${scenario.failures.length > 0 ? ` (${scenario.failures.join(", ")})` : ""}`).join("\n")}

Mark passed only if the deterministic replay is passed and the skill appears safe to use as a bounded advisory procedure.`;
}

function statusFromDriverResult(result: DriverResult, deterministicReplay: ReplayResult): "passed" | "failed" | "error" {
  if (result.status !== "succeeded") return "error";
  const text = result.finalMessage ?? "";
  try {
    const parsed = JSON.parse(text) as { status?: unknown };
    if (parsed.status === "passed" || parsed.status === "failed") return parsed.status;
  } catch {
    // Fall through to conservative text matching for older Codex exec output.
  }
  if (/\bpassed\b/i.test(text) && !/\bfailed\b/i.test(text)) return "passed";
  return deterministicReplay.status === "passed" ? "passed" : "failed";
}

export async function evaluateModelReplay(options: {
  cwd: string;
  requested: boolean;
  allowLive: boolean;
  budget: number | null;
  replay: ReplayResult;
  codexCommand?: string;
  codexModel?: string | null;
  env?: NodeJS.ProcessEnv;
}): Promise<ModelReplayResult> {
  if (!options.requested) {
    return {
      schemaVersion: 1,
      status: "not_run",
      reason: "model replay was not requested",
      budget: options.budget,
    };
  }
  if (!options.allowLive) {
    return {
      schemaVersion: 1,
      status: "not_run",
      reason: "model replay requires --allow-live-model-replay; deterministic replay remains the promotion gate",
      budget: options.budget,
    };
  }
  const budget = options.budget;
  if (!Number.isInteger(budget) || budget === null || budget <= 0) {
    return {
      schemaVersion: 1,
      status: "blocked",
      reason: "live model replay requires a positive --model-budget",
      budget,
    };
  }
  const requiredBudget = Math.max(1, options.replay.scenarios.length);
  if (budget < requiredBudget) {
    return {
      schemaVersion: 1,
      status: "blocked",
      reason: `model budget ${budget} is below required replay budget ${requiredBudget}`,
      budget,
    };
  }
  if ((options.env ?? process.env).CODEXUS_ENABLE_LIVE_MODEL_REPLAY !== "1") {
    return {
      schemaVersion: 1,
      status: "blocked",
      reason: "live model replay is disabled; set CODEXUS_ENABLE_LIVE_MODEL_REPLAY=1 for an explicit local experiment",
      budget,
    };
  }

  const driver = new CodexExecDriver();
  const result = await driver.run({
    runId: `model_replay_${options.replay.skillId}`,
    cwd: options.cwd,
    prompt: modelReplayPrompt(options.replay),
    config: {
      ...defaultConfig,
      driver: "codex-exec",
      codex: {
        ...defaultConfig.codex,
        command: options.codexCommand ?? defaultConfig.codex.command,
        model: options.codexModel ?? null,
        sandbox: "read-only",
        approval: "never",
      },
      repair: {
        ...defaultConfig.repair,
        maxIterations: 0,
        maxDriverFailureIterations: 0,
      },
      evolution: {
        ...defaultConfig.evolution,
        enabled: false,
      },
    },
  }, async () => {});
  const status = statusFromDriverResult(result, options.replay);
  return {
    schemaVersion: 1,
    status,
    reason: status === "passed" ? "live model replay passed" : (result.error ?? "live model replay did not pass"),
    budget,
    evidence: {
      driver: "codex-exec",
      finalMessage: result.finalMessage ?? null,
      exitCode: result.exitCode ?? null,
    },
  };
}
