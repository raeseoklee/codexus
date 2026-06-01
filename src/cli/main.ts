#!/usr/bin/env node
import { flagString, parseArgs } from "./args.ts";
import { emitCliError, isJsonRequested } from "./errors.ts";
import { doctorCommand } from "./commands/doctor.ts";
import { runCommand } from "./commands/run.ts";
import { statusCommand } from "./commands/status.ts";
import { memoryCommand } from "./commands/memory.ts";
import { skillCommand } from "./commands/skill.ts";
import { verifyCommand } from "./commands/verify.ts";
import { replayCommand } from "./commands/replay.ts";
import { planCommand } from "./commands/plan.ts";
import { resumeCommand } from "./commands/resume.ts";
import { initCommand } from "./commands/init.ts";
import { setupCommand } from "./commands/setup.ts";
import { sessionCommand } from "./commands/session.ts";
import { runsCommand } from "./commands/runs.ts";
import { eventsCommand } from "./commands/events.ts";
import { reportCommand } from "./commands/report.ts";
import { featureCommand } from "./commands/feature.ts";
import { locksCommand } from "./commands/locks.ts";
import { schemaCommand } from "./commands/schema.ts";
import { appServerCommand } from "./commands/app-server.ts";
import { cancelCommand } from "./commands/cancel.ts";
import { slopCommand } from "./commands/slop.ts";
import { supplyChainCommand } from "./commands/supply-chain.ts";
import { versionCommand } from "./commands/version.ts";
import { architectureCommand } from "./commands/architecture.ts";
import { repoCommand } from "./commands/repo.ts";
import { autopilotCommand } from "./commands/autopilot.ts";
import { migrateLegacyHarnessRoot } from "../ledger/paths.ts";

function helpText(): string {
  return `Codexus

Usage:
  cx --version
  cx version [--json]
  cx doctor [--json] [--strict]
  cx init [--with-docs] [--json]
  cx setup codex-session [--scope user|project] [--always-on] [--enable-notify-hook|--disable-notify-hook] [--json]
  cx session status [--json]
  cx session hud [--json]
  cx session migrate [--dry-run] [--json]
  cx session checkpoint <label> [--json]
  cx session verify --verify <cmd> [--json]
  cx session verify --auto [--execute] [--json]
  cx session notify [--event <name>] [--json]
  cx session slop [--since <ref>] [--scope <glob>] [--review <path>] [--gate] [--json]
  cx session subagent record --file <result.json> [--json]
  cx session subagent attach --role <role> --claim-file <claims.json> [--json]
  cx session subagent launch --role <role> --task <task> [--json]
  cx session subagent complete [--task-id <id>] --claim <text> [--limitation <text>] [--evidence-link <link>] [--confidence low|medium|high|unknown] [--assumptions-surfaced pass|fail|unknown] [--simplest-sufficient-change pass|fail|unknown] [--surgical-scope pass|fail|unknown] [--verification-evidence-present pass|fail|unknown] [--json]
  cx session subagent status <task-id> [--json]
  cx session workers status [--json]
  cx slop check [--since <ref>] [--scope <glob>] [--review <path>] [--gate] [--json]
  cx supply-chain check [--gate] [--json]
  cx architecture check [--policy <path>] [--gate] [--json]
  cx repo map|check [--gate] [--json]
  cx repo graph build --graph-provider codexus-lite [--scope <glob>] [--json]
  cx repo graph check --graph <graph-id-or-path> [--gate] [--json]
  cx autopilot relay record --stage issue|design|plan|implementation --artifact <path> --author-file <path> --review-file <path> [--json]
  cx autopilot relay stage-gate --stage issue|design|plan|implementation --scope delta-check|full-gate --artifact <path> [--verification-status passed|failed|skipped|unknown] [--json]
  cx autopilot relay check-agreement --agreement <path> --stage-gate <path> [--verification-status passed|failed|skipped|unknown] [--gate] [--json]
  cx autopilot relay status <relay-id> [--json]
  cx run [--driver mock|codex-exec] [--verify <cmd>] [--max-driver-repairs <n>] [--run-timeout-ms <n|none>] <prompt>
  cx cancel <run-id> [--reason <reason>] [--json]
  cx plan <task> [--json]
  cx runs list [--json]
  cx status <run-id> [--json]
  cx events tail <run-id> [--lines <n>] [--json]
  cx report <run-id> [--json]
  cx locks list|inspect|clear [name] [--stale-only] [--json]
  cx schema check [--json]
  cx schema engine [--json]
  cx schema validate --type <config|state|event|memory-entry|skill|session-state|supply-chain-policy|architecture-policy|repo-graph|relay-session|stage-gate-evidence|convergence-agreement> --file <path> [--json]
  cx schema validate-run <run-id> [--json]
  cx app-server status|roundtrip|experiment [--dry-run|--live] [--json]
  cx app-server experiment --dry-run --record [--probe-process] [--supervise-fake] [--timeout-ms <n>] [--json]
  cx app-server experiment --isolated-real --record [--timeout-ms <n>] [--json]
  cx app-server experiment --live-read-only --sock <path> --record [--observe-ms <n>] [--timeout-ms <n>] [--json]
  cx resume <run-id> [follow-up] [--json]
  cx verify <run-id> [--verify <cmd>] [--json]
  cx replay parity [--json]
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
  cx skill export <skill-id> --target codex [--json]
  cx skill improve <skill-id> [--reason <reason>] [--json]
  cx skill deprecate <skill-id> [reason] [--json]
  cx skill list [--json]
  cx cron status|run-now [--dry-run] [--record] [--json]
  cx gateway status|check [--dry-run] [--record] [--json]

Public bins:
  codexus and cx are the supported command names.
`;
}

async function dispatch(args: ReturnType<typeof parseArgs>): Promise<void> {
  if (args.command === "help" || args.command === "--help" || args.flags.help === true) {
    console.log(helpText());
    return;
  }
  if (args.command === "--version" || args.command === "-v") {
    await versionCommand(args, { short: true });
    return;
  }
  if (args.command === "version") {
    await versionCommand(args);
    return;
  }
  await migrateLegacyHarnessRoot(flagString(args.flags, "cwd") ?? process.cwd());
  if (args.command === "doctor") {
    await doctorCommand(args);
    return;
  }
  if (args.command === "init") {
    await initCommand(args);
    return;
  }
  if (args.command === "setup") {
    await setupCommand(args);
    return;
  }
  if (args.command === "session") {
    await sessionCommand(args);
    return;
  }
  if (args.command === "slop") {
    await slopCommand(args);
    return;
  }
  if (args.command === "supply-chain") {
    await supplyChainCommand(args);
    return;
  }
  if (args.command === "architecture") {
    await architectureCommand(args);
    return;
  }
  if (args.command === "repo") {
    await repoCommand(args);
    return;
  }
  if (args.command === "autopilot") {
    await autopilotCommand(args);
    return;
  }
  if (args.command === "run") {
    await runCommand(args);
    return;
  }
  if (args.command === "cancel") {
    await cancelCommand(args);
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
