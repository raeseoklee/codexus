import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { validateArchitecturePolicy } from "../architecture/policy.ts";
import { validateSupplyChainPolicy } from "../supply-chain/policy.ts";
import { findCodexusPackageRoot } from "../util/package-root.ts";
import { inspectJsonSchemaSubset, jsonSchemaSubsetEngine, validateJsonSchemaSubset } from "./json-schema-subset.ts";

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

function repoRoot(): string {
  return findCodexusPackageRoot();
}

export async function readAppServerSchemaFixture(path = join(repoRoot(), "fixtures", "app-server", "schema.fixture.json")): Promise<AppServerSchemaFixtureStatus> {
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
  engine: typeof jsonSchemaSubsetEngine;
  schemaErrors: string[];
  unsupportedKeywords: string[];
  error: string | null;
}

export type SchemaValidationType =
  | "config"
  | "state"
  | "event"
  | "memory-entry"
  | "skill"
  | "session-state"
  | "supply-chain-policy"
  | "architecture-policy"
  | "repo-graph"
  | "relay-session"
  | "stage-gate-evidence"
  | "convergence-agreement"
  | "decision";

export interface SchemaValidationResult {
  schemaVersion: 1;
  type: SchemaValidationType;
  valid: boolean;
  errors: string[];
}

export interface SchemaArtifactValidationResult extends SchemaValidationResult {
  engine: typeof jsonSchemaSubsetEngine;
  schemaPath: string;
  schemaErrors: string[];
  unsupportedKeywords: string[];
}

export const schemaArtifactNames = [
  "config.schema.json",
  "state.schema.json",
  "event.schema.json",
  "memory-entry.schema.json",
  "skill.schema.json",
  "session-state.schema.json",
  "supply-chain-policy.schema.json",
  "architecture-policy.schema.json",
  "repo-graph.schema.json",
  "relay-session.schema.json",
  "stage-gate-evidence.schema.json",
  "convergence-agreement.schema.json",
  "decision.schema.json",
] as const;

const schemaArtifactsByType: Record<SchemaValidationType, typeof schemaArtifactNames[number]> = {
  config: "config.schema.json",
  state: "state.schema.json",
  event: "event.schema.json",
  "memory-entry": "memory-entry.schema.json",
  skill: "skill.schema.json",
  "session-state": "session-state.schema.json",
  "supply-chain-policy": "supply-chain-policy.schema.json",
  "architecture-policy": "architecture-policy.schema.json",
  "repo-graph": "repo-graph.schema.json",
  "relay-session": "relay-session.schema.json",
  "stage-gate-evidence": "stage-gate-evidence.schema.json",
  "convergence-agreement": "convergence-agreement.schema.json",
  decision: "decision.schema.json",
};

const harnessPhases = ["intake", "research", "plan", "execute", "verify", "repair", "evolve", "complete", "failed", "blocked", "cancelled"] as const;
const terminalOutcomes = ["complete", "failed", "blocked", "cancelled"] as const;
const verificationStatuses = ["pending", "passed", "failed", "skipped", "timed_out", "error"] as const;
const relayStages = ["issue", "design", "plan", "implementation"] as const;
const relayScopes = ["delta-check", "full-gate"] as const;
const relayVerificationStatuses = ["passed", "failed", "skipped", "unknown"] as const;

function schemaRoot(): string {
  return join(repoRoot(), "schemas");
}

