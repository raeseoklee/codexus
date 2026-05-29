# 레퍼런스 스냅샷: 2026-05-29

[English](../../../references/audits/2026-05-29-reference-snapshot.md)

이 스냅샷은 2026-05-29 기준 Codexus의 필수 하네스 레퍼런스를 기록합니다.
upstream 프로젝트 전체 code review가 아니라, 앞으로 Codexus 하네스 의사결정이
반드시 출발해야 하는 최소 reference evidence입니다.

## 조회 요약

| Reference | URL | Default branch | Updated | Source access |
| --- | --- | --- | --- | --- |
| `ultraworkers/claw-code` | https://github.com/ultraworkers/claw-code | `main` | 2026-05-29T10:33:13Z | cloned and inspected at `4d3dc5b` |
| `NousResearch/hermes-agent` | https://github.com/NousResearch/hermes-agent | `main` | 2026-05-29T10:27:48Z | cloned and inspected |
| `Gitlawb/openclaude` | https://github.com/Gitlawb/openclaude | `main` | 2026-05-29T10:18:19Z | cloned and inspected |

## Claw Code

확인한 source path:

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

확인한 동작 theme:

- Canonical runtime: `rust/`가 `claw` CLI binary의 source of truth입니다.
  `src/`와 `tests/`는 companion Python/reference 및 audit helper입니다.
- Health와 machine output: `doctor`, `status`, `sandbox`, `version`은
  `--output-format json`으로 machine-readable output을 제공합니다.
- Repository initialization: `claw init --output-format json`은 `created`,
  `updated`, `skipped`, `artifacts` field를 제공하여 consumer가 human prose를
  substring-match하지 않게 합니다.
- Session state: `claw state --output-format json`은 worker id, session
  reference, model, permission mode를 담은 `.claw/worker-state.json`을 읽습니다.
- Permission controls: `read-only`, `workspace-write`, `danger-full-access`
  mode와 `--allowedTools` tool scope가 있습니다.
- REPL/slash surface: status, sandbox, cost, resume, session, usage, stats,
  compact, config, memory, diff, commit, PR, issue, export, hooks, files,
  release notes, MCP, agents, skills, doctor, tasks, context, desktop, review,
  advisor, security review, subagent, team, telemetry, providers, cron, plugin
  surface가 존재합니다.
- Provider stance: Anthropic, OpenAI-compatible gateway, local model server를
  target할 수 있지만 OpenAI Codex session이나 Codex CLI session import/export는
  지원하지 않습니다.
- Mock parity harness: deterministic Anthropic-compatible mock service가
  streaming text, file read/write, grep, multi-tool turns, bash stdout, approved
  and denied permission prompts, plugin tools, auto-compaction, token/cost
  reporting을 다룹니다.
- Parity lanes: bash validation, file-tool guard, task/team/cron registry, MCP
  lifecycle bridge, LSP registry, permission enforcement를 추적합니다.
- Event/report contract: structured lane events, report schema versions,
  canonical payload/projection lineage, redaction provenance, policy-blocked
  actions, approval tokens, capability negotiation이 first-class
  interoperability concept입니다.
- ACP/Zed/JSON-RPC stance: editor daemon 미지원 상태를 command 존재로 추론하지
  않고 JSON envelope가 있는 truthful status로 노출합니다.

Codexus 반영:

- `cx doctor/status/verify`와 자동화 surface는 명시적으로 machine-readable해야
  하며, 자동화가 natural-language status text에 의존하면 안 됩니다.
- run/session identity, permission mode, selected model/driver, tool scope는
  final-report prose가 아니라 ledger fact로 취급합니다.
- Codexus replay test는 Claw-style parity fixture 방향으로 확장합니다: tool
  success, tool denial, permission prompts, multi-step turns, plugin/skill paths,
  compaction/large-output behavior, token/cost/accounting metadata.
- unattended, remote, team, cron, daemon-like execution 전에 permission과
  approval event를 명시적 ledger event로 만듭니다.
- Codexus divergence를 보존합니다. Claw는 Codex session import를 지원하지
  않지만, Codexus는 authenticated local `codex` CLI를 의도적으로 감쌉니다.
- app-server 또는 future daemon surface는 truthful capability/status envelope를
  사용합니다. command 존재만으로 support를 추론하지 않습니다.

## Hermes Agent

