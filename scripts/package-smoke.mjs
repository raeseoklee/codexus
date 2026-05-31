#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringArray(value, key) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim() === "")) {
    throw new Error(`codexus.supplyChain.${key} must be an array of non-empty strings`);
  }
  return value;
}

function readSupplyChainPolicy() {
  const policy = pkg.codexus?.supplyChain;
  if (!isRecord(policy)) throw new Error("codexus.supplyChain policy missing or invalid");
  if (!Number.isInteger(policy.runtimeDependenciesMax) || policy.runtimeDependenciesMax < 0) {
    throw new Error("codexus.supplyChain.runtimeDependenciesMax must be a non-negative integer");
  }
  for (const key of [
    "allowedLifecycleScripts",
    "allowedDevDependencyInstallScripts",
    "allowRuntimeNetworkImports",
    "forbiddenPackageFiles",
    "requiredPackageFiles",
  ]) {
    stringArray(policy[key], key);
  }
  for (const key of ["binTargetsMustBeBuiltArtifacts", "lockfileIntegrityRequired"]) {
    if (typeof policy[key] !== "boolean") throw new Error(`codexus.supplyChain.${key} must be boolean`);
  }
  return policy;
}

function normalizePath(path) {
  return path.replace(/\\/g, "/").replace(/^package\//, "");
}

function globToRegExp(pattern) {
  const normalized = pattern.replace(/\\/g, "/").replace(/^\.\/+/, "");
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

function matchesPattern(path, pattern) {
  const normalizedPath = normalizePath(path);
  const normalizedPattern = pattern.replace(/\\/g, "/").replace(/^\.\/+/, "");
  if (normalizedPattern.includes("*")) return globToRegExp(normalizedPattern).test(normalizedPath);
  const withoutSlash = normalizedPattern.replace(/\/+$/, "");
  return normalizedPath === withoutSlash || normalizedPath.startsWith(`${withoutSlash}/`);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? root,
    env: {
      ...process.env,
      npm_config_dry_run: "false",
      NPM_CONFIG_DRY_RUN: "false",
      ...(options.env ?? {}),
    },
    encoding: "utf8",
  });
  if (result.status !== 0) {
    const rendered = [result.stdout, result.stderr].filter(Boolean).join("\n");
    throw new Error(`${command} ${args.join(" ")} failed with ${result.status}\n${rendered}`);
  }
  return { stdout: result.stdout.trim(), stderr: result.stderr.trim() };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function binPath(prefix, name) {
  return process.platform === "win32" ? join(prefix, `${name}.cmd`) : join(prefix, "bin", name);
}

const workspace = await mkdtemp(join(tmpdir(), "codexus-package-smoke-"));
const packDir = join(workspace, "pack");
const prefix = join(workspace, "prefix");
const project = join(workspace, "project");
const codexHome = join(workspace, "codex-home");

try {
  await mkdir(packDir, { recursive: true });
  await mkdir(project, { recursive: true });
  await mkdir(codexHome, { recursive: true });

  run("npm", ["pack", "--pack-destination", packDir]);
  const packed = (await readdir(packDir)).filter((name) => name.endsWith(".tgz"));
  assert(packed.length === 1, `expected one packed tarball, found ${packed.length}`);
  const tarball = join(packDir, packed[0]);

  const tarEntries = run("tar", ["-tf", tarball]).stdout.split(/\n/).filter(Boolean);
  const policy = readSupplyChainPolicy();
  for (const required of policy.requiredPackageFiles) {
    assert(tarEntries.some((entry) => matchesPattern(entry, required)), `packed tarball missing package/${required}`);
  }
  for (const forbidden of policy.forbiddenPackageFiles) {
    const matched = tarEntries.filter((entry) => matchesPattern(entry, forbidden));
    assert(matched.length === 0, `packed tarball should not contain ${forbidden}: ${matched.join(", ")}`);
  }
  assert(tarEntries.includes("package/dist/cli/main.js"), "packed tarball missing built CLI backstop");
  assert(!tarEntries.some((entry) => entry.startsWith("package/src/")), "packed tarball should not contain source backstop");
  assert(run("tar", ["-xOf", tarball, "package/dist/cli/main.js"]).stdout.length > 0, "built CLI backstop is empty");

  run("npm", ["install", "-g", tarball, "--prefix", prefix], {
    env: { CODEX_HOME: codexHome },
  });
  assert(existsSync(join(codexHome, "skills", "codexus", "SKILL.md")), "postinstall did not install the Codex skill adapter");

  const codexus = binPath(prefix, "codexus");
  const cx = binPath(prefix, "cx");
  assert(run(codexus, ["--help"]).stdout.includes("Codexus"), "codexus --help did not render help");
  assert(run(cx, ["--help"]).stdout.includes("Codexus"), "cx --help did not render help");
  assert(run(codexus, ["--version"]).stdout === pkg.version, "codexus --version did not report package version");
  const installedVersion = JSON.parse(run(cx, ["version", "--json"]).stdout);
  assert(installedVersion.version === pkg.version, "cx version --json did not report package version");
  assert(installedVersion.name === "codexus", "cx version --json did not report package name");

  const schema = JSON.parse(run(codexus, ["schema", "check", "--json"]).stdout);
  assert(schema.ok === true, "codexus schema check did not return ok=true");
  assert(schema.appServerFixture?.valid === true, "app-server runtime fixture was not readable from the installed package");

  const mockRun = JSON.parse(run(codexus, ["run", "--driver", "mock", "--json", "package smoke"], { cwd: project }).stdout);
  assert(mockRun.outcome === "complete", "mock run did not complete from the installed package");
  assert(String(mockRun.statePath).includes(".codexus"), "mock run did not write under .codexus");
  assert(existsSync(join(project, ".codexus")), "mock run did not create .codexus");

  console.log("package smoke ok");
} finally {
  if (process.env.CODEXUS_KEEP_PACKAGE_SMOKE !== "1") {
    await rm(workspace, { recursive: true, force: true });
  }
}
