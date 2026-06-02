import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { runPaths } from "../../ledger/paths.ts";
import { readState } from "../../ledger/state.ts";
import type { RunState } from "../../types.ts";
import {
  readAppServerSchemaFixture,
  readSchemaArtifactStatus,
  validateSchemaArtifactValue,
  validateSchemaValue,
  type SchemaValidationType,
} from "../../validation/schemas.ts";
import { schemaEngineStatus } from "../../validation/json-schema-subset.ts";
import { flagBool, flagString, type ParsedArgs } from "../args.ts";

const schemaValidationTypes = new Set<SchemaValidationType>([
  "config",
  "state",
  "event",
  "memory-entry",
  "skill",
  "session-state",
  "supply-chain-policy",
  "architecture-policy",
  "autopilot-contract",
  "wiki-manifest",
  "repo-graph",
  "relay-session",
  "stage-gate-evidence",
  "convergence-agreement",
  "decision",
  "app-instance-descriptor",
  "app-instance",
  "app-instance-observation",
  "app-server-discovery",
  "app-server-stage-a",
  "app-server-stage-b",
]);

function parseSchemaType(value: string | undefined): SchemaValidationType {
  if (!value || !schemaValidationTypes.has(value as SchemaValidationType)) {
    throw new Error(`unsupported_schema_type:${value ?? "missing"}`);
  }
  return value as SchemaValidationType;
}

async function readJsonFile(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch (error) {
    throw new Error(`json_parse_failed:${path}:${error instanceof Error ? error.message : String(error)}`);
  }
}

