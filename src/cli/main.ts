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
import { initCommand } from "./commands/init.ts";
import { runsCommand } from "./commands/runs.ts";
import { eventsCommand } from "./commands/events.ts";
import { reportCommand } from "./commands/report.ts";
import { featureCommand } from "./commands/feature.ts";
import { locksCommand } from "./commands/locks.ts";
import { schemaCommand } from "./commands/schema.ts";
import { appServerCommand } from "./commands/app-server.ts";

function helpText(): string {
  return `Codexus

Usage:
  cx doctor [--json]
  cx init [--with-docs] [--json]
  cx run [--driver mock|codex-exec] [--verify <cmd>] [--max-driver-repairs <n>] <prompt>
  cx plan [--omx] <task> [--json]
  cx runs list [--json]
  cx status <run-id> [--json]
  cx events tail <run-id> [--lines <n>] [--json]
  cx report <run-id> [--json]
  cx locks list|inspect|clear [name] [--stale-only] [--json]
  cx schema check [--json]
  cx schema validate --type <config|state|event|memory-entry|skill> --file <path> [--json]
  cx schema validate-run <run-id> [--json]
  cx app-server status|roundtrip|experiment [--dry-run|--live] [--json]
  cx app-server experiment --dry-run --record [--timeout-ms <n>] [--json]
  cx resume <run-id> [follow-up] [--json]
  cx verify <run-id> [--verify <cmd>] [--json]
  cx replay skill <skill-id> [--with-model-replay] [--allow-live-model-replay] [--model-budget <n>] [--json]
  cx replay <path-to-replay.json> [--json]
  cx memory search <query> [--json]
  cx memory add --kind <kind> <text> [--json]
  cx memory list [--json]
  cx memory review [--json]
  cx memory curate [--json]
  cx memory prune --before <iso-date> [--json]
  cx skill propose <run-id> [--json]
  cx skill review <skill-id> [--json]
  cx skill promote <skill-id> [--json]
  cx skill export <skill-id> --target codex|omx [--json]
  cx skill improve <skill-id> [--reason <reason>] [--json]
  cx skill deprecate <skill-id> [reason] [--json]
  cx skill list [--json]
  cx adapt omx status [--json]
  cx adapt omx retrieve --task <task> [--json]
  cx adapt omx context --task <task> [--approve] [--json]
  cx cron status|run-now [--dry-run] [--record] [--json]
  cx gateway status|check [--dry-run] [--record] [--json]

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
  if (args.command === "init") {
    await initCommand(args);
    return;
  }
  if (args.command === "run") {
    await runCommand(args);
    return;
  }
  if (args.command === "runs") {
    await runsCommand(args);
    return;
  }
  if (args.command === "status") {
    await statusCommand(args);
    return;
  }
  if (args.command === "events") {
    await eventsCommand(args);
    return;
  }
  if (args.command === "report") {
    await reportCommand(args);
    return;
  }
  if (args.command === "locks") {
    await locksCommand(args);
    return;
  }
  if (args.command === "schema") {
    await schemaCommand(args);
    return;
  }
  if (args.command === "app-server") {
    await appServerCommand(args);
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
  if (args.command === "cron") {
    await featureCommand(args, "cron");
    return;
  }
  if (args.command === "gateway") {
    await featureCommand(args, "gateway");
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
