import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { validateArchitecturePolicy } from "../architecture/policy.ts";
import { validateAppInstanceArtifact, validateAppInstanceDescriptor, validateAppInstanceObservation } from "../app-instance/launcher.ts";
import { validateAutopilotContract } from "../autopilot/contract.ts";
import { validateSupplyChainPolicy } from "../supply-chain/policy.ts";
import { validateWikiContextApproval, validateWikiInjectionPlan, validateWikiManifest } from "../wiki/wiki.ts";
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
  | "autopilot-contract"
  | "wiki-manifest"
  | "wiki-advisory"
  | "wiki-context-approval"
  | "wiki-injection-plan"
  | "repo-graph"
  | "relay-session"
  | "stage-gate-evidence"
  | "convergence-agreement"
  | "decision"
  | "session-tasks"
  | "app-instance-descriptor"
  | "app-instance"
  | "app-instance-observation"
  | "automation-dispatch"
  | "automation-recovery"
  | "subagent-result"
  | "subagent-launch-contract"
  | "subagent-bridge-probe"
  | "app-server-discovery"
  | "app-server-stage-a"
  | "app-server-stage-b"
  | "app-server-stdio-proof";

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
  "autopilot-contract.schema.json",
  "wiki-manifest.schema.json",
  "wiki-page.schema.json",
  "wiki-advisory.schema.json",
  "wiki-context-approval.schema.json",
  "wiki-injection-plan.schema.json",
  "repo-graph.schema.json",
  "relay-session.schema.json",
  "stage-gate-evidence.schema.json",
  "convergence-agreement.schema.json",
  "decision.schema.json",
  "session-tasks.schema.json",
  "app-instance-descriptor.schema.json",
  "app-instance.schema.json",
  "app-instance-observation.schema.json",
  "automation-dispatch.schema.json",
  "automation-recovery.schema.json",
  "subagent-result.schema.json",
  "subagent-launch-contract.schema.json",
  "subagent-bridge-probe.schema.json",
  "app-server-discovery.schema.json",
  "app-server-stage-a.schema.json",
  "app-server-stage-b.schema.json",
  "app-server-stdio-proof.schema.json",
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
  "autopilot-contract": "autopilot-contract.schema.json",
  "wiki-manifest": "wiki-manifest.schema.json",
  "wiki-advisory": "wiki-advisory.schema.json",
  "wiki-context-approval": "wiki-context-approval.schema.json",
  "wiki-injection-plan": "wiki-injection-plan.schema.json",
  "repo-graph": "repo-graph.schema.json",
  "relay-session": "relay-session.schema.json",
  "stage-gate-evidence": "stage-gate-evidence.schema.json",
  "convergence-agreement": "convergence-agreement.schema.json",
  decision: "decision.schema.json",
  "session-tasks": "session-tasks.schema.json",
  "app-instance-descriptor": "app-instance-descriptor.schema.json",
  "app-instance": "app-instance.schema.json",
  "app-instance-observation": "app-instance-observation.schema.json",
  "automation-dispatch": "automation-dispatch.schema.json",
  "automation-recovery": "automation-recovery.schema.json",
  "subagent-result": "subagent-result.schema.json",
  "subagent-launch-contract": "subagent-launch-contract.schema.json",
  "subagent-bridge-probe": "subagent-bridge-probe.schema.json",
  "app-server-discovery": "app-server-discovery.schema.json",
  "app-server-stage-a": "app-server-stage-a.schema.json",
  "app-server-stage-b": "app-server-stage-b.schema.json",
  "app-server-stdio-proof": "app-server-stdio-proof.schema.json",
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

  if (type === "autopilot-contract") {
    const validation = validateAutopilotContract(value);
    errors.push(...validation.errors);
  }
  if (type === "wiki-manifest") {
    const validation = validateWikiManifest(value);
    errors.push(...validation.errors);
  }

  if (type === "wiki-advisory") {
    requireOneOf(value, "stability", ["experimental"], errors);
    requireOneOf(value, "command", ["wiki build"], errors);
    requireString(value, "cwd", errors);
    requireOneOf(value, "mode", ["advisory"], errors);
    requireString(value, "advisoryManifestPath", errors);
    requireString(value, "sourceManifestPath", errors);
    const sourcePages = requireArray(value, "sourcePages", errors);
    for (const item of sourcePages) {
      if (!isRecord(item)) {
        errors.push("sourcePages:non_object_item");
        continue;
      }
      requireString(item, "pageId", errors, "sourcePages.pageId");
      requireString(item, "title", errors, "sourcePages.title");
      requireString(item, "path", errors, "sourcePages.path");
      requireOneOf(item, "freshness", ["fresh", "stale", "partial", "unknown"], errors, "sourcePages.freshness");
      requireString(item, "sourceFingerprint", errors, "sourcePages.sourceFingerprint");
    }
    if (requireRecord(value.synthesis, errors, "synthesis")) {
      if (requireRecord(value.synthesis.driver, errors, "synthesis.driver")) {
        requireString(value.synthesis.driver, "id", errors, "synthesis.driver.id");
        requireOneOf(value.synthesis.driver, "kind", ["local-deterministic"], errors, "synthesis.driver.kind");
        if (!(value.synthesis.driver.model === null || typeof value.synthesis.driver.model === "string")) errors.push("synthesis.driver.model:invalid");
        if (value.synthesis.driver.modelInvoked !== false) errors.push("synthesis.driver.modelInvoked:not_false");
      }
      requireString(value.synthesis, "sourceBundleHash", errors, "synthesis.sourceBundleHash");
      requireString(value.synthesis, "advisoryText", errors, "synthesis.advisoryText");
      if (requireRecord(value.synthesis.claimClasses, errors, "synthesis.claimClasses")) {
        requireNumber(value.synthesis.claimClasses, "derivableFacts", errors, "synthesis.claimClasses.derivableFacts");
        requireNumber(value.synthesis.claimClasses, "advisoryClaims", errors, "synthesis.claimClasses.advisoryClaims");
      }
      if (value.synthesis.eligibleForAutomaticInjection !== false) errors.push("synthesis.eligibleForAutomaticInjection:not_false");
      if (value.synthesis.sourceTruth !== false) errors.push("synthesis.sourceTruth:not_false");
      if (value.synthesis.completionAuthority !== false) errors.push("synthesis.completionAuthority:not_false");
    }
    if (requireRecord(value.check, errors, "check")) {
      requireOneOf(value.check, "status", ["pass"], errors, "check.status");
      requireOneOf(value.check, "gate", ["not_requested", "passed"], errors, "check.gate");
    }
    if (value.completionAuthority !== false) errors.push("completionAuthority:not_false");
  }

  if (type === "wiki-context-approval") {
    const validation = validateWikiContextApproval(value);
    errors.push(...validation.errors);
  }

  if (type === "wiki-injection-plan") {
    const validation = validateWikiInjectionPlan(value);
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
    const acceptanceCriteria = requireArray(value, "acceptanceCriteria", errors);
    for (const item of acceptanceCriteria) {
      if (!isRecord(item)) {
        errors.push("acceptanceCriteria:non_object_item");
        continue;
      }
      requireString(item, "id", errors, "acceptanceCriteria.id");
      if (!(item.text === null || typeof item.text === "string")) errors.push("acceptanceCriteria.text:invalid");
    }
    const verificationMatrix = requireArray(value, "verificationMatrix", errors);
    for (const item of verificationMatrix) {
      if (!isRecord(item)) {
        errors.push("verificationMatrix:non_object_item");
        continue;
      }
      requireString(item, "acceptanceCriterion", errors, "verificationMatrix.acceptanceCriterion");
      if (!(item.planStep === null || typeof item.planStep === "string")) errors.push("verificationMatrix.planStep:invalid");
      requireString(item, "verification", errors, "verificationMatrix.verification");
      requireOneOf(item, "status", [...relayVerificationStatuses, "planned", "deferred"], errors, "verificationMatrix.status");
      if (!(item.evidencePath === null || typeof item.evidencePath === "string")) errors.push("verificationMatrix.evidencePath:invalid");
      if (!(item.deferredReason === null || typeof item.deferredReason === "string")) errors.push("verificationMatrix.deferredReason:invalid");
      requireBoolean(item, "deferredApproved", errors, "verificationMatrix.deferredApproved");
    }
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

  if (type === "session-tasks") {
    requireOneOf(value, "stability", ["experimental"], errors);
    requireOneOf(value, "type", ["codexus.session.tasks"], errors);
    if (!(value.sessionId === null || typeof value.sessionId === "string")) errors.push("sessionId:invalid");
    requireString(value, "cwd", errors);
    requireString(value, "updatedAt", errors);
    const tasks = requireArray(value, "tasks", errors);
    let inProgressCount = 0;
    for (const item of tasks) {
      if (!isRecord(item)) {
        errors.push("tasks:non_object_item");
        continue;
      }
      requireString(item, "taskId", errors, "tasks.taskId");
      requireNumber(item, "order", errors, "tasks.order");
      requireString(item, "title", errors, "tasks.title");
      requireOneOf(item, "status", ["pending", "in_progress", "completed", "blocked", "skipped"], errors, "tasks.status");
      if (item.status === "in_progress") inProgressCount += 1;
      requireOneOf(item, "kind", ["planning", "implementation", "verification", "review", "release", "other"], errors, "tasks.kind");
      requireOneOf(item, "source", ["manual", "autopilot", "relay", "subagent", "codexus"], errors, "tasks.source");
      requireString(item, "createdAt", errors, "tasks.createdAt");
      requireString(item, "updatedAt", errors, "tasks.updatedAt");
      if (requireArray(item, "evidenceLinks", errors, "tasks.evidenceLinks").some((link) => typeof link !== "string")) {
        errors.push("tasks.evidenceLinks:non_string_item");
      }
      if (!(item.blockedReason === null || typeof item.blockedReason === "string")) errors.push("tasks.blockedReason:invalid");
      if (requireRecord(item.related, errors, "tasks.related")) {
        if (requireArray(item.related, "acceptanceCriteria", errors, "tasks.related.acceptanceCriteria").some((entry) => typeof entry !== "string")) {
          errors.push("tasks.related.acceptanceCriteria:non_string_item");
        }
        if (requireArray(item.related, "verificationRows", errors, "tasks.related.verificationRows").some((entry) => typeof entry !== "string")) {
          errors.push("tasks.related.verificationRows:non_string_item");
        }
        if (!(item.related.relayStage === null || typeof item.related.relayStage === "string")) errors.push("tasks.related.relayStage:invalid");
        if (!(item.related.subagentTaskId === null || typeof item.related.subagentTaskId === "string")) errors.push("tasks.related.subagentTaskId:invalid");
      }
      if (item.completionAuthority !== false) errors.push("tasks.completionAuthority:not_false");
    }
    if (inProgressCount > 1) errors.push("tasks.in_progress:multiple");
    if (requireRecord(value.projection, errors, "projection")) {
      requireOneOf(value.projection, "sourceOfTruth", ["codexus-session-tasks"], errors, "projection.sourceOfTruth");
      if (!(value.projection.lastProjectedAt === null || typeof value.projection.lastProjectedAt === "string")) errors.push("projection.lastProjectedAt:invalid");
      if (!(value.projection.surface === null || typeof value.projection.surface === "string")) errors.push("projection.surface:invalid");
      if (!(value.projection.adapter === null || typeof value.projection.adapter === "string")) errors.push("projection.adapter:invalid");
      if (value.projection.completionAuthority !== false) errors.push("projection.completionAuthority:not_false");
    }
    if (value.completionAuthority !== false) errors.push("completionAuthority:not_false");
  }

  if (type === "app-instance-descriptor") {
    const validation = validateAppInstanceDescriptor(value);
    errors.push(...validation.errors);
  }

  if (type === "app-instance") {
    const validation = validateAppInstanceArtifact(value);
    errors.push(...validation.errors);
  }

  if (type === "app-instance-observation") {
    const validation = validateAppInstanceObservation(value);
    errors.push(...validation.errors);
  }

  if (type === "automation-dispatch") {
    requireString(value, "dispatchId", errors);
    requireString(value, "recordedAt", errors);
    if (requireRecord(value.plan, errors, "plan")) {
      if (requireRecord(value.plan.actionAuthority, errors, "plan.actionAuthority")) {
        const authority = value.plan.actionAuthority;
        if (authority.schemaVersion !== 1) errors.push("plan.actionAuthority.schemaVersion:not_1");
        requireOneOf(authority, "contractVersion", ["automation-action-authority-v1"], errors, "plan.actionAuthority.contractVersion");
        requireOneOf(authority, "feature", ["cron", "gateway"], errors, "plan.actionAuthority.feature");
        requireOneOf(authority, "actionSurface", ["cron.run-now", "gateway.check"], errors, "plan.actionAuthority.actionSurface");
        requireOneOf(authority, "mode", ["dry-run", "live"], errors, "plan.actionAuthority.mode");
        if (requireRecord(authority.sideEffects, errors, "plan.actionAuthority.sideEffects")) {
          requireBoolean(authority.sideEffects, "startsRun", errors, "plan.actionAuthority.sideEffects.startsRun");
          if (authority.sideEffects.mutatesScheduler !== false) errors.push("plan.actionAuthority.sideEffects.mutatesScheduler:not_false");
          if (authority.sideEffects.mutatesGatewayListener !== false) errors.push("plan.actionAuthority.sideEffects.mutatesGatewayListener:not_false");
          requireBoolean(authority.sideEffects, "requiresLock", errors, "plan.actionAuthority.sideEffects.requiresLock");
          requireBoolean(authority.sideEffects, "requiresExplicitApproval", errors, "plan.actionAuthority.sideEffects.requiresExplicitApproval");
        }
        requireOneOf(authority, "dispatcherAuthority", ["none", "linked_codexus_run"], errors, "plan.actionAuthority.dispatcherAuthority");
        if (!(authority.runOutcomeSource === null || authority.runOutcomeSource === "linked_codexus_run")) errors.push("plan.actionAuthority.runOutcomeSource:invalid");
        if (authority.cleanupAuthority !== false) errors.push("plan.actionAuthority.cleanupAuthority:not_false");
        if (authority.healthAuthority !== false) errors.push("plan.actionAuthority.healthAuthority:not_false");
        if (authority.completionAuthority !== false) errors.push("plan.actionAuthority.completionAuthority:not_false");
        requireString(authority, "caveat", errors, "plan.actionAuthority.caveat");
      }
    }
    requireString(value, "path", errors);
    const ledgerEvents = requireArray(value, "ledgerEvents", errors);
    for (const item of ledgerEvents) {
      if (!isRecord(item)) {
        errors.push("ledgerEvents:non_object_item");
        continue;
      }
      requireString(item, "type", errors, "ledgerEvents.type");
      if (item.dryRun !== false) errors.push("ledgerEvents.dryRun:not_false");
      if (item.type === "automation.boundary_stop") {
        if (!requireRecord(item.payload, errors, "ledgerEvents.boundary_stop.payload")) continue;
        if (item.payload.schemaVersion !== 1) errors.push("ledgerEvents.boundary_stop.payload.schemaVersion:not_1");
        requireOneOf(item.payload, "contractVersion", ["automation-boundary-v1"], errors, "ledgerEvents.boundary_stop.payload.contractVersion");
        requireOneOf(item.payload, "feature", ["cron", "gateway"], errors, "ledgerEvents.boundary_stop.payload.feature");
        requireOneOf(item.payload, "reason", ["feature_gate_disabled", "approval_missing", "lock_unavailable"], errors, "ledgerEvents.boundary_stop.payload.reason");
        if (item.payload.control_boundary !== true) errors.push("ledgerEvents.boundary_stop.payload.control_boundary:not_true");
        requireBoolean(item.payload, "required_approval", errors, "ledgerEvents.boundary_stop.payload.required_approval");
        if (item.payload.completionAuthority !== false) errors.push("ledgerEvents.boundary_stop.payload.completionAuthority:not_false");
      }
    }
  }

  if (type === "automation-recovery") {
    requireOneOf(value, "type", ["codexus.automation.recovery"], errors);
    requireString(value, "recordedAt", errors);
    requireOneOf(value, "feature", ["cron", "gateway"], errors);
    if (requireRecord(value.scheduler, errors, "scheduler")) {
      requireOneOf(value.scheduler, "status", ["foreground_dispatch_only"], errors, "scheduler.status");
      if (value.scheduler.queueOwned !== false) errors.push("scheduler.queueOwned:not_false");
      if (value.scheduler.unattendedOwner !== false) errors.push("scheduler.unattendedOwner:not_false");
      if (value.scheduler.mutatesScheduler !== false) errors.push("scheduler.mutatesScheduler:not_false");
      if (value.scheduler.recoveryAuthority !== false) errors.push("scheduler.recoveryAuthority:not_false");
      if (value.scheduler.completionAuthority !== false) errors.push("scheduler.completionAuthority:not_false");
    }
    if ("ownership" in value && value.ownership !== undefined) {
      if (requireRecord(value.ownership, errors, "ownership")) {
        if (value.ownership.schemaVersion !== 1) errors.push("ownership.schemaVersion:not_1");
        requireOneOf(value.ownership, "contractVersion", ["automation-scheduler-ownership-v1"], errors, "ownership.contractVersion");
        requireOneOf(value.ownership, "feature", ["cron", "gateway"], errors, "ownership.feature");
        requireOneOf(value.ownership, "status", ["not_owned"], errors, "ownership.status");
        requireString(value.ownership, "dispatchStorePath", errors, "ownership.dispatchStorePath");
        requireNumber(value.ownership, "dispatchRecordCount", errors, "ownership.dispatchRecordCount");
        if (requireRecord(value.ownership.queue, errors, "ownership.queue")) {
          if (value.ownership.queue.owned !== false) errors.push("ownership.queue.owned:not_false");
          if (value.ownership.queue.durableQueue !== false) errors.push("ownership.queue.durableQueue:not_false");
        }
        if (requireRecord(value.ownership.lease, errors, "ownership.lease")) {
          if (value.ownership.lease.supported !== false) errors.push("ownership.lease.supported:not_false");
          if (value.ownership.lease.active !== false) errors.push("ownership.lease.active:not_false");
          if (value.ownership.lease.heartbeat !== false) errors.push("ownership.lease.heartbeat:not_false");
        }
        if (requireRecord(value.ownership.unattendedRetry, errors, "ownership.unattendedRetry")) {
          if (value.ownership.unattendedRetry.supported !== false) errors.push("ownership.unattendedRetry.supported:not_false");
          if (value.ownership.unattendedRetry.automaticRetry !== false) errors.push("ownership.unattendedRetry.automaticRetry:not_false");
          requireArray(value.ownership.unattendedRetry, "requires", errors, "ownership.unattendedRetry.requires");
        }
        if (requireRecord(value.ownership.authority, errors, "ownership.authority")) {
          if (value.ownership.authority.schedulerAuthority !== false) errors.push("ownership.authority.schedulerAuthority:not_false");
          if (value.ownership.authority.retryAuthority !== false) errors.push("ownership.authority.retryAuthority:not_false");
          if (value.ownership.authority.cleanupAuthority !== false) errors.push("ownership.authority.cleanupAuthority:not_false");
          if (value.ownership.authority.healthAuthority !== false) errors.push("ownership.authority.healthAuthority:not_false");
          if (value.ownership.authority.completionAuthority !== false) errors.push("ownership.authority.completionAuthority:not_false");
        }
      }
    }
    if (requireRecord(value.retry, errors, "retry")) {
      if (value.retry.automaticRetry !== false) errors.push("retry.automaticRetry:not_false");
      if (value.retry.retryAuthority !== false) errors.push("retry.retryAuthority:not_false");
      requireBoolean(value.retry, "manualReviewRequired", errors, "retry.manualReviewRequired");
      if (typeof value.retry.candidateCount !== "number") errors.push("retry.candidateCount:not_number");
    }
    if (requireRecord(value.recovery, errors, "recovery")) {
      requireOneOf(value.recovery, "status", ["no_dispatches", "manual_review_required", "clear"], errors, "recovery.status");
      requireArray(value.recovery, "candidates", errors, "recovery.candidates");
      requireArray(value.recovery, "manualReviewCandidates", errors, "recovery.manualReviewCandidates");
      requireArray(value.recovery, "unreadableArtifacts", errors, "recovery.unreadableArtifacts");
      if (value.recovery.cleanupAuthority !== false) errors.push("recovery.cleanupAuthority:not_false");
      if (value.recovery.healthAuthority !== false) errors.push("recovery.healthAuthority:not_false");
      if (value.recovery.completionAuthority !== false) errors.push("recovery.completionAuthority:not_false");
    }
    if (requireRecord(value.authority, errors, "authority")) {
      if (value.authority.schedulerAuthority !== false) errors.push("authority.schedulerAuthority:not_false");
      if (value.authority.retryAuthority !== false) errors.push("authority.retryAuthority:not_false");
      if (value.authority.cleanupAuthority !== false) errors.push("authority.cleanupAuthority:not_false");
      if (value.authority.healthAuthority !== false) errors.push("authority.healthAuthority:not_false");
      if (value.authority.completionAuthority !== false) errors.push("authority.completionAuthority:not_false");
    }
  }

  if (type === "subagent-result") {
    requireOneOf(value, "type", ["codexus.session.subagent_result"], errors);
    requireString(value, "taskId", errors);
    requireString(value, "role", errors);
    requireOneOf(value, "status", ["recorded", "attached"], errors);
    requireString(value, "recordedAt", errors);
    if (requireRecord(value.source, errors, "source")) {
      requireOneOf(value.source, "mode", ["record", "attach", "complete"], errors, "source.mode");
      if (!(value.source.inputFile === null || typeof value.source.inputFile === "string")) errors.push("source.inputFile:invalid");
    }
    const claims = requireArray(value, "claims", errors);
    for (const item of claims) {
      if (!isRecord(item)) {
        errors.push("claims:non_object_item");
        continue;
      }
      requireString(item, "kind", errors, "claims.kind");
      requireString(item, "text", errors, "claims.text");
      requireOneOf(item, "confidence", ["low", "medium", "high", "unknown"], errors, "claims.confidence");
      if (requireArray(item, "evidenceLinks", errors, "claims.evidenceLinks").some((link) => typeof link !== "string")) errors.push("claims.evidenceLinks:non_string_item");
    }
    if (requireArray(value, "limitations", errors).some((item) => typeof item !== "string")) errors.push("limitations:non_string_item");
    if (requireArray(value, "evidenceLinks", errors).some((item) => typeof item !== "string")) errors.push("evidenceLinks:non_string_item");
    if (value.behaviorChecklist !== null) {
      if (requireRecord(value.behaviorChecklist, errors, "behaviorChecklist")) {
        requireOneOf(value.behaviorChecklist, "assumptionsSurfaced", ["pass", "fail", "unknown"], errors, "behaviorChecklist.assumptionsSurfaced");
        requireOneOf(value.behaviorChecklist, "simplestSufficientChange", ["pass", "fail", "unknown"], errors, "behaviorChecklist.simplestSufficientChange");
        requireOneOf(value.behaviorChecklist, "surgicalScope", ["pass", "fail", "unknown"], errors, "behaviorChecklist.surgicalScope");
        requireOneOf(value.behaviorChecklist, "verificationEvidencePresent", ["pass", "fail", "unknown"], errors, "behaviorChecklist.verificationEvidencePresent");
      }
    }
    if (requireRecord(value.rawShape, errors, "rawShape")) {
      requireString(value.rawShape, "type", errors, "rawShape.type");
      if (requireArray(value.rawShape, "keys", errors, "rawShape.keys").some((item) => typeof item !== "string")) errors.push("rawShape.keys:non_string_item");
    }
  }

  if (type === "subagent-launch-contract") {
    requireOneOf(value, "type", ["codexus.session.subagent_launch_contract"], errors);
    requireString(value, "taskId", errors);
    requireString(value, "role", errors);
    requireString(value, "task", errors);
    requireOneOf(value, "mode", ["read_only"], errors);
    requireString(value, "requestedAt", errors);
    requireOneOf(value, "stability", ["deferred"], errors);
    requireOneOf(value, "status", ["unavailable"], errors);
    if (requireRecord(value.launcher, errors, "launcher")) {
      requireOneOf(value.launcher, "driverId", ["native-subagent"], errors, "launcher.driverId");
      if (value.launcher.supported !== false) errors.push("launcher.supported:not_false");
      requireOneOf(value.launcher, "capability", ["unavailable"], errors, "launcher.capability");
      requireString(value.launcher, "reason", errors, "launcher.reason");
      requireString(value.launcher, "recoveryHint", errors, "launcher.recoveryHint");
    }
    if (requireRecord(value.policy, errors, "policy")) {
      if (value.policy.maySpawn !== false) errors.push("policy.maySpawn:not_false");
      if (value.policy.mayModifyWorkspace !== false) errors.push("policy.mayModifyWorkspace:not_false");
      if (value.policy.mayApplyPatch !== false) errors.push("policy.mayApplyPatch:not_false");
      if (value.policy.verificationRequired !== true) errors.push("policy.verificationRequired:not_true");
      requireOneOf(value.policy, "completionAuthority", ["verification"], errors, "policy.completionAuthority");
    }
    if (requireRecord(value.handoff, errors, "handoff")) {
      requireString(value.handoff, "recordCommand", errors, "handoff.recordCommand");
      requireString(value.handoff, "completeCommand", errors, "handoff.completeCommand");
      requireRecord(value.handoff.claimFileShape, errors, "handoff.claimFileShape");
    }
  }

  if (type === "subagent-bridge-probe") {
    requireOneOf(value, "stability", ["experimental"], errors);
    requireOneOf(value, "type", ["codexus.session.subagent_bridge_probe"], errors);
    requireString(value, "probeId", errors);
    requireString(value, "recordedAt", errors);
    requireOneOf(value, "surface", ["codex-native-subagent"], errors);
    requireOneOf(value, "outcome", ["unavailable"], errors);
    if (requireRecord(value.detection, errors, "detection")) {
      requireOneOf(value.detection, "method", ["cli-boundary-static"], errors, "detection.method");
      requireString(value.detection, "cwd", errors, "detection.cwd");
      if (value.detection.supportedBridgeObserved !== false) errors.push("detection.supportedBridgeObserved:not_false");
      requireString(value.detection, "evidence", errors, "detection.evidence");
    }
    if (requireRecord(value.capability, errors, "capability")) {
      if (value.capability.canDetectNativeBridge !== false) errors.push("capability.canDetectNativeBridge:not_false");
      if (value.capability.canSpawn !== false) errors.push("capability.canSpawn:not_false");
      if (value.capability.canModifyWorkspace !== false) errors.push("capability.canModifyWorkspace:not_false");
      if (value.capability.completionAuthority !== false) errors.push("capability.completionAuthority:not_false");
    }
    requireString(value, "recommendation", errors);
    requireString(value, "caveat", errors);
  }

  if (type === "app-server-discovery") {
    requireOneOf(value, "stability", ["experimental"], errors);
    requireOneOf(value, "command", ["app-server discover"], errors);
    requireString(value, "cwd", errors);
    requireString(value, "generatedAt", errors);
    if (requireRecord(value.consent, errors, "consent")) {
      if (value.consent.readOnly !== true) errors.push("consent.readOnly:not_true");
      if (value.consent.remoteControlAutoEnabled !== false) errors.push("consent.remoteControlAutoEnabled:not_false");
      if (value.consent.connectsToLiveSocket !== false) errors.push("consent.connectsToLiveSocket:not_false");
      if (value.consent.startsDaemon !== false) errors.push("consent.startsDaemon:not_false");
    }
    requireRecord(value.controlSocket, errors, "controlSocket");
    requireRecord(value.daemonVersionProbe, errors, "daemonVersionProbe");
    requireRecord(value.processes, errors, "processes");
    if (requireRecord(value.stageBReadiness, errors, "stageBReadiness")) {
      requireOneOf(value.stageBReadiness, "status", ["candidate_socket_found", "stdio_only", "no_app_server", "unknown"], errors, "stageBReadiness.status");
      requireOneOf(value.stageBReadiness, "promotionRecommendation", ["run_live_read_only_with_explicit_socket", "design_stdio_observer", "block_stage_b"], errors, "stageBReadiness.promotionRecommendation");
    }
    requireRecord(value.record, errors, "record");
  }

  if (type === "app-server-stage-a") {
    requireOneOf(value, "stability", ["experimental"], errors);
    requireOneOf(value, "mode", ["isolated-real"], errors);
    requireString(value, "experimentId", errors);
    requireString(value, "cwd", errors);
    requireString(value, "experimentDir", errors);
    requireNumber(value, "timeoutMs", errors);
    requireRecord(value.isolation, errors, "isolation");
    requireRecord(value.schemaDrift, errors, "schemaDrift");
    requireRecord(value.appServerLifecycle, errors, "appServerLifecycle");
    if (requireRecord(value.observerAttach, errors, "observerAttach")) {
      requireOneOf(value.observerAttach, "observerAttach", ["observed", "unobserved", "unsupported", "unknown"], errors, "observerAttach.observerAttach");
    }
    requireRecord(value.cleanup, errors, "cleanup");
    if (requireArray(value, "relevantEventMethods", errors).some((item) => typeof item !== "string")) errors.push("relevantEventMethods:non_string_item");
    requireOneOf(value, "conservativeCapability", ["unobserved", "observed"], errors);
  }

  if (type === "app-server-stage-b") {
    requireOneOf(value, "stability", ["experimental"], errors);
    requireOneOf(value, "mode", ["live-read-only"], errors);
    requireString(value, "experimentId", errors);
    requireString(value, "cwd", errors);
    requireString(value, "experimentDir", errors);
    requireNumber(value, "timeoutMs", errors);
    requireNumber(value, "observeMs", errors);
    if (requireRecord(value.consent, errors, "consent")) {
      requireOneOf(value.consent, "commandFlag", ["live-read-only"], errors, "consent.commandFlag");
      requireOneOf(value.consent, "envGate", ["CODEXUS_ENABLE_DESKTOP_APP_SERVER_ATTACH"], errors, "consent.envGate");
      requireBoolean(value.consent, "envGateEnabled", errors, "consent.envGateEnabled");
      requireBoolean(value.consent, "userProvidedSocket", errors, "consent.userProvidedSocket");
      if (value.consent.remoteControlAutoEnabled !== false) errors.push("consent.remoteControlAutoEnabled:not_false");
      if (value.consent.readOnly !== true) errors.push("consent.readOnly:not_true");
    }
    requireRecord(value.socket, errors, "socket");
    if (requireRecord(value.connection, errors, "connection")) {
      requireOneOf(value.connection, "status", ["observed", "unobserved", "unavailable"], errors, "connection.status");
      requireOneOf(value.connection, "handshake", ["observed", "unobserved", "unavailable"], errors, "connection.handshake");
    }
    requireArray(value, "readOnlyRequests", errors);
    if (requireRecord(value.eventObservation, errors, "eventObservation")) {
      requireOneOf(value.eventObservation, "status", ["observed", "unobserved", "unavailable"], errors, "eventObservation.status");
      requireOneOf(value.eventObservation, "runtimeSurface", ["unknown", "desktop-app-server"], errors, "eventObservation.runtimeSurface");
      requireBoolean(value.eventObservation, "turnBoundaryObserved", errors, "eventObservation.turnBoundaryObserved");
      if (requireArray(value.eventObservation, "notificationMethods", errors, "eventObservation.notificationMethods").some((item) => typeof item !== "string")) {
        errors.push("eventObservation.notificationMethods:non_string_item");
      }
      if (requireArray(value.eventObservation, "relevantEventMethods", errors, "eventObservation.relevantEventMethods").some((item) => typeof item !== "string")) {
        errors.push("eventObservation.relevantEventMethods:non_string_item");
      }
      requireArray(value.eventObservation, "messages", errors, "eventObservation.messages");
    }
    requireOneOf(value, "promotionRecommendation", ["allow_session_mapping_design", "block_stage_b", "inconclusive"], errors);
  }

  if (type === "app-server-stdio-proof") {
    requireOneOf(value, "stability", ["experimental"], errors);
    requireOneOf(value, "mode", ["stdio-proof"], errors);
    requireString(value, "experimentId", errors);
    requireString(value, "cwd", errors);
    requireString(value, "experimentDir", errors);
    requireNumber(value, "timeoutMs", errors);
    if (requireRecord(value.source, errors, "source")) {
      requireOneOf(value.source, "kind", ["fake-process", "codexus-owned-process"], errors, "source.kind");
      if (value.source.ownedByCodexus !== true) errors.push("source.ownedByCodexus:not_true");
      if (value.source.existingDesktopStdioAttachAttempted !== false) errors.push("source.existingDesktopStdioAttachAttempted:not_false");
      if (value.source.desktopProcessPid !== null) errors.push("source.desktopProcessPid:not_null");
      requireString(value.source, "command", errors, "source.command");
      if (requireArray(value.source, "argsPreview", errors, "source.argsPreview").some((item) => typeof item !== "string")) {
        errors.push("source.argsPreview:non_string_item");
      }
    }
    if (requireRecord(value.safety, errors, "safety")) {
      if (value.safety.readOnly !== true) errors.push("safety.readOnly:not_true");
      if (value.safety.startsDesktopTurn !== false) errors.push("safety.startsDesktopTurn:not_false");
      if (value.safety.transcriptValuesStored !== false) errors.push("safety.transcriptValuesStored:not_false");
      if (value.safety.remoteControlAutoEnabled !== false) errors.push("safety.remoteControlAutoEnabled:not_false");
      if (value.safety.completionAuthority !== false) errors.push("safety.completionAuthority:not_false");
      requireOneOf(value.safety, "runtimeSurfaceAuthority", ["turn-boundary-event-only"], errors, "safety.runtimeSurfaceAuthority");
    }
    if (requireRecord(value.process, errors, "process")) {
      if (!(value.process.pid === null || typeof value.process.pid === "number")) errors.push("process.pid:invalid");
      requireString(value.process, "startedAt", errors, "process.startedAt");
      requireString(value.process, "completedAt", errors, "process.completedAt");
      if (!(value.process.exitCode === null || typeof value.process.exitCode === "number")) errors.push("process.exitCode:invalid");
      if (!(value.process.signal === null || typeof value.process.signal === "string")) errors.push("process.signal:invalid");
      requireOneOf(value.process, "status", ["passed", "failed", "timed_out", "error"], errors, "process.status");
      if (!(value.process.error === null || typeof value.process.error === "string")) errors.push("process.error:invalid");
    }
    if (requireRecord(value.limits, errors, "limits")) {
      requireNumber(value.limits, "maxReadBytes", errors, "limits.maxReadBytes");
      requireNumber(value.limits, "maxMessages", errors, "limits.maxMessages");
      requireNumber(value.limits, "bytesRead", errors, "limits.bytesRead");
      requireBoolean(value.limits, "truncated", errors, "limits.truncated");
      requireNumber(value.limits, "timeoutMs", errors, "limits.timeoutMs");
    }
    if (requireRecord(value.observation, errors, "observation")) {
      requireOneOf(value.observation, "status", ["observed", "unobserved", "unavailable"], errors, "observation.status");
      requireOneOf(value.observation, "runtimeSurface", ["unknown", "desktop-app-server"], errors, "observation.runtimeSurface");
      requireBoolean(value.observation, "turnBoundaryObserved", errors, "observation.turnBoundaryObserved");
      if (requireArray(value.observation, "notificationMethods", errors, "observation.notificationMethods").some((item) => typeof item !== "string")) {
        errors.push("observation.notificationMethods:non_string_item");
      }
      if (requireArray(value.observation, "relevantEventMethods", errors, "observation.relevantEventMethods").some((item) => typeof item !== "string")) {
        errors.push("observation.relevantEventMethods:non_string_item");
      }
      requireArray(value.observation, "messages", errors, "observation.messages");
      requireString(value.observation, "reason", errors, "observation.reason");
    }
    requireOneOf(value, "promotionRecommendation", ["allow_session_mapping_design", "block_stage_b", "inconclusive"], errors);
  }

  return { schemaVersion: 1, type, valid: errors.length === 0, errors };
}

export function assertSchemaValue(type: SchemaValidationType, value: unknown): void {
  const result = validateSchemaValue(type, value);
  if (!result.valid) throw new Error(`schema_validation_failed:${type}:${result.errors.join(",")}`);
}
