# Reference Snapshot: 2026-05-29

[한국어](../../ko/references/audits/2026-05-29-reference-snapshot.md)

This snapshot records the mandatory harness references consulted for Codexus on
2026-05-29. It is not a full code review of the upstream projects. It is the
minimum reference evidence that future Codexus harness decisions must start
from.

## Retrieval Summary

| Reference | URL | Default branch | Updated | Source access |
| --- | --- | --- | --- | --- |
| `raeseoklee/claw-code` | https://github.com/raeseoklee/claw-code | `main` | 2026-04-02T00:58:02Z | GitHub metadata readable; clone blocked by disabled repository, HTTP 403 |
| `NousResearch/hermes-agent` | https://github.com/NousResearch/hermes-agent | `main` | 2026-05-29T10:27:48Z | cloned and inspected |
| `Gitlawb/openclaude` | https://github.com/Gitlawb/openclaude | `main` | 2026-05-29T10:18:19Z | cloned and inspected |

`raeseoklee/claw-code` clone attempt:

```text
remote: Your repository is disabled.
fatal: unable to access 'https://github.com/raeseoklee/claw-code.git/': The requested URL returned error: 403
```

## Claw Code

Observed metadata:

- Repository: `raeseoklee/claw-code`
- Description: "The fastest repo in history to surpass 50K stars ... Better
  Harness Tools that make real things done. Now writing in Rust using
  oh-my-codex."
- Status: public metadata visible, not archived, source unavailable through
  clone on this date.

Codexus implication:

- Keep Claw Code as a mandatory parity reference for CLI and harness behavior,
  but do not make fresh source-specific claims until source access is restored.
- Existing Codexus docs that mention Claw-style parity must be treated as
  provisional reference baseline, not as current source audit.
- When access returns, re-audit README, usage docs, parity fixtures, CLI command
  contracts, permission/session behavior, tool/MCP/LSP behavior, and
  subagent/team surfaces.

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
| CLI command contract | Claw Code | OpenClaude | Claw source needs re-audit when accessible. |
| Codex auth boundary | OpenClaude | Codexus local probes | Reuse local Codex auth; avoid private backend APIs. |
| Evolution loop | Hermes Agent | Claw Code | Promotion must remain explicit and replay-gated. |
| Skill lifecycle | Hermes Agent | OpenClaude slash commands | Prefer source-linked, reversible skills. |
| Session and run ledger | Claw Code | OpenClaude gRPC/session model | Ledger is Codexus' source of truth. |
| Permission flow | OpenClaude | Claw Code | Model permission events as ledger events. |
| Gateways/cron | Hermes Agent | OpenClaude service mode | Later surface after local core hardening. |
| Provider/driver metadata | OpenClaude | Codex driver probes | Descriptor/capability-driven runtime. |
| Codex-native adapter | Codexus docs | OpenClaude and Hermes | Keep current Codex chat primary unless a new chat is explicitly justified. |
