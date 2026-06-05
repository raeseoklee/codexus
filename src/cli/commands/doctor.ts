import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { access, readFile, readdir } from "node:fs/promises";
import { constants, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { flagBool, flagString, type ParsedArgs } from "../args.ts";
import { loadConfig } from "../../config/loader.ts";
import { harnessRoot } from "../../ledger/paths.ts";
import { createDriver } from "../../drivers/index.ts";
import type { DriverProbe } from "../../drivers/contract.ts";
import { trimmedProcessOutput } from "../../util/process-output.ts";
import { findCodexusPackageRoot } from "../../util/package-root.ts";
import { overlayStatus, readSessionStateWithMigration, refreshSessionState, sessionPaths, type NotifyDispatchState, type SessionStateMigrationReport } from "../../session/state.ts";
import { inspectNotifyHookConfig } from "../../session/hook-config.ts";
import { buildSupplyChainEvidenceReport } from "../../supply-chain/check.ts";
import { summarizeDeferredSelfReports } from "../../control/deferred-self-reports.ts";
import { readCodexusVersionInfo } from "./version.ts";
import { buildUpdateSummary } from "../../update/check.ts";
import { buildCodexusPluginPackageReport } from "../../plugin/package.ts";

interface Check {
  id: string;
  status: "pass" | "warn" | "fail";
  summary: string;
  details?: Record<string, unknown>;
}

function run(command: string, args: string[]): { ok: boolean; stdout: string; stderr: string; status: number | null; error?: string } {
  const result = spawnSync(command, args, { encoding: "utf8" });
  return {
    ok: result.status === 0,
    stdout: trimmedProcessOutput(result.stdout),
    stderr: trimmedProcessOutput(result.stderr),
    status: result.status,
    ...(result.error instanceof Error ? { error: result.error.message } : {}),
  };
}

function commandCheck(
  id: string,
  command: string,
  args: string[],
  summary: string,
  failureStatus: "warn" | "fail" = "fail",
): Check {
  const result = run(command, args);
  if (result.ok) {
    return { id, status: "pass", summary: result.stdout || summary, details: { status: result.status } };
  }
  return {
    id,
    status: failureStatus,
    summary: result.stderr || result.error || `${command} ${args.join(" ")} failed`,
    details: { status: result.status, ...(result.error ? { error: result.error } : {}) },
  };
}

async function hashFileIfExists(path: string): Promise<string | null> {
  if (!existsSync(path)) return null;
  return `sha256:${createHash("sha256").update(await readFile(path)).digest("hex")}`;
}

async function hashTreeIfExists(rootDir: string, exclude = new Set<string>()): Promise<string | null> {
  if (!existsSync(rootDir)) return null;
  const entries: Array<[string, string]> = [];
  async function walk(dir: string, prefix = ""): Promise<void> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (exclude.has(relative)) continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(path, relative);
      } else if (entry.isFile()) {
        entries.push([relative, createHash("sha256").update(await readFile(path)).digest("hex")]);
      }
    }
  }
  await walk(rootDir);
  const hash = createHash("sha256");
  for (const [relative, fileHash] of entries.sort((left, right) => left[0].localeCompare(right[0]))) {
    hash.update(`${relative}\0${fileHash}\n`);
  }
  return `sha256:${hash.digest("hex")}`;
}

async function codexusSkillInstallCheck(): Promise<Check> {
  const repoRoot = findCodexusPackageRoot();
  const codexHome = process.env.CODEX_HOME ? resolve(process.env.CODEX_HOME) : join(homedir(), ".codex");
  const sourceRoot = join(repoRoot, "codex", "skills", "codexus");
  const sourceSkill = join(repoRoot, "codex", "skills", "codexus", "SKILL.md");
  const installedRoot = join(codexHome, "skills", "codexus");
  const installedSkill = join(installedRoot, "SKILL.md");
  const metadataPath = join(installedRoot, "codexus-root.json");
  const sourceHash = await hashFileIfExists(sourceSkill);
  const installedHash = await hashFileIfExists(installedSkill);
  const sourceTreeHash = await hashTreeIfExists(sourceRoot);
  const installedTreeHash = await hashTreeIfExists(installedRoot, new Set([".codexus-adapter-managed", "codexus-root.json"]));
  let installedMetadata: Record<string, unknown> | null = null;
  if (existsSync(metadataPath)) {
    try {
      installedMetadata = JSON.parse(await readFile(metadataPath, "utf8")) as Record<string, unknown>;
    } catch {
      installedMetadata = null;
    }
  }
  if (!installedHash) {
    return {
      id: "codexus.skill_install",
      status: "warn",
      summary: "Codexus skill is not installed in CODEX_HOME",
      details: { codexHome, installedRoot, sourceHash, sourceTreeHash },
    };
  }
  const current = sourceTreeHash !== null
    && installedTreeHash === sourceTreeHash
    && installedMetadata?.root === repoRoot
    && installedMetadata?.sourceTreeHash === sourceTreeHash
    && installedMetadata?.installedTreeHash === installedTreeHash;
  return {
    id: "codexus.skill_install",
    status: current ? "pass" : "warn",
    summary: current ? "Codexus skill install matches this repository" : "Codexus skill install is missing metadata or differs from this repository",
    details: {
      codexHome,
      installedRoot,
      sourceHash,
      installedHash,
      sourceTreeHash,
      installedTreeHash,
      installedRootMetadata: installedMetadata,
    },
  };
}

