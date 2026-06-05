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

async function wait(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(check, timeoutMs = 5000, intervalMs = 100) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await wait(intervalMs);
  }
  throw new Error("wait_for_timeout");
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
  await mkdir(join(project, "docs"), { recursive: true });
  await writeFile(join(project, "README.md"), "# Package Smoke Fixture\n");
  await writeFile(join(project, "docs", "README.md"), "# Docs Index\n");
  await writeFile(
    join(project, "package.json"),
    `${JSON.stringify(
      {
        name: "package-smoke-project",
        version: "1.0.0",
        scripts: {
          test: "node --test",
          lint: "node -e \"console.log('lint ok')\"",
          typecheck: "node -e \"console.log('typecheck ok')\"",
        },
      },
      null,
      2,
    )}\n`,
  );

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
  await writeFile(join(project, ".codexus", "config.json"), `${JSON.stringify({
    codex: { command: fakeCodex },
    automation: {
      cronEnabled: true,
      gatewayEnabled: true,
    },
  }, null, 2)}\n`);
  const serverScript = join(project, "server.mjs");
  await writeFile(serverScript, `#!/usr/bin/env node
import http from "node:http";

const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 0);
const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  res.writeHead(200, { "content-type": "text/plain" });
  res.end("ok");
});

server.listen(port, host, () => {
  const address = server.address();
  const actualPort = address && typeof address !== "string" ? address.port : port;
  console.log(\`listening \${host}:\${actualPort}\`);
  console.error("stderr ready");
});

function shutdown() {
  server.close(() => process.exit(0));
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
`);
  const appInstanceDescriptor = join(project, "codexus.app-instances.json");
  await writeFile(
    appInstanceDescriptor,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        stability: "experimental",
        profiles: [
          {
            name: "web",
            command: [process.execPath, serverScript],
            cwd: ".",
            port: { mode: "allocate", preferred: 4173 },
            health: { type: "http", url: "http://127.0.0.1:{port}/health", timeoutMs: 1000 },
            log: { stdout: true, stderr: true },
          },
        ],
      },
      null,
      2,
    )}\n`,
  );

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
  assert(installedVersion.stability === "stable", "cx version --json did not report stable JSON stability");
  assert(installedVersion.version === pkg.version, "cx version --json did not report package version");
  assert(installedVersion.name === "codexus", "cx version --json did not report package name");
  assert(installedVersion.update?.stability === "experimental", "cx version --json did not include experimental update summary");
  assert(installedVersion.update?.registryChecked === false, "cx version --json should not query the registry");

  const update = parseJsonRun(cx, ["update", "check", "--json"], {
    env: {
      CODEXUS_NO_UPDATE_CHECK: "1",
      CODEXUS_UPDATE_CACHE_DIR: join(workspace, "update-cache"),
    },
  });
  assert(update.stability === "experimental", "cx update check did not report experimental stability");
  assert(update.status === "disabled", "cx update check did not honor CODEXUS_NO_UPDATE_CHECK");
  assert(update.registryChecked === false, "disabled update check should not query the registry");
  assert(update.installationMutated === false, "update check must not mutate the installed package");

  const doctor = parseJsonRun(codexus, ["doctor", "--cwd", project, "--json", "--strict"], {
    env: { CODEX_HOME: codexHome },
  });
  assert(doctor.stability === "stable", "doctor did not report stable JSON stability");
  assert(doctor.ok === true, "doctor --strict did not pass with fake codex fixture");
  assert(doctor.update?.stability === "experimental", "doctor did not include experimental update summary");
  assert(doctor.update?.registryChecked === false, "doctor should not query the update registry");

  const schema = parseJsonRun(codexus, ["schema", "check", "--json"]);
  assert(schema.stability === "stable", "schema check did not report stable JSON stability");
  assert(schema.ok === true, "codexus schema check did not return ok=true");
  assert(schema.appServerFixture?.valid === true, "app-server runtime fixture was not readable from the installed package");

  const supplyChain = parseJsonRun(codexus, ["supply-chain", "check", "--gate", "--json"]);
  assert(supplyChain.stability === "stable", "supply-chain check did not report stable JSON stability");
  assert(supplyChain.gate?.status === "passed", "installed supply-chain gate did not pass");
  const lsp = parseJsonRun(codexus, ["lsp", "check", "--cwd", project, "--gate", "--json"]);
  assert(lsp.stability === "experimental", "installed lsp check did not report experimental stability");
  assert(lsp.autoApply?.startsLanguageServer === false, "installed lsp check should not start a language server");
  assert(lsp.result?.status === "passed", "installed lsp check did not run the fixture typecheck");
  assert(lsp.gate?.status === "passed", "installed lsp gate did not pass");
  const policyCatalog = parseJsonRun(codexus, ["policy", "catalog", "check", "--scope", "src/**", "--json"], {
    cwd: project,
  });
  assert(policyCatalog.stability === "experimental", "policy catalog did not report experimental stability");
  assert(policyCatalog.command === "policy catalog check", "policy catalog command name was not stable");
  assert(policyCatalog.rules?.some((rule) => rule.ruleId === "driver.command.preflight" && rule.status === "unavailable"), "policy catalog did not report honest driver preflight unavailability");

  const architecture = parseJsonRun(codexus, ["architecture", "check", "--gate", "--json"]);
  assert(architecture.stability === "experimental", "architecture check did not report experimental JSON stability");
  assert(architecture.scanAccuracy === "best_effort", "architecture check did not report best-effort scan accuracy");
  assert(architecture.gate?.status === "passed", "installed architecture gate did not pass");

  const repo = parseJsonRun(codexus, ["repo", "check", "--gate", "--json"]);
  assert(repo.stability === "experimental", "repo check did not report experimental JSON stability");
  assert(repo.scanAccuracy === "best_effort", "repo check did not report best-effort scan accuracy");
  assert(repo.gate?.status === "passed", "installed repo knowledge gate did not pass");
  const contract = parseJsonRun(codexus, ["contract", "check", "--cwd", project, "--target", "0.2.0", "--json"]);
  assert(contract.stability === "experimental", "contract check did not report experimental JSON stability");
  assert(contract.command === "contract check", "contract check command name was not stable");
  assert(contract.targetVersion === "0.2.0", "contract check did not report the 0.2.0 target");
  assert(contract.gate?.status === "not_requested", "contract check should stay report-only without --gate");

  const wikiBuild = parseJsonRun(codexus, ["wiki", "build", "--cwd", project, "--mode", "deterministic", "--json"]);
  assert(wikiBuild.stability === "experimental", "wiki build did not report experimental stability");
  assert(wikiBuild.mode === "deterministic", "wiki build did not stay in deterministic mode");
  assert(wikiBuild.manifest?.pages?.length >= 3, "wiki build did not generate the expected starter pages");
  const wikiManifestValidation = parseJsonRun(codexus, [
    "schema",
    "validate",
    "--type",
    "wiki-manifest",
    "--file",
    join(project, ".codexus", "wiki", "manifest.json"),
    "--json",
  ]);
  assert(wikiManifestValidation.ok === true, "wiki manifest validation did not pass from the installed package");
  const wikiCheck = parseJsonRun(codexus, ["wiki", "check", "--cwd", project, "--gate", "--json"]);
  assert(wikiCheck.stability === "experimental", "wiki check did not report experimental stability");
  assert(wikiCheck.gate?.status === "passed", "wiki check gate did not pass from the installed package");
  const wikiContext = parseJsonRun(codexus, [
    "wiki",
    "context",
    "--cwd",
    project,
    "--topic",
    "verification",
    "--budget",
    "1200",
    "--json",
  ]);
  assert(wikiContext.stability === "experimental", "wiki context did not report experimental stability");
  assert(wikiContext.selectedPages?.some((page) => page.pageId === "wiki.verification"), "wiki context did not include the verification page");
  assert(wikiContext.eligibleForAutomaticInjection === false, "wiki context should not be eligible for automatic injection");
  const autopilotPresets = parseJsonRun(codexus, ["autopilot", "presets", "list", "--json"]);
  assert(autopilotPresets.stability === "experimental", "autopilot presets did not report experimental stability");
  assert(autopilotPresets.defaultPreset === "contracted", "autopilot presets did not report the default preset");
  const autopilotPlan = parseJsonRun(codexus, [
    "autopilot",
    "plan",
    "--cwd",
    project,
    "--from",
    join(project, "README.md"),
    "--preset",
    "guided",
    "--json",
  ]);
  assert(autopilotPlan.stability === "experimental", "autopilot plan did not report experimental stability");
  assert(autopilotPlan.contract?.autonomyPreset === "guided", "autopilot plan did not persist the requested preset");
  const cronDispatch = parseJsonRun(codexus, [
    "cron",
    "run-now",
    "--cwd",
    project,
    "--driver",
    "mock",
    "--task",
    "package smoke dispatch",
    "--approved-by",
    "package-smoke",
    "--json",
  ]);
  assert(cronDispatch.stability === "experimental", "cron live dispatch did not report experimental stability");
  assert(cronDispatch.status === "completed", "cron live dispatch did not complete through the mock driver");
  assert(cronDispatch.run?.outcome === "complete", "cron live dispatch did not produce a completed supervised run");
  const gatewayDispatch = parseJsonRun(codexus, [
    "gateway",
    "check",
    "--cwd",
    project,
    "--driver",
    "mock",
    "--task",
    "package smoke gateway check",
    "--approved-by",
    "package-smoke",
    "--json",
  ]);
  assert(gatewayDispatch.stability === "experimental", "gateway live dispatch did not report experimental stability");
  assert(gatewayDispatch.status === "completed", "gateway live dispatch did not complete through the mock driver");

  const appProfiles = parseJsonRun(codexus, ["app", "instance", "profile", "list", "--cwd", project, "--descriptor", appInstanceDescriptor, "--json"]);
  assert(appProfiles.stability === "experimental", "app instance profile list did not report experimental stability");
  assert(appProfiles.descriptor?.valid === true, "app instance descriptor did not validate from installed package");
  assert(appProfiles.profiles?.[0]?.name === "web", "app instance profile list did not load the web profile");
  assert(appProfiles.capabilities?.dryRunStart === true, "app instance profile list did not report dry-run capability");
  assert(appProfiles.capabilities?.liveStart === true, "app instance profile list did not report live start capability");
  const appPlan = parseJsonRun(codexus, [
    "app",
    "instance",
    "start",
    "--cwd",
    project,
    "--descriptor",
    appInstanceDescriptor,
    "--profile",
    "web",
    "--worktree",
    project,
    "--dry-run",
    "--json",
  ]);
  assert(appPlan.stability === "experimental", "app instance dry-run plan did not report experimental stability");
  assert(appPlan.mode === "dry-run", "app instance start did not stay in dry-run mode");
  assert(appPlan.spawned === false, "app instance dry-run falsely reported spawned=true");
  assert(appPlan.status === "planned", "app instance dry-run did not report planned status");
  assert(appPlan.capabilities?.liveStart === true, "app instance dry-run did not report live start capability");
  const appStatus = parseJsonRun(codexus, ["app", "instance", "status", "--cwd", project, "--json"]);
  assert(appStatus.stability === "experimental", "app instance status did not report experimental stability");
  assert(appStatus.status === "empty", "app instance status should not report dry-run plans as live instances");
  assert(appStatus.instances?.length === 0, "app instance status should not include dry-run plans as instances");

  const appLive = parseJsonRun(codexus, [
    "app",
    "instance",
    "start",
    "--cwd",
    project,
    "--descriptor",
    appInstanceDescriptor,
    "--profile",
    "web",
    "--worktree",
    project,
    "--json",
  ]);
  assert(appLive.mode === "live", "app instance live start did not report live mode");
  assert(appLive.spawned === true, "app instance live start did not report spawned=true");
  assert(appLive.owned === true, "app instance live start did not report owned=true");
  const liveInstanceId = appLive.launch.instanceId;

  await waitFor(async () => {
    const status = parseJsonRun(codexus, ["app", "instance", "status", "--cwd", project, "--instance-id", liveInstanceId, "--json"]);
    return status.instances?.[0]?.process?.status === "running" && status.instances?.[0]?.health?.status === "passed";
  });

  const appLogs = parseJsonRun(codexus, ["app", "instance", "logs", "--cwd", project, "--instance-id", liveInstanceId, "--tail", "20", "--json"]);
  assert(appLogs.stdout.lines.some((line) => line.includes("listening 127.0.0.1:")), "app instance live stdout did not contain the listening line");
  assert(appLogs.stderr.lines.some((line) => line.includes("stderr ready")), "app instance live stderr did not contain the readiness line");

  const observationEvidence = join(project, "browser-evidence.txt");
  await writeFile(observationEvidence, "browser reached app instance\n");
  const appObservation = parseJsonRun(codexus, [
    "app",
    "instance",
    "evidence",
    "record",
    "--cwd",
    project,
    "--instance-id",
    liveInstanceId,
    "--kind",
    "browser",
    "--source",
    "package-smoke",
    "--url",
    appLive.launch.url,
    "--evidence-path",
    observationEvidence,
    "--summary",
    "browser evidence linked to the live app instance",
    "--json",
  ]);
  assert(appObservation.observation?.instance?.instanceId === liveInstanceId, "app instance observation did not cite the live instance id");
  assert(appObservation.observation?.observation?.status === "observed", "app instance observation did not remain observed while the instance was live");
  assert(appObservation.observation?.authority?.completionAuthority === false, "app instance observation must not become completion authority");
  const appObservationSchema = parseJsonRun(codexus, ["schema", "validate", "--cwd", project, "--type", "app-instance-observation", "--file", appObservation.path, "--json"]);
  assert(appObservationSchema.ok === true, "app instance observation did not validate against schema");
  const appObservationList = parseJsonRun(codexus, ["app", "instance", "evidence", "list", "--cwd", project, "--instance-id", liveInstanceId, "--json"]);
  assert(appObservationList.observations?.length === 1, "app instance evidence list did not include the recorded observation");

  const appStop = parseJsonRun(codexus, ["app", "instance", "stop", "--cwd", project, "--instance-id", liveInstanceId, "--json"]);
  assert(appStop.status === "stopped", "app instance stop did not report stopped");
  assert(appStop.stopped === true, "app instance stop did not report stopped=true");

  await waitFor(async () => {
    const status = parseJsonRun(codexus, ["app", "instance", "status", "--cwd", project, "--instance-id", liveInstanceId, "--json"]);
    return status.instances?.[0]?.process?.status === "stopped";
  });

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
  assert(String(subagentLaunch.launch?.handoff?.completeCommand ?? "").includes("session subagent complete"), "subagent launch contract missing complete handoff");
  const subagentComplete = parseJsonRun(codexus, [
    "session",
    "subagent",
    "complete",
    "--cwd",
    project,
    "--task-id",
    subagentLaunch.launch.taskId,
    "--claim",
    "package smoke captured a hosted subagent claim",
    "--limitation",
    "package smoke did not launch a native subagent",
    "--confidence",
    "medium",
    "--json",
  ]);
  assert(subagentComplete.stability === "stable", "subagent complete did not report stable JSON stability");
  assert(subagentComplete.artifact?.source?.mode === "complete", "subagent completion did not use complete source mode");
  assert(subagentComplete.link?.status === "attached", "subagent completion did not attach claims");
  assert(subagentComplete.artifact?.claims?.length === 1, "subagent completion did not record exactly one claim");

  const passRun = parseJsonRun(codexus, ["run", "--driver", "mock", "--verify", "node -e \"process.exit(0)\"", "--json", "package smoke pass"], { cwd: project });
  assert(passRun.stability === "stable", "mock pass run did not report stable JSON stability");
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
  assert(status.stability === "stable", "installed status did not report stable JSON stability");
  assert(status.state?.runId === repairRun.runId, "installed status did not read the repair run");
  assert(status.state?.repairIteration === 1, "installed status did not expose the repair iteration");
  const events = parseJsonRun(codexus, ["events", "tail", repairRun.runId, "--lines", "5", "--json"], { cwd: project });
  assert(events.stability === "stable", "installed events tail did not report stable JSON stability");
  assert(events.events?.length > 0, "installed events tail returned no events");
  const resume = parseJsonRun(codexus, ["resume", repairRun.runId, "--json", "package smoke resume"], { cwd: project });
  assert(resume.stability === "stable", "installed resume did not report stable JSON stability");
  assert(resume.resumedFrom === repairRun.runId, "installed resume did not reference the original run");
  assert(resume.outcome === "complete", "installed resume did not complete");
  const cancel = parseJsonRun(codexus, ["cancel", failRun.runId, "--reason", "package smoke cancel", "--json"], { cwd: project });
  assert(cancel.stability === "stable", "installed cancel did not report stable JSON stability");
  assert(cancel.status === "already_terminal", "installed cancel did not exercise terminal cancel path");
  assert(existsSync(join(project, ".codexus")), "mock run did not create .codexus");

  console.log("package smoke ok");
} finally {
  if (process.env.CODEXUS_KEEP_PACKAGE_SMOKE !== "1") {
    await rm(workspace, { recursive: true, force: true });
  }
}
