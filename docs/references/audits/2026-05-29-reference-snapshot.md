# Reference Snapshot: 2026-05-29

[한국어](../../ko/references/audits/2026-05-29-reference-snapshot.md)

This snapshot records the mandatory harness references consulted for Codexus on
2026-05-29. It is not a full code review of the upstream projects. It is the
minimum reference evidence that future Codexus harness decisions must start
from.

## Retrieval Summary

| Reference | URL | Default branch | Updated | Source access |
| --- | --- | --- | --- | --- |
| `ultraworkers/claw-code` | https://github.com/ultraworkers/claw-code | `main` | 2026-05-29T10:33:13Z | cloned and inspected at `4d3dc5b` |
| `NousResearch/hermes-agent` | https://github.com/NousResearch/hermes-agent | `main` | 2026-05-29T10:27:48Z | cloned and inspected |
| `Gitlawb/openclaude` | https://github.com/Gitlawb/openclaude | `main` | 2026-05-29T10:18:19Z | cloned and inspected |

## Claw Code

Observed source paths:

- `README.md`
- `USAGE.md`
- `PARITY.md`
- `rust/README.md`
- `rust/MOCK_PARITY_HARNESS.md`
- `docs/g004-events-reports-contract.md`
- `docs/navigation-file-context.md`
- `docs/local-openai-compatible-providers.md`
- `docs/g011-acp-json-rpc-status-contract.md`
- `rust/crates/runtime/src/permissions.rs`
- `rust/crates/runtime/src/mcp.rs`
- `rust/crates/runtime/src/report_schema.rs`
- `rust/crates/rusty-claude-cli/tests/mock_parity_harness.rs`
- `rust/crates/rusty-claude-cli/tests/output_format_contract.rs`

Observed behavior themes:

- Canonical runtime: `rust/` is the source of truth for the `claw` CLI binary;
  `src/` and `tests/` are companion Python/reference and audit helpers.
- Health and machine output: `doctor`, `status`, `sandbox`, and `version`
  support machine-readable output through `--output-format json`.
- Repository initialization: `claw init --output-format json` emits structured
  `created`, `updated`, `skipped`, and `artifacts` fields so consumers do not
  substring-match prose.
- Session state: `claw state --output-format json` reads
  `.claw/worker-state.json`, including worker id, session reference, model, and
  permission mode.
- Permission controls: supported modes include `read-only`, `workspace-write`,
  and `danger-full-access`; `--allowedTools` scopes tool availability.
- REPL/slash surface: status, sandbox, cost, resume, session, usage, stats,
  compact, config, memory, diff, commit, PR, issue, export, hooks, files,
  release notes, MCP, agents, skills, doctor, tasks, context, desktop, review,
  advisor, security review, subagent, team, telemetry, providers, cron, and
  plugin operations are represented in slash/direct command surfaces.
- Provider stance: Claw can target Anthropic, OpenAI-compatible gateways, and
  local model servers, but it does not support OpenAI Codex sessions or Codex
  CLI session import/export.
- Mock parity harness: deterministic Anthropic-compatible mock service covers
  streaming text, file read/write, grep, multi-tool turns, bash stdout, approved
  and denied permission prompts, plugin tools, auto-compaction, and token/cost
  reporting.
- Parity lanes: the Rust port tracks bash validation, file-tool guards,
  task/team/cron registries, MCP lifecycle bridge, LSP registry, and permission
  enforcement.
- Event/report contract: structured lane events, report schema versions,
  canonical payload/projection lineage, redaction provenance, policy-blocked
  actions, approval tokens, and capability negotiation are first-class
  interoperability concepts.
- ACP/Zed/JSON-RPC stance: unsupported editor daemon behavior is surfaced as a
  truthful status with a JSON envelope rather than inferred from command
  presence.

Codexus implication:

- Keep `cx doctor/status/verify` and other automation surfaces explicitly
  machine-readable; do not rely on natural-language status text for automation.
- Treat run/session identity, permission mode, selected model/driver, and tool
  scope as ledger facts, not final-report prose.
- Expand Codexus replay tests toward Claw-style parity fixtures: tool success,
  tool denial, permission prompts, multi-step turns, plugin/skill paths,
  compaction/large-output behavior, and token/cost/accounting metadata.
- Keep permission and approval events explicit before adding unattended,
  remote, team, cron, or daemon-like execution.
- Preserve the current Codex-auth boundary as a Codexus divergence: Claw does
  not import Codex sessions, while Codexus intentionally wraps authenticated
  local `codex` CLI behavior.
- Use truthful capability/status envelopes for app-server or future daemon
  surfaces; command presence alone must not imply support.

## Hermes Agent

Observed source paths:

