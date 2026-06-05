import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { findCodexusPackageRoot } from "../util/package-root.ts";

export interface CodexusPluginPackageReport {
  schemaVersion: 1;
  stability: "experimental";
  command: "plugin status";
  packageRoot: string;
  pluginPackage: {
    path: string;
    manifestPath: string;
    present: boolean;
    manifestValid: boolean;
    manifest: {
      name: string | null;
      version: string | null;
      skills: string | null;
      displayName: string | null;
    };
    validation: {
      status: "passed" | "failed";
      errors: string[];
    };
    components: {
      skills: {
        path: string;
        present: boolean;
        count: number;
      };
      scripts: {
        wrapperPath: string;
        wrapperPresent: boolean;
      };
      apps: {
        declared: boolean;
        present: boolean;
      };
      mcpServers: {
        declared: boolean;
        present: boolean;
      };
      hooks: {
        declared: boolean;
        supported: false;
      };
    };
  };
  installedPlugin: {
    status: "deferred";
    detectionSupported: false;
    reason: "codex_plugin_install_location_contract_deferred";
  };
  authority: {
    distributionLayer: true;
    alwaysOnProof: false;
    heartbeatObserved: false;
    workflowKernelMoved: false;
    completionAuthority: false;
  };
  capabilities: {
    codexSkillStableAdapter: true;
    pluginPackageFreshnessDiagnostic: true;
    installedPluginStateDiagnostic: false;
    alwaysOnSupervision: false;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function strictSemver(value: string | null): boolean {
  return value !== null && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(value);
}

function relativePath(value: string | null): boolean {
  return value !== null && value.startsWith("./") && !value.includes("..");
}

function readManifest(path: string): { value: Record<string, unknown> | null; errors: string[] } {
  if (!existsSync(path)) return { value: null, errors: ["manifest_missing"] };
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    if (!isRecord(parsed)) return { value: null, errors: ["manifest_not_object"] };
    return { value: parsed, errors: [] };
  } catch {
    return { value: null, errors: ["manifest_unreadable"] };
  }
}

function countSkillFiles(skillsPath: string): number {
  if (!existsSync(skillsPath)) return 0;
  let count = 0;
  for (const entry of readdirSync(skillsPath, { withFileTypes: true })) {
    if (entry.isDirectory() && existsSync(join(skillsPath, entry.name, "SKILL.md"))) count += 1;
    if (entry.isFile() && entry.name === "SKILL.md") count += 1;
  }
  return count;
}

function validateManifest(
  manifest: Record<string, unknown> | null,
  pluginRoot: string,
  packageVersion: string | null,
): {
  errors: string[];
  manifestSummary: CodexusPluginPackageReport["pluginPackage"]["manifest"];
  components: CodexusPluginPackageReport["pluginPackage"]["components"];
} {
  const errors: string[] = [];
  const emptySummary = {
    name: null,
    version: null,
    skills: null,
    displayName: null,
  };
  const skillsPath = join(pluginRoot, "skills");
  const wrapperPath = join(pluginRoot, "scripts", "cx.mjs");
  const defaultComponents = {
    skills: { path: skillsPath, present: existsSync(skillsPath), count: countSkillFiles(skillsPath) },
    scripts: { wrapperPath, wrapperPresent: existsSync(wrapperPath) },
    apps: { declared: false, present: false },
    mcpServers: { declared: false, present: false },
    hooks: { declared: false, supported: false as const },
  };
  if (!manifest) return { errors, manifestSummary: emptySummary, components: defaultComponents };

  const name = stringField(manifest, "name");
  const version = stringField(manifest, "version");
  const description = stringField(manifest, "description");
  const skills = stringField(manifest, "skills");
  const author = isRecord(manifest.author) ? manifest.author : null;
  const pluginInterface = isRecord(manifest.interface) ? manifest.interface : null;
  const displayName = pluginInterface ? stringField(pluginInterface, "displayName") : null;
  const shortDescription = pluginInterface ? stringField(pluginInterface, "shortDescription") : null;
  const longDescription = pluginInterface ? stringField(pluginInterface, "longDescription") : null;
  const developerName = pluginInterface ? stringField(pluginInterface, "developerName") : null;
  const category = pluginInterface ? stringField(pluginInterface, "category") : null;
  const capabilities = pluginInterface?.capabilities;
  const defaultPrompt = pluginInterface?.defaultPrompt;
  const apps = stringField(manifest, "apps");
  const mcpServers = stringField(manifest, "mcpServers");
  const hooksDeclared = Object.hasOwn(manifest, "hooks");
  const appsPath = apps ? resolve(pluginRoot, apps) : null;
  const mcpServersPath = mcpServers ? resolve(pluginRoot, mcpServers) : null;
  const resolvedSkillsPath = skills ? resolve(pluginRoot, skills) : skillsPath;
  const components = {
    skills: {
      path: resolvedSkillsPath,
      present: existsSync(resolvedSkillsPath),
      count: countSkillFiles(resolvedSkillsPath),
    },
    scripts: defaultComponents.scripts,
    apps: { declared: apps !== null, present: appsPath !== null && existsSync(appsPath) },
    mcpServers: { declared: mcpServers !== null, present: mcpServersPath !== null && existsSync(mcpServersPath) },
    hooks: { declared: hooksDeclared, supported: false as const },
  };

  if (name !== "codexus") errors.push("name_must_be_codexus");
  if (!strictSemver(version)) errors.push("version_must_be_strict_semver");
  if (packageVersion !== null && version !== packageVersion) errors.push("version_must_match_package_json");
  if (!description) errors.push("description_missing");
  if (!isRecord(author) || !stringField(author, "name")) errors.push("author_name_missing");
  if (!relativePath(skills)) errors.push("skills_path_must_be_relative");
  if (!components.skills.present || components.skills.count === 0) errors.push("skills_missing");
  if (!components.scripts.wrapperPresent) errors.push("script_wrapper_missing");
  if (!pluginInterface) errors.push("interface_missing");
  if (!displayName) errors.push("interface_display_name_missing");
  if (!shortDescription) errors.push("interface_short_description_missing");
  if (!longDescription) errors.push("interface_long_description_missing");
  if (!developerName) errors.push("interface_developer_name_missing");
  if (!category) errors.push("interface_category_missing");
  if (!Array.isArray(capabilities) || capabilities.some((item) => typeof item !== "string")) {
    errors.push("interface_capabilities_must_be_string_array");
  }
  if (!Array.isArray(defaultPrompt) || defaultPrompt.some((item) => typeof item !== "string") || defaultPrompt.length > 3) {
    errors.push("interface_default_prompt_must_be_short_string_array");
  }
  if (hooksDeclared) errors.push("hooks_field_unsupported");
  if (apps !== null && !components.apps.present) errors.push("apps_manifest_missing");
  if (mcpServers !== null && !components.mcpServers.present) errors.push("mcp_manifest_missing");

  return {
    errors,
    manifestSummary: { name, version, skills, displayName },
    components,
  };
}

function resolvePackageRoot(cwd: string): string {
  try {
    return findCodexusPackageRoot(cwd);
  } catch {
    return findCodexusPackageRoot();
  }
}

export function buildCodexusPluginPackageReport(cwd = process.cwd()): CodexusPluginPackageReport {
  const packageRoot = resolvePackageRoot(cwd);
  let packageVersion: string | null = null;
  try {
    const packageJson = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")) as unknown;
    packageVersion = isRecord(packageJson) && typeof packageJson.version === "string" ? packageJson.version : null;
  } catch {
    packageVersion = null;
  }
  const pluginRoot = join(packageRoot, "codex", "plugins", "codexus");
  const manifestPath = join(pluginRoot, ".codex-plugin", "plugin.json");
  const present = existsSync(pluginRoot);
  const manifest = readManifest(manifestPath);
  const validation = validateManifest(manifest.value, pluginRoot, packageVersion);
  const errors = [...manifest.errors, ...validation.errors];
  const manifestValid = present && errors.length === 0;
  return {
    schemaVersion: 1,
    stability: "experimental",
    command: "plugin status",
    packageRoot,
    pluginPackage: {
      path: pluginRoot,
      manifestPath,
      present,
      manifestValid,
      manifest: validation.manifestSummary,
      validation: {
        status: manifestValid ? "passed" : "failed",
        errors,
      },
      components: validation.components,
    },
    installedPlugin: {
      status: "deferred",
      detectionSupported: false,
      reason: "codex_plugin_install_location_contract_deferred",
    },
    authority: {
      distributionLayer: true,
      alwaysOnProof: false,
      heartbeatObserved: false,
      workflowKernelMoved: false,
      completionAuthority: false,
    },
    capabilities: {
      codexSkillStableAdapter: true,
      pluginPackageFreshnessDiagnostic: true,
      installedPluginStateDiagnostic: false,
      alwaysOnSupervision: false,
    },
  };
}
