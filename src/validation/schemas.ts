import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

export interface AppServerSchemaFixtureStatus {
  path: string;
  exists: boolean;
  valid: boolean;
  methods: string[];
  error: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function readAppServerSchemaFixture(path = resolve("fixtures/app-server/schema.fixture.json")): Promise<AppServerSchemaFixtureStatus> {
  if (!existsSync(path)) return { path, exists: false, valid: false, methods: [], error: "fixture_missing" };
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
    if (!isRecord(parsed) || parsed.schemaVersion !== 1 || parsed.protocol !== "codex-app-server" || !Array.isArray(parsed.methods)) {
      return { path, exists: true, valid: false, methods: [], error: "fixture_shape_invalid" };
    }
    return { path, exists: true, valid: true, methods: parsed.methods.filter((method): method is string => typeof method === "string"), error: null };
  } catch (error) {
    return { path, exists: true, valid: false, methods: [], error: error instanceof Error ? error.message : String(error) };
  }
}

export interface SchemaArtifactStatus {
  name: string;
  path: string;
  exists: boolean;
  valid: boolean;
  id: string | null;
  error: string | null;
}

export const schemaArtifactNames = [
  "config.schema.json",
  "state.schema.json",
  "event.schema.json",
  "memory-entry.schema.json",
  "skill.schema.json",
] as const;

export async function readSchemaArtifactStatus(root = resolve("schemas")): Promise<SchemaArtifactStatus[]> {
  const statuses: SchemaArtifactStatus[] = [];
  for (const name of schemaArtifactNames) {
    const path = join(root, name);
    if (!existsSync(path)) {
      statuses.push({ name, path, exists: false, valid: false, id: null, error: "schema_missing" });
      continue;
    }
    try {
      const parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
      if (!isRecord(parsed) || typeof parsed.$schema !== "string" || typeof parsed.$id !== "string" || typeof parsed.title !== "string") {
        statuses.push({ name, path, exists: true, valid: false, id: null, error: "schema_shape_invalid" });
        continue;
      }
      statuses.push({ name, path, exists: true, valid: true, id: parsed.$id, error: null });
    } catch (error) {
      statuses.push({ name, path, exists: true, valid: false, id: null, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return statuses;
}
