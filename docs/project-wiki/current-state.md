# Current State

[Korean](../ko/project-wiki/current-state.md)

This page gives a quick project-management snapshot. For exact coverage, read
[Implementation status](../implementation-status.md), [JSON contract](../json-contract.md),
and the latest [release evidence](../release-evidence/0.2.8.md).

## Baseline

- Current release-prep baseline: `0.2.8`.
- Stable execution path: local authenticated `codex exec --json` supervised by
  Codexus.
- Stable management expectation: stable JSON fields stay frozen through the
  current stable line; experimental surfaces may be added without promotion.
- Package entrypoints: `cx` and `codexus`.

## What Exists

Codexus has a working harness spine:

- durable run ledgers under `.codexus/runs/<run-id>/`,
- verification gates and bounded repair loops,
- typed JSON error envelopes,
- session status, checkpoint, verification, HUD, and notify-hook evidence,
- memory lifecycle and replay-gated skills,
- schema, slop, supply-chain, LSP, repo graph, release, and contract checks,
- experimental app-instance observation summaries and owned-process controls,
- app-instance profile preflight, split observation signals, bounded evidence
  collection, a read-only evidence dashboard over app/wiki/LSP evidence,
  aggregate evidence checks, and explicit evidence bundle export,
- release/update-channel hardening and cache-only advisory update notices,
- experimental wiki context approvals, relay, decision, loop-breaker, and
  autopilot contract surfaces.

The current project direction is not to replace Codex. Codexus keeps Codex as
the engine and adds evidence, records, boundaries, and gates around it.

## What Is Still Gated

The following are intentionally not stable completion authorities:

- live Desktop app-server turn attachment,
- routine live model-in-the-loop replay,
- automatic prompt injection of retrieved skills or wiki context,
- full autopilot execution,
- plugin always-on supervision,
- app-instance observations as app health or completion authority,
- relay convergence as task completion authority.

Use [Remaining work](../remaining-work.md) and
[Roadmap Kanban](../roadmap-kanban.html) for the active backlog.

## Current Management Signal

The project has moved from "build the MVP harness" to "promote only the
surfaces that have clear evidence contracts." Work should be grouped into
release-sized themes rather than tiny version bumps. Commits can stay small,
but releases should tell a coherent story.

Useful current themes:

- contract-promotion readiness for `0.2.0`,
- stronger project observability and LLM context management,
- app-instance lifecycle, observation summary, and authority-boundary hardening,
- relay/autopilot evidence gates,
- generated wiki and graph context that remain explicit and non-injected.
