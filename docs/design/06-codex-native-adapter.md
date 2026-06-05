# Codex-Native Adapter

[Korean](../ko/design/06-codex-native-adapter.md)

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
  -> .codexus ledger / memory / skills
```

The skill is intentionally thin. It delegates to the same core used by the external `cx` CLI.

For user-facing invocation examples, see
[Using Codexus inside Codex](../codex-session-usage.md).

The adapter is the first installed piece of the broader
[session-native supervision](07-supervised-sessions.md) direction. The target is
not a separate chat surface or an external `codex exec resume` thread; it is a
Codex-native session harness that the current Codex TUI session can
explicitly call through skills, marker-bounded AGENTS guidance, local state,
optional hooks/status, and optional tmux workers.

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

## Update Notifications

Codexus should surface update availability automatically when it is already
being used, but it must not turn normal commands into noisy network probes.

Implemented first slice:

- `cx update check --json` is an explicit experimental command;
- npm `latest` dist-tag lookup is bounded by a TTL cache and short timeout;
- `version --json`, `doctor --json`, and `session status --json` expose an
  additive cache-only `update` summary without querying the registry;
- the `$codexus` skill can summarize `update.status: "available"` inside the
  active Codex chat when Codexus is invoked from a session;
- primary commands do not fail when the update check cannot reach the registry.

Required gates:

- `CODEXUS_NO_UPDATE_CHECK=1` disables registry checks;
- CI/non-interactive release verification should default to disabled or
  cache-only update checks;
- update notifications are informational only and do not affect completion,
  verification, or release gates;
- prerelease/`next` checks require explicit opt-in;
- automatic installation is out of scope for this slice.

## Skill Versus Plugin Packaging

Codexus currently installs as a Codex skill adapter because the first product
need is a thin, explicit command surface inside the active Codex conversation.
That remains the primary path.

A Codex plugin package can still be useful later, but it should not be treated
as proof of always-on behavior by itself. Based on the local Codex plugin shape,
a plugin can bundle skills, scripts, assets, MCP/app descriptors, and
marketplace metadata. That packaging improves distribution and discoverability,
but it does not replace the existing always-on evidence sources:

- AGENTS overlay guidance;
- trust-gated notify-hook heartbeat;
- local `.codexus/session` state;
- explicit `cx` commands and JSON evidence.

Recommended direction:

1. Keep the npm-installed `$codexus` skill as the stable adapter.
2. Add a plugin-packaging experiment only after the update-notification slice
   lands, so plugin users can also see stale package/adapter status.
3. Treat plugin packaging as `stability: experimental` until installed-plugin
   status can be diagnosed by `cx doctor --json`.
4. Do not move workflow-kernel logic into plugin-local scripts.
5. Do not claim plugin installation creates always-on supervision unless a
   notify hook or other observed heartbeat has actually dispatched.

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

## Implemented Session-Native Slices

- Marker-bounded project/user AGENTS overlays document session-native Codexus
  usage.
- `cx setup codex-session`, `cx session status`, `cx session hud`,
  `cx session migrate`, `cx session checkpoint`, `cx session verify`,
  `cx session notify`, and `cx session workers status` provide the first
  session-native command surface.
- Notify-hook setup is trust-gated, chain-preserving, atomic, reversible, and
  distinguishes configured hooks from observed `turn-ended` dispatch.
- Adapter context remains approval-artifact based; automatic prompt injection is
  intentionally unsupported.
- `.codexus` is the canonical runtime root. Legacy `.codex-harness` directories
  are migrated into `.codexus` and removed when the CLI sees them.

## Remaining Steps

- Add app-server based turns only after supervised lifecycle, non-disruptive
  attachment, and JSON-RPC event contracts are tested.
- Add richer permission, approval, and policy-block event display.
- Keep unsupported protocol paths visible as truthful status envelopes rather
  than implying support from command presence.
