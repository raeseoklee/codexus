#!/usr/bin/env node
import { parseArgs } from "./args.ts";
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

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
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
  if (args.command === "adapt" && args.positionals[0] === "omx") {
    await adaptOmxCommand({ ...args, positionals: args.positionals.slice(1) });
    return;
  }
  if (args.command === "memory") {
    await memoryCommand(args);
    return;
  }
  if (args.command === "skill") {
    await skillCommand(args);
    return;
  }

  console.log(`Codexus

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
`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
