# Codexus Engineering Plan

[한국어](../ko/plans/2026-05-29-codex-harness-engineering-plan.md)

Date: 2026-05-29
Workspace: /Users/irae/Workspace/irae/codex-harness
Status: migrated from `.omx/plans` into project docs

## Goal

Build Codexus, an evolutionary execution harness that keeps OpenAI Codex as the model/runtime engine and is used alongside Codex the way OMC/OMX-style tooling is used alongside its base agent. OMC and OMX are the same family of harness idea: OMC targets Claude Code, while OMX targets Codex. Codexus should learn from that pattern while remaining its own Codex-side runtime layer. It should close the practical gaps users feel versus Claude Code-style harnesses: durable orchestration, workflow state, explicit verification gates, multi-agent supervision, recoverability, skill/memory loops, and operator-visible runtime diagnostics.

The target is closer to Hermes Agent's "agent that grows with you" than a static command wrapper: each completed run should leave behind structured experience, searchable memory, reusable procedures, and evidence that can improve future runs without silently mutating behavior.

The first implementation should be a separate CLI, not a Codex App-only feature. It should use the authenticated local `codex` command so it can benefit from the user's ChatGPT-backed Codex access without depending on private ChatGPT backend APIs. A later Codex-native adapter should let users invoke Codexus from inside a Codex session, closer to the OMX feel, while reusing the same core runtime.

## Research Baseline

Local environment:

- `codex-cli 0.135.0`
- `codex login status`: logged in using ChatGPT
- `oh-my-codex v0.11.9`
- Current workspace contains only `.omx` runtime files; no git repo or app scaffold exists yet.

Reference findings:

- Harness design is now governed by the
  [reference-first harness policy](../references/01-reference-first-harness-policy.md).
  The mandatory references are `raeseoklee/claw-code`,
  `NousResearch/hermes-agent`, and `Gitlawb/openclaude`.
- OpenAI Codex supports local CLI use, `codex exec --json`, plugins, hooks, app server tooling, MCP server mode, and ChatGPT sign-in. Official docs say Codex is included in eligible ChatGPT plans and can be used from Codex CLI/App/IDE/Web.
- The generated Codex app-server protocol exposes useful JSON-RPC surfaces such as `thread/start`, `turn/start`, `turn/steer`, thread turns/items reads, skills/plugins lists, command execution, filesystem tools, MCP server calls, account/rate-limit reads, and model listing. This is useful but should be treated as optional/experimental until proven stable.
- OMX upstream has moved to a CLI/JSON-first contract, `.omx` state/artifacts, skills, prompts, team runtime, durable goals, sparkshell/explore, Hermes/OpenClaw adapters, and an optional Hermes MCP bridge. Local installed OMX is behind upstream, so compatibility detection matters. In this plan, OMC means the Claude Code sibling in the same conceptual family, and OMX means the Codex-targeted sibling.
- `raeseoklee/claw-code` is the mandatory parity-first CLI/harness reference. The 2026-05-29 audit could read GitHub metadata but could not clone source because the repository was disabled with HTTP 403, so existing source-specific Claw parity notes are provisional until re-audit.
- Hermes Agent contributes the strongest ideas for self-improvement: skill creation, skill improvement, persistent memory, session search, cron, gateways, toolsets, terminal backends, and isolated subagents. For this project, the evolutionary loop should be adapted as local artifacts and workflows around Codex, not copied as a model provider layer.
- OpenClaude contributes the strongest ideas for provider/session runtime: provider profiles, Codex OAuth, existing Codex CLI auth reuse through `~/.codex/auth.json`, terminal-first tool loops, MCP/slash-command workflows, permission requests, headless gRPC streaming, and descriptor-first provider metadata. For Codexus, this reinforces local Codex auth reuse and capability-driven driver metadata instead of private backend calls or broad hardcoded provider branches.

## Core Constraints

- Do not call undocumented/private ChatGPT or Codex backend endpoints directly.
- Use `codex` CLI as the stable model access boundary for MVP.
- Treat `codex app-server` as an optional advanced driver behind capability detection.
- Treat OMC/OMX as sibling/reference orchestration layers in the same family; OMX is the Codex-side reference, but this harness should not require, fork, or replace it.
- Make self-improvement explicit, inspectable, and reversible. The harness may propose memories, skills, routing rules, and workflow changes, but promotion must be gated by evidence and policy.
- Keep state auditable and portable under repo-local directories.
- No new dependencies until implementation explicitly needs them; start with Node/TypeScript because it aligns with OMX and local Node is available.
- Every mutating workflow needs a resumable state record, explicit terminal outcome, and verification evidence.

