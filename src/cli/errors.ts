import type { JsonValue } from "../types.ts";

export interface CliErrorEnvelope {
  schemaVersion: 1;
  stability: "stable";
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
    case "unsupported_app_command":
      return `Unsupported app command${target ? `: ${target}` : ""}.`;
    case "unsupported_app_instance_command":
      return `Unsupported app instance command${target ? `: ${target}` : ""}.`;
    case "unsupported_setup_command":
      return `Unsupported setup command${target ? `: ${target}` : ""}.`;
    case "unsupported_session_command":
      return `Unsupported session command${target ? `: ${target}` : ""}.`;
    case "unsupported_session_subagent_command":
      return `Unsupported session subagent command${target ? `: ${target}` : ""}.`;
    case "unsupported_session_decision_command":
      return `Unsupported session decision command${target ? `: ${target}` : ""}.`;
    case "unsupported_session_workers_command":
      return `Unsupported session workers command${target ? `: ${target}` : ""}.`;
    case "unsupported_slop_command":
      return `Unsupported slop command${target ? `: ${target}` : ""}.`;
    case "unsupported_lsp_command":
      return `Unsupported LSP command${target ? `: ${target}` : ""}.`;
    case "unsupported_supply_chain_command":
      return `Unsupported supply-chain command${target ? `: ${target}` : ""}.`;
    case "unsupported_policy_command":
      return `Unsupported policy command${target ? `: ${target}` : ""}.`;
    case "unsupported_contract_command":
      return `Unsupported contract command${target ? `: ${target}` : ""}.`;
    case "unsupported_contract_target":
      return `Unsupported contract target${target ? `: ${target}` : ""}.`;
    case "unsupported_update_command":
      return `Unsupported update command${target ? `: ${target}` : ""}.`;
    case "unsupported_plugin_command":
      return `Unsupported plugin command${target ? `: ${target}` : ""}.`;
    case "unsupported_wiki_command":
      return `Unsupported wiki command${target ? `: ${target}` : ""}.`;
    case "unsupported_wiki_build_mode":
      return `Unsupported wiki build mode${target ? `: ${target}` : ""}.`;
    case "unsupported_autopilot_command":
      return `Unsupported autopilot command${target ? `: ${target}` : ""}.`;
    case "unsupported_autopilot_contract_command":
      return `Unsupported autopilot contract command${target ? `: ${target}` : ""}.`;
    case "autopilot_run_deferred":
      return "Autopilot run is still deferred behind capability and policy start gates.";
    case "invalid_autopilot_preset":
      return `Invalid autopilot preset${target ? `: ${target}` : ""}.`;
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
    case "missing_decision_summary":
      return "Missing decision summary.";
    case "missing_decision_id":
      return "Missing decision id.";
    case "invalid_decision_kind":
      return `Invalid decision kind${target ? `: ${target}` : ""}.`;
    case "invalid_decision_id":
      return `Invalid decision id${target ? `: ${target}` : ""}.`;
    case "invalid_decision_evidence_link":
      return `Invalid decision evidence link${target ? `: ${target}` : ""}.`;
    case "decision_not_found":
      return `Decision artifact not found${target ? `: ${target}` : ""}.`;
    case "decision_artifact_invalid":
      return `Decision artifact is invalid${target ? `: ${target}` : ""}.`;
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
    case "missing_autopilot_from":
      return "Missing autopilot source document.";
    case "missing_autopilot_contract_file":
      return "Missing autopilot contract file.";
    case "missing_autopilot_approved_by":
      return "Missing autopilot approver identity.";
    case "missing_automation_task":
      return "Missing automation task prompt.";
    case "missing_wiki_topic":
      return "Missing wiki context topic.";
    case "invalid_wiki_budget":
      return "Invalid wiki context budget.";
    case "wiki_manifest_missing":
      return "Wiki manifest is missing.";
    case "wiki_manifest_invalid":
      return "Wiki manifest is invalid.";
    case "autopilot_source_doc_missing":
      return `Autopilot source document not found${target ? `: ${target}` : ""}.`;
    case "autopilot_source_doc_outside_workspace":
      return `Autopilot source document is outside the workspace${target ? `: ${target}` : ""}.`;
    case "autopilot_contract_invalid":
      return `Autopilot contract is invalid${target ? `: ${target}` : ""}.`;
    case "autopilot_contract_not_draft":
      return `Autopilot contract is not a draft${target ? `: ${target}` : ""}.`;
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
    case "missing_app_instance_descriptor":
      return "Missing app instance descriptor.";
    case "missing_app_instance_profile":
      return "Missing app instance profile.";
    case "missing_app_instance_worktree":
      return "Missing app instance worktree.";
    case "missing_app_instance_id":
      return "Missing app instance id.";
    case "invalid_app_instance_port":
      return "Invalid app instance port.";
    case "invalid_app_instance_worktree":
      return `Invalid app instance worktree${target ? `: ${target}` : ""}.`;
    case "invalid_app_instance_log_tail":
      return "Invalid app instance log tail.";
    case "invalid_app_instance_observation_kind":
      return `Invalid app instance observation kind${target ? `: ${target}` : ""}.`;
    case "invalid_app_instance_observation_status":
      return `Invalid app instance observation status${target ? `: ${target}` : ""}.`;
    case "missing_app_instance_observation_source":
      return "Missing app instance observation source.";
    case "app_instance_observation_evidence_missing":
      return `App instance observation evidence file not found${target ? `: ${target}` : ""}.`;
    case "invalid_app_instance_probe_url":
      return `Invalid app instance probe URL${target ? `: ${target}` : ""}.`;
    case "invalid_app_instance_probe_timeout":
      return "Invalid app instance probe timeout.";
    case "app_instance_descriptor_invalid":
      return `App instance descriptor is invalid${target ? `: ${target}` : ""}.`;
    case "app_instance_profile_not_found":
      return `App instance profile not found${target ? `: ${target}` : ""}.`;
    case "app_instance_profile_cwd_outside_worktree":
      return "App instance profile cwd resolves outside the selected worktree.";
    case "app_instance_not_found":
      return `App instance not found${target ? `: ${target}` : ""}.`;
    case "app_instance_artifact_invalid":
      return `App instance artifact is invalid${target ? `: ${target}` : ""}.`;
    case "app_instance_fixed_port_required":
      return "App instance profile requires a fixed port, but no port was resolved.";
    case "app_instance_port_unavailable":
      return `App instance port is unavailable${target ? `: ${target}` : ""}.`;
    case "app_instance_runner_missing":
      return "App instance runner script is missing from this installation.";
    case "app_instance_profile_already_running":
      return `An app instance for this profile is already running${target ? `: ${target}` : ""}.`;
    case "app_instance_start_timeout":
      return "App instance start timed out before the runner reported readiness.";
    case "app_instance_start_failed":
      return `App instance start failed${target ? `: ${target}` : ""}.`;
    case "missing_subagent_file":
      return "Missing subagent evidence file.";
    case "missing_subagent_id":
      return "Missing subagent id.";
    case "missing_subagent_task":
      return "Missing subagent task.";
    case "missing_subagent_claim":
      return "Missing subagent claim.";
    case "invalid_subagent_confidence":
      return `Invalid subagent claim confidence${target ? `: ${target}` : ""}.`;
    case "invalid_subagent_checklist_status":
      return `Invalid subagent behavior checklist status${target ? `: ${target}` : ""}.`;
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
      return "Run `cx schema check --json`, `cx schema engine --json`, `cx schema validate --type <type> --file <path> --json`, or `cx schema validate-run <run-id> --json`.";
    case "unsupported_schema_type":
      return "Use `--type config|state|event|memory-entry|skill|session-state|supply-chain-policy|architecture-policy|autopilot-contract|wiki-manifest|repo-graph|relay-session|stage-gate-evidence|convergence-agreement|decision|app-instance-descriptor|app-instance|app-instance-observation|automation-dispatch|subagent-result|subagent-launch-contract|app-server-discovery|app-server-stage-a|app-server-stage-b|app-server-stdio-proof`.";
    case "unsupported_app_server_command":
      return "Run `cx app-server status --json` or `cx app-server roundtrip --dry-run --json`.";
    case "unsupported_app_command":
      return "Run `cx app instance status --json`.";
    case "unsupported_app_instance_command":
      return "Run `cx app instance profile list --json`, `cx app instance status --json`, `cx app instance logs --instance-id <id> --json`, or `cx app instance start --profile <name> --worktree <path> --dry-run --json`.";
    case "unsupported_setup_command":
      return "Run `cx setup codex-session --scope project --json`.";
    case "unsupported_session_command":
      return "Run `cx session status --json`, `cx session hud --json`, `cx session migrate --json`, `cx session checkpoint <label> --json`, `cx session verify --verify <cmd> --json`, `cx session decision list --json`, `cx session loop --json`, `cx session slop --json`, or `cx session notify --event <name> --json`.";
    case "unsupported_session_subagent_command":
      return "Codexus does not directly spawn native subagents from the CLI; run `cx session subagent launch --role <role> --task <task> --json` to record a capability-gated launcher contract, `cx session subagent complete --task-id <id> --claim <text> --json` to record the result of a native subagent used in the current Codex session, `cx session subagent record --file <result.json> --json`, `cx session subagent attach --role <role> --claim-file <claims.json> --json`, or `cx session subagent status <task-id> --json`.";
    case "unsupported_session_decision_command":
      return "Run `cx session decision record --summary <text> --json`, `cx session decision list --json`, or `cx session decision status <decision-id> --json`.";
    case "unsupported_session_workers_command":
      return "Run `cx session workers status --json`.";
    case "unsupported_slop_command":
      return "Run `cx slop check --json` or `cx slop check --gate --json`.";
    case "unsupported_lsp_command":
      return "Run `cx lsp status --json` to detect project LSP candidates or `cx lsp check --gate --json` to run explicit project diagnostics.";
    case "unsupported_supply_chain_command":
      return "Run `cx supply-chain check --json` or `cx supply-chain check --gate --json`.";
    case "unsupported_policy_command":
      return "Run `cx policy catalog check --json`.";
    case "unsupported_contract_command":
      return "Run `cx contract check --target 0.2.0 --json` or add `--gate` to fail until a stable promotion is ready.";
    case "unsupported_contract_target":
      return "Only `--target 0.2.0` is supported by the current contract readiness audit.";
    case "unsupported_update_command":
      return "Run `cx update check --json`.";
    case "unsupported_wiki_command":
      return "Run `cx wiki map --json`, `cx wiki build --mode deterministic --json`, `cx wiki check --gate --json`, or `cx wiki context --topic <name> --json`.";
    case "unsupported_wiki_build_mode":
      return "Use `--mode deterministic`; advisory wiki synthesis remains deferred.";
    case "unsupported_autopilot_command":
      return "Run `cx autopilot presets list --json`, `cx autopilot plan --from <path> --preset <name> --json`, `cx autopilot contract validate <path> --json`, `cx autopilot contract approve <path> --approved-by <name> --json`, `cx autopilot contract scope-check <path> --json`, or `cx autopilot relay ...`.";
    case "unsupported_autopilot_contract_command":
      return "Run `cx autopilot contract validate <path> --json`, `cx autopilot contract approve <path> --approved-by <name> --json`, or `cx autopilot contract scope-check <path> --json`.";
    case "autopilot_run_deferred":
      return "Use `cx autopilot plan` and `cx autopilot contract scope-check` first; live `autopilot run` stays blocked until capability and scope gates are promoted.";
    case "invalid_session_setup_scope":
      return "Use `--scope project` or `--scope user`.";
    case "missing_session_checkpoint_label":
      return "Pass a short label after `cx session checkpoint`.";
    case "missing_session_verification_command":
      return "Pass at least one `--verify <cmd>` argument.";
    case "missing_decision_summary":
      return "Pass `--summary <text>` or a positional summary after `cx session decision record`.";
    case "missing_decision_id":
      return "Pass a decision id from `.codexus/session/decisions/<decision-id>`.";
    case "invalid_decision_kind":
      return "Use `--kind decision|boundary|rejected_alternative|approval|note`.";
    case "invalid_decision_evidence_link":
      return "Decision evidence links must be relative workspace paths, not URLs, absolute paths, or parent-directory paths.";
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
    case "missing_autopilot_from":
      return "Pass at least one `--from <path>` source document.";
    case "missing_autopilot_contract_file":
      return "Pass an autopilot contract path, for example `cx autopilot contract validate .codexus/autopilot/drafts/<id>.json --json`.";
    case "missing_autopilot_approved_by":
      return "Pass `--approved-by <name>` when approving a draft contract.";
    case "missing_automation_task":
      return "Pass `--task <text>` when running live `cx cron run-now` or `cx gateway check`.";
    case "invalid_autopilot_preset":
      return "Use `--preset manual|guided|contracted|gated-auto|extended-auto`.";
    case "missing_wiki_topic":
      return "Pass `--topic <name>` with `cx wiki context`.";
    case "invalid_wiki_budget":
      return "Use a positive integer for `--budget`.";
    case "wiki_manifest_missing":
      return "Run `cx wiki build --mode deterministic --json` before requesting wiki context or checks.";
    case "wiki_manifest_invalid":
      return "Rebuild the wiki so the manifest matches the current schema and page set.";
    case "autopilot_source_doc_missing":
      return "Pass an existing workspace document path with `--from`.";
    case "autopilot_source_doc_outside_workspace":
      return "Keep autopilot source documents inside the current workspace so scope and provenance stay reproducible.";
    case "autopilot_contract_invalid":
      return "Run `cx autopilot contract validate <path> --json` to inspect contract errors before approval or scope checks.";
    case "autopilot_contract_not_draft":
      return "Approve only draft contracts, or regenerate a fresh draft with `cx autopilot plan`.";
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
    case "missing_app_instance_descriptor":
      return "Pass `--descriptor <path>` or add `codexus.app-instances.json` / package.json#codexus.appInstances.";
    case "missing_app_instance_profile":
      return "Pass `--profile <name>` from `cx app instance profile list --json`.";
    case "missing_app_instance_worktree":
      return "Pass `--worktree <path>` so the dry-run can bind evidence to one worktree.";
    case "missing_app_instance_id":
      return "Pass `--instance-id <id>` from `cx app instance status --json`.";
    case "invalid_app_instance_port":
      return "Use a TCP port from 1 to 65535.";
    case "invalid_app_instance_worktree":
      return "Pass a directory path for `--worktree`.";
    case "invalid_app_instance_log_tail":
      return "Use `--tail <n>` with a value from 1 to 500.";
    case "invalid_app_instance_observation_kind":
      return "Use `--kind browser|dev-server|log|screenshot|metric`.";
    case "invalid_app_instance_observation_status":
      return "Use `--status observed|unavailable|failed`.";
    case "missing_app_instance_observation_source":
      return "Pass `--source <adapter-or-tool>` when recording app instance evidence.";
    case "app_instance_observation_evidence_missing":
      return "Pass an existing file with `--evidence-path`, or omit the flag for URL/summary-only evidence.";
    case "invalid_app_instance_probe_url":
      return "Use a loopback HTTP URL such as `http://127.0.0.1:<port>/`.";
    case "invalid_app_instance_probe_timeout":
      return "Use `--timeout-ms <n>` with a positive integer up to 30000.";
    case "app_instance_fixed_port_required":
      return "Set `port.preferred` in the descriptor or pass `--port <n>` for a fixed-port profile.";
    case "app_instance_port_unavailable":
      return "Choose another port or stop the conflicting process before retrying.";
    case "app_instance_runner_missing":
      return "Reinstall Codexus so the packaged app instance runner script is available.";
    case "app_instance_profile_already_running":
      return "Use `cx app instance status --json` to inspect the existing owned instance before starting another one.";
    case "app_instance_start_timeout":
      return "Inspect `cx app instance logs --instance-id <id> --json` or rerun with a simpler descriptor command.";
    case "app_instance_start_failed":
      return "Inspect the reported runner error and the instance logs before retrying.";
    case "missing_subagent_file":
      return "Pass `--file <result.json>` or `--claim-file <claims.json>` with `cx session subagent`.";
    case "missing_subagent_id":
    case "subagent_not_found":
      return "Run `cx session status --json` to list linked subagent artifacts.";
    case "missing_subagent_task":
      return "Pass `--task <bounded task>` with `cx session subagent launch`.";
    case "missing_subagent_claim":
      return "Pass at least one `--claim <text>` with `cx session subagent complete`.";
    case "invalid_subagent_confidence":
      return "Use `--confidence low|medium|high|unknown`.";
    case "invalid_subagent_checklist_status":
      return "Use `pass|fail|unknown` for subagent behavior checklist flags.";
    case "invalid_skill_export_target":
      return "Use `--target codex`.";
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
    stability: "stable",
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