export async function readSchemaArtifactStatus(root = schemaRoot()): Promise<SchemaArtifactStatus[]> {
  const statuses: SchemaArtifactStatus[] = [];
  for (const name of schemaArtifactNames) {
    const path = join(root, name);
    if (!existsSync(path)) {
      statuses.push({
        name,
        path,
        exists: false,
        valid: false,
        id: null,
        engine: jsonSchemaSubsetEngine,
        schemaErrors: [],
        unsupportedKeywords: [],
        error: "schema_missing",
      });
      continue;
    }
    try {
      const parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
      if (!isRecord(parsed) || typeof parsed.$schema !== "string" || typeof parsed.$id !== "string" || typeof parsed.title !== "string") {
        statuses.push({
          name,
          path,
          exists: true,
          valid: false,
          id: null,
          engine: jsonSchemaSubsetEngine,
          schemaErrors: [],
          unsupportedKeywords: [],
          error: "schema_shape_invalid",
        });
        continue;
      }
      const inspection = inspectJsonSchemaSubset(parsed);
      const error = inspection.errors.length > 0
        ? "schema_subset_shape_invalid"
        : inspection.unsupportedKeywords.length > 0
          ? "schema_subset_unsupported_keywords"
          : null;
      statuses.push({
        name,
        path,
        exists: true,
        valid: inspection.valid,
        id: parsed.$id,
        engine: inspection.engine,
        schemaErrors: inspection.errors,
        unsupportedKeywords: inspection.unsupportedKeywords,
        error,
      });
    } catch (error) {
      statuses.push({
        name,
        path,
        exists: true,
        valid: false,
        id: null,
        engine: jsonSchemaSubsetEngine,
        schemaErrors: [],
        unsupportedKeywords: [],
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return statuses;
}

export async function validateSchemaArtifactValue(type: SchemaValidationType, value: unknown, root = schemaRoot()): Promise<SchemaArtifactValidationResult> {
  const schemaPath = join(root, schemaArtifactsByType[type]);
  if (!existsSync(schemaPath)) {
    return {
      schemaVersion: 1,
      type,
      valid: false,
      errors: ["schema_missing"],
      engine: jsonSchemaSubsetEngine,
      schemaPath,
      schemaErrors: [],
      unsupportedKeywords: [],
    };
  }
  try {
    const schema = JSON.parse(await readFile(schemaPath, "utf8")) as unknown;
    const validation = validateJsonSchemaSubset(schema, value);
    const schemaErrors = validation.valid ? [] : inspectJsonSchemaSubset(schema).errors;
    return {
      schemaVersion: 1,
      type,
      valid: validation.valid,
      errors: validation.errors,
      engine: validation.engine,
      schemaPath,
      schemaErrors,
      unsupportedKeywords: validation.unsupportedKeywords,
    };
  } catch (error) {
    return {
      schemaVersion: 1,
      type,
      valid: false,
      errors: [error instanceof Error ? error.message : String(error)],
      engine: jsonSchemaSubsetEngine,
      schemaPath,
      schemaErrors: [],
      unsupportedKeywords: [],
    };
  }
}

function requireRecord(value: unknown, errors: string[], path: string): value is Record<string, unknown> {
  if (isRecord(value)) return true;
  errors.push(`${path}:not_object`);
  return false;
}

function requireString(record: Record<string, unknown>, key: string, errors: string[], path = key): void {
  if (typeof record[key] !== "string" || !(record[key] as string).trim()) errors.push(`${path}:missing_string`);
}

function requireNumber(record: Record<string, unknown>, key: string, errors: string[], path = key): void {
  if (!Number.isFinite(record[key])) errors.push(`${path}:missing_number`);
}

function requireBoolean(record: Record<string, unknown>, key: string, errors: string[], path = key): void {
  if (typeof record[key] !== "boolean") errors.push(`${path}:missing_boolean`);
}

function requireArray(record: Record<string, unknown>, key: string, errors: string[], path = key): unknown[] {
  if (Array.isArray(record[key])) return record[key] as unknown[];
  errors.push(`${path}:missing_array`);
  return [];
}

function requireOneOf(record: Record<string, unknown>, key: string, allowed: readonly string[], errors: string[], path = key): void {
  if (typeof record[key] !== "string" || !allowed.includes(record[key] as string)) errors.push(`${path}:invalid_enum`);
}

function validateWorkspaceFingerprint(value: unknown, errors: string[], path: string): void {
  if (!requireRecord(value, errors, path)) return;
  if (value.schemaVersion !== 1) errors.push(`${path}.schemaVersion:not_1`);
  requireBoolean(value, "isGit", errors, `${path}.isGit`);
  if (!(value.head === null || typeof value.head === "string")) errors.push(`${path}.head:invalid`);
  if (!(value.stagedDiffHash === null || typeof value.stagedDiffHash === "string")) errors.push(`${path}.stagedDiffHash:invalid`);
  if (!(value.unstagedDiffHash === null || typeof value.unstagedDiffHash === "string")) errors.push(`${path}.unstagedDiffHash:invalid`);
  if (requireRecord(value.untracked, errors, `${path}.untracked`)) {
    requireString(value.untracked, "hash", errors, `${path}.untracked.hash`);
    requireNumber(value.untracked, "count", errors, `${path}.untracked.count`);
    requireBoolean(value.untracked, "partial", errors, `${path}.untracked.partial`);
  }
  requireString(value, "cwd", errors, `${path}.cwd`);
  requireString(value, "computedAt", errors, `${path}.computedAt`);
  requireBoolean(value, "degraded", errors, `${path}.degraded`);
  if (!(value.degradedReason === null || typeof value.degradedReason === "string")) errors.push(`${path}.degradedReason:invalid`);
}

function validateScopedWorkspaceFingerprint(value: unknown, errors: string[], path: string): void {
  if (!requireRecord(value, errors, path)) return;
  if (value.schemaVersion !== 1) errors.push(`${path}.schemaVersion:not_1`);
  requireOneOf(value, "kind", ["scoped"], errors, `${path}.kind`);
  requireOneOf(value, "root", ["."], errors, `${path}.root`);
  if (requireArray(value, "patterns", errors, `${path}.patterns`).some((item) => typeof item !== "string")) {
    errors.push(`${path}.patterns:non_string_item`);
  }
  requireString(value, "scopeHash", errors, `${path}.scopeHash`);
  if (!(value.trackedContentHash === null || typeof value.trackedContentHash === "string")) errors.push(`${path}.trackedContentHash:invalid`);
  if (!(value.stagedDiffHash === null || typeof value.stagedDiffHash === "string")) errors.push(`${path}.stagedDiffHash:invalid`);
  if (!(value.unstagedDiffHash === null || typeof value.unstagedDiffHash === "string")) errors.push(`${path}.unstagedDiffHash:invalid`);
  if (requireRecord(value.untracked, errors, `${path}.untracked`)) {
    requireString(value.untracked, "hash", errors, `${path}.untracked.hash`);
    requireNumber(value.untracked, "count", errors, `${path}.untracked.count`);
    requireBoolean(value.untracked, "partial", errors, `${path}.untracked.partial`);
  }
  if (!(value.head === null || typeof value.head === "string")) errors.push(`${path}.head:invalid`);
  requireString(value, "cwd", errors, `${path}.cwd`);
  requireString(value, "computedAt", errors, `${path}.computedAt`);
  requireBoolean(value, "degraded", errors, `${path}.degraded`);
  if (!(value.degradedReason === null || typeof value.degradedReason === "string")) errors.push(`${path}.degradedReason:invalid`);
}

export function validateSchemaValue(type: SchemaValidationType, value: unknown): SchemaValidationResult {
  const errors: string[] = [];
  if (!requireRecord(value, errors, type)) return { schemaVersion: 1, type, valid: false, errors };
  const expectedSchemaVersion = type === "session-state" ? 5 : 1;
  if (type !== "config" && type !== "supply-chain-policy" && type !== "architecture-policy" && value.schemaVersion !== expectedSchemaVersion) {
    errors.push(`schemaVersion:not_${expectedSchemaVersion}`);
  }
  if (type === "config" && value.schemaVersion !== undefined && value.schemaVersion !== 1) errors.push("schemaVersion:not_1");

  if (type === "config") {
    requireOneOf(value, "driver", ["codex-exec", "mock", "codex-app-server"], errors);
    if (requireRecord(value.codex, errors, "codex")) {
      requireString(value.codex, "command", errors, "codex.command");
      if (value.codex.model !== null && typeof value.codex.model !== "string") errors.push("codex.model:invalid");
      requireOneOf(value.codex, "sandbox", ["read-only", "workspace-write", "danger-full-access"], errors, "codex.sandbox");
      requireOneOf(value.codex, "approval", ["untrusted", "on-request", "never"], errors, "codex.approval");
      if (value.codex.runTimeoutMs !== null && typeof value.codex.runTimeoutMs !== "number") errors.push("codex.runTimeoutMs:invalid");
    }
    if (requireRecord(value.verification, errors, "verification")) {
      if (requireArray(value.verification, "commands", errors, "verification.commands").some((item) => typeof item !== "string")) {
        errors.push("verification.commands:non_string_item");
      }
      requireNumber(value.verification, "timeoutMs", errors, "verification.timeoutMs");
    }
    if (requireRecord(value.repair, errors, "repair")) {
      if (!Number.isInteger(value.repair.maxIterations) || (value.repair.maxIterations as number) < 0) errors.push("repair.maxIterations:invalid_integer");
      if (!Number.isInteger(value.repair.maxDriverFailureIterations) || (value.repair.maxDriverFailureIterations as number) < 0) {
        errors.push("repair.maxDriverFailureIterations:invalid_integer");
      }
    }
    if (requireRecord(value.evolution, errors, "evolution")) {
      requireBoolean(value.evolution, "enabled", errors, "evolution.enabled");
      requireBoolean(value.evolution, "autoPromote", errors, "evolution.autoPromote");
      requireBoolean(value.evolution, "redactBeforeMemory", errors, "evolution.redactBeforeMemory");
    }
    if (requireRecord(value.automation, errors, "automation")) {
      requireBoolean(value.automation, "cronEnabled", errors, "automation.cronEnabled");
      requireBoolean(value.automation, "gatewayEnabled", errors, "automation.gatewayEnabled");
    }
  }

  if (type === "state") {
    requireString(value, "runId", errors);
    requireOneOf(value, "status", ["running", "terminal"], errors);
    requireOneOf(value, "phase", harnessPhases, errors);
    if (value.outcome !== null && !terminalOutcomes.includes(value.outcome as typeof terminalOutcomes[number])) errors.push("outcome:invalid_enum");
    requireString(value, "createdAt", errors);
    requireString(value, "updatedAt", errors);
    requireString(value, "cwd", errors);
    requireString(value, "driver", errors);
    requireString(value, "promptHash", errors);
    if (!Number.isInteger(value.repairIteration) || (value.repairIteration as number) < 0) errors.push("repairIteration:invalid_integer");
    if (value.driverRepairIteration !== undefined && (!Number.isInteger(value.driverRepairIteration) || (value.driverRepairIteration as number) < 0)) {
      errors.push("driverRepairIteration:invalid_integer");
    }
    if (requireRecord(value.verification, errors, "verification")) {
      requireBoolean(value.verification, "required", errors, "verification.required");
      requireOneOf(value.verification, "latestStatus", verificationStatuses, errors, "verification.latestStatus");
      if (value.verification.reason !== undefined && typeof value.verification.reason !== "string") errors.push("verification.reason:invalid");
    }
    requireArray(value, "artifacts", errors);
    if (value.usage !== undefined && !isRecord(value.usage)) errors.push("usage:invalid");
  }

  if (type === "event") {
    requireString(value, "eventId", errors);
    requireString(value, "runId", errors);
    requireString(value, "timestamp", errors);
    requireOneOf(value, "phase", harnessPhases, errors);
    requireString(value, "type", errors);
    requireString(value, "source", errors);
    if (!("payload" in value)) errors.push("payload:missing");
  }

  if (type === "memory-entry") {
    requireString(value, "id", errors);
    requireString(value, "createdAt", errors);
    requireString(value, "sourceRunId", errors);
    requireOneOf(value, "kind", ["repo_fact", "user_preference", "workflow_lesson", "verification_pattern", "failure_pattern", "tooling_note"], errors);
    requireString(value, "text", errors);
    if (requireArray(value, "tags", errors).some((item) => typeof item !== "string")) errors.push("tags:non_string_item");
    requireOneOf(value, "confidence", ["low", "medium", "high"], errors);
  }

  if (type === "skill") {
    requireString(value, "id", errors);
    requireString(value, "name", errors);
    requireString(value, "displayName", errors);
    if (typeof value.displayName === "string" && !value.displayName.startsWith("codexus:")) errors.push("displayName:not_codexus_namespaced");
    requireOneOf(value, "status", ["proposed", "active", "deprecated"], errors);
    requireString(value, "version", errors);
    if (requireArray(value, "sourceRunIds", errors).some((item) => typeof item !== "string")) errors.push("sourceRunIds:non_string_item");
    requireRecord(value.trigger, errors, "trigger");
    requireRecord(value.scope, errors, "scope");
    if (requireArray(value, "procedure", errors).some((item) => typeof item !== "string")) errors.push("procedure:non_string_item");
    if (requireRecord(value.safety, errors, "safety")) {
      requireBoolean(value.safety, "requiresVerification", errors, "safety.requiresVerification");
      if (requireArray(value.safety, "forbiddenActions", errors, "safety.forbiddenActions").some((item) => typeof item !== "string")) {
        errors.push("safety.forbiddenActions:non_string_item");
      }
    }
    requireRecord(value.promotion, errors, "promotion");
  }

  if (type === "session-state") {
    requireString(value, "sessionId", errors);
    requireString(value, "cwd", errors);
    requireOneOf(value, "status", ["initialized"], errors);
    requireString(value, "createdAt", errors);
    requireString(value, "updatedAt", errors);
    if (!(value.lastCommand === null || typeof value.lastCommand === "string")) errors.push("lastCommand:invalid");
    requireArray(value, "checkpoints", errors);
    const verifications = requireArray(value, "verifications", errors);
    for (const item of verifications) {
      if (!isRecord(item)) {
        errors.push("verifications:non_object_item");
        continue;
      }
      requireString(item, "id", errors, "verifications.id");
      requireString(item, "createdAt", errors, "verifications.createdAt");
      requireString(item, "status", errors, "verifications.status");
      if (requireArray(item, "commands", errors, "verifications.commands").some((command) => typeof command !== "string")) {
        errors.push("verifications.commands:non_string_item");
      }
      requireString(item, "path", errors, "verifications.path");
      requireString(item, "artifactsDir", errors, "verifications.artifactsDir");
      if (!("workspaceFingerprint" in item)) {
        errors.push("verifications.workspaceFingerprint:missing");
      } else if (item.workspaceFingerprint !== null) {
        validateWorkspaceFingerprint(item.workspaceFingerprint, errors, "verifications.workspaceFingerprint");
      }
    }
    if (!("lastVerifiedFingerprint" in value)) {
      errors.push("lastVerifiedFingerprint:missing");
    } else if (value.lastVerifiedFingerprint !== null) {
      if (requireRecord(value.lastVerifiedFingerprint, errors, "lastVerifiedFingerprint")) {
        requireString(value.lastVerifiedFingerprint, "verificationId", errors, "lastVerifiedFingerprint.verificationId");
        requireString(value.lastVerifiedFingerprint, "status", errors, "lastVerifiedFingerprint.status");
        requireString(value.lastVerifiedFingerprint, "recordedAt", errors, "lastVerifiedFingerprint.recordedAt");
        validateWorkspaceFingerprint(value.lastVerifiedFingerprint.fingerprint, errors, "lastVerifiedFingerprint.fingerprint");
      }
    }
    const hookEvents = requireArray(value, "hookEvents", errors);
    for (const item of hookEvents) {
      if (!isRecord(item)) {
        errors.push("hookEvents:non_object_item");
        continue;
      }
      requireString(item, "id", errors, "hookEvents.id");
      requireString(item, "event", errors, "hookEvents.event");
      requireString(item, "observedAt", errors, "hookEvents.observedAt");
      requireOneOf(item, "source", ["notify"], errors, "hookEvents.source");
      requireString(item, "cwd", errors, "hookEvents.cwd");
      requireOneOf(item, "runtimeSurface", ["unknown", "cli-tui", "desktop-app-server"], errors, "hookEvents.runtimeSurface");
      if (requireRecord(item.process, errors, "hookEvents.process")) {
        requireNumber(item.process, "pid", errors, "hookEvents.process.pid");
        requireNumber(item.process, "ppid", errors, "hookEvents.process.ppid");
        requireString(item.process, "cwd", errors, "hookEvents.process.cwd");
        if (!(item.process.bundleIdentifier === null || typeof item.process.bundleIdentifier === "string")) {
          errors.push("hookEvents.process.bundleIdentifier:invalid");
        }
      }
      if ("heartbeatEvidence" in item && !(item.heartbeatEvidence === null || isRecord(item.heartbeatEvidence))) {
        errors.push("hookEvents.heartbeatEvidence:invalid");
      }
      if ("heartbeatChangeEvidence" in item && !(item.heartbeatChangeEvidence === null || isRecord(item.heartbeatChangeEvidence))) {
        errors.push("hookEvents.heartbeatChangeEvidence:invalid");
      }
    }
    const subagents = requireArray(value, "subagents", errors);
    for (const item of subagents) {
      if (!isRecord(item)) {
        errors.push("subagents:non_object_item");
        continue;
      }
      requireString(item, "taskId", errors, "subagents.taskId");
      requireString(item, "role", errors, "subagents.role");
      requireOneOf(item, "status", ["recorded", "attached", "launch_unavailable"], errors, "subagents.status");
      requireString(item, "recordedAt", errors, "subagents.recordedAt");
      requireString(item, "path", errors, "subagents.path");
      requireNumber(item, "claimCount", errors, "subagents.claimCount");
      requireNumber(item, "limitationCount", errors, "subagents.limitationCount");
      if (requireArray(item, "evidenceLinks", errors, "subagents.evidenceLinks").some((link) => typeof link !== "string")) {
        errors.push("subagents.evidenceLinks:non_string_item");
      }
    }
    requireArray(value, "linkedRunIds", errors);
    if (requireRecord(value.capabilities, errors, "capabilities")) {
      requireOneOf(value.capabilities, "tmux", ["available", "unavailable"], errors, "capabilities.tmux");
      requireOneOf(value.capabilities, "hooks", ["available", "configured", "unavailable"], errors, "capabilities.hooks");
      requireOneOf(value.capabilities, "statusline", ["available", "unavailable"], errors, "capabilities.statusline");
    }
    if (requireRecord(value.notifyDispatch, errors, "notifyDispatch")) {
      requireOneOf(value.notifyDispatch, "status", ["observed", "unobserved", "not_configured"], errors, "notifyDispatch.status");
      if (!(value.notifyDispatch.lastTurnEndedAt === null || typeof value.notifyDispatch.lastTurnEndedAt === "string")) errors.push("notifyDispatch.lastTurnEndedAt:invalid");
      if (!(value.notifyDispatch.lastObservedAt === null || typeof value.notifyDispatch.lastObservedAt === "string")) errors.push("notifyDispatch.lastObservedAt:invalid");
      requireOneOf(value.notifyDispatch, "runtimeSurface", ["unknown", "cli-tui", "desktop-app-server"], errors, "notifyDispatch.runtimeSurface");
      requireString(value.notifyDispatch, "caveat", errors, "notifyDispatch.caveat");
    }
    if (requireRecord(value.overlays, errors, "overlays")) {
      requireRecord(value.overlays.project, errors, "overlays.project");
      requireRecord(value.overlays.user, errors, "overlays.user");
    }
  }

  if (type === "supply-chain-policy") {
    const validation = validateSupplyChainPolicy(value);
    errors.push(...validation.errors);
  }

  if (type === "architecture-policy") {
    const validation = validateArchitecturePolicy(value);
    errors.push(...validation.errors);
  }

  if (type === "repo-graph") {
    requireOneOf(value, "stability", ["experimental"], errors);
    requireOneOf(value, "type", ["codexus.repo.graph"], errors);
    requireString(value, "graphId", errors);
    if (requireRecord(value.provider, errors, "provider")) {
      requireOneOf(value.provider, "type", ["codexus.repo.graph.provider"], errors, "provider.type");
      requireString(value.provider, "id", errors, "provider.id");
      requireBoolean(value.provider, "external", errors, "provider.external");
      requireBoolean(value.provider, "runtimeDeps", errors, "provider.runtimeDeps");
      requireString(value.provider, "accuracy", errors, "provider.accuracy");
      if (requireRecord(value.provider.capabilities, errors, "provider.capabilities")) {
        requireBoolean(value.provider.capabilities, "build", errors, "provider.capabilities.build");
        requireBoolean(value.provider.capabilities, "import", errors, "provider.capabilities.import");
        requireBoolean(value.provider.capabilities, "check", errors, "provider.capabilities.check");
        requireBoolean(value.provider.capabilities, "semanticClaims", errors, "provider.capabilities.semanticClaims");
      }
    }
    if (requireRecord(value.scope, errors, "scope")) {
      requireOneOf(value.scope, "root", ["."], errors, "scope.root");
      if (requireArray(value.scope, "patterns", errors, "scope.patterns").some((item) => typeof item !== "string")) {
        errors.push("scope.patterns:non_string_item");
      }
    }
    validateScopedWorkspaceFingerprint(value.sourceWorkspaceFingerprint, errors, "sourceWorkspaceFingerprint");
    if (requireRecord(value.source, errors, "source")) {
      requireString(value.source, "kind", errors, "source.kind");
      if (!(value.source.path === null || typeof value.source.path === "string")) errors.push("source.path:invalid");
      if (!(value.source.hash === null || typeof value.source.hash === "string")) errors.push("source.hash:invalid");
      requireBoolean(value.source, "sanitized", errors, "source.sanitized");
    }
    const nodes = requireArray(value, "nodes", errors);
    for (const item of nodes) {
      if (!isRecord(item)) {
        errors.push("nodes:non_object_item");
        continue;
      }
      requireString(item, "id", errors, "nodes.id");
      requireString(item, "kind", errors, "nodes.kind");
    }
    const edges = requireArray(value, "edges", errors);
    for (const item of edges) {
      if (!isRecord(item)) {
        errors.push("edges:non_object_item");
        continue;
      }
      requireString(item, "id", errors, "edges.id");
      requireString(item, "kind", errors, "edges.kind");
      requireString(item, "from", errors, "edges.from");
      requireString(item, "to", errors, "edges.to");
    }
    requireArray(value, "layers", errors);
    requireArray(value, "tour", errors);
    requireArray(value, "evidenceGaps", errors);
    requireArray(value, "derivableFacts", errors);
    requireArray(value, "heuristicClaims", errors);
    requireArray(value, "blockingUnknowns", errors);
    requireArray(value, "informationalUnknowns", errors);
    if (requireRecord(value.gate, errors, "gate")) {
      requireBoolean(value.gate, "enabled", errors, "gate.enabled");
      requireOneOf(value.gate, "status", ["not_requested", "passed", "failed", "blocked"], errors, "gate.status");
      requireNumber(value.gate, "exitCode", errors, "gate.exitCode");
      requireString(value.gate, "reason", errors, "gate.reason");
    }
  }

  if (type === "relay-session") {
    requireOneOf(value, "stability", ["experimental"], errors);
    requireOneOf(value, "type", ["codexus.autopilot.relay.session"], errors);
    requireString(value, "relayId", errors);
    if (!(value.contractSubjectHash === null || typeof value.contractSubjectHash === "string")) errors.push("contractSubjectHash:invalid");
    requireOneOf(value, "stage", relayStages, errors);
    requireNumber(value, "round", errors);
    requireOneOf(value, "status", ["recorded"], errors);
    requireBoolean(value, "recordOnly", errors);
    requireString(value, "createdAt", errors);
    requireString(value, "updatedAt", errors);
    requireRecord(value.authorEngine, errors, "authorEngine");
    requireRecord(value.reviewEngine, errors, "reviewEngine");
    if (requireRecord(value.stageArtifact, errors, "stageArtifact")) {
      requireString(value.stageArtifact, "path", errors, "stageArtifact.path");
      requireString(value.stageArtifact, "storedPath", errors, "stageArtifact.storedPath");
      requireString(value.stageArtifact, "hash", errors, "stageArtifact.hash");
    }
    requireArray(value, "submissions", errors);
    requireArray(value, "reviews", errors);
    requireArray(value, "stageGateEvidence", errors);
    if (!(value.convergenceAgreement === null || isRecord(value.convergenceAgreement))) errors.push("convergenceAgreement:invalid");
    if (value.stop !== null) errors.push("stop:not_null");
    requireArray(value, "evidenceGaps", errors);
    requireArray(value, "derivableFacts", errors);
    requireArray(value, "heuristicClaims", errors);
    requireArray(value, "blockingUnknowns", errors);
    requireArray(value, "informationalUnknowns", errors);
    if (requireRecord(value.gate, errors, "gate")) {
      requireBoolean(value.gate, "enabled", errors, "gate.enabled");
      requireOneOf(value.gate, "status", ["not_requested", "passed", "failed", "blocked"], errors, "gate.status");
      requireNumber(value.gate, "exitCode", errors, "gate.exitCode");
      requireString(value.gate, "reason", errors, "gate.reason");
    }
  }

  if (type === "stage-gate-evidence") {
    requireOneOf(value, "stability", ["experimental"], errors);
    requireOneOf(value, "type", ["codexus.autopilot.stage-gate-evidence"], errors);
    requireString(value, "evidenceId", errors);
    requireOneOf(value, "stage", relayStages, errors);
    requireOneOf(value, "scope", relayScopes, errors);
    requireString(value, "role", errors);
    requireString(value, "recordedAt", errors);
    requireString(value, "stageArtifactHash", errors);
    requireArray(value, "freshReadArtifacts", errors);
    requireArray(value, "verificationMatrix", errors);
    requireArray(value, "findings", errors);
    requireNumber(value, "residualFindingCount", errors);
    const verificationResults = requireArray(value, "verificationResults", errors);
    for (const item of verificationResults) {
      if (!isRecord(item)) {
        errors.push("verificationResults:non_object_item");
        continue;
      }
      requireOneOf(item, "status", relayVerificationStatuses, errors, "verificationResults.status");
      if (!(item.command === null || typeof item.command === "string")) errors.push("verificationResults.command:invalid");
      if (!(item.evidencePath === null || typeof item.evidencePath === "string")) errors.push("verificationResults.evidencePath:invalid");
    }
    requireArray(value, "heuristicClaims", errors);
    requireArray(value, "derivableFacts", errors);
  }

  if (type === "convergence-agreement") {
    requireOneOf(value, "stability", ["experimental"], errors);
    requireOneOf(value, "type", ["codexus.autopilot.convergence-agreement"], errors);
    requireOneOf(value, "stage", relayStages, errors);
    requireNumber(value, "round", errors);
    const declarations = requireArray(value, "declarations", errors);
    for (const item of declarations) {
      if (!isRecord(item)) {
        errors.push("declarations:non_object_item");
        continue;
      }
      requireString(item, "role", errors, "declarations.role");
      requireString(item, "engine", errors, "declarations.engine");
      requireString(item, "artifactHash", errors, "declarations.artifactHash");
      requireString(item, "declaredAt", errors, "declarations.declaredAt");
    }
    requireNumber(value, "unresolvedHighFindings", errors);
    requireBoolean(value, "decisionNeeded", errors);
  }

  if (type === "decision") {
    requireOneOf(value, "stability", ["experimental"], errors);
    requireOneOf(value, "type", ["codexus.decision"], errors);
    requireString(value, "decisionId", errors);
    requireOneOf(value, "kind", ["decision", "boundary", "rejected_alternative", "approval", "note"], errors);
    requireString(value, "createdAt", errors);
    requireString(value, "cwd", errors);
    requireString(value, "summary", errors);
    if (!(value.rationale === null || typeof value.rationale === "string")) errors.push("rationale:invalid");
    if (requireArray(value, "constraints", errors).some((item) => typeof item !== "string")) errors.push("constraints:non_string_item");
    if (requireArray(value, "rejectedAlternatives", errors).some((item) => typeof item !== "string")) errors.push("rejectedAlternatives:non_string_item");
    if (requireArray(value, "evidenceLinks", errors).some((item) => typeof item !== "string")) errors.push("evidenceLinks:non_string_item");
    requireOneOf(value, "authority", ["advisory"], errors);
    if (value.completionAuthority !== false) errors.push("completionAuthority:not_false");
  }

  return { schemaVersion: 1, type, valid: errors.length === 0, errors };
}

export function assertSchemaValue(type: SchemaValidationType, value: unknown): void {
  const result = validateSchemaValue(type, value);
  if (!result.valid) throw new Error(`schema_validation_failed:${type}:${result.errors.join(",")}`);
}
