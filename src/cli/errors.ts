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
    case "unsupported_feature":
      return `Unsupported feature${target ? `: ${target}` : ""}.`;
    case "unexpected_argument":
      return `Unexpected argument${target ? `: ${target}` : ""}.`;
    case "unsupported_skill_command":
      return `Unsupported skill command${target ? `: ${target}` : ""}.`;
    case "unsupported_memory_command":
      return `Unsupported memory command${target ? `: ${target}` : ""}.`;
    case "unsupported_runs_command":
      return `Unsupported runs command${target ? `: ${target}` : ""}.`;
    case "unsupported_events_command":
      return `Unsupported events command${target ? `: ${target}` : ""}.`;
    case "unsupported_locks_command":
      return `Unsupported locks command${target ? `: ${target}` : ""}.`;
    case "unsupported_schema_command":
      return `Unsupported schema command${target ? `: ${target}` : ""}.`;
    case "unsupported_schema_type":
      return `Unsupported schema validation type${target ? `: ${target}` : ""}.`;
    case "unsupported_app_server_command":
      return `Unsupported app-server command${target ? `: ${target}` : ""}.`;
    case "unsupported_setup_command":
      return `Unsupported setup command${target ? `: ${target}` : ""}.`;
    case "unsupported_session_command":
      return `Unsupported session command${target ? `: ${target}` : ""}.`;
    case "unsupported_session_subagent_command":
      return `Unsupported session subagent command${target ? `: ${target}` : ""}.`;
    case "unsupported_slop_command":
      return `Unsupported slop command${target ? `: ${target}` : ""}.`;
    case "invalid_session_setup_scope":
      return `Invalid Codex-session setup scope${target ? `: ${target}` : ""}.`;
    case "conflicting_notify_hook_flags":
      return "Cannot enable and disable the Codex notify hook in the same command.";
    case "conflicting_always_on_disable_notify_hook":
      return "Cannot install the always-on overlay while disabling the Codex notify hook.";
    case "missing_session_checkpoint_label":
      return "Missing session checkpoint label.";
    case "missing_session_verification_command":
      return "Missing session verification command.";
    case "ambiguous_session_verification_command":
      return "Multiple verification candidates were detected; choose one with --verify \"<cmd>\".";
    case "session_state_corrupt":
      return `Codexus session state is corrupt${target ? `: ${target}` : ""}.`;
    case "missing_schema_file":
      return "Missing schema validation file.";
    case "json_parse_failed":
      return `JSON file could not be parsed${target ? `: ${target}` : ""}.`;
    case "replay_schema_invalid":
      return `Replay schema is invalid${target ? `: ${target}` : ""}.`;
    case "invalid_event_tail_lines":
      return "Invalid event tail line count.";
    case "invalid_timeout_ms":
      return "Invalid timeout milliseconds.";
    case "invalid_observe_ms":
      return "Invalid observe milliseconds.";
    case "missing_memory_kind":
      return "Missing memory kind.";
    case "missing_memory_text":
      return "Missing memory text.";
    case "missing_memory_id":
      return "Missing memory id.";
    case "missing_lock_name":
      return "Missing lock name.";
    case "missing_prompt":
      return "Missing run prompt.";
    case "missing_app_server_socket":
      return "Missing app-server socket path.";
    case "missing_subagent_file":
      return "Missing subagent evidence file.";
    case "missing_subagent_id":
      return "Missing subagent id.";
    case "subagent_not_found":
      return `Subagent artifact not found${target ? `: ${target}` : ""}.`;
    case "subagent_artifact_invalid":
      return `Subagent artifact is invalid${target ? `: ${target}` : ""}.`;
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
    case "invalid_memory_prune_window":
      return "Invalid memory prune window.";
    case "invalid_skill_export_target":
      return `Invalid skill export target${target ? `: ${target}` : ""}.`;
    case "skill_not_active":
      return `Skill is not active${target ? `: ${target}` : ""}.`;
    case "skill_export_validation_failed":
      return `Skill export validation failed${target ? `: ${target}` : ""}.`;
    case "skill_export_target_exists":
      return `Skill export target exists${target ? `: ${target}` : ""}.`;
    case "lock_unavailable":
      return `Lock is already held${target ? `: ${target}` : ""}.`;
    case "lock_not_found":
      return `Lock not found${target ? `: ${target}` : ""}.`;
    case "lock_not_stale":
      return `Lock is not stale${target ? `: ${target}` : ""}.`;
    case "state_corrupt":
      return `Run state is corrupt${target ? `: ${target}` : ""}.`;
    case "config_parse_failed":
      return `Config file could not be parsed${target ? `: ${target}` : ""}.`;
    case "schema_validation_failed":
      return `Schema validation failed${target ? `: ${target}` : ""}.`;
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
    case "unsupported_feature":
      return "Use `cx doctor --json` to inspect supported local capabilities before enabling this feature.";
    case "unexpected_argument":
      return "Run the command with `--help` or check `cx --help` for supported arguments.";
    case "unsupported_skill_command":
      return "Run `cx skill list --json`, `cx skill review <skill-id> --json`, `cx skill improve <skill-id> --json`, or another supported skill subcommand.";
    case "unsupported_memory_command":
      return "Run `cx memory search`, `cx memory list`, `cx memory add`, `cx memory review`, `cx memory curate`, or `cx memory prune`.";
    case "unsupported_runs_command":
      return "Run `cx runs list --json`.";
    case "unsupported_events_command":
      return "Run `cx events tail <run-id> --json`.";
    case "unsupported_locks_command":
      return "Run `cx locks list`, `cx locks inspect <name>`, or `cx locks clear <name> --stale-only`.";
    case "unsupported_schema_command":
      return "Run `cx schema check --json`, `cx schema validate --type <type> --file <path> --json`, or `cx schema validate-run <run-id> --json`.";
    case "unsupported_schema_type":
      return "Use `--type config|state|event|memory-entry|skill|session-state`.";
    case "unsupported_app_server_command":
      return "Run `cx app-server status --json` or `cx app-server roundtrip --dry-run --json`.";
    case "unsupported_setup_command":
      return "Run `cx setup codex-session --scope project --json`.";
    case "unsupported_session_command":
      return "Run `cx session status --json`, `cx session migrate --json`, `cx session checkpoint <label> --json`, `cx session verify --verify <cmd> --json`, `cx session slop --json`, or `cx session notify --event <name> --json`.";
    case "unsupported_session_subagent_command":
      return "Run `cx session subagent record --file <result.json> --json`, `cx session subagent attach --role <role> --claim-file <claims.json> --json`, or `cx session subagent status <task-id> --json`.";
    case "unsupported_slop_command":
      return "Run `cx slop check --json`.";
    case "invalid_session_setup_scope":
      return "Use `--scope project` or `--scope user`.";
    case "missing_session_checkpoint_label":
      return "Pass a short label after `cx session checkpoint`.";
    case "missing_session_verification_command":
      return "Pass at least one `--verify <cmd>` argument.";
    case "session_state_corrupt":
      return "Inspect `.codexus/session/state.json` before continuing.";
    case "missing_schema_file":
      return "Pass `--file <path>` with `cx schema validate`.";
    case "json_parse_failed":
      return "Fix the JSON syntax in the reported file and rerun the command.";
    case "replay_schema_invalid":
      return "Fix the replay fixture shape before using it for skill review or promotion.";
    case "missing_prompt":
      return "Pass the prompt after `cx run`, for example `cx run --json \"inspect the project\"`.";
    case "missing_run_id":
      return "Pass a run id from an existing `.codexus/runs/<run-id>` ledger.";
    case "missing_skill_id":
      return "Pass the storage id of a proposed skill, for example `skill_document-parser`.";
    case "missing_memory_query":
      return "Pass a bounded query after `cx memory search`.";
    case "missing_memory_kind":
      return "Pass `--kind repo_fact|user_preference|workflow_lesson|verification_pattern|failure_pattern|tooling_note`.";
    case "missing_memory_text":
      return "Pass memory text after the memory command.";
    case "missing_memory_id":
      return "Pass the memory id to remove or inspect.";
    case "missing_replay_target":
      return "Pass `skill <skill-id>` or a path to `replay.json`.";
    case "invalid_max_repairs":
      return "Use a non-negative integer for `--max-repairs` or `--max-driver-repairs`.";
    case "invalid_memory_limit":
      return "Use a positive integer for `--limit`.";
    case "invalid_memory_prune_window":
      return "Use `--before <iso-date>` or `--older-than-days <positive integer>`.";
    case "invalid_event_tail_lines":
      return "Use a positive integer for `--lines`.";
    case "invalid_timeout_ms":
      return "Use a positive integer for `--timeout-ms`.";
    case "invalid_observe_ms":
      return "Use a positive integer for `--observe-ms` that is less than or equal to `--timeout-ms`.";
    case "missing_app_server_socket":
      return "Pass `--sock <path>` with `cx app-server experiment --live-read-only`.";
    case "missing_subagent_file":
      return "Pass `--file <result.json>` or `--claim-file <claims.json>` with `cx session subagent`.";
    case "missing_subagent_id":
    case "subagent_not_found":
      return "Run `cx session status --json` to list linked subagent artifacts.";
    case "invalid_skill_export_target":
      return "Use `--target codex` or `--target omx`.";
    case "skill_not_active":
      return "Promote the skill first with `cx skill promote <skill-id> --json`.";
    case "skill_export_validation_failed":
      return "Review the generated skill metadata before exporting it.";
    case "skill_export_target_exists":
      return "Use `--force` to overwrite a previous generated export.";
    case "lock_unavailable":
      return "Wait for the active Codexus operation to finish, then retry.";
    case "lock_not_found":
      return "Run `cx locks list --json` to inspect current locks.";
    case "lock_not_stale":
      return "Use `cx locks inspect <name> --json`; clear active locks only after verifying no operation is running.";
    case "state_corrupt":
      return "Inspect the run ledger state file or restore it from version control/backups.";
    case "config_parse_failed":
      return "Fix the JSON syntax in the reported config file and rerun the command.";
    case "schema_validation_failed":
      return "Inspect the reported durable record and run `cx schema check --json` before retrying.";
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
