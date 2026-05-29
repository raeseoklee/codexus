import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { defaultConfig, type HarnessConfig } from "./schema.ts";
import { assertSchemaValue } from "../validation/schemas.ts";

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mergeConfig<T extends Record<string, unknown>>(base: T, overlay: Record<string, unknown>): T {
  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    const current = result[key];
    if (isRecord(current) && isRecord(value)) {
      result[key] = mergeConfig(current, value);
    } else if (value !== undefined) {
      result[key] = value;
    }
  }
  return result as T;
}

function readJsonFile(path: string): Record<string, unknown> | null {
  if (!existsSync(path)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch {
    throw new Error(`config_parse_failed:${path}`);
  }
  if (!isRecord(parsed)) {
    throw new Error(`config_not_object:${path}`);
  }
  return parsed;
}

function collectUnknownKeys(value: Record<string, unknown>, shape: Record<string, unknown>, prefix = ""): string[] {
  const keys: string[] = [];
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (!(key in shape)) {
      keys.push(path);
      continue;
    }
    const shapeChild = shape[key];
    if (isRecord(child) && isRecord(shapeChild)) {
      keys.push(...collectUnknownKeys(child, shapeChild, path));
    }
  }
  return keys;
}

function isOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value);
}

function validateConfig(config: HarnessConfig, warnings: string[]): HarnessConfig {
  const next = structuredClone(config) as HarnessConfig;
  if (!isOneOf(next.driver, ["codex-exec", "mock", "codex-app-server"] as const)) {
    warnings.push(`invalid config driver '${String(next.driver)}'; using default '${defaultConfig.driver}'`);
    next.driver = defaultConfig.driver;
  }
  if (typeof next.codex.command !== "string" || !next.codex.command.trim()) {
    warnings.push("invalid config codex.command; using default 'codex'");
    next.codex.command = defaultConfig.codex.command;
  }
  if (next.codex.model !== null && typeof next.codex.model !== "string") {
    warnings.push("invalid config codex.model; using null");
    next.codex.model = null;
  }
  if (!isOneOf(next.codex.sandbox, ["read-only", "workspace-write", "danger-full-access"] as const)) {
    warnings.push(`invalid config codex.sandbox '${String(next.codex.sandbox)}'; using default '${defaultConfig.codex.sandbox}'`);
    next.codex.sandbox = defaultConfig.codex.sandbox;
  }
  if (!isOneOf(next.codex.approval, ["untrusted", "on-request", "never"] as const)) {
    warnings.push(`invalid config codex.approval '${String(next.codex.approval)}'; using default '${defaultConfig.codex.approval}'`);
    next.codex.approval = defaultConfig.codex.approval;
  }
  if (next.codex.runTimeoutMs !== null && (!Number.isFinite(next.codex.runTimeoutMs) || next.codex.runTimeoutMs <= 0)) {
    warnings.push(`invalid config codex.runTimeoutMs '${String(next.codex.runTimeoutMs)}'; using default ${defaultConfig.codex.runTimeoutMs}`);
    next.codex.runTimeoutMs = defaultConfig.codex.runTimeoutMs;
  }
  if (!Array.isArray(next.verification.commands) || next.verification.commands.some((command) => typeof command !== "string")) {
    warnings.push("invalid config verification.commands; using []");
    next.verification.commands = [];
  }
  if (!Number.isFinite(next.verification.timeoutMs) || next.verification.timeoutMs <= 0) {
    warnings.push(`invalid config verification.timeoutMs '${String(next.verification.timeoutMs)}'; using default ${defaultConfig.verification.timeoutMs}`);
    next.verification.timeoutMs = defaultConfig.verification.timeoutMs;
  }
  if (!Number.isInteger(next.repair.maxIterations) || next.repair.maxIterations < 0) {
    warnings.push(`invalid config repair.maxIterations '${String(next.repair.maxIterations)}'; using default ${defaultConfig.repair.maxIterations}`);
    next.repair.maxIterations = defaultConfig.repair.maxIterations;
  }
  if (!Number.isInteger(next.repair.maxDriverFailureIterations) || next.repair.maxDriverFailureIterations < 0) {
    warnings.push(`invalid config repair.maxDriverFailureIterations '${String(next.repair.maxDriverFailureIterations)}'; using default ${defaultConfig.repair.maxDriverFailureIterations}`);
    next.repair.maxDriverFailureIterations = defaultConfig.repair.maxDriverFailureIterations;
  }
  if (typeof next.evolution.enabled !== "boolean") {
    warnings.push("invalid config evolution.enabled; using default true");
    next.evolution.enabled = defaultConfig.evolution.enabled;
  }
  if (typeof next.evolution.autoPromote !== "boolean") {
    warnings.push("invalid config evolution.autoPromote; using default false");
    next.evolution.autoPromote = defaultConfig.evolution.autoPromote;
  }
  if (typeof next.evolution.redactBeforeMemory !== "boolean") {
    warnings.push("invalid config evolution.redactBeforeMemory; using default true");
    next.evolution.redactBeforeMemory = defaultConfig.evolution.redactBeforeMemory;
  }
  if (!(next.omx.enabled === "auto" || typeof next.omx.enabled === "boolean")) {
    warnings.push("invalid config omx.enabled; using default 'auto'");
    next.omx.enabled = defaultConfig.omx.enabled;
  }
  if (typeof next.omx.preferSparkshellForVerification !== "boolean") {
    warnings.push("invalid config omx.preferSparkshellForVerification; using default true");
    next.omx.preferSparkshellForVerification = defaultConfig.omx.preferSparkshellForVerification;
  }
  if (!next.automation || typeof next.automation !== "object") {
    warnings.push("invalid config automation; using defaults");
    next.automation = structuredClone(defaultConfig.automation);
  }
  if (typeof next.automation.cronEnabled !== "boolean") {
    warnings.push("invalid config automation.cronEnabled; using default false");
    next.automation.cronEnabled = defaultConfig.automation.cronEnabled;
  }
  if (typeof next.automation.gatewayEnabled !== "boolean") {
    warnings.push("invalid config automation.gatewayEnabled; using default false");
    next.automation.gatewayEnabled = defaultConfig.automation.gatewayEnabled;
  }
  return next;
}

