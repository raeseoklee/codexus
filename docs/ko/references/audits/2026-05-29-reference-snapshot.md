# 레퍼런스 스냅샷: 2026-05-29

[English](../../../references/audits/2026-05-29-reference-snapshot.md)

이 스냅샷은 2026-05-29 기준 Codexus의 필수 하네스 레퍼런스를 기록합니다.
upstream 프로젝트 전체 code review가 아니라, 앞으로 Codexus 하네스 의사결정이
반드시 출발해야 하는 최소 reference evidence입니다.

## 조회 요약

| Reference | URL | Default branch | Updated | Source access |
| --- | --- | --- | --- | --- |
| `raeseoklee/claw-code` | https://github.com/raeseoklee/claw-code | `main` | 2026-04-02T00:58:02Z | GitHub metadata readable; clone blocked by disabled repository, HTTP 403 |
| `NousResearch/hermes-agent` | https://github.com/NousResearch/hermes-agent | `main` | 2026-05-29T10:27:48Z | cloned and inspected |
| `Gitlawb/openclaude` | https://github.com/Gitlawb/openclaude | `main` | 2026-05-29T10:18:19Z | cloned and inspected |

`raeseoklee/claw-code` clone 시도:

```text
remote: Your repository is disabled.
fatal: unable to access 'https://github.com/raeseoklee/claw-code.git/': The requested URL returned error: 403
```

## Claw Code

확인한 metadata:

- Repository: `raeseoklee/claw-code`
- Description: "The fastest repo in history to surpass 50K stars ... Better
  Harness Tools that make real things done. Now writing in Rust using
  oh-my-codex."
- Status: public metadata는 보이지만, 이 날짜에는 clone으로 source를 읽을 수
  없었습니다.

Codexus 반영:

- Claw Code는 CLI와 하네스 동작의 필수 parity reference로 유지합니다.
- 다만 source 접근이 복구될 때까지 fresh source-specific 주장을 만들지
  않습니다.
- 기존 Codexus 문서의 Claw-style parity 언급은 current source audit이 아니라
  provisional reference baseline으로 취급합니다.
- 접근이 복구되면 README, usage docs, parity fixtures, CLI command
  contracts, permission/session behavior, tool/MCP/LSP behavior,
  subagent/team surfaces를 재감사합니다.

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
| CLI command contract | Claw Code | OpenClaude | Claw source는 접근 가능해지면 재감사 필요 |
| Codex auth boundary | OpenClaude | Codexus local probes | local Codex auth reuse, private backend API 회피 |
| Evolution loop | Hermes Agent | Claw Code | explicit promotion과 replay gate 유지 |
| Skill lifecycle | Hermes Agent | OpenClaude slash commands | source-linked, reversible skill 선호 |
| Session and run ledger | Claw Code | OpenClaude gRPC/session model | ledger가 Codexus source of truth |
| Permission flow | OpenClaude | Claw Code | permission event를 ledger event로 모델링 |
| Gateways/cron | Hermes Agent | OpenClaude service mode | local core hardening 이후 later surface |
| Provider/driver metadata | OpenClaude | Codex driver probes | descriptor/capability-driven runtime |
| Codex-native adapter | Codexus docs | OpenClaude and Hermes | 새 chat은 명시적 근거가 있을 때만 |
