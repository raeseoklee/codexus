import type { RunState } from "../types.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function migrateRunState(value: unknown, path = "state.json"): RunState {
  if (!isRecord(value)) throw new Error(`state_corrupt:${path}`);
  const migrated = { schemaVersion: 1, ...value };
  if (migrated.schemaVersion !== 1) throw new Error(`state_corrupt:${path}`);
  if (typeof migrated.runId !== "string" || !migrated.runId) throw new Error(`state_corrupt:${path}`);
  if (!(migrated.status === "running" || migrated.status === "terminal")) throw new Error(`state_corrupt:${path}`);
  if (typeof migrated.phase !== "string") throw new Error(`state_corrupt:${path}`);
  if (typeof migrated.cwd !== "string") throw new Error(`state_corrupt:${path}`);
  if (typeof migrated.driver !== "string") throw new Error(`state_corrupt:${path}`);
  if (!isRecord(migrated.verification)) throw new Error(`state_corrupt:${path}`);
  if (typeof migrated.verification.latestStatus !== "string") throw new Error(`state_corrupt:${path}`);
  return migrated as unknown as RunState;
}