async function validateJsonFile(type: SchemaValidationType, path: string, schemaRoot?: string) {
  const value = await readJsonFile(path);
  const validation = validateSchemaValue(type, value);
  const artifactValidation = await validateSchemaArtifactValue(type, value, schemaRoot);
  return {
    schemaVersion: 1 as const,
    type,
    file: path,
    validation,
    artifactValidation,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function inputEvolutionEnabled(input: unknown): boolean {
  if (!isRecord(input) || !isRecord(input.config) || !isRecord(input.config.evolution)) return true;
  return input.config.evolution.enabled !== false;
}

async function validateRunLedger(cwd: string, runId: string, schemaRoot?: string) {
  const paths = runPaths(cwd, runId);
  let parsedState: RunState | null = null;
  const state = {
    name: "state",
    path: paths.state,
    exists: existsSync(paths.state),
    valid: false,
    error: null as string | null,
    artifactValidation: null as Awaited<ReturnType<typeof validateSchemaArtifactValue>> | null,
  };
  if (state.exists) {
    try {
      parsedState = await readState(paths.state);
      if (parsedState.runId !== runId) throw new Error("runId_mismatch");
      state.artifactValidation = await validateSchemaArtifactValue("state", parsedState, schemaRoot);
      state.valid = state.artifactValidation.valid;
      if (!state.valid) state.error = `artifact:${state.artifactValidation.errors.join(",")}`;
    } catch (error) {
      state.error = error instanceof Error ? error.message : String(error);
    }
  } else {
    state.error = "missing";
  }

  const eventErrors: string[] = [];
  let eventCount = 0;
  let terminalEventOutcome: unknown = null;
  if (existsSync(paths.events)) {
    const raw = await readFile(paths.events, "utf8");
    for (const [index, line] of raw.split(/\r?\n/).entries()) {
      if (!line.trim()) continue;
      eventCount += 1;
      try {
        const event = JSON.parse(line) as unknown;
        const validation = validateSchemaValue("event", event);
        if (!validation.valid) eventErrors.push(`line_${index + 1}:${validation.errors.join(",")}`);
        const artifactValidation = await validateSchemaArtifactValue("event", event, schemaRoot);
        if (!artifactValidation.valid) eventErrors.push(`line_${index + 1}:artifact:${artifactValidation.errors.join(",")}`);
        if (typeof event === "object" && event !== null && !Array.isArray(event)) {
          const record = event as Record<string, unknown>;
          if (record.runId !== runId) eventErrors.push(`line_${index + 1}:runId_mismatch`);
          if (record.type === "run.terminal" && typeof record.payload === "object" && record.payload !== null && !Array.isArray(record.payload)) {
            terminalEventOutcome = (record.payload as Record<string, unknown>).outcome;
          }
        }
      } catch (error) {
        eventErrors.push(`line_${index + 1}:${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (eventCount === 0) eventErrors.push("empty");
    if (parsedState?.status === "terminal") {
      if (terminalEventOutcome === null) eventErrors.push("terminal_event_missing");
      if (terminalEventOutcome !== null && terminalEventOutcome !== parsedState.outcome) eventErrors.push("terminal_event_outcome_mismatch");
    }
  } else {
    eventErrors.push("missing");
  }

  const input = existsSync(paths.input) ? await readJsonFile(paths.input).catch(() => null) : null;
  const evolutionEnabled = inputEvolutionEnabled(input);
  const verificationNotReached = parsedState?.verification.latestStatus === "skipped" && parsedState.verification.reason?.startsWith("not_reached_");
  const verificationRequired = parsedState ? !verificationNotReached && (parsedState.verification.required || parsedState.verification.latestStatus !== "skipped") : true;
  const artifactRequirements = [
    { name: "verification", path: paths.verification, required: verificationRequired },
    { name: "experience", path: paths.experience, required: evolutionEnabled },
  ];
  const jsonArtifacts = await Promise.all(artifactRequirements.map(async ({ name, path, required }) => {
    if (!existsSync(path)) return { name, path, exists: false, valid: !required, required, error: required ? "missing" : null };
    try {
      const parsed = await readJsonFile(path);
      const valid = typeof parsed === "object" && parsed !== null && !Array.isArray(parsed);
      return { name, path, exists: true, valid, required, error: valid ? null : "not_object" };
    } catch (error) {
      return { name, path, exists: true, valid: false, required, error: error instanceof Error ? error.message : String(error) };
    }
  }));

  const events = {
    name: "events",
    path: paths.events,
    exists: existsSync(paths.events),
    valid: existsSync(paths.events) && eventErrors.length === 0,
    count: eventCount,
    errors: eventErrors,
  };
  const artifacts = [state, events, ...jsonArtifacts];
  return {
    schemaVersion: 1 as const,
    runId,
    cwd,
    ok: artifacts.every((artifact) => artifact.valid),
    artifacts,
  };
}

export async function schemaCommand(args: ParsedArgs): Promise<void> {
  const subcommand = args.positionals[0] ?? "check";
  const rootFlag = flagString(args.flags, "schema-root");
  const root = rootFlag ? resolve(rootFlag) : undefined;
  const json = flagBool(args.flags, "json");

  if (subcommand === "check" || subcommand === "list") {
    const schemas = await readSchemaArtifactStatus(root);
    const appServerFixture = await readAppServerSchemaFixture();
    const ok = schemas.every((schema) => schema.valid) && appServerFixture.valid;
    const result = { schemaVersion: 1, stability: "stable" as const, ok, schemas, appServerFixture };
    if (json) {
      console.log(JSON.stringify(result, null, 2));
      process.exitCode = ok ? 0 : 1;
      return;
    }
    for (const schema of schemas) console.log(`${schema.valid ? "OK" : "FAIL"} ${schema.name}`);
    console.log(`${appServerFixture.valid ? "OK" : "FAIL"} app-server fixture`);
    process.exitCode = ok ? 0 : 1;
    return;
  }

  if (subcommand === "engine") {
    const result = schemaEngineStatus();
    if (json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    console.log(`Schema engine: ${result.activeEngine}`);
    console.log(`Full JSON Schema engine: ${result.fullJsonSchemaEngine.available ? "available" : "unavailable"}`);
    return;
  }

  if (subcommand === "validate") {
    const type = parseSchemaType(flagString(args.flags, "type"));
    const file = flagString(args.flags, "file");
    if (!file) throw new Error("missing_schema_file");
    const result = await validateJsonFile(type, resolve(file), root);
    const ok = result.validation.valid && result.artifactValidation.valid;
    if (json) {
      console.log(JSON.stringify({ stability: "stable" as const, ok, ...result }, null, 2));
      process.exitCode = ok ? 0 : 1;
      return;
    }
    console.log(`${ok ? "OK" : "FAIL"} ${type} ${result.file}`);
    for (const error of result.validation.errors) console.log(`- ${error}`);
    for (const error of result.artifactValidation.schemaErrors) console.log(`- schema:${error}`);
    for (const error of result.artifactValidation.unsupportedKeywords) console.log(`- unsupported:${error}`);
    for (const error of result.artifactValidation.errors) console.log(`- artifact:${error}`);
    process.exitCode = ok ? 0 : 1;
    return;
  }

  if (subcommand === "validate-run") {
    const runId = args.positionals[1];
    if (!runId) throw new Error("missing_run_id");
    const cwd = resolve(flagString(args.flags, "cwd") ?? process.cwd());
    const result = await validateRunLedger(cwd, runId, root);
    if (json) {
      console.log(JSON.stringify({ stability: "stable" as const, ...result }, null, 2));
      process.exitCode = result.ok ? 0 : 1;
      return;
    }
    console.log(`${result.ok ? "OK" : "FAIL"} run ${runId}`);
    for (const artifact of result.artifacts) {
      console.log(`${artifact.valid ? "OK" : "FAIL"} ${artifact.name}`);
    }
    process.exitCode = result.ok ? 0 : 1;
    return;
  }

  throw new Error(`unsupported_schema_command:${subcommand}`);
}