export interface LoadConfigOptions {
  cwd?: string;
  overrides?: DeepPartial<HarnessConfig>;
}

export interface LoadedConfig {
  config: HarnessConfig;
  filesRead: string[];
  warnings: string[];
}

export function loadConfig(options: LoadConfigOptions = {}): LoadedConfig {
  const cwd = resolve(options.cwd ?? process.cwd());
  const userPath = join(homedir(), ".codex-harness", "config.json");
  const projectPath = join(cwd, ".codex-harness", "config.json");
  let config = structuredClone(defaultConfig) as HarnessConfig;
  const filesRead: string[] = [];
  const warnings: string[] = [];

  for (const path of [userPath, projectPath]) {
    const value = readJsonFile(path);
    if (value) {
      for (const key of collectUnknownKeys(value, defaultConfig as unknown as Record<string, unknown>)) {
        warnings.push(`unknown config key '${key}' in ${path}`);
      }
      config = mergeConfig(config as unknown as Record<string, unknown>, value) as unknown as HarnessConfig;
      filesRead.push(path);
    }
  }

  if (options.overrides) {
    for (const key of collectUnknownKeys(options.overrides as Record<string, unknown>, defaultConfig as unknown as Record<string, unknown>)) {
      warnings.push(`unknown config override key '${key}'`);
    }
    config = mergeConfig(
      config as unknown as Record<string, unknown>,
      options.overrides as Record<string, unknown>,
    ) as unknown as HarnessConfig;
  }

  config = validateConfig(config, warnings);
  assertSchemaValue("config", config);

  return { config, filesRead, warnings };
}
