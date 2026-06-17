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
    case "unsupported_session_tasks_command":
      return `Unsupported session tasks command${target ? `: ${target}` : ""}.`;
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
    case "unsupported_evidence_command":
      return `Unsupported evidence command${target ? `: ${target}` : ""}.`;
    case "unsupported_supply_chain_command":
      return `Unsupported supply-chain command${target ? `: ${target}` : ""}.`;
    case "unsupported_policy_command":
      return `Unsupported policy command${target ? `: ${target}` : ""}.`;
    case "unsupported_repo_command":
      return `Unsupported repo command${target ? `: ${target}` : ""}.`;
    case "unsupported_repo_graph_command":
      return `Unsupported repo graph command${target ? `: ${target}` : ""}.`;
    case "unsupported_graph_provider":
      return `Unsupported repository graph provider${target ? `: ${target}` : ""}.`;
    case "unsupported_contract_command":
      return `Unsupported contract command${target ? `: ${target}` : ""}.`;
    case "unsupported_contract_target":
      return `Unsupported contract target${target ? `: ${target}` : ""}.`;
    case "unsupported_update_command":
      return `Unsupported update command${target ? `: ${target}` : ""}.`;
    case "invalid_update_channel":
      return `Invalid update channel${target ? `: ${target}` : ""}.`;
    case "unsupported_release_command":
      return `Unsupported release command${target ? `: ${target}` : ""}.`;
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
    case "missing_session_task_title":
      return "Missing session task title.";
    case "missing_session_task_id":
      return "Missing session task id.";
    case "missing_session_task_block_reason":
      return "Missing session task block reason.";
    case "invalid_session_task_status":
      return `Invalid session task status${target ? `: ${target}` : ""}.`;
    case "invalid_session_task_kind":
      return `Invalid session task kind${target ? `: ${target}` : ""}.`;
    case "invalid_session_task_source":
      return `Invalid session task source${target ? `: ${target}` : ""}.`;
    case "invalid_session_task_evidence":
      return `Invalid session task evidence link${target ? `: ${target}` : ""}.`;
    case "session_task_evidence_missing":
      return `Session task evidence file not found${target ? `: ${target}` : ""}.`;
    case "session_task_not_found":
      return `Session task not found${target ? `: ${target}` : ""}.`;
    case "session_task_in_progress_conflict":
      return "Only one Codexus session task may be in progress at a time.";
    case "session_tasks_artifact_invalid":
      return "Codexus session tasks artifact is invalid.";
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
    case "missing_repo_graph":
      return "Missing repository graph id or path.";
    case "missing_repo_graph_source":
      return "Missing repository graph source JSON path.";
    case "missing_repo_graph_query":
      return "Missing repository graph search query.";
    case "missing_repo_graph_explain_id":
      return "Missing repository graph node or edge id.";
    case "invalid_repo_graph_limit":
      return "Invalid repository graph search limit.";
    case "invalid_repo_graph_source":
      return `Invalid repository graph source${target ? `: ${target}` : ""}.`;
    case "repo_graph_source_missing":
      return `Repository graph source not found${target ? `: ${target}` : ""}.`;
    case "repo_graph_source_too_large":
      return `Repository graph source is too large${target ? `: ${target}` : ""}.`;
    case "invalid_repo_graph_import_path":
      return `Imported repository graph path is unsafe${target ? `: ${target}` : ""}.`;
    case "missing_automation_task":
      return "Missing automation task prompt.";
    case "missing_wiki_topic":
      return "Missing wiki context topic.";
    case "invalid_wiki_budget":
      return "Invalid wiki context budget.";
    case "missing_wiki_injection_approval":
      return "Missing wiki injection approval reference.";
    case "missing_wiki_injection_target":
      return "Missing wiki injection target.";
    case "missing_evidence_export_target":
      return "Missing evidence export target.";
    case "unsafe_wiki_injection_approval":
      return "Wiki injection approval must be an approval id or a workspace-local .codexus/wiki/context/*/approval.json path.";
    case "unsafe_evidence_export_target":
      return `Evidence export target is unsafe${target ? `: ${target}` : ""}.`;
    case "wiki_context_approval_missing":
      return `Wiki context approval not found${target ? `: ${target}` : ""}.`;
    case "wiki_context_approval_invalid":
      return `Wiki context approval is invalid${target ? `: ${target}` : ""}.`;
    case "wiki_injection_apply_deferred":
      return "Wiki injection apply is deferred; use `cx wiki injection plan --approval <id-or-path> --target <target> --json` for report-only planning.";
    case "wiki_manifest_missing":
      return "Wiki manifest is missing.";
    case "wiki_manifest_invalid":
      return "Wiki manifest is invalid.";
    case "wiki_advisory_source_not_fresh":
      return "Wiki advisory source manifest is not fresh.";
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
      return "Use `--type config|state|event|memory-entry|skill|session-state|supply-chain-policy|architecture-policy|autopilot-contract|autopilot-run-gate|wiki-manifest|wiki-advisory|wiki-context-approval|wiki-injection-plan|repo-graph|relay-session|relay-adapter|stage-gate-evidence|convergence-agreement|decision|session-tasks|app-instance-descriptor|app-instance|app-instance-observation|observability-adapter|lsp-adapter|automation-dispatch|automation-recovery|subagent-result|subagent-launch-contract|subagent-bridge-probe|app-server-discovery|app-server-stage-a|app-server-stage-b|app-server-stdio-proof`.";
    case "unsupported_app_server_command":
      return "Run `cx app-server status --json` or `cx app-server roundtrip --dry-run --json`.";
    case "unsupported_app_command":
      return "Run `cx app instance status --json`.";
    case "unsupported_app_instance_command":
      return "Run `cx app instance profile list --json`, `cx app instance status --json`, `cx app instance logs --instance-id <id> --json`, `cx app instance evidence adapters --json`, `cx app instance evidence browser --instance-id <id> --capture <file> --json`, or `cx app instance start --profile <name> --worktree <path> --dry-run --json`.";
    case "unsupported_setup_command":
      return "Run `cx setup codex-session --scope project --json`.";
    case "unsupported_session_command":
      return "Run `cx session status --json`, `cx session hud --json`, `cx session tasks list --json`, `cx session migrate --json`, `cx session checkpoint <label> --json`, `cx session verify --verify <cmd> --json`, `cx session decision list --json`, `cx session loop --json`, `cx session slop --json`, or `cx session notify --event <name> --json`.";
    case "unsupported_session_tasks_command":
      return "Run `cx session tasks list --json`, `cx session tasks add --title <text> --json`, `cx session tasks update <task-id> --status in_progress --json`, `cx session tasks complete <task-id> --evidence <path> --json`, or `cx session tasks block <task-id> --reason <text> --json`.";
    case "unsupported_session_subagent_command":
      return "Codexus does not directly spawn native subagents from the CLI; run `cx session subagent probe --record --json` to record bridge availability evidence, `cx session subagent launch --role <role> --task <task> --json` to record a capability-gated launcher contract, `cx session subagent complete --task-id <id> --claim <text> --json` to record the result of a native subagent used in the current Codex session, `cx session subagent record --file <result.json> --json`, `cx session subagent attach --role <role> --claim-file <claims.json> --json`, or `cx session subagent status <task-id> --json`.";
    case "unsupported_session_decision_command":
      return "Run `cx session decision record --summary <text> --json`, `cx session decision list --json`, or `cx session decision status <decision-id> --json`.";
    case "unsupported_session_workers_command":
      return "Run `cx session workers status --json`.";
    case "unsupported_slop_command":
      return "Run `cx slop check --json` or `cx slop check --gate --json`.";
    case "unsupported_lsp_command":
      return "Run `cx lsp status --json` to detect project LSP candidates, `cx lsp adapters --json` to inspect report-only adapter authority, or `cx lsp check --gate --json` to run explicit project diagnostics.";
    case "unsupported_evidence_command":
      return "Run `cx evidence status --json` for a read-only project evidence dashboard.";
    case "unsupported_supply_chain_command":
      return "Run `cx supply-chain check --json` or `cx supply-chain check --gate --json`.";
    case "unsupported_policy_command":
      return "Run `cx policy catalog check --json`.";
    case "unsupported_repo_command":
      return "Run `cx repo map --json`, `cx repo check --gate --json`, or `cx repo graph ... --json`.";
    case "unsupported_repo_graph_command":
      return "Run `cx repo graph build --graph-provider codexus-lite --json`, `cx repo graph import --graph-provider understand-anything --source <path> --json`, `cx repo graph check --graph <graph> --gate --json`, `cx repo graph search --graph <graph> <query> --json`, or `cx repo graph explain --graph <graph> <id> --json`.";
    case "unsupported_graph_provider":
      return "Use `codexus-lite` for graph build, or `understand-anything` / `external-json` for JSON-only graph import.";
    case "unsupported_contract_command":
      return "Run `cx contract check --target 0.2.0 --json` or add `--gate` to fail until a stable promotion is ready.";
    case "unsupported_contract_target":
      return "Only `--target 0.2.0` is supported by the current contract readiness audit.";
    case "unsupported_update_command":
      return "Run `cx update check --json` or `cx update check --channel next --json`.";
    case "invalid_update_channel":
      return "Use `--channel stable` or `--channel next`; prerelease checks require explicit opt-in.";
    case "unsupported_release_command":
      return "Run `cx release policy --json` for release cadence policy or `cx release check --gate --json` for release integrity.";
    case "unsupported_wiki_command":
      return "Run `cx wiki map --json`, `cx wiki build --mode deterministic --json`, `cx wiki check --gate --json`, `cx wiki context --topic <name> --json`, `cx wiki injection-policy --json`, or `cx wiki injection plan --approval <id-or-path> --target <target> --json`.";
    case "unsupported_wiki_build_mode":
      return "Use `--mode deterministic` or `--mode advisory`. Advisory build requires a fresh deterministic wiki manifest.";
    case "unsupported_autopilot_command":
      return "Run `cx autopilot presets list --json`, `cx autopilot plan --from <path> --preset <name> --json`, `cx autopilot contract validate <path> --json`, `cx autopilot contract approve <path> --approved-by <name> --json`, `cx autopilot contract scope-check <path> --json`, `cx autopilot run-gate --policy <path> --json`, or `cx autopilot relay adapters|record|stage-gate|check-agreement|status ...`.";
    case "unsupported_autopilot_contract_command":
      return "Run `cx autopilot contract validate <path> --json`, `cx autopilot contract approve <path> --approved-by <name> --json`, or `cx autopilot contract scope-check <path> --json`.";
    case "unsupported_autopilot_relay_command":
      return "Run `cx autopilot relay adapters --json`, `cx autopilot relay record --stage <stage> --artifact <path> --author-file <path> --review-file <path> --json`, `cx autopilot relay stage-gate ... --json`, `cx autopilot relay check-agreement ... --json`, or `cx autopilot relay status <relay-id> --json`.";
    case "autopilot_run_deferred":
      return "Use `cx autopilot run-gate --policy <path> --json` to inspect readiness; live `autopilot run` stays blocked until capability and scope gates are promoted.";
    case "invalid_session_setup_scope":
      return "Use `--scope project` or `--scope user`.";
    case "missing_session_checkpoint_label":
      return "Pass a short label after `cx session checkpoint`.";
    case "missing_session_verification_command":
      return "Pass at least one `--verify <cmd>` argument.";
    case "missing_session_task_title":
      return "Pass `--title <text>` or a positional title after `cx session tasks add`.";
    case "missing_session_task_id":
      return "Pass a task id from `cx session tasks list --json`.";
    case "missing_session_task_block_reason":
      return "Pass `--reason <text>` when blocking a session task.";
    case "invalid_session_task_status":
      return "Use `pending`, `in_progress`, `completed`, `blocked`, or `skipped`.";
    case "invalid_session_task_kind":
      return "Use `planning`, `implementation`, `verification`, `review`, `release`, or `other`.";
    case "invalid_session_task_source":
      return "Use `manual`, `autopilot`, `relay`, `subagent`, or `codexus`.";
    case "invalid_session_task_evidence":
      return "Task evidence links must be relative workspace paths, not URLs, absolute paths, or parent-directory paths.";
    case "session_task_evidence_missing":
      return "Record or choose an existing workspace evidence file before linking it to a task.";
    case "session_task_not_found":
      return "Run `cx session tasks list --json` to inspect available task ids.";
    case "session_task_in_progress_conflict":
      return "Move the current in-progress task to another status before starting a different one.";
    case "session_tasks_artifact_invalid":
      return "Inspect `.codexus/session/tasks.json`; Codexus will not silently repair malformed task state.";
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
    case "missing_repo_graph":
      return "Pass `--graph <graph-id-or-path>`.";
    case "missing_repo_graph_source":
      return "Pass `--source <relative-json-path>`; Codexus reads JSON only and does not execute provider packages.";
    case "missing_repo_graph_query":
      return "Pass a positional query after `cx repo graph search --graph <graph>`.";
    case "missing_repo_graph_explain_id":
      return "Pass a node id or edge id after `cx repo graph explain --graph <graph>`.";
    case "invalid_repo_graph_limit":
      return "Use a positive integer `--limit <n>`.";
    case "invalid_repo_graph_source":
      return "Repository graph sources must be existing JSON files inside the workspace.";
    case "repo_graph_source_missing":
      return "Create the graph JSON artifact first or pass a correct relative path.";
    case "repo_graph_source_too_large":
      return "Use a bounded source artifact; Codexus refuses oversized imports by default.";
    case "invalid_repo_graph_import_path":
      return "Imported node paths must be sanitized relative paths.";
    case "missing_automation_task":
      return "Pass `--task <text>` when running live `cx cron run-now` or `cx gateway check`.";
    case "invalid_autopilot_preset":
      return "Use `--preset manual|guided|contracted|gated-auto|extended-auto`.";
    case "missing_wiki_topic":
      return "Pass `--topic <name>` with `cx wiki context`.";
    case "invalid_wiki_budget":
      return "Use a positive integer for `--budget`.";
    case "missing_wiki_injection_approval":
      return "Pass `--approval <approval-id-or-path>` with `cx wiki injection plan`.";
    case "missing_wiki_injection_target":
      return "Pass `--target <target>` with `cx wiki injection plan`.";
    case "missing_evidence_export_target":
      return "Pass `--target <workspace-relative-directory>` with `cx evidence export`.";
    case "unsafe_wiki_injection_approval":
      return "Use an approval id or a path under `.codexus/wiki/context/<id>/approval.json`.";
    case "unsafe_evidence_export_target":
      return "Use a workspace-relative target outside `.codexus`, `.git`, and `node_modules`.";
    case "wiki_context_approval_missing":
      return "Regenerate the context approval with `cx wiki context --approve --approved-by <name> --json`.";
    case "wiki_context_approval_invalid":
      return "Regenerate the context approval so it matches the current schema and handoff policy.";
    case "wiki_injection_apply_deferred":
      return "Only report-only injection planning is available; prompt mutation remains deferred.";
    case "wiki_manifest_missing":
      return "Run `cx wiki build --mode deterministic --json` before requesting wiki context or checks.";
    case "wiki_manifest_invalid":
      return "Rebuild the wiki so the manifest matches the current schema and page set.";
    case "wiki_advisory_source_not_fresh":
      return "Run `cx wiki check --gate --json`; rebuild deterministic wiki pages before advisory synthesis.";
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
    case "missing_app_instance_browser_capture_path":
      return "Pass `--capture <browser-capture.json>` or `--evidence-path <browser-capture.json>`.";
    case "app_instance_browser_capture_missing":
      return "Pass an existing Browser/DevTools capture JSON file with `--capture <path>`.";
    case "app_instance_browser_capture_not_file":
      return "Pass a regular JSON file with `--capture <path>`.";
    case "app_instance_browser_capture_too_large":
      return "Keep Browser/DevTools capture files at or below 1 MiB.";
    case "invalid_app_instance_browser_capture_json":
      return "Use a JSON object capture with a loopback `url` or `page.url` field.";
    case "missing_app_instance_browser_url":
      return "Provide a loopback URL in the capture JSON `url`/`page.url` field, or pass `--url <loopback-url>`.";
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
