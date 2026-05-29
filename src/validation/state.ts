import type { RunState } from "../types.ts";
import { assertSchemaValue } from "./schemas.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function migrateRunState(value: unknown, path = "state.json"): RunState {
  if (!isRecord(value)) throw new Error(`state_corrupt:${path}`);
  const migrated = {
    schemaVersion: 1,
    driverRepairIteration: 0,
    ...value,
  };
  if (migrated.schemaVersion !== 1) throw new Error(`state_corrupt:${path}`);
  if (typeof migrated.runId !== "string" || !migrated.runId) throw new Error(`state_corrupt:${path}`);
  if (!(migrated.status === "running" || migrated.status === "terminal")) throw new Error(`state_corrupt:${path}`);
  if (!["intake", "research", "plan", "execute", "verify", "repair", "evolve", "complete", "failed", "blocked", "cancelled"].includes(String(migrated.phase))) {
    throw new Error(`state_corrupt:${path}`);
  }
  if (!(migrated.outcome === null || ["complete", "failed", "blocked", "cancelled"].includes(String(migrated.outcome)))) throw new Error(`state_corrupt:${path}`);
  if (typeof migrated.cwd !== "string") throw new Error(`state_corrupt:${path}`);
  if (typeof migrated.driver !== "string") throw new Error(`state_corrupt:${path}`);
  if (typeof migrated.promptHash !== "string") throw new Error(`state_corrupt:${path}`);
  if (!Number.isInteger(migrated.repairIteration) || migrated.repairIteration < 0) throw new Error(`state_corrupt:${path}`);
  if (!Array.isArray(migrated.artifacts) || migrated.artifacts.some((artifact) => typeof artifact !== "string")) throw new Error(`state_corrupt:${path}`);
  if (!isRecord(migrated.verification)) throw new Error(`state_corrupt:${path}`);
  if (typeof migrated.verification.required !== "boolean") throw new Error(`state_corrupt:${path}`);
  if (typeof migrated.verification.latestStatus !== "string") throw new Error(`state_corrupt:${path}`);
  assertSchemaValue("state", migrated);
  return migrated as unknown as RunState;
}
