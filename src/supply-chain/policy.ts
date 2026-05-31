import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

export interface SupplyChainPolicy {
  runtimeDependenciesMax?: number;
  allowedLifecycleScripts?: string[];
  allowedDevDependencyInstallScripts?: string[];
  allowRuntimeNetworkImports?: string[];
  forbiddenPackageFiles?: string[];
  requiredPackageFiles?: string[];
  binTargetsMustBeBuiltArtifacts?: boolean;
  lockfileIntegrityRequired?: boolean;
}

export interface SupplyChainPolicyValidation {
  schemaVersion: 1;
  valid: boolean;
  errors: string[];
  policy: SupplyChainPolicy | null;
}

export interface SupplyChainPolicyResolution {
  declared: boolean;
  source: "package.json#codexus.supplyChain" | ".codexus/supply-chain-policy.json" | null;
  path: string | null;
  validation: SupplyChainPolicyValidation;
}

const allowedPolicyKeys = new Set([
  "runtimeDependenciesMax",
  "allowedLifecycleScripts",
  "allowedDevDependencyInstallScripts",
  "allowRuntimeNetworkImports",
  "forbiddenPackageFiles",
  "requiredPackageFiles",
  "binTargetsMustBeBuiltArtifacts",
  "lockfileIntegrityRequired",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

function requireStringArray(record: Record<string, unknown>, key: keyof SupplyChainPolicy, errors: string[]): string[] | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim() === "")) {
    errors.push(`${String(key)}:expected_non_empty_string_array`);
    return undefined;
  }
  return value;
}

function requireBoolean(record: Record<string, unknown>, key: keyof SupplyChainPolicy, errors: string[]): boolean | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") {
    errors.push(`${String(key)}:expected_boolean`);
    return undefined;
  }
  return value;
}

export function validateSupplyChainPolicy(value: unknown): SupplyChainPolicyValidation {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return { schemaVersion: 1, valid: false, errors: ["policy:not_object"], policy: null };
  }

  for (const key of Object.keys(value)) {
    if (!allowedPolicyKeys.has(key)) errors.push(`${key}:unknown_key`);
  }

  const runtimeDependenciesMax = value.runtimeDependenciesMax;
  if (runtimeDependenciesMax !== undefined && (!Number.isInteger(runtimeDependenciesMax) || runtimeDependenciesMax < 0)) {
    errors.push("runtimeDependenciesMax:expected_non_negative_integer");
  }

  const policy: SupplyChainPolicy = {};
  if (Number.isInteger(runtimeDependenciesMax) && runtimeDependenciesMax >= 0) {
    policy.runtimeDependenciesMax = runtimeDependenciesMax as number;
  }

  const allowedLifecycleScripts = requireStringArray(value, "allowedLifecycleScripts", errors);
  if (allowedLifecycleScripts) policy.allowedLifecycleScripts = allowedLifecycleScripts;

  const allowedDevDependencyInstallScripts = requireStringArray(value, "allowedDevDependencyInstallScripts", errors);
  if (allowedDevDependencyInstallScripts) policy.allowedDevDependencyInstallScripts = allowedDevDependencyInstallScripts;

  const allowRuntimeNetworkImports = requireStringArray(value, "allowRuntimeNetworkImports", errors);
  if (allowRuntimeNetworkImports) policy.allowRuntimeNetworkImports = allowRuntimeNetworkImports;

  const forbiddenPackageFiles = requireStringArray(value, "forbiddenPackageFiles", errors);
  if (forbiddenPackageFiles) policy.forbiddenPackageFiles = forbiddenPackageFiles;

  const requiredPackageFiles = requireStringArray(value, "requiredPackageFiles", errors);
  if (requiredPackageFiles) policy.requiredPackageFiles = requiredPackageFiles;

  const binTargetsMustBeBuiltArtifacts = requireBoolean(value, "binTargetsMustBeBuiltArtifacts", errors);
  if (binTargetsMustBeBuiltArtifacts !== undefined) policy.binTargetsMustBeBuiltArtifacts = binTargetsMustBeBuiltArtifacts;

  const lockfileIntegrityRequired = requireBoolean(value, "lockfileIntegrityRequired", errors);
  if (lockfileIntegrityRequired !== undefined) policy.lockfileIntegrityRequired = lockfileIntegrityRequired;

  return {
    schemaVersion: 1,
    valid: errors.length === 0,
    errors,
    policy: errors.length === 0 ? policy : null,
  };
}

export function extractSupplyChainPolicyFromPackageJson(packageJson: unknown): unknown {
  if (!isRecord(packageJson)) return undefined;
  const codexus = packageJson.codexus;
  if (!isRecord(codexus)) return undefined;
  return codexus.supplyChain;
}

export function readSupplyChainPolicy(packageRoot: string): SupplyChainPolicyResolution {
  const externalPath = join(packageRoot, ".codexus", "supply-chain-policy.json");
  if (existsSync(externalPath)) {
    try {
      const parsed = readJson(externalPath);
      const candidate = isRecord(parsed) && isRecord(parsed.codexus) && parsed.codexus.supplyChain !== undefined
        ? parsed.codexus.supplyChain
        : parsed;
      return {
        declared: true,
        source: ".codexus/supply-chain-policy.json",
        path: externalPath,
        validation: validateSupplyChainPolicy(candidate),
      };
    } catch (error) {
      return {
        declared: true,
        source: ".codexus/supply-chain-policy.json",
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
    const candidate = extractSupplyChainPolicyFromPackageJson(parsed);
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
      source: "package.json#codexus.supplyChain",
      path: packageJsonPath,
      validation: validateSupplyChainPolicy(candidate),
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