## Proposed System

Product name: `Codexus`.

Target CLI: `cx`.

Long-form CLI alias: `codexus`.

Temporary MVP alias: `chx` remains acceptable until the implementation package/bin rename is complete.

Layered architecture:

1. CLI and configuration
   - Commands: `cx doctor`, `cx run`, `cx plan`, `cx verify`, `cx resume`, `cx status`, `cx adapt omx`, `cx replay`.
   - Config precedence: project `.codex-harness/config.json`, user `~/.codex-harness/config.json`, CLI flags.
   - Machine-readable output with `--json` on every command.

2. Driver abstraction
   - `CodexExecDriver`: runs `codex exec --json -C <cwd> ...`, captures JSONL events, final message, exit status, and usage/error metadata.
   - `CodexResumeDriver`: wraps `codex exec resume` / `codex resume` flows where safe.
   - `CodexAppServerDriver`: optional experimental JSON-RPC driver for app-server threads and turns.
   - `MockDriver`: deterministic local driver for contract tests and replay.

3. Run state and event ledger
   - Write to `.codex-harness/runs/<run-id>/`.
   - Persist `input.json`, `events.jsonl`, `state.json`, `artifacts/`, `verification.json`, and `report.md`.
   - Terminal outcomes: `complete`, `failed`, `blocked`, `cancelled`.
   - Nonterminal phases: `research`, `plan`, `execute`, `verify`, `repair`.

4. Workflow kernel
   - Plan-first mode for broad tasks.
   - Execute mode with a durable task ledger.
   - Verification gate that runs configured checks before completion.
   - Repair loop when verification fails.
   - Explicit stop conditions to prevent false completion.

5. OMX adapter
   - Detect `omx` version, `omx doctor`, local `.omx`, tmux availability, and upstream-compatible features.
   - Prefer `omx explore` and `omx sparkshell` for bounded read-only repo exploration and noisy verification output.
   - Optionally launch `omx team` only for work that benefits from coordinated parallel execution.
   - Write interop metadata under `.omx/adapters/codex-harness/` and `.codex-harness/omx/`; avoid mutating `.omx/state` directly.

6. Codex-native adapter
   - Provide a future Codex skill/plugin/command surface so Codexus can be invoked from inside an interactive Codex session.
   - Reuse the same Codexus core, ledger, verification, memory, and skill stores.
   - Do not duplicate orchestration logic inside the adapter.

7. Skill and memory loop
   - Summarize successful runs into reusable lessons.
   - Propose skill candidates under `.codex-harness/skills/proposed/`.
   - Promote approved skills into Codex/OMX skill locations through explicit commands.
   - Maintain local memory as append-only JSONL plus summarized markdown, with redaction hooks before persistence.

8. Evolution engine
   - Convert run ledgers into structured experience records: task shape, repo context, decisions, failed attempts, final fix, verification evidence, and reusable heuristics.
   - Maintain searchable memory over prior runs, plans, failures, and accepted skills.
   - Generate skill proposals with a trigger, scope, procedure, required tools, safety constraints, and regression examples.
   - Run candidate skills against mock or replayed scenarios before promotion.
   - Track skill versions and deprecations so bad procedures can be rolled back.
   - Add periodic review jobs that find repeated failures, stale memories, over-broad skills, and missing verification patterns.

9. Policy and safety
   - Reuse Codex sandbox/approval settings.
   - Add a harness-side policy preflight for destructive shell patterns, broad filesystem targets, secret-looking content, and non-git workspaces.
   - Never auto-approve irreversible actions outside configured safe roots.

10. Verification and parity harness
   - Contract tests for each driver using recorded JSONL fixtures.
   - Scenario tests modeled after Claw's parity harness: success, tool failure, permission block, verification fail-then-repair, resume, cancelled run, large output truncation.
   - Golden reports for `doctor`, `run --json`, `status --json`, and `verify --json`.

## MVP Scope

Phase 0: repository bootstrap

- Initialize a small TypeScript CLI package.
- Add formatting, typecheck, and a test runner using existing platform tooling.
- Add `cx doctor` with local probes:
  - `codex --version`
  - `codex login status`
  - `codex exec --help`
  - `omx --version`
  - `omx doctor` availability
  - git/workspace detection
  - tmux detection

