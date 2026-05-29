import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { access, readFile, readdir } from "node:fs/promises";
import { constants, existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { flagBool, flagString, type ParsedArgs } from "../args.ts";
import { loadConfig } from "../../config/loader.ts";
import { harnessRoot } from "../../ledger/paths.ts";
import { createDriver } from "../../drivers/index.ts";
import type { DriverProbe } from "../../drivers/contract.ts";
import { trimmedProcessOutput } from "../../util/process-output.ts";

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
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
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
    status: Number(process.versions.node.split(".")[0]) >= 26 ? "pass" : "fail",
    summary: `Node ${process.version}`,
  });
  checks.push(commandCheck("codex.version", config.codex.command, ["--version"], "codex available"));
  checks.push(commandCheck("codex.auth", config.codex.command, ["login", "status"], "codex login status ok"));
  checks.push(commandCheck("codex.exec_help", config.codex.command, ["exec", "--help"], "codex exec help ok"));
  checks.push(commandCheck("codex.app_server_help", config.codex.command, ["app-server", "--help"], "codex app-server help ok"));
  checks.push(commandCheck("codex.features", config.codex.command, ["features", "list"], "codex features listed", "warn"));
  checks.push(await codexusSkillInstallCheck());
  checks.push(commandCheck("omx.version", "omx", ["--version"], "omx available", "warn"));
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

  const ok = checks.every((check) => check.status !== "fail");
  const result = { ok, strict, checks, warnings, configFiles: filesRead, driverProbe };
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
