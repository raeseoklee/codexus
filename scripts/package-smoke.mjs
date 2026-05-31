#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
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
  const { allowFailure = false, ...spawnOptions } = options;
  const result = spawnSync(command, args, {
    cwd: spawnOptions.cwd ?? root,
    env: {
      ...process.env,
      npm_config_dry_run: "false",
      NPM_CONFIG_DRY_RUN: "false",
      ...(spawnOptions.env ?? {}),
    },
    encoding: "utf8",
  });
  if (result.status !== 0 && !allowFailure) {
    const rendered = [result.stdout, result.stderr].filter(Boolean).join("\n");
    throw new Error(`${command} ${args.join(" ")} failed with ${result.status}\n${rendered}`);
  }
  return { status: result.status, stdout: result.stdout.trim(), stderr: result.stderr.trim() };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function binPath(prefix, name) {
  return process.platform === "win32" ? join(prefix, `${name}.cmd`) : join(prefix, "bin", name);
}

function parseJsonRun(command, args, options = {}) {
  return JSON.parse(run(command, args, options).stdout);
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
  await mkdir(join(project, ".codexus"), { recursive: true });

  const fakeCodex = join(workspace, "fake-codex.mjs");
  await writeFile(fakeCodex, `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] === "--version") {
  console.log("codex-cli package-smoke");
} else if (args[0] === "login" && args[1] === "status") {
  console.log("logged in");
} else if (args[0] === "exec" && args[1] === "--help") {
  console.log("Usage: codex exec --json --sandbox --model --output-last-message");
} else if (args[0] === "app-server" && args[1] === "--help") {
  console.log("Usage: codex app-server");
} else if (args[0] === "features" && args[1] === "list") {
  console.log("mock stable true");
} else {
  console.error("unexpected codex args", args.join(" "));
  process.exit(2);
}
`);
  await chmod(fakeCodex, 0o755);
  await writeFile(join(project, ".codexus", "config.json"), `${JSON.stringify({ codex: { command: fakeCodex } }, null, 2)}\n`);

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
  const installedVersion = parseJsonRun(cx, ["version", "--json"]);
  assert(installedVersion.version === pkg.version, "cx version --json did not report package version");
  assert(installedVersion.name === "codexus", "cx version --json did not report package name");

  const doctor = parseJsonRun(codexus, ["doctor", "--cwd", project, "--json", "--strict"], {
    env: { CODEX_HOME: codexHome },
  });
  assert(doctor.stability === "stable", "doctor did not report stable JSON stability");
  assert(doctor.ok === true, "doctor --strict did not pass with fake codex fixture");

  const schema = parseJsonRun(codexus, ["schema", "check", "--json"]);
  assert(schema.ok === true, "codexus schema check did not return ok=true");
  assert(schema.appServerFixture?.valid === true, "app-server runtime fixture was not readable from the installed package");

  const supplyChain = parseJsonRun(codexus, ["supply-chain", "check", "--gate", "--json"]);
  assert(supplyChain.stability === "stable", "supply-chain check did not report stable JSON stability");
  assert(supplyChain.gate?.status === "passed", "installed supply-chain gate did not pass");

  const subagentLaunch = parseJsonRun(codexus, [
    "session",
    "subagent",
    "launch",
    "--cwd",
    project,
    "--role",
    "reviewer",
    "--task",
    "package smoke review",
    "--json",
  ]);
  assert(subagentLaunch.stability === "deferred", "subagent launch contract did not report deferred stability");
  assert(subagentLaunch.launch?.launcher?.supported === false, "subagent launch contract falsely reported support");
  assert(subagentLaunch.link?.status === "launch_unavailable", "subagent launch contract did not link unavailable launch state");

  const passRun = parseJsonRun(codexus, ["run", "--driver", "mock", "--verify", "node -e \"process.exit(0)\"", "--json", "package smoke pass"], { cwd: project });
  assert(passRun.outcome === "complete", "mock pass run did not complete from the installed package");
  assert(String(passRun.statePath).includes(".codexus"), "mock pass run did not write under .codexus");

  const failRunResult = run(codexus, ["run", "--driver", "mock", "--max-repairs", "0", "--verify", "node -e \"process.exit(1)\"", "--json", "package smoke fail"], {
    cwd: project,
    allowFailure: true,
  });
  assert(failRunResult.status === 1, "mock failing verification run should return nonzero");
  const failRun = JSON.parse(failRunResult.stdout);
  assert(failRun.outcome === "failed", "mock failing verification run did not report failed outcome");

  const repairVerify = "node -e \"const fs=require('fs'); if(!fs.existsSync('smoke-marker')){fs.writeFileSync('smoke-marker','1'); process.exit(1)}\"";
  const repairRun = parseJsonRun(codexus, ["run", "--driver", "mock", "--max-repairs", "1", "--verify", repairVerify, "--json", "package smoke repair"], { cwd: project });
  assert(repairRun.outcome === "complete", "mock repair run did not complete");
  const repairState = JSON.parse(await readFile(repairRun.statePath, "utf8"));
  assert(repairState.repairIteration === 1, "mock repair run did not exercise one repair iteration");

  const status = parseJsonRun(codexus, ["status", repairRun.runId, "--json"], { cwd: project });
  assert(status.state?.runId === repairRun.runId, "installed status did not read the repair run");
  assert(status.state?.repairIteration === 1, "installed status did not expose the repair iteration");
  const events = parseJsonRun(codexus, ["events", "tail", repairRun.runId, "--lines", "5", "--json"], { cwd: project });
  assert(events.events?.length > 0, "installed events tail returned no events");
  const resume = parseJsonRun(codexus, ["resume", repairRun.runId, "--json", "package smoke resume"], { cwd: project });
  assert(resume.resumedFrom === repairRun.runId, "installed resume did not reference the original run");
  assert(resume.outcome === "complete", "installed resume did not complete");
  const cancel = parseJsonRun(codexus, ["cancel", failRun.runId, "--reason", "package smoke cancel", "--json"], { cwd: project });
  assert(cancel.status === "already_terminal", "installed cancel did not exercise terminal cancel path");
  assert(existsSync(join(project, ".codexus")), "mock run did not create .codexus");

  console.log("package smoke ok");
} finally {
  if (process.env.CODEXUS_KEEP_PACKAGE_SMOKE !== "1") {
    await rm(workspace, { recursive: true, force: true });
  }
}