- `README.md`
- `AGENTS.md`
- `agent/conversation_loop.py`
- `agent/context_engine.py`
- `agent/memory_manager.py`
- `agent/skill_commands.py`
- `agent/skill_preprocessing.py`
- `agent/curator.py`
- `agent/curator_backup.py`
- `agent/transports/codex_app_server.py`
- `agent/transports/codex_app_server_session.py`
- `agent/transports/hermes_tools_mcp_server.py`

Observed behavior themes:

- Real terminal interface: TUI, multiline editing, slash-command autocomplete,
  conversation history, interruption/redirect, and streaming tool output.
- Cross-platform gateways: CLI plus Telegram, Discord, Slack, WhatsApp, Signal,
  and related messaging delivery surfaces.
- Closed learning loop: agent-curated memory, periodic nudges, autonomous skill
  creation after complex tasks, skill improvement during use, session search,
  and user modeling.
- Scheduled automations: cron scheduler with platform delivery.
- Delegation: isolated subagents and RPC-style tool use from scripts.
- Runtime placement: local, Docker, SSH, Singularity, Modal, and Daytona
  terminal backends.
- Skill migration: OpenClaw settings, memories, skills, allowlists, messaging
  settings, API keys, TTS assets, and workspace instructions can be imported.

Codexus implications:

- The Codexus evolution engine should be more than a static memory writer. It
  needs a loop across run evidence, memory, skill proposals, replay, promotion,
  deprecation, and periodic review.
- Hermes-style learning must be adapted to Codexus' local audit model:
  source-linked records, explicit promotion, replay gates, redaction, and
  reversible skill versions.
- Cron and gateway behavior should be treated as later runtime surfaces after
  the run ledger, verification gate, and skill promotion path are stable.
- Terminal backend abstraction is useful, but Codexus should not add remote
  backends before the local Codex driver contract is hardened.

## OpenClaude

Observed source paths:

- `README.md`
- `docs/advanced-setup.md`
- `docs/architecture/integrations.md`
- `docs/hook-chains.md`
- `src/QueryEngine.ts`
- `src/Task.ts`
- `src/proto/openclaude.proto`
- `src/remote/RemoteSessionManager.ts`
- `src/remote/remotePermissionBridge.ts`
- `src/utils/forkedAgent.ts`

Observed behavior themes:

- Terminal-first coding-agent workflow across prompts, tools, agents, MCP,
  slash commands, and streaming output.
- Provider profiles through `/provider`, including OpenAI-compatible APIs,
  Gemini, GitHub Models, Codex OAuth, Codex, Ollama, and local providers.
- Codex auth reuse: Codex OAuth flow and existing Codex CLI auth from
  `~/.codex/auth.json`.
- Tool-driven workflows: bash, file tools, grep, glob, agents, tasks, MCP, web
  tools, streaming responses, and tool-calling loops.
- Agent routing: settings-based routing can send different agent roles to
  different models/providers with a fallback global provider.
- Headless service boundary: gRPC server with bidirectional streaming for text
  chunks, tool calls, and permission requests.
- Descriptor-first integration architecture: descriptors define vendors,
  gateways, model metadata, validation hints, discovery policy, and transport
  capabilities; runtime code executes descriptor metadata rather than cloning a
  broad provider matrix.
- Provider divergence is explicit: documented exceptions remain when external
  API contracts are genuinely different.

Codexus implications:

- Codexus should continue reusing authenticated local Codex access instead of
  calling private ChatGPT/Codex backend APIs.
- If Codexus grows a separate service or UI, OpenClaude's headless gRPC shape is
  the best current reference for streaming events, tool calls, and permission
  requests.
- Driver/provider metadata should be descriptor-like: capability declarations
  should drive flag mapping and runtime behavior instead of hardcoded provider
  branches.
- Permission and approval events should become first-class run ledger events
  before Codexus adds unattended or remote execution.

## Reference Matrix

| Codexus surface | Primary reference | Secondary reference | Notes |
| --- | --- | --- | --- |
| CLI command contract | Claw Code | OpenClaude | Use Claw's JSON command contracts and typed errors as parity pressure. |
| Codex auth boundary | OpenClaude | Codexus local probes | Reuse local Codex auth; avoid private backend APIs. |
| Evolution loop | Hermes Agent | Claw Code | Promotion must remain explicit and replay-gated. |
| Skill lifecycle | Hermes Agent | OpenClaude slash commands | Prefer source-linked, reversible skills. |
| Session and run ledger | Claw Code | OpenClaude gRPC/session model | Ledger is Codexus' source of truth. |
| Permission flow | Claw Code | OpenClaude | Model permission checks, prompts, denials, and approvals as ledger events. |
| Gateways/cron | Hermes Agent | OpenClaude service mode | Later surface after local core hardening. |
| Provider/driver metadata | OpenClaude | Codex driver probes | Descriptor/capability-driven runtime. |
| Codex-native adapter | Codexus docs | OpenClaude and Hermes | Keep current Codex chat primary unless a new chat is explicitly justified. |