Phase 1: Codex exec supervisor

- Implement `CodexExecDriver`.
- Run `codex exec --json --skip-git-repo-check -C <cwd> <prompt>`.
- Capture stdout JSONL and stderr separately.
- Normalize run events into harness events.
- Emit `.codex-harness/runs/<id>/report.md`.

Phase 2: workflow state machine

- Implement `cx run`.
- Add phase transitions, terminal outcomes, and resumable `state.json`.
- Add configurable verification commands.
- Add repair loop with bounded iterations.

Phase 3: OMX interop

- Implement `cx adapt omx doctor/status`.
- Prefer `omx sparkshell` for noisy verification commands when available.
- Support `cx plan --omx` to create `.omx/plans/...` compatible artifacts.
- Add version-gated warnings because local OMX is currently `0.11.9` while upstream research baseline is `0.18.6`.

Phase 4: evolutionary learning loop

- Add run summarization artifacts.
- Add `cx skill propose <run-id>`.
- Add memory redaction and append-only records.
- Add `cx memory search`.
- Add `cx skill review/promote/deprecate`.
- Add replay tests for proposed skills before promotion.

Phase 5: app-server driver experiment

- Generate schema in CI from installed `codex app-server generate-json-schema`.
- Implement a gated prototype that can start a thread and turn via JSON-RPC.
- Keep it off by default until contract tests prove stability across Codex versions.

## Acceptance Criteria

- `cx doctor --json` reports Codex auth, Codex version, OMX version, git status, tmux, and feature availability.
- `cx run "Reply exactly OK"` completes through ChatGPT-authenticated local Codex and writes a run ledger.
- `cx run --verify "npm test" ...` cannot report `complete` when verification fails.
- A failed verification run can enter a repair iteration and preserve both failure and fix evidence.
- `cx status --json <run-id>` reconstructs state from disk without a live process.
- `cx adapt omx status --json` never mutates `.omx/state`.
- Tests pass with the mock driver without network or model access.
- No code uses private ChatGPT/Codex backend endpoints.
- A completed nontrivial run produces an experience record with decisions, failures, verification evidence, and reusable lessons.
- A proposed skill cannot be promoted unless it includes scope, trigger conditions, safety constraints, and replay or mock verification.
- Memory search can retrieve prior relevant runs without injecting unbounded raw history into future prompts.

## Risks

- Codex JSONL event schema may drift; mitigate with tolerant parsing, fixture tests, and raw event preservation.
- App-server JSON-RPC is useful but experimental; keep it optional.
- ChatGPT plan usage limits can throttle long multi-agent runs; add concurrency and iteration budgets.
- Local OMX is older than upstream; design adapters with capability probes, not hardcoded assumptions.
- Skill/memory loops can persist sensitive data; add redaction and explicit promotion.
- Self-improvement can amplify bad habits; mitigate with replay tests, versioned skill promotion, deprecation, and human-readable diffs.
- Memory can poison prompts or create bloat; mitigate with scoped retrieval, summaries, TTL/deprecation, and source citations back to run artifacts.
- Parallel orchestration can create noisy failures; start with one supervised Codex lane before adding team fanout.

## Recommended First Implementation Slice

Build only:

1. `cx doctor`
2. `CodexExecDriver`
3. run ledger under `.codex-harness/runs/<run-id>/`
4. `cx run`
5. mock-driver tests
6. one real smoke test using `codex exec --json --skip-git-repo-check`

This gives a stable spine before adding planning, OMX team integration, app-server control, or the full evolutionary learning loop.

## Sources Consulted

- OpenAI Help: ChatGPT plan support for Codex
- OpenAI Codex GitHub README
- `raeseoklee/claw-code` GitHub metadata; source clone blocked by disabled repository on 2026-05-29
- `NousResearch/hermes-agent` README and source tree
- `Gitlawb/openclaude` README, advanced setup, integrations architecture, and source tree
- `Yeachan-Heo/oh-my-codex` README, adapt docs, Hermes MCP bridge docs, CLI-first MCP taxonomy, plugin bundle contract
- Local CLI help for `codex`, `codex exec`, `codex login`, `codex app-server`, `codex mcp-server`, `codex features`, `omx`, and `omx agents`
