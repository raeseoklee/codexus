import { resolve } from "node:path";
import { loadConfig } from "../../config/loader.ts";
import type { HarnessConfig } from "../../config/schema.ts";
import { createDriver } from "../../drivers/index.ts";
import { executeRun } from "../../workflow/kernel.ts";
import { flagArray, flagBool, flagString, type ParsedArgs } from "../args.ts";

function applyFlagOverrides(config: HarnessConfig, args: ParsedArgs): HarnessConfig {
  const next = structuredClone(config) as HarnessConfig;
  const driver = flagString(args.flags, "driver");
  if (driver === "mock" || driver === "codex-exec" || driver === "codex-app-server") {
    next.driver = driver;
  }
  const sandbox = flagString(args.flags, "sandbox");
  if (sandbox === "read-only" || sandbox === "workspace-write" || sandbox === "danger-full-access") {
    next.codex.sandbox = sandbox;
  }
  const approval = flagString(args.flags, "approval");
  if (approval === "untrusted" || approval === "on-request" || approval === "never") {
    next.codex.approval = approval;
  }
  const verify = flagArray(args.flags, "verify");
  if (verify.length > 0) {
    next.verification.commands = verify;
  }
  const maxRepairs = flagString(args.flags, "max-repairs");
  if (maxRepairs !== undefined) {
    const parsed = Number(maxRepairs);
    if (!Number.isInteger(parsed) || parsed < 0) throw new Error("invalid_max_repairs");
    next.repair.maxIterations = parsed;
  }
  const maxDriverRepairs = flagString(args.flags, "max-driver-repairs");
  if (maxDriverRepairs !== undefined) {
    const parsed = Number(maxDriverRepairs);
    if (!Number.isInteger(parsed) || parsed < 0) throw new Error("invalid_max_repairs");
    next.repair.maxDriverFailureIterations = parsed;
  }
  return next;
}

function promptFromArgs(args: ParsedArgs): string {
  return args.positionals.join(" ").trim();
}

export async function runCommand(args: ParsedArgs): Promise<void> {
  const cwd = resolve(flagString(args.flags, "cwd") ?? process.cwd());
  const json = flagBool(args.flags, "json");
  const prompt = promptFromArgs(args);
  if (!prompt) throw new Error("missing_prompt");

  const loaded = loadConfig({ cwd });
  const config = applyFlagOverrides(loaded.config, args);
  if (config.driver === "codex-app-server") {
    const probe = await (await createDriver(config)).probe();
    if (!probe.available) throw new Error("unsupported_feature:codex-app-server");
  }
  const result = await executeRun({ cwd, prompt, config });

  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`${result.runId}: ${result.outcome}`);
    console.log(result.reportPath);
  }
  process.exitCode = result.outcome === "complete" ? 0 : 1;
}
