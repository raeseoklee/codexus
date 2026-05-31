import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { readSupplyChainPolicy, type SupplyChainPolicy, type SupplyChainPolicyResolution } from "./policy.ts";

export type SupplyChainEvidenceStatus = "pass" | "fail" | "unknown";

export interface SupplyChainEvidenceGap {
  kind:
    | "policy_invalid"
    | "lifecycle_script_not_allowed"
    | "dev_dependency_install_script_not_allowed"
    | "runtime_dependency_count_exceeds_policy"
    | "forbidden_package_file"
    | "required_package_file_missing"
    | "bin_target_not_built_artifact"
    | "runtime_network_import_not_allowed"
    | "missing_lockfile"
    | "missing_lockfile_integrity"
    | "secret_pattern_in_package_artifact";
  gate: true;
  evidence: string | null;
  policy: string;
  recommendation: string;
  files?: string[];
  scripts?: string[];
  dependencies?: string[];
  imports?: string[];
}

export interface SupplyChainDerivableFact {
  kind:
    | "policy_declared"
    | "policy_missing_report_only"
    | "package_lifecycle_scripts"
    | "dev_dependency_install_scripts"
    | "runtime_dependency_count"
    | "package_file_projection"
    | "required_package_files_present"
    | "forbidden_package_files_absent"
    | "bin_targets_built_artifacts"
    | "runtime_network_imports"
    | "lockfile_integrity";
  gate: boolean;
  evidence: string;
  files?: string[];
  scripts?: string[];
  dependencies?: string[];
  imports?: string[];
  count?: number;
}

export interface SupplyChainHeuristicClaim {
  kind: "typosquat_name_similarity_deferred" | "mutable_github_actions_ref";
  confidence: "low" | "medium" | "high";
  evidence: string;
  recommendation: string;
}

export interface SupplyChainUnknown {
  kind:
    | "package_json_missing"
    | "package_json_unreadable"
    | "package_file_projection_failed"
    | "lockfile_unreadable"
    | "policy_invalid"
    | "npm_2fa_status"
    | "npm_maintainer_status"
    | "publish_provenance"
    | "known_cve_status";
  gate: boolean;
  evidence: string | null;
  recommendation: string;
}

export interface SupplyChainGate {
  enabled: boolean;
  status: "not_requested" | "passed" | "failed" | "blocked";
  exitCode: 0 | 1;
  reason: string;
}

export interface SupplyChainEvidenceReport {
  schemaVersion: 1;
  cwd: string;
  packageRoot: string | null;
  packageJsonPath: string | null;
  lifecycleExecuted: false;
  projectionMode: "static";
  projectionAccuracy: "best_effort";
  policy: SupplyChainPolicyResolution;
  packageArtifact: {
    files: string[];
    fileCount: number;
    errors: string[];
  };
  evidenceGaps: SupplyChainEvidenceGap[];
  derivableFacts: SupplyChainDerivableFact[];
  heuristicClaims: SupplyChainHeuristicClaim[];
  blockingUnknowns: SupplyChainUnknown[];
  informationalUnknowns: SupplyChainUnknown[];
  supplyChain: {
    status: SupplyChainEvidenceStatus;
    policyMode: "declared" | "report_only" | "invalid";
    runtimeDependencyCount: number | null;
  };
  gate: SupplyChainGate;
}

interface PackageFileProjection {
  files: string[];
  errors: string[];
}

const lifecycleScriptNames = new Set([
  "preinstall",
  "install",
  "postinstall",
  "prepack",
  "prepare",
  "postpack",
  "prepublish",
  "prepublishOnly",
  "publish",
  "postpublish",
]);

const codeExtensions = new Set([".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx"]);
const highConfidenceSecretPatterns = [
  /-----BEGIN [A-Z ]*(?:PRIVATE KEY|SECRET KEY)-----[\s\S]*?-----END [A-Z ]*(?:PRIVATE KEY|SECRET KEY)-----/,
  /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/,
  /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
  /sk-[A-Za-z0-9_-]{16,}/,
  /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{16,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/,
  /xox[baprs]-[A-Za-z0-9-]{16,}/,
  /\b(?:sk|rk)_live_[A-Za-z0-9]{16,}\b/,
  /\bnpm_[A-Za-z0-9]{16,}\b/,
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readJsonFile(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

function findPackageRoot(cwd: string): string | null {
  let current = resolve(cwd);
  while (true) {
    if (existsSync(join(current, "package.json"))) return current;
    const next = dirname(current);
    if (next === current) return null;
    current = next;
  }
}

function stringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  const result: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string") result[key] = item;
  }
  return result;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\/+/, "");
}

