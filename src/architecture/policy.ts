import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

export interface ArchitectureForbiddenImportRule {
  id: string;
  kind: "forbidden-import";
  from: string[];
  forbidden: string[];
  allow?: string[];
}

export type ArchitectureRule = ArchitectureForbiddenImportRule;

export interface ArchitecturePolicy {
  schemaVersion?: 1;
  type?: "codexus.architecture.policy";
  rules: ArchitectureRule[];
}

export interface ArchitecturePolicyValidation {
  schemaVersion: 1;
  valid: boolean;
  errors: string[];
  policy: ArchitecturePolicy | null;
}

export interface ArchitecturePolicyResolution {
  declared: boolean;
  source: "package.json#codexus.architecture" | ".codexus/architecture-policy.json" | null;
  path: string | null;
  validation: ArchitecturePolicyValidation;
}

const allowedPolicyKeys = new Set(["schemaVersion", "type", "rules"]);
const allowedRuleKeys = new Set(["id", "kind", "from", "forbidden", "allow"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

function requireStringArray(record: Record<string, unknown>, key: string, errors: string[], path: string, required = false): string[] | undefined {
  const value = record[key];
  if (value === undefined) {
    if (required) errors.push(`${path}:expected_non_empty_string_array`);
    return undefined;
  }
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== "string" || item.trim() === "")) {
    errors.push(`${path}:expected_non_empty_string_array`);
    return undefined;
  }
  return value;
}

export function validateArchitecturePolicy(value: unknown): ArchitecturePolicyValidation {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return { schemaVersion: 1, valid: false, errors: ["policy:not_object"], policy: null };
  }

  for (const key of Object.keys(value)) {
    if (!allowedPolicyKeys.has(key)) errors.push(`${key}:unknown_key`);
  }

  if (value.schemaVersion !== undefined && value.schemaVersion !== 1) errors.push("schemaVersion:not_1");
  if (value.type !== undefined && value.type !== "codexus.architecture.policy") errors.push("type:not_codexus_architecture_policy");

  const rawRules = value.rules;
  const rules: ArchitectureRule[] = [];
  if (!Array.isArray(rawRules)) {
    errors.push("rules:expected_array");
  } else {
    for (const [index, rawRule] of rawRules.entries()) {
      const path = `rules[${index}]`;
      if (!isRecord(rawRule)) {
        errors.push(`${path}:not_object`);
        continue;
      }
      for (const key of Object.keys(rawRule)) {
        if (!allowedRuleKeys.has(key)) errors.push(`${path}.${key}:unknown_key`);
      }
      if (typeof rawRule.id !== "string" || rawRule.id.trim() === "") errors.push(`${path}.id:expected_non_empty_string`);
      if (rawRule.kind !== "forbidden-import") errors.push(`${path}.kind:unsupported_rule_kind`);
      const from = requireStringArray(rawRule, "from", errors, `${path}.from`, true);
      const forbidden = requireStringArray(rawRule, "forbidden", errors, `${path}.forbidden`, true);
      const allow = requireStringArray(rawRule, "allow", errors, `${path}.allow`);
      if (typeof rawRule.id === "string" && rawRule.id.trim() && rawRule.kind === "forbidden-import" && from && forbidden) {
        rules.push({
          id: rawRule.id,
          kind: "forbidden-import",
          from,
          forbidden,
          ...(allow ? { allow } : {}),
        });
      }
    }
  }

  const policy: ArchitecturePolicy = {
    ...(value.schemaVersion === 1 ? { schemaVersion: 1 as const } : {}),
    ...(value.type === "codexus.architecture.policy" ? { type: "codexus.architecture.policy" as const } : {}),
    rules,
  };
  return {
    schemaVersion: 1,
    valid: errors.length === 0,
    errors,
    policy: errors.length === 0 ? policy : null,
  };
}

export function extractArchitecturePolicyFromPackageJson(packageJson: unknown): unknown {
  if (!isRecord(packageJson)) return undefined;
  const codexus = packageJson.codexus;
  if (!isRecord(codexus)) return undefined;
  return codexus.architecture;
}

export function readArchitecturePolicy(packageRoot: string, explicitPath?: string): ArchitecturePolicyResolution {
  const externalPath = explicitPath ? resolve(packageRoot, explicitPath) : join(packageRoot, ".codexus", "architecture-policy.json");
  if (explicitPath || existsSync(externalPath)) {
    try {
      const parsed = readJson(externalPath);
      const candidate = isRecord(parsed) && isRecord(parsed.codexus) && parsed.codexus.architecture !== undefined
        ? parsed.codexus.architecture
        : parsed;
      return {
        declared: true,
        source: ".codexus/architecture-policy.json",
        path: externalPath,
        validation: validateArchitecturePolicy(candidate),
      };
    } catch (error) {
      return {
        declared: true,
        source: ".codexus/architecture-policy.json",
        path: externalPath,
        validation: {
          schemaVersion: 1,
          valid: false,
          errors: [`policy_json_unreadable:${error instanceof Error ? error.message : String(error)}`],
          policy: null,
        },
      };
    }
  }

  const packageJsonPath = join(packageRoot, "package.json");
  try {
    const parsed = readJson(packageJsonPath);
    const candidate = extractArchitecturePolicyFromPackageJson(parsed);
    if (candidate === undefined) {
      return {
        declared: false,
        source: null,
        path: null,
        validation: { schemaVersion: 1, valid: true, errors: [], policy: null },
      };
    }
    return {
      declared: true,
      source: "package.json#codexus.architecture",
      path: packageJsonPath,
      validation: validateArchitecturePolicy(candidate),
    };
  } catch (error) {
    return {
      declared: false,
      source: null,
      path: resolve(packageJsonPath),
      validation: {
        schemaVersion: 1,
        valid: false,
        errors: [`package_json_unreadable:${error instanceof Error ? error.message : String(error)}`],
        policy: null,
      },
    };
  }
}
