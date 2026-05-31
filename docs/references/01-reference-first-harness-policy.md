# Reference-First Harness Policy

[Korean](../ko/references/01-reference-first-harness-policy.md)

Status: active

Codexus is a Codex execution harness. Harness-related decisions must not rely
primarily on local intuition when a relevant upstream harness already exists.
Before changing architecture, runtime behavior, orchestration policy, memory,
skills, provider/auth handling, or Codex-native adapter behavior, consult the
mandatory reference set below and record the mapping.

## Mandatory References

1. [ultraworkers/claw-code](https://github.com/ultraworkers/claw-code)
   - Role: parity-first CLI and harness behavior reference.
   - Use for: CLI ergonomics, doctor/status JSON surfaces, permission modes,
     session state, slash-command expectations, tool/MCP/LSP surfaces,
     subagent/team surfaces, and parity fixture thinking.
   - Current audit note: on 2026-05-29, source clone succeeded and HEAD
     `4d3dc5b` was inspected. Use `README.md`, `USAGE.md`, `PARITY.md`,
     `rust/README.md`, `rust/MOCK_PARITY_HARNESS.md`, and the contract docs as
     the active source baseline.
2. [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent)
   - Role: evolutionary agent and self-improvement reference.
   - Use for: memory, skill creation and improvement, session search,
     skill lifecycle maintenance, cron scheduling, gateways, terminal
     backends, isolated subagents, toolsets, and context-file behavior.
3. [Gitlawb/openclaude](https://github.com/Gitlawb/openclaude)
   - Role: open coding-agent runtime, provider, and session architecture
     reference.
   - Use for: provider profiles, Codex OAuth and Codex CLI auth reuse, tool
     loops, slash commands, MCP integration, headless service boundaries,
     bidirectional streaming, permission requests, descriptor-first provider
     metadata, hook chains, fallback agents, and multi-provider divergences.

## Decision Routing

- CLI/session parity: start with `ultraworkers/claw-code`, then compare
  OpenClaude where provider/session behavior matters.
- Evolution loops: start with Hermes Agent, then adapt to Codexus with local,
  source-linked, promotion-gated artifacts.
- Provider/auth/runtime boundaries: start with OpenClaude, especially Codex
  OAuth, existing `~/.codex/auth.json`, provider profiles, descriptor metadata,
  and permission-request flows.
- Codex-native adapter behavior: start with Codexus' thin-skill constraint, then
  compare OpenClaude's terminal-first workflow and Hermes' conversation/gateway
  loops. Do not create a second chat loop unless the design explicitly says why
  Codex-native operation is insufficient.
- Sibling harnesses are references only: Codexus has no dependency on or adapter
  for them, and sibling Codex-side harnesses must not replace the three mandatory
  harness references above.

## Required Process

For every meaningful harness design or implementation change:

1. Identify which mandatory reference paths apply.
2. Fetch current upstream evidence with `git clone`, `gh repo view`, web docs,
   or local checked-out copies.
3. Record exact source paths, URLs, commit dates, or access failures.
4. Extract the behavior pattern before proposing the Codexus version.
5. Map the pattern to Codexus constraints: authenticated local Codex CLI,
   durable ledger, verification gate, replay-gated skills, local auditability,
   and English/Korean documentation.
6. If Codexus intentionally diverges, record:
   - `Constraint`: what forces the divergence.
   - `Rejected`: the upstream approach not taken and why.
   - `Decision`: the Codexus behavior.
   - `Risk`: what may need revisiting.
7. Update both the English document and the matching `docs/ko/...` document.

## Implementation Gate

A harness change is incomplete if it changes one of these surfaces without a
reference note or audit update:

- CLI command contract
- run/session state
- verification and repair loop
- memory, skill, replay, or curator behavior
- provider/auth/session model
- permission or approval behavior
- Codex-native adapter behavior
- subagent/team orchestration
- scheduled or unattended execution

If a mandatory source is unavailable, do not silently substitute another
project. Record the failure, use the last documented baseline only as
provisional guidance, and add a follow-up to re-audit the source when access is
restored.