function globToRegExp(pattern: string): RegExp {
  const normalized = normalizePath(pattern);
  let out = "^";
  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    const next = normalized[index + 1];
    if (char === "*" && next === "*") {
      out += ".*";
      index += 1;
    } else if (char === "*") {
      out += "[^/]*";
    } else {
      out += char.replace(/[\\^$+?.()|[\]{}]/g, "\\$&");
    }
  }
  return new RegExp(`${out}$`);
}

function matchesPattern(path: string, pattern: string): boolean {
  const normalizedPath = normalizePath(path);
  const normalizedPattern = normalizePath(pattern);
  if (normalizedPattern.includes("*")) return globToRegExp(normalizedPattern).test(normalizedPath);
  const withoutSlash = normalizedPattern.replace(/\/+$/, "");
  return normalizedPath === withoutSlash || normalizedPath.startsWith(`${withoutSlash}/`);
}

function listFiles(root: string, relative: string): string[] {
  const path = join(root, relative);
  if (!existsSync(path)) return [];
  const stat = statSync(path);
  if (stat.isFile()) return [normalizePath(relative)];
  if (!stat.isDirectory()) return [];
  const files: string[] = [];
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const child = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...listFiles(root, child));
    else if (entry.isFile()) files.push(normalizePath(child));
  }
  return files;
}

function projectPackageFiles(packageRoot: string, packageJson: Record<string, unknown>): PackageFileProjection {
  const errors: string[] = [];
  const files = new Set<string>();
  const fileSpecs = stringArray(packageJson.files);
  // Static projection is intentionally best-effort and does not claim byte parity with npm pack.
  const specs = fileSpecs.length > 0 ? fileSpecs : ["."];
  for (const spec of specs) {
    const normalized = normalizePath(spec);
    for (const file of listFiles(packageRoot, normalized)) {
      if (file === "package-lock.json") continue;
      if (file.startsWith("node_modules/") || file.startsWith(".git/")) continue;
      files.add(file);
    }
  }
  for (const always of ["package.json", "README.md", "LICENSE", "CHANGELOG.md"]) {
    if (existsSync(join(packageRoot, always))) files.add(always);
  }
  const bin = isRecord(packageJson.bin) ? packageJson.bin : {};
  for (const target of Object.values(bin)) {
    if (typeof target === "string" && existsSync(join(packageRoot, target))) files.add(normalizePath(target));
  }
  return { files: [...files].sort(), errors };
}

function packageLifecycleScripts(packageJson: Record<string, unknown>): string[] {
  const scripts = stringRecord(packageJson.scripts);
  return Object.keys(scripts).filter((name) => lifecycleScriptNames.has(name)).sort();
}

function runtimeDependencies(packageJson: Record<string, unknown>): string[] {
  return Object.keys(stringRecord(packageJson.dependencies)).sort();
}

function directDevDependencyInstallScripts(packageRoot: string, packageJson: Record<string, unknown>): Array<{ name: string; scripts: string[]; packagePath: string }> {
  const result: Array<{ name: string; scripts: string[]; packagePath: string }> = [];
  for (const name of Object.keys(stringRecord(packageJson.devDependencies)).sort()) {
    const packagePath = join(packageRoot, "node_modules", ...name.split("/"), "package.json");
    if (!existsSync(packagePath)) continue;
    try {
      const parsed = readJsonFile(packagePath);
      if (!isRecord(parsed)) continue;
      const scripts = Object.keys(stringRecord(parsed.scripts)).filter((script) => lifecycleScriptNames.has(script)).sort();
      if (scripts.length > 0) result.push({ name, scripts, packagePath });
    } catch {
      // Missing dependency package metadata is not a blocker for the first slice;
      // lockfile integrity covers the reproducible dependency evidence.
    }
  }
  return result;
}

