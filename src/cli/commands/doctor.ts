import { spawnSync } from "node:child_process";
import { access, mkdir } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve } from "node:path";
import { flagBool, flagString, type ParsedArgs } from "../args.ts";
import { loadConfig } from "../../config/loader.ts";
import { harnessRoot } from "../../ledger/paths.ts";
import { createDriver } from "../../drivers/index.ts";
import type { DriverProbe } from "../../drivers/contract.ts";

interface Check {
  id: string;
  status: "pass" | "warn" | "fail";
  summary: string;
  details?: Record<string, unknown>;
}

function run(command: string, args: string[]): { ok: boolean; stdout: string; stderr: string; status: number | null } {
  const result = spawnSync(command, args, { encoding: "utf8" });
  return {
    ok: result.status === 0,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
    status: result.status,
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
    summary: result.stderr || `${command} ${args.join(" ")} failed`,
    details: { status: result.status },
  };
}

export async function doctorCommand(args: ParsedArgs): Promise<void> {
  const cwd = resolve(flagString(args.flags, "cwd") ?? process.cwd());
  const json = flagBool(args.flags, "json");
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
  checks.push(commandCheck("omx.version", "omx", ["--version"], "omx available", "warn"));
  checks.push(commandCheck("git.root", "git", ["-C", cwd, "rev-parse", "--show-toplevel"], "git root detected", "warn"));
  checks.push(commandCheck("tmux.version", "tmux", ["-V"], "tmux available", "warn"));

  try {
    driverProbe = await (await createDriver(config)).probe();
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
    await mkdir(root, { recursive: true });
    await access(root, constants.W_OK);
    checks.push({ id: "harness.state_root", status: "pass", summary: root });
  } catch (error) {
    checks.push({
      id: "harness.state_root",
      status: "fail",
      summary: error instanceof Error ? error.message : String(error),
    });
  }

  const ok = checks.every((check) => check.status !== "fail");
  const result = { ok, checks, warnings, configFiles: filesRead, driverProbe };
  if (json) {
    console.log(JSON.stringify(result, null, 2));
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
