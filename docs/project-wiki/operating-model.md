# Operating Model

[Korean](../ko/project-wiki/operating-model.md)

Codexus development uses the same rule as Codexus itself: facts may gate;
judgment advises; projections are not truth.

Primary source docs:

- [Operational control invariants](../design/17-operational-control-invariants.md)
- [Harness engineering alignment](../design/13-harness-engineering-alignment.md)
- [Subagent evidence supervision](../design/09-subagent-evidence-supervision.md)
- [Quality evidence guard](../design/10-quality-evidence-guard.md)

## Core Rules

- Do not claim completion from model consensus, UI state, task labels, or
  generated summaries.
- Gate completion only on derivable evidence: tests, schema checks, release
  checks, repo checks, supply-chain checks, or explicitly approved verification.
- Keep experimental surfaces visibly experimental in JSON output and docs.
- Treat generated artifacts as projections unless their schema and source links
  make them evidence.
- Record rejected alternatives when they prevent future agents from repeating
  the same path.

## Dogfood Workflow

Use Codexus as the project-management harness whenever it adds evidence:

```bash
node codex/skills/codexus/scripts/cx.mjs session checkpoint "before <task>" --json
node codex/skills/codexus/scripts/cx.mjs session status --json
node codex/skills/codexus/scripts/cx.mjs session verify --verify "npm run ci" --json
```

For narrower work, prefer narrower gates:

```bash
node codex/skills/codexus/scripts/cx.mjs repo check --gate --json
node codex/skills/codexus/scripts/cx.mjs lsp check --gate --json
node codex/skills/codexus/scripts/cx.mjs release policy --gate --json
node codex/skills/codexus/scripts/cx.mjs release check --gate --json
```

## Completion Standard

A task is ready to close when:

- the changed files match the requested scope,
- source docs and Korean translations are updated when user-facing docs change,
- the relevant evidence command passes,
- known gaps are reported instead of hidden,
- the worktree state is intentional.

For release work, also require [Release management](release-management.md).

## Project Management Use Of LLM Wiki

This wiki should help LLM agents decide where to look first. It should not
become a parallel backlog, a second changelog, or a private memory store. If a
page needs to make an actionable claim, link to the source artifact that proves
it.
