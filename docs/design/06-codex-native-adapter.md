# Codex-Native Adapter

[한국어](../ko/design/06-codex-native-adapter.md)

## Intent

Codexus needs a Codex-native surface so users can keep working inside an interactive Codex session instead of repeatedly starting isolated `cx run "<prompt>"` calls.

The adapter should not create a second chat implementation. It should let the current Codex conversation remain the primary interaction loop while Codexus supplies durable evidence, verification, replay, memory, and skill workflows.

## Runtime Shape

Implemented MVP:

```text
Codex session
  -> $codexus skill
  -> codex/skills/codexus/scripts/cx.mjs
  -> Codexus core CLI
  -> .codex-harness ledger / memory / skills
```

The skill is intentionally thin. It delegates to the same core used by the external `cx` CLI.

For user-facing invocation examples, see
[Using Codexus inside Codex](../codex-session-usage.md).

The adapter is the first installed piece of the broader
[session-native supervision](07-supervised-sessions.md) direction. The target is
not a separate chat surface or an external `codex exec resume` thread; it is an
OMX-like harness that the current Codex TUI session can explicitly call through
skills, marker-bounded AGENTS guidance, local state, optional hooks/status, and
optional tmux workers.

## Installation

The repository stores the source skill at:

```text
codex/skills/codexus/
```

Install it into the local Codex skill store:

```bash
npm run install:codex-skill -- --json
```

Global npm installs run the same adapter installer automatically unless
`CODEXUS_INSTALL_CODEX_SKILL=0` is set.

The installer copies the skill to:

```text
${CODEX_HOME:-~/.codex}/skills/codexus
```

It also writes `codexus-root.json` so the installed skill can find this repository and call the local Codexus core.

`cx doctor --json` includes a `codexus.skill_install` check. It reports whether
the installed skill is missing, stale, or tree-hash matched to this repository.
The installer writes source and installed tree hashes into `codexus-root.json`.
A stale install is a warning, not an automatic mutation; reinstall explicitly
with the command above.

## Supported First Commands

Inside Codex, prefer low-risk commands first:

```bash
node codex/skills/codexus/scripts/cx.mjs doctor --json
node codex/skills/codexus/scripts/cx.mjs cancel <run-id> --reason "<why>" --json
node codex/skills/codexus/scripts/cx.mjs status <run-id> --json
node codex/skills/codexus/scripts/cx.mjs events tail <run-id> --json
node codex/skills/codexus/scripts/cx.mjs verify <run-id> --json
node codex/skills/codexus/scripts/cx.mjs memory search "<query>" --json
node codex/skills/codexus/scripts/cx.mjs memory review --json
node codex/skills/codexus/scripts/cx.mjs skill review <skill-id> --json
node codex/skills/codexus/scripts/cx.mjs skill index --json
node codex/skills/codexus/scripts/cx.mjs replay skill <skill-id> --json
node codex/skills/codexus/scripts/cx.mjs adapt omx retrieve --task "<task>" --json
```

Supervised handoff is supported but should be deliberate:

```bash
node codex/skills/codexus/scripts/cx.mjs run --driver codex-exec --json "<bounded task>"
```

This starts a separate non-interactive Codex process. It is useful for bounded supervised runs, not for replacing the current interactive conversation.

## Design Rules

- Keep Codex as the interactive loop.
- Keep Codexus as the evidence and orchestration layer.
- Keep the adapter thin and deterministic.
- Do not duplicate workflow-kernel logic inside the skill.
- Do not auto-promote skills from inside the adapter.
- Prefer status, verification, replay, memory, and review commands before launching nested Codex runs.
- Before changing adapter behavior, apply the
  [reference-first harness policy](../references/01-reference-first-harness-policy.md):
  compare Claw's JSON/status/permission contracts, OpenClaude's
  terminal/provider/runtime surfaces, and Hermes' conversation/gateway loops,
  then record why the Codexus adapter should remain thin or intentionally grow.
- If the adapter exposes a visible command for an unsupported protocol or
  app-server path, return a truthful status envelope instead of implying support
  from command presence.

## Next Steps

- Add a marker-bounded project/user AGENTS overlay documenting session-native
  `$codexus` usage.
- Add `cx setup codex-session`, `cx session status`, `cx session checkpoint`,
  and `cx session verify` as the first session-native command slice.
- Add explicit adapter injection only if the user-visible approval step and
  non-injected context artifact contract are preserved.
- Add app-server based turns only after supervised lifecycle and JSON-RPC
  roundtrip contracts are tested.
- Add richer permission, approval, and policy-block event display.
- Add a migration from `.codex-harness` to `.codexus` only with backward-compatible reads.