function networkImports(packageRoot: string, files: string[]): Array<{ file: string; imports: string[] }> {
  const result: Array<{ file: string; imports: string[] }> = [];
  const modules = new Set<string>();
  for (const file of files) {
    if (!codeExtensions.has(extname(file))) continue;
    let text = "";
    try {
      text = readFileSync(join(packageRoot, file), "utf8");
    } catch {
      continue;
    }
    const local = new Set<string>();
    for (const match of text.matchAll(/\b(?:from\s+|import\s*\(\s*|require\s*\(\s*)["'](node:(?:net|http|https|dgram|tls|http2))["']/g)) {
      local.add(match[1]);
      modules.add(match[1]);
    }
    if (local.size > 0) result.push({ file, imports: [...local].sort() });
  }
  return result.sort((left, right) => left.file.localeCompare(right.file));
}

function secretPatternFiles(packageRoot: string, files: string[]): string[] {
  const leaked: string[] = [];
  for (const file of files) {
    let text = "";
    try {
      text = readFileSync(join(packageRoot, file), "utf8");
    } catch {
      continue;
    }
    if (highConfidenceSecretPatterns.some((pattern) => pattern.test(text))) leaked.push(file);
  }
  return leaked.sort();
}

function lockfileEvidence(packageRoot: string): { status: "missing" | "invalid" | "present"; missingIntegrity: string[]; error: string | null } {
  const path = join(packageRoot, "package-lock.json");
  if (!existsSync(path)) return { status: "missing", missingIntegrity: [], error: null };
  try {
    const parsed = readJsonFile(path);
    if (!isRecord(parsed) || !isRecord(parsed.packages)) return { status: "invalid", missingIntegrity: [], error: "package-lock packages object missing" };
    const missingIntegrity = Object.entries(parsed.packages)
      .filter(([name]) => name !== "")
      .filter(([, value]) => isRecord(value) && value.link !== true)
      .filter(([, value]) => !isRecord(value) || typeof value.integrity !== "string" || !value.integrity)
      .map(([name]) => name)
      .sort();
    return { status: "present", missingIntegrity, error: null };
  } catch (error) {
    return { status: "invalid", missingIntegrity: [], error: error instanceof Error ? error.message : String(error) };
  }
}

function gitActionWorkflowFiles(packageRoot: string): string[] {
  const workflows = join(packageRoot, ".github", "workflows");
  if (!existsSync(workflows)) return [];
  return listFiles(packageRoot, ".github/workflows").filter((file) => file.endsWith(".yml") || file.endsWith(".yaml"));
}

function mutableGitHubActions(packageRoot: string): string[] {
  const mutable: string[] = [];
  for (const file of gitActionWorkflowFiles(packageRoot)) {
    let text = "";
    try {
      text = readFileSync(join(packageRoot, file), "utf8");
    } catch {
      continue;
    }
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/\buses:\s*([^@\s]+)@([^\s#]+)/);
      if (match && !/^[a-f0-9]{40}$/i.test(match[2])) mutable.push(`${file}:${match[1]}@${match[2]}`);
    }
  }
  return mutable.sort();
}

function artifactHash(packageRoot: string, files: string[]): string {
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(`${file}\0`);
    try {
      hash.update(readFileSync(join(packageRoot, file)));
    } catch {
      hash.update("[unreadable]");
    }
    hash.update("\n");
  }
  return `sha256:${hash.digest("hex")}`;
}

function supplyChainGateFor(status: SupplyChainEvidenceStatus, enabled: boolean, hasBlockingUnknowns: boolean): SupplyChainGate {
  if (!enabled) {
    return {
      enabled: false,
      status: "not_requested",
      exitCode: 0,
      reason: "pass --gate to make supplyChain.status affect the process exit code",
    };
  }
  if (status === "pass") {
    return {
      enabled: true,
      status: "passed",
      exitCode: 0,
      reason: "no gateable supply-chain evidence gaps or blocking unknowns are present",
    };
  }
  if (hasBlockingUnknowns) {
    return {
      enabled: true,
      status: "blocked",
      exitCode: 1,
      reason: "blocking unknowns prevent local supply-chain evidence from being derived",
    };
  }
  return {
    enabled: true,
    status: "failed",
    exitCode: 1,
    reason: "gateable supply-chain evidence gaps are present",
  };
}

function policyValue(policy: SupplyChainPolicy | null): SupplyChainPolicy {
  return policy ?? {};
}

export function buildSupplyChainEvidenceReport(cwd: string, options: { gate?: boolean } = {}): SupplyChainEvidenceReport {
  const resolvedCwd = resolve(cwd);
  const packageRoot = findPackageRoot(resolvedCwd);
  const informationalUnknowns: SupplyChainUnknown[] = [
    {
      kind: "npm_2fa_status",
      gate: false,
      evidence: null,
      recommendation: "Check npm account/package 2FA with npm or registry tooling; Codexus does not query account state.",
    },
    {
      kind: "npm_maintainer_status",
      gate: false,
      evidence: null,
      recommendation: "Check npm maintainer/account status with registry tooling; Codexus does not query maintainer data.",
    },
    {
      kind: "publish_provenance",
      gate: false,
      evidence: null,
      recommendation: "Check npm provenance after publish or use trusted publishing; local checks cannot prove registry provenance.",
    },
    {
      kind: "known_cve_status",
      gate: false,
      evidence: null,
      recommendation: "Run npm audit, OSV, Snyk, or Socket for vulnerability database coverage.",
    },
  ];
  if (!packageRoot) {
    const policy: SupplyChainPolicyResolution = {
      declared: false,
      source: null,
      path: null,
      validation: { schemaVersion: 1, valid: true, errors: [], policy: null },
    };
    const blockingUnknowns: SupplyChainUnknown[] = [{
      kind: "package_json_missing",
      gate: true,
      evidence: resolvedCwd,
      recommendation: "Run from a package directory or pass --cwd to a package root.",
    }];
    const status: SupplyChainEvidenceStatus = "unknown";
    return {
      schemaVersion: 1,
      cwd: resolvedCwd,
      packageRoot: null,
      packageJsonPath: null,
      lifecycleExecuted: false,
      projectionMode: "static",
      projectionAccuracy: "best_effort",
      policy,
      packageArtifact: { files: [], fileCount: 0, errors: [] },
      evidenceGaps: [],
      derivableFacts: [],
      heuristicClaims: [],
      blockingUnknowns,
      informationalUnknowns,
      supplyChain: { status, policyMode: "report_only", runtimeDependencyCount: null },
      gate: supplyChainGateFor(status, options.gate === true, true),
    };
  }

  const packageJsonPath = join(packageRoot, "package.json");
  let packageJson: Record<string, unknown> | null = null;
  const evidenceGaps: SupplyChainEvidenceGap[] = [];
  const derivableFacts: SupplyChainDerivableFact[] = [];
  const heuristicClaims: SupplyChainHeuristicClaim[] = [];
  const blockingUnknowns: SupplyChainUnknown[] = [];

  try {
    const parsed = readJsonFile(packageJsonPath);
    if (isRecord(parsed)) packageJson = parsed;
    else {
      blockingUnknowns.push({
        kind: "package_json_unreadable",
        gate: true,
        evidence: packageJsonPath,
        recommendation: "Fix package.json so supply-chain facts can be derived.",
      });
    }
  } catch (error) {
    blockingUnknowns.push({
      kind: "package_json_unreadable",
      gate: true,
      evidence: packageJsonPath,
      recommendation: `Fix package.json parse/read error: ${error instanceof Error ? error.message : String(error)}`,
    });
  }

  const policy = readSupplyChainPolicy(packageRoot);
  const effectivePolicy = policyValue(policy.validation.policy);
  if (policy.declared && !policy.validation.valid) {
    blockingUnknowns.push({
      kind: "policy_invalid",
      gate: true,
      evidence: policy.path,
      recommendation: `Fix codexus.supplyChain policy: ${policy.validation.errors.join(", ")}`,
    });
    evidenceGaps.push({
      kind: "policy_invalid",
      gate: true,
      evidence: policy.path,
      policy: "codexus.supplyChain must validate before facts can be promoted to gateable findings",
      recommendation: `Fix policy errors: ${policy.validation.errors.join(", ")}`,
    });
  }
  derivableFacts.push({
    kind: policy.declared ? "policy_declared" : "policy_missing_report_only",
    gate: false,
    evidence: policy.path ?? "no codexus.supplyChain policy declared; report-only mode",
  });

  if (!packageJson) {
    const status: SupplyChainEvidenceStatus = evidenceGaps.length > 0 ? "fail" : "unknown";
    return {
      schemaVersion: 1,
      cwd: resolvedCwd,
      packageRoot,
      packageJsonPath,
      lifecycleExecuted: false,
      projectionMode: "static",
      projectionAccuracy: "best_effort",
      policy,
      packageArtifact: { files: [], fileCount: 0, errors: [] },
      evidenceGaps,
      derivableFacts,
      heuristicClaims,
      blockingUnknowns,
      informationalUnknowns,
      supplyChain: { status, policyMode: policy.declared ? policy.validation.valid ? "declared" : "invalid" : "report_only", runtimeDependencyCount: null },
      gate: supplyChainGateFor(status, options.gate === true, blockingUnknowns.length > 0),
    };
  }

  const projection = projectPackageFiles(packageRoot, packageJson);
  const packageFiles = projection.files;
  if (projection.errors.length > 0) {
    blockingUnknowns.push({
      kind: "package_file_projection_failed",
      gate: true,
      evidence: packageRoot,
      recommendation: projection.errors.join(", "),
    });
  }
  derivableFacts.push({
    kind: "package_file_projection",
    gate: false,
    evidence: artifactHash(packageRoot, packageFiles),
    files: packageFiles.slice(0, 100),
    count: packageFiles.length,
  });

  const lifecycleScripts = packageLifecycleScripts(packageJson);
  derivableFacts.push({
    kind: "package_lifecycle_scripts",
    gate: false,
    evidence: packageJsonPath,
    scripts: lifecycleScripts,
    count: lifecycleScripts.length,
  });
  if (policy.declared && policy.validation.valid) {
    const allowed = new Set(effectivePolicy.allowedLifecycleScripts ?? []);
    const disallowed = lifecycleScripts.filter((script) => !allowed.has(script));
    if (disallowed.length > 0) {
      evidenceGaps.push({
        kind: "lifecycle_script_not_allowed",
        gate: true,
        evidence: packageJsonPath,
        policy: "allowedLifecycleScripts",
        recommendation: "Declare the lifecycle script as allowed or remove it.",
        scripts: disallowed,
      });
    }
  }

  const devInstallScripts = directDevDependencyInstallScripts(packageRoot, packageJson);
  if (devInstallScripts.length > 0) {
    derivableFacts.push({
      kind: "dev_dependency_install_scripts",
      gate: false,
      evidence: "direct devDependency package metadata",
      dependencies: devInstallScripts.map((entry) => entry.name),
      scripts: devInstallScripts.flatMap((entry) => entry.scripts.map((script) => `${entry.name}:${script}`)),
    });
  }
  if (policy.declared && policy.validation.valid) {
    const allowed = new Set(effectivePolicy.allowedDevDependencyInstallScripts ?? []);
    const disallowed = devInstallScripts.filter((entry) => !allowed.has(entry.name));
    if (disallowed.length > 0) {
      evidenceGaps.push({
        kind: "dev_dependency_install_script_not_allowed",
        gate: true,
        evidence: "direct devDependency package metadata",
        policy: "allowedDevDependencyInstallScripts",
        recommendation: "Declare the devDependency install script as allowed or remove the install-script dependency.",
        dependencies: disallowed.map((entry) => entry.name),
      });
    }
  }

  const runtimeDeps = runtimeDependencies(packageJson);
  derivableFacts.push({
    kind: "runtime_dependency_count",
    gate: false,
    evidence: packageJsonPath,
    dependencies: runtimeDeps,
    count: runtimeDeps.length,
  });
  if (policy.declared && policy.validation.valid && effectivePolicy.runtimeDependenciesMax !== undefined && runtimeDeps.length > effectivePolicy.runtimeDependenciesMax) {
    evidenceGaps.push({
      kind: "runtime_dependency_count_exceeds_policy",
      gate: true,
      evidence: packageJsonPath,
      policy: "runtimeDependenciesMax",
      recommendation: "Remove runtime dependencies or raise the declared policy bound intentionally.",
      dependencies: runtimeDeps,
    });
  }

  const forbiddenMatches = policy.declared && policy.validation.valid
    ? packageFiles.filter((file) => (effectivePolicy.forbiddenPackageFiles ?? []).some((pattern) => matchesPattern(file, pattern)))
    : [];
  if (forbiddenMatches.length > 0) {
    evidenceGaps.push({
      kind: "forbidden_package_file",
      gate: true,
      evidence: "static package file projection",
      policy: "forbiddenPackageFiles",
      recommendation: "Remove forbidden files from the shipped package artifact.",
      files: forbiddenMatches.slice(0, 100),
    });
  } else if (policy.declared && policy.validation.valid) {
    derivableFacts.push({
      kind: "forbidden_package_files_absent",
      gate: false,
      evidence: "static package file projection",
      files: effectivePolicy.forbiddenPackageFiles ?? [],
    });
  }

  const missingRequired = policy.declared && policy.validation.valid
    ? (effectivePolicy.requiredPackageFiles ?? []).filter((required) => !packageFiles.some((file) => matchesPattern(file, required)))
    : [];
  if (missingRequired.length > 0) {
    evidenceGaps.push({
      kind: "required_package_file_missing",
      gate: true,
      evidence: "static package file projection",
      policy: "requiredPackageFiles",
      recommendation: "Ship the required file or update the declared policy intentionally.",
      files: missingRequired,
    });
  } else if (policy.declared && policy.validation.valid) {
    derivableFacts.push({
      kind: "required_package_files_present",
      gate: false,
      evidence: "static package file projection",
      files: effectivePolicy.requiredPackageFiles ?? [],
    });
  }

  if (policy.declared && policy.validation.valid && effectivePolicy.binTargetsMustBeBuiltArtifacts === true) {
    const bin = isRecord(packageJson.bin) ? packageJson.bin : {};
    const invalid = Object.values(bin)
      .filter((target): target is string => typeof target === "string")
      .filter((target) => !normalizePath(target).startsWith("dist/"));
    if (invalid.length > 0) {
      evidenceGaps.push({
        kind: "bin_target_not_built_artifact",
        gate: true,
        evidence: packageJsonPath,
        policy: "binTargetsMustBeBuiltArtifacts",
        recommendation: "Point public bins at built dist artifacts.",
        files: invalid,
      });
    } else {
      derivableFacts.push({
        kind: "bin_targets_built_artifacts",
        gate: false,
        evidence: packageJsonPath,
        files: Object.values(bin).filter((target): target is string => typeof target === "string"),
      });
    }
  }

  const secretFiles = secretPatternFiles(packageRoot, packageFiles);
  if (secretFiles.length > 0) {
    evidenceGaps.push({
      kind: "secret_pattern_in_package_artifact",
      gate: true,
      evidence: "high-confidence secret-pattern scan over projected package files",
      policy: "built-in:secret-pattern-leak",
      recommendation: "Remove secrets from files included in the package artifact.",
      files: secretFiles.slice(0, 100),
    });
  }

  const imports = networkImports(packageRoot, packageFiles);
  if (imports.length > 0) {
    derivableFacts.push({
      kind: "runtime_network_imports",
      gate: false,
      evidence: "static import scan over projected package code",
      imports: [...new Set(imports.flatMap((entry) => entry.imports))].sort(),
      files: imports.map((entry) => entry.file),
    });
  }
  if (policy.declared && policy.validation.valid) {
    const allowed = new Set(effectivePolicy.allowRuntimeNetworkImports ?? []);
    const disallowed = imports
      .map((entry) => ({ ...entry, imports: entry.imports.filter((name) => !allowed.has(name)) }))
      .filter((entry) => entry.imports.length > 0);
    if (disallowed.length > 0) {
      evidenceGaps.push({
        kind: "runtime_network_import_not_allowed",
        gate: true,
        evidence: "static import scan over projected package code",
        policy: "allowRuntimeNetworkImports",
        recommendation: "Remove the network import from shipped code or declare it as allowed.",
        files: disallowed.map((entry) => entry.file),
        imports: [...new Set(disallowed.flatMap((entry) => entry.imports))].sort(),
      });
    }
  }

  const lockfile = lockfileEvidence(packageRoot);
  if (lockfile.status === "invalid") {
    blockingUnknowns.push({
      kind: "lockfile_unreadable",
      gate: true,
      evidence: join(packageRoot, "package-lock.json"),
      recommendation: `Fix package-lock.json so dependency integrity can be derived: ${lockfile.error ?? "invalid"}`,
    });
  } else if (lockfile.status === "missing") {
    if (policy.declared && policy.validation.valid && effectivePolicy.lockfileIntegrityRequired === true) {
      evidenceGaps.push({
        kind: "missing_lockfile",
        gate: true,
        evidence: join(packageRoot, "package-lock.json"),
        policy: "lockfileIntegrityRequired",
        recommendation: "Commit package-lock.json or relax the declared policy intentionally.",
      });
    } else {
      derivableFacts.push({
        kind: "lockfile_integrity",
        gate: false,
        evidence: "package-lock.json missing; no policy required it",
        count: 0,
      });
    }
  } else if (lockfile.missingIntegrity.length > 0) {
    if (policy.declared && policy.validation.valid && effectivePolicy.lockfileIntegrityRequired === true) {
      evidenceGaps.push({
        kind: "missing_lockfile_integrity",
        gate: true,
        evidence: join(packageRoot, "package-lock.json"),
        policy: "lockfileIntegrityRequired",
        recommendation: "Regenerate package-lock.json so dependency entries carry integrity hashes.",
        dependencies: lockfile.missingIntegrity.slice(0, 100),
      });
    } else {
      derivableFacts.push({
        kind: "lockfile_integrity",
        gate: false,
        evidence: "package-lock.json has entries without integrity, but no policy required integrity",
        dependencies: lockfile.missingIntegrity.slice(0, 100),
      });
    }
  } else {
    derivableFacts.push({
      kind: "lockfile_integrity",
      gate: false,
      evidence: join(packageRoot, "package-lock.json"),
    });
  }

  const mutableActions = mutableGitHubActions(packageRoot);
  if (mutableActions.length > 0) {
    heuristicClaims.push({
      kind: "mutable_github_actions_ref",
      confidence: "low",
      evidence: `Mutable GitHub Action refs observed: ${mutableActions.slice(0, 5).join(", ")}`,
      recommendation: "Pin GitHub Actions to commit SHA in a dedicated supply-chain hardening pass.",
    });
  }
  if (runtimeDeps.length > 0) {
    heuristicClaims.push({
      kind: "typosquat_name_similarity_deferred",
      confidence: "low",
      evidence: "Dependency name similarity is heuristic and intentionally not evaluated in the first slice.",
      recommendation: "Use dedicated supply-chain tools for typosquat and registry reputation checks.",
    });
  }

  const status: SupplyChainEvidenceStatus = evidenceGaps.length > 0
    ? "fail"
    : blockingUnknowns.length > 0
      ? "unknown"
      : "pass";

  return {
    schemaVersion: 1,
    cwd: resolvedCwd,
    packageRoot,
    packageJsonPath,
    lifecycleExecuted: false,
    projectionMode: "static",
    projectionAccuracy: "best_effort",
    policy,
    packageArtifact: {
      files: packageFiles,
      fileCount: packageFiles.length,
      errors: projection.errors,
    },
    evidenceGaps,
    derivableFacts,
    heuristicClaims,
    blockingUnknowns,
    informationalUnknowns,
    supplyChain: {
      status,
      policyMode: policy.declared ? policy.validation.valid ? "declared" : "invalid" : "report_only",
      runtimeDependencyCount: runtimeDeps.length,
    },
    gate: supplyChainGateFor(status, options.gate === true, blockingUnknowns.length > 0),
  };
}