export async function doctorCommand(args: ParsedArgs): Promise<void> {
  const cwd = resolve(flagString(args.flags, "cwd") ?? process.cwd());
  const json = flagBool(args.flags, "json");
  const strict = flagBool(args.flags, "strict");
  const { config, filesRead, warnings } = loadConfig({ cwd });
  const checks: Check[] = [];
  let driverProbe: DriverProbe | null = null;

  checks.push({
    id: "node.version",
    status: Number(process.versions.node.split(".")[0]) >= 22 ? "pass" : "fail",
    summary: `Node ${process.version}`,
  });
  checks.push(commandCheck("codex.version", config.codex.command, ["--version"], "codex available"));
  checks.push(commandCheck("codex.auth", config.codex.command, ["login", "status"], "codex login status ok"));
  checks.push(commandCheck("codex.exec_help", config.codex.command, ["exec", "--help"], "codex exec help ok"));
  checks.push(commandCheck("codex.app_server_help", config.codex.command, ["app-server", "--help"], "codex app-server help ok"));
  checks.push(commandCheck("codex.features", config.codex.command, ["features", "list"], "codex features listed", "warn"));
  checks.push(await codexusSkillInstallCheck());
  const pluginPackage = buildCodexusPluginPackageReport(cwd);
  checks.push({
    id: "codexus.plugin_package",
    status: pluginPackage.pluginPackage.present
      ? pluginPackage.pluginPackage.manifestValid ? "pass" : "fail"
      : "warn",
    summary: pluginPackage.pluginPackage.present
      ? pluginPackage.pluginPackage.manifestValid
        ? "Codexus plugin package manifest is valid; installed plugin state remains deferred"
        : `Codexus plugin package manifest is invalid: ${pluginPackage.pluginPackage.validation.errors.join(",")}`
      : "Codexus plugin package is not present in this installation",
    details: pluginPackage,
  });
  checks.push(commandCheck("git.root", "git", ["-C", cwd, "rev-parse", "--show-toplevel"], "git root detected", "warn"));
  checks.push(commandCheck("tmux.version", "tmux", ["-V"], "tmux available", "warn"));

  try {
    driverProbe = await (await createDriver(config)).probe(config);
    checks.push({
      id: `driver.${config.driver}`,
      status: driverProbe.available ? "pass" : "warn",
      summary: driverProbe.summary,
      details: {
        capabilities: driverProbe.capabilities as unknown as Record<string, unknown>,
      },
    });
  } catch (error) {
    checks.push({
      id: `driver.${config.driver}`,
      status: "fail",
      summary: error instanceof Error ? error.message : String(error),
    });
  }

  const root = harnessRoot(cwd);
  try {
    await access(existsSync(root) ? root : cwd, constants.W_OK);
    checks.push({ id: "harness.state_root", status: "pass", summary: root, details: { exists: existsSync(root), createsOnDemand: true } });
  } catch (error) {
  checks.push({
    id: "harness.state_root",
      status: "fail",
      summary: error instanceof Error ? error.message : String(error),
    });
  }

  const supplyChain = buildSupplyChainEvidenceReport(cwd);
  checks.push({
    id: "codexus.supply_chain",
    status: supplyChain.supplyChain.status === "fail" ? "fail" : supplyChain.supplyChain.status === "unknown" ? "warn" : "pass",
    summary: `Supply-chain evidence ${supplyChain.supplyChain.status} (${supplyChain.supplyChain.policyMode}, ${supplyChain.evidenceGaps.length} gaps, ${supplyChain.blockingUnknowns.length} blocking unknowns)`,
    details: {
      policy: supplyChain.policy,
      lifecycleExecuted: supplyChain.lifecycleExecuted,
      projectionMode: supplyChain.projectionMode,
      evidenceGaps: supplyChain.evidenceGaps.length,
      blockingUnknowns: supplyChain.blockingUnknowns.length,
      informationalUnknowns: supplyChain.informationalUnknowns.length,
    },
  });

  const deferredSelfReports = summarizeDeferredSelfReports(cwd);
  checks.push({
    id: "codexus.deferred_self_reports",
    status: deferredSelfReports.status === "findings" ? "fail" : deferredSelfReports.status === "unknown" ? "warn" : "pass",
    summary: `Deferred self-reports ${deferredSelfReports.status} (${deferredSelfReports.counts.documented}/${deferredSelfReports.counts.source} documented, ${deferredSelfReports.counts.undocumented} undocumented, ${deferredSelfReports.counts.unbacked} unbacked)`,
    details: deferredSelfReports,
  });

  const session = sessionPaths(cwd);
  const projectOverlay = await overlayStatus(cwd, "project");
  const userOverlay = await overlayStatus(cwd, "user");
  const notifyHook = await inspectNotifyHookConfig(cwd);
  const sessionStateExists = existsSync(session.state);
  let sessionStateInitialized = false;
  let sessionStateError: string | null = null;
  let sessionStateMigration: SessionStateMigrationReport | null = null;
  let sessionNotifyDispatch: NotifyDispatchState | null = null;
  try {
    const stateRead = await readSessionStateWithMigration(cwd);
    const refreshedState = stateRead.state ? await refreshSessionState(cwd, stateRead.state) : null;
    sessionStateInitialized = refreshedState !== null;
    sessionStateMigration = stateRead.migration;
    sessionNotifyDispatch = refreshedState?.notifyDispatch ?? null;
  } catch (error) {
    sessionStateError = error instanceof Error ? error.message : String(error);
  }
  checks.push({
    id: "codexus.session_state",
    status: sessionStateError ? "fail" : sessionStateMigration?.migrated ? "warn" : sessionStateExists ? "pass" : "warn",
    summary: sessionStateError
      ?? (sessionStateMigration?.migrated
        ? `Codexus session state requires migration: ${sessionStateMigration.applied.join(",")}`
        : sessionStateExists ? session.state : "Codexus session state has not been initialized"),
    details: {
      statePath: session.state,
      sessionRoot: session.sessionRoot,
      exists: sessionStateExists,
      initialized: sessionStateInitialized,
      migration: sessionStateMigration,
    },
  });
  checks.push({
    id: "codexus.agents_overlay.project",
    status: projectOverlay.installed ? "pass" : "warn",
    summary: projectOverlay.installed ? "Project AGENTS.md has Codexus runtime overlay" : "Project AGENTS.md does not have Codexus runtime overlay",
    details: projectOverlay,
  });
  checks.push({
    id: "codexus.agents_overlay.user",
    status: userOverlay.installed ? "pass" : "warn",
    summary: userOverlay.installed ? "User AGENTS.md has Codexus runtime overlay" : "User AGENTS.md does not have Codexus runtime overlay",
    details: userOverlay,
  });
  const notifyDispatch = sessionNotifyDispatch ?? {
    status: notifyHook.installed ? "unobserved" : "not_configured",
    lastTurnEndedAt: null,
    lastObservedAt: null,
    runtimeSurface: "unknown",
    caveat: notifyHook.installed
      ? "Codexus notify is configured in Codex CLI config, but no real turn-ended dispatch has been observed for this session state."
      : "Codexus notify is not configured in Codex CLI config.",
  } satisfies NotifyDispatchState;
  checks.push({
    id: "codexus.session_hooks",
    status: notifyDispatch.status === "observed" ? "pass" : "warn",
    summary: notifyDispatch.status === "observed"
      ? "Codexus notify hook has observed a turn-ended dispatch; statusline remains unavailable"
      : notifyHook.installed
        ? "Codexus notify hook is installed but no turn-ended dispatch has been observed; statusline remains unavailable"
        : "Codexus notify hook is not installed; statusline remains unavailable",
    details: {
      hooks: notifyDispatch.status === "observed" ? "available" : notifyHook.installed ? "configured" : "unavailable",
      notifyHook,
      notifyDispatch,
      statusline: "unavailable",
      fallback: "Use explicit `cx session checkpoint` and `cx session verify` commands.",
    },
  });

  const ok = checks.every((check) => check.status !== "fail");
  const version = readCodexusVersionInfo();
  const update = buildUpdateSummary({ currentVersion: version.version, cacheOnly: true });
  const result = { stability: "stable" as const, ok, strict, checks, warnings, configFiles: filesRead, driverProbe, update };
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = strict && !ok ? 1 : 0;
    return;
  }
  for (const check of checks) {
    console.log(`${check.status.toUpperCase().padEnd(4)} ${check.id}: ${check.summary.split("\n")[0]}`);
  }
  if (warnings.length > 0) {
    for (const warning of warnings) console.log(`WARN config: ${warning}`);
  }
  process.exitCode = ok ? 0 : 1;
}