확인한 source path:

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

확인한 동작 theme:

- Real terminal interface: TUI, multiline editing, slash-command autocomplete,
  conversation history, interruption/redirect, streaming tool output.
- Cross-platform gateways: CLI와 Telegram, Discord, Slack, WhatsApp, Signal 등
  messaging delivery surface.
- Closed learning loop: agent-curated memory, periodic nudges, autonomous skill
  creation after complex tasks, skill improvement during use, session search,
  user modeling.
- Scheduled automations: platform delivery가 있는 cron scheduler.
- Delegation: isolated subagents와 RPC-style tool use from scripts.
- Runtime placement: local, Docker, SSH, Singularity, Modal, Daytona terminal
  backends.
- Skill migration: OpenClaw settings, memories, skills, allowlists, messaging
  settings, API keys, TTS assets, workspace instructions import.

Codexus 반영:

- Codexus evolution engine은 static memory writer가 아니라 run evidence,
  memory, skill proposal, replay, promotion, deprecation, periodic review를
  잇는 loop여야 합니다.
- Hermes식 learning은 Codexus의 local audit model에 맞춰 source-linked
  records, explicit promotion, replay gates, redaction, reversible skill
  versions로 변환합니다.
- Cron과 gateway는 run ledger, verification gate, skill promotion path가
  안정된 뒤의 later runtime surface로 둡니다.
- Terminal backend abstraction은 유용하지만, local Codex driver contract가
  단단해지기 전 remote backend를 먼저 추가하지 않습니다.

## OpenClaude

확인한 source path:

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

확인한 동작 theme:

- Terminal-first coding-agent workflow: prompts, tools, agents, MCP, slash
  commands, streaming output.
- `/provider`를 통한 provider profile: OpenAI-compatible APIs, Gemini,
  GitHub Models, Codex OAuth, Codex, Ollama, local providers.
- Codex auth reuse: Codex OAuth flow와 기존 Codex CLI auth
  `~/.codex/auth.json`.
- Tool-driven workflows: bash, file tools, grep, glob, agents, tasks, MCP, web
  tools, streaming responses, tool-calling loops.
- Agent routing: role별 model/provider routing과 global fallback.
- Headless service boundary: text chunks, tool calls, permission requests를
  위한 bidirectional streaming gRPC server.
- Descriptor-first integration architecture: vendors, gateways, model metadata,
  validation hints, discovery policy, transport capabilities를 descriptor로
  정의하고 runtime은 이 metadata를 실행합니다.
- Provider divergence를 명시적으로 문서화합니다.

Codexus 반영:

- Codexus는 private ChatGPT/Codex backend API 대신 authenticated local Codex
  access를 계속 재사용해야 합니다.
- 별도 service/UI를 키운다면 OpenClaude의 headless gRPC shape가 streaming
  events, tool calls, permission requests의 우선 reference입니다.
- Driver/provider metadata는 descriptor-like이어야 합니다. capability
  declaration이 flag mapping과 runtime behavior를 이끌어야 하며,
  hardcoded provider branch를 늘리지 않습니다.
- Unattended/remote execution 전에 permission/approval event를 first-class run
  ledger event로 만들어야 합니다.

## 레퍼런스 매트릭스

| Codexus surface | Primary reference | Secondary reference | Notes |
| --- | --- | --- | --- |
| CLI command contract | Claw Code | OpenClaude | Claw JSON command contract와 typed error를 parity pressure로 사용 |
| Codex auth boundary | OpenClaude | Codexus local probes | local Codex auth reuse, private backend API 회피 |
| Evolution loop | Hermes Agent | Claw Code | explicit promotion과 replay gate 유지 |
| Skill lifecycle | Hermes Agent | OpenClaude slash commands | source-linked, reversible skill 선호 |
| Session and run ledger | Claw Code | OpenClaude gRPC/session model | ledger가 Codexus source of truth |
| Permission flow | Claw Code | OpenClaude | permission check, prompt, denial, approval을 ledger event로 모델링 |
| Gateways/cron | Hermes Agent | OpenClaude service mode | local core hardening 이후 later surface |
| Provider/driver metadata | OpenClaude | Codex driver probes | descriptor/capability-driven runtime |
| Codex-native adapter | Codexus docs | OpenClaude and Hermes | 새 chat은 명시적 근거가 있을 때만 |
