# Using Codexus Inside Codex

[한국어](ko/codex-session-usage.md)

Codexus can be used in two ways:

- external CLI: `cx ...`
- Codex-native adapter: ask the `codexus` skill from inside an interactive Codex
  session

The Codex-native path keeps the current Codex conversation as the primary
working loop. Codexus only adds durable status, verification, replay, memory,
schema, and skill evidence.

Design direction: Codexus is moving toward an OMX-like session-native runtime.
The installed skill is the first layer. Future setup will add marker-bounded
AGENTS guidance, session state, checkpoint/verification commands, and optional
hook/status/tmux integration. See
[Session-native supervision](design/07-supervised-sessions.md).

## Install the Adapter

The published npm package installs the CLI and the Codex skill adapter by
default on global installs:

```bash
npm install -g codexus@next
```

For a CLI-only global install, opt out explicitly:

```bash
CODEXUS_INSTALL_CODEX_SKILL=0 npm install -g codexus@next
```

To refresh or reinstall the Codex skill adapter from that global package:

```bash
node "$(npm root -g)/codexus/scripts/install-codex-skill.mjs" --json
```

The GitHub Pages installer also installs the adapter by default:

```bash
curl -fsSL https://raeseoklee.github.io/codexus/install.sh | sh
```

To install or refresh only the adapter from a cloned repository:

```bash
npm run install:codex-skill
```

The adapter is installed to:

```text
${CODEX_HOME:-~/.codex}/skills/codexus
```

Verify it:

```bash
cx doctor --json
```

Look for the `codexus.skill_install` check. It should report `pass`; stale or
missing installs are warnings until you reinstall explicitly.

## How to Invoke It in Codex

In an interactive Codex session, mention `codexus` or `$codexus` and describe
the harness command or evidence you want.

Examples:

```text
codexus로 doctor 상태 확인해줘.
```

```text
$codexus runs list --json 결과를 보고 최근 run 상태를 요약해줘.
```

```text
codexus로 schema check를 실행하고 문제가 있으면 원인을 정리해줘.
```

```text
codexus로 run_... 상태와 events tail을 확인해줘.
```

```text
codexus memory search "parser regression" 결과를 현재 작업에 필요한 것만 요약해줘.
```

Codex will use the installed `codexus` skill, which calls:

```bash
node codex/skills/codexus/scripts/cx.mjs <command>
```

The wrapper discovers the Codexus repository from the installed skill metadata.
You do not need a global `cx` binary inside the Codex session.

## Good Codex-Session Commands

Prefer read-only or evidence-oriented commands first:

```bash
doctor --json
runs list --json
cancel <run-id> --reason "<why>" --json
status <run-id> --json
events tail <run-id> --json
verify <run-id> --json
schema check --json
schema validate-run <run-id> --json
memory search "<query>" --json
memory review --json
skill index --json
skill review <skill-id> --json
replay skill <skill-id> --json
```

As the session-native command surface lands, prefer checkpoint and session
verification commands before starting nested `cx run` sub-runs.

Use supervised runs deliberately:

```bash
run --driver codex-exec --json "<bounded task>"
```

This starts a separate non-interactive Codex process. It is useful for a
bounded, reproducible sub-run, but it should not replace the active interactive
conversation for normal code edits.

## When Not to Use Codexus

Use normal Codex interaction for:

- direct code edits in the current conversation,
- quick explanations,
- one-off local inspections that do not need a durable ledger,
- ordinary review or refactor work already being handled in the active session.

Use Codexus when you need:

- durable run status,
- verification reruns,
- event history,
- schema validation,
- memory retrieval,
- skill review/promotion evidence,
- replay-gated behavior,
- bounded context evidence,
- a bounded supervised handoff.

## Troubleshooting

If Codex does not seem to use the skill:

1. Run `cx doctor --json` and inspect `codexus.skill_install`.
2. Reinstall the adapter with `npm run install:codex-skill`.
3. In the Codex session, explicitly say `use the codexus skill`.
4. If needed, ask Codex to run the wrapper directly:

```bash
node codex/skills/codexus/scripts/cx.mjs doctor --json
```

If the wrapper cannot find the repository, set `CODEXUS_HOME` to the cloned
Codexus repository root or reinstall the adapter.
