import type { JsonValue } from "../types.ts";

export interface CliErrorEnvelope {
  schemaVersion: 1;
  type: "error";
  code: string;
  message: string;
  hint: string | null;
  command?: string;
  details?: Record<string, JsonValue>;
  exitCode: number;
}

interface ParsedCliError {
  code: string;
  target?: string;
  raw: string;
}

function rawMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function parseCliError(error: unknown): ParsedCliError {
  const raw = rawMessage(error);
  const separator = raw.indexOf(":");
  if (separator === -1) return { code: raw || "unknown_error", raw };
  const code = raw.slice(0, separator) || "unknown_error";
  const target = raw.slice(separator + 1);
  return { code, target: target || undefined, raw };
}

function messageFor({ code, target, raw }: ParsedCliError): string {
  switch (code) {
    case "unknown_command":
      return `Unknown command${target ? `: ${target}` : ""}.`;
    case "unsupported_adapt_target":
      return `Unsupported adapt target${target ? `: ${target}` : ""}.`;
    case "unsupported_adapt_omx_command":
      return `Unsupported OMX adapter command${target ? `: ${target}` : ""}.`;
    case "unsupported_skill_command":
      return `Unsupported skill command${target ? `: ${target}` : ""}.`;
    case "missing_prompt":
      return "Missing run prompt.";
    case "missing_run_id":
      return "Missing run id.";
    case "missing_skill_id":
      return "Missing skill id.";
    case "missing_memory_query":
      return "Missing memory search query.";
    case "missing_replay_target":
      return "Missing replay target.";
    case "invalid_max_repairs":
      return "Invalid --max-repairs value.";
    case "invalid_memory_limit":
      return "Invalid memory limit.";
    case "run_not_found":
      return `Run not found${target ? `: ${target}` : ""}.`;
    case "skill_not_found":
    case "skill_not_found_for_replay":
      return `Skill not found${target ? `: ${target}` : ""}.`;
    case "experience_not_found":
      return `Experience record not found${target ? `: ${target}` : ""}.`;
    case "promotion_blocked":
      return `Skill promotion is blocked${target ? `: ${target}` : ""}.`;
    default:
      return raw || "Unknown CLI error.";
  }
}

function hintFor({ code }: ParsedCliError): string | null {
  switch (code) {
    case "unknown_command":
      return "Run `cx --help` to see supported commands.";
    case "unsupported_adapt_target":
    case "unsupported_adapt_omx_command":
      return "Run `cx adapt omx status --json` for the currently supported adapter surface.";
    case "unsupported_skill_command":
      return "Run `cx skill list --json`, `cx skill review <skill-id> --json`, or another supported skill subcommand.";
    case "missing_prompt":
      return "Pass the prompt after `cx run`, for example `cx run --json \"inspect the project\"`.";
    case "missing_run_id":
      return "Pass a run id from an existing `.codex-harness/runs/<run-id>` ledger.";
    case "missing_skill_id":
      return "Pass the storage id of a proposed skill, for example `skill_document-parser`.";
    case "missing_memory_query":
      return "Pass a bounded query after `cx memory search`.";
    case "missing_replay_target":
      return "Pass `skill <skill-id>` or a path to `replay.json`.";
    case "invalid_max_repairs":
      return "Use a non-negative integer for `--max-repairs`.";
    case "invalid_memory_limit":
      return "Use a positive integer for `--limit`.";
    case "run_not_found":
      return "Check the run id and workspace, then rerun the command.";
    case "skill_not_found":
    case "skill_not_found_for_replay":
      return "Check `cx skill list --json` for available proposed and active skill records.";
    case "experience_not_found":
      return "Run `cx status <run-id> --json` to confirm the ledger includes extracted experience.";
    case "promotion_blocked":
      return "Run `cx skill review <skill-id> --json` and fix each blocker before promotion.";
    default:
      return null;
  }
}

export function isJsonRequested(argv: string[]): boolean {
  return argv.includes("--json");
}

export function buildCliErrorEnvelope(error: unknown, options: {
  command?: string;
  exitCode?: number;
} = {}): CliErrorEnvelope {
  const parsed = parseCliError(error);
  return {
    schemaVersion: 1,
    type: "error",
    code: parsed.code,
    message: messageFor(parsed),
    hint: hintFor(parsed),
    ...(options.command ? { command: options.command } : {}),
    ...(parsed.target ? { details: { target: parsed.target } } : {}),
    exitCode: options.exitCode ?? 1,
  };
}

export function emitCliError(error: unknown, options: {
  json: boolean;
  command?: string;
  exitCode?: number;
}): void {
  const envelope = buildCliErrorEnvelope(error, options);
  if (options.json) {
    console.log(JSON.stringify(envelope, null, 2));
    return;
  }
  console.error(envelope.hint ? `${envelope.message}\nHint: ${envelope.hint}` : envelope.message);
}
