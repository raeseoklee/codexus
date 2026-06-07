# Codexus Project LLM Wiki

[Korean](../ko/project-wiki/README.md)

This is the checked-in project-management wiki for Codexus. It is meant for
maintainers and LLM agents that need to recover project context quickly before
planning, reviewing, or implementing work.

It is separate from the experimental generated repository wiki described in
[Compiled repository wiki](../design/18-compiled-repository-wiki.md). The
generated wiki is a product surface under Codexus control. This project wiki is
a curated management artifact in `docs/project-wiki/`.

## Authority

This wiki is a navigation and synthesis layer, not a completion or verification
authority.

Source of truth order:

1. Code, tests, schemas, release workflows, and package metadata.
2. Release evidence under [release-evidence](../release-evidence/).
3. Contract and status docs such as [JSON contract](../json-contract.md),
   [Implementation status](../implementation-status.md), and
   [Remaining work](../remaining-work.md).
4. This project wiki.

If this wiki disagrees with source artifacts, update the wiki. Do not use wiki
text to override evidence gates.

## Pages

| Page | Use it for |
| --- | --- |
| [Current state](current-state.md) | Fast orientation on what Codexus is, what is stable, what is experimental, and what remains gated. |
| [Operating model](operating-model.md) | Project principles, evidence rules, dogfood workflow, and how to decide whether work is complete. |
| [Release management](release-management.md) | Version policy, release gates, trusted publishing, and post-publish evidence expectations. |
| [Roadmap and backlog](roadmap-and-backlog.md) | Management-level view of active themes and next work groups. |
| [Tooling](tooling.md) | Optional context tools such as `llms.txt` and Repomix, with license and authority boundaries. |
| [Agent onboarding](agent-onboarding.md) | First-read checklist for LLM agents working in this repository. |

## How To Use

For a new task:

1. Read [Current state](current-state.md) and [Operating model](operating-model.md).
2. Jump to the source docs linked from the relevant page.
3. Create a Codexus checkpoint before risky edits.
4. Verify with the smallest evidence command that proves the claim.
5. Update this wiki only when the project-management summary changes.

For external context sharing, start with [llms.txt](../../llms.txt) or the
optional [Tooling](tooling.md) workflow. Tool-generated context packs are
advisory projections; inspect them before use.

Useful commands:

```bash
node codex/skills/codexus/scripts/cx.mjs session status --json
node codex/skills/codexus/scripts/cx.mjs session checkpoint "before <task>" --json
node codex/skills/codexus/scripts/cx.mjs session verify --verify "npm run ci" --json
node codex/skills/codexus/scripts/cx.mjs repo check --gate --json
node codex/skills/codexus/scripts/cx.mjs release check --gate --json
```

## Boundary

This wiki may summarize judgment, but it must label judgment as judgment. Facts
that can gate work must remain derivable from source artifacts or command
outputs.
