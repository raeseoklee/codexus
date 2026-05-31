---
name: codexus
description: Run Codexus from inside an interactive Codex session. Use when the user asks for Codexus, cx/codexus harness operations, supervised Codex execution, run ledger/status, verification reruns, replay-gated skills, memory search, or a Codex-native adapter workflow that should call the local Codexus core instead of starting a separate manual terminal flow.
---

# Codexus

Codexus is a Codex execution harness. This skill is the Codex-native adapter surface: stay in the current Codex session, but call the local Codexus core when the task needs durable run state, verification evidence, replay, memory, or skill review.

## Quick Start

Use the bundled wrapper instead of assuming `cx` is globally installed:

```bash
node codex/skills/codexus/scripts/cx.mjs doctor --json
```

If this skill has been installed into `$CODEX_HOME/skills`, the same wrapper should still work because the installer writes the Codexus repo path into the installed skill.

## Decision Rules

- Use normal Codex interaction for direct code edits, explanations, and small one-off checks.
- Use Codexus when the user asks for harness behavior: durable run ledger, status, cancellation, verification, replay, memory, skill proposal/review/promotion/export, bounded context retrieval, or supervised handoff.
- Prefer session-native and read-only Codexus commands first inside an ongoing conversation: `session status`, `session checkpoint`, `session verify`, `status`, `events tail`, `verify`, `replay`, `memory search`, `memory review`, `skill review`, `skill index`, `locks list`, `schema check`, `schema validate-run`.
- Use `run --driver codex-exec` only when an explicit supervised sub-run is useful. It starts a separate `codex exec` process and should not replace the active conversation for ordinary edits.
- Preserve the current conversation as the primary interaction surface. Codexus augments it; it does not create a competing chat loop.

## Common Commands

```bash
node codex/skills/codexus/scripts/cx.mjs setup codex-session --scope project --json
node codex/skills/codexus/scripts/cx.mjs session status --json
node codex/skills/codexus/scripts/cx.mjs session checkpoint "before risky change" --json
node codex/skills/codexus/scripts/cx.mjs session verify --verify "npm test" --json
node codex/skills/codexus/scripts/cx.mjs doctor --json
node codex/skills/codexus/scripts/cx.mjs runs list --json
node codex/skills/codexus/scripts/cx.mjs cancel <run-id> --reason "<why>" --json
node codex/skills/codexus/scripts/cx.mjs status <run-id> --json
node codex/skills/codexus/scripts/cx.mjs events tail <run-id> --json
node codex/skills/codexus/scripts/cx.mjs verify <run-id> --json
node codex/skills/codexus/scripts/cx.mjs memory search "<query>" --json
node codex/skills/codexus/scripts/cx.mjs memory review --json
node codex/skills/codexus/scripts/cx.mjs memory curate --json
node codex/skills/codexus/scripts/cx.mjs skill review <skill-id> --json
node codex/skills/codexus/scripts/cx.mjs skill index --json
node codex/skills/codexus/scripts/cx.mjs skill improve <skill-id> --reason "<why>" --json
node codex/skills/codexus/scripts/cx.mjs replay skill <skill-id> --with-model-replay --json
node codex/skills/codexus/scripts/cx.mjs locks list --json
node codex/skills/codexus/scripts/cx.mjs schema check --json
node codex/skills/codexus/scripts/cx.mjs schema validate-run <run-id> --json
node codex/skills/codexus/scripts/cx.mjs session subagent launch --role reviewer --task "review the staged diff" --json
node codex/skills/codexus/scripts/cx.mjs session subagent complete --task-id <id> --claim "<bounded subagent claim>" --json
node codex/skills/codexus/scripts/cx.mjs app-server roundtrip --dry-run --json
node codex/skills/codexus/scripts/cx.mjs app-server experiment --dry-run --record --probe-process --supervise-fake --json
```

For a supervised handoff:

```bash
node codex/skills/codexus/scripts/cx.mjs run --driver codex-exec --json "<bounded task>"
```

## Workflow

1. Classify whether the request benefits from Codexus evidence or can stay as normal Codex work.
2. If using Codexus, run the smallest command that answers the need.
3. Read the JSON output and summarize the result in the Codex conversation.
4. If a command creates or updates a run ledger, mention the run id and relevant artifact path.
5. If verification fails, keep working in the current session unless the user explicitly wants a supervised repair run.

## References

- For command selection, read `references/commands.md`.
- For runtime positioning and limitations, read `references/runtime.md`.
