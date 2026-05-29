#!/usr/bin/env node
import { parseArgs } from "./args.ts";
import { emitCliError, isJsonRequested } from "./errors.ts";
import { doctorCommand } from "./commands/doctor.ts";
import { runCommand } from "./commands/run.ts";
import { statusCommand } from "./commands/status.ts";
import { adaptOmxCommand } from "./commands/adapt-omx.ts";
import { memoryCommand } from "./commands/memory.ts";
import { skillCommand } from "./commands/skill.ts";
import { verifyCommand } from "./commands/verify.ts";
import { replayCommand } from "./commands/replay.ts";
import { planCommand } from "./commands/plan.ts";
import { resumeCommand } from "./commands/resume.ts";

function helpText(): string {
  return `Codexus

Usage:
  cx doctor [--json]
  cx run [--driver mock|codex-exec] [--verify <cmd>] <prompt>
  cx plan [--omx] <task> [--json]
  cx status <run-id> [--json]
  cx resume <run-id> [follow-up] [--json]
  cx verify <run-id> [--verify <cmd>] [--json]
  cx replay skill <skill-id> [--json]
  cx replay <path-to-replay.json> [--json]
  cx memory search <query> [--json]
  cx skill propose <run-id> [--json]
  cx skill review <skill-id> [--json]
  cx skill promote <skill-id> [--json]
  cx skill deprecate <skill-id> [reason] [--json]
  cx skill list [--json]
  cx adapt omx status [--json]

Compatibility:
  chx remains a temporary alias during the Codexus migration.
`;
}

async function dispatch(args: ReturnType<typeof parseArgs>): Promise<void> {
  if (args.command === "help" || args.command === "--help" || args.flags.help === true) {
    console.log(helpText());
    return;
  }
  if (args.command === "doctor") {
    await doctorCommand(args);
    return;
  }
  if (args.command === "run") {
    await runCommand(args);
    return;
  }
  if (args.command === "status") {
    await statusCommand(args);
    return;
  }
  if (args.command === "resume") {
    await resumeCommand(args);
    return;
  }
  if (args.command === "verify") {
    await verifyCommand(args);
    return;
  }
  if (args.command === "replay") {
    await replayCommand(args);
    return;
  }
  if (args.command === "plan") {
    await planCommand(args);
    return;
  }
  if (args.command === "adapt") {
    if (args.positionals[0] === "omx") {
      await adaptOmxCommand({ ...args, positionals: args.positionals.slice(1) });
      return;
    }
    throw new Error(`unsupported_adapt_target:${args.positionals[0] ?? "missing"}`);
  }
  if (args.command === "memory") {
    await memoryCommand(args);
    return;
  }
  if (args.command === "skill") {
    await skillCommand(args);
    return;
  }

  throw new Error(`unknown_command:${args.command}`);
}

async function main(argv = process.argv.slice(2)): Promise<void> {
  let args: ReturnType<typeof parseArgs> | undefined;
  try {
    args = parseArgs(argv);
    await dispatch(args);
    return;
  } catch (error) {
    emitCliError(error, {
      json: isJsonRequested(argv),
      command: args?.command,
    });
    process.exitCode = 1;
  }
}

await main();
