import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";

export interface ReplayScenario {
  id: string;
  driver: "mock";
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
}

export interface ModelReplayResult {
  schemaVersion: 1;
  status: "not_run";
  reason: string;
  budget: number | null;
}

export function buildDefaultReplaySpec(skillId: string, task: string): ReplaySpec {
  return {
    schemaVersion: 1,
    skillId,
    scenarios: [
      {
        id: "default_scope_and_verification",
        driver: "mock",
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
  };
}

export async function readReplaySpec(path: string): Promise<ReplaySpec | null> {
  if (!existsSync(path)) return null;
  return JSON.parse(await readFile(path, "utf8")) as ReplaySpec;
}

export function evaluateModelReplayStub(options: { requested: boolean; budget: number | null }): ModelReplayResult {
  return {
    schemaVersion: 1,
    status: "not_run",
    reason: options.requested
      ? "model replay is intentionally stubbed until deterministic replay, budget, and policy gates are complete"
      : "model replay was not requested",
    budget: options.budget,
  };
}
