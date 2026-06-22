# Codexus

[![CI](https://github.com/raeseoklee/codexus/actions/workflows/ci.yml/badge.svg)](https://github.com/raeseoklee/codexus/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/raeseoklee/codexus/blob/main/LICENSE)
[![Node.js >=22](https://img.shields.io/badge/Node.js-%3E%3D22-339933.svg)](https://github.com/raeseoklee/codexus/blob/main/package.json)

[Korean](https://github.com/raeseoklee/codexus/blob/main/docs/ko/README.md)

**Codexus is a harness engineering layer for OpenAI's Codex CLI.**

It keeps the same local Codex engine and auth, then adds durable run ledgers,
verification gates, bounded repair loops, session evidence, memory, and truthful
status around the work. Tell it what to change and how to verify it; Codexus
runs the local authenticated Codex CLI, runs your verification command, feeds
real failure output back into a bounded repair loop when the check fails, and
reports `complete` only when the check passes.

Every run is saved under `.codexus/runs/<id>`, so you can inspect, resume,
verify, or cancel it even after a terminal closes or a process crashes.

Same Codex model. Same local Codex auth. More supervision, recovery, memory, and
truthful status around the work.

## Why Use It

| Plain Codex CLI | With Codexus |
| --- | --- |
| A task can look done before tests pass. | `complete` only after your verify command passes. |
| A run lives in one terminal session. | Every run has a durable ledger under `.codexus/runs/<id>`. |
| Failure output disappears into scrollback. | Failures become bounded repair context and saved evidence. |
| Lessons are manual. | Useful lessons can become memory or replay-gated skills. |
| Experimental surfaces are easy to overstate. | Gated features report what is proven, configured, or unavailable. |

## See It

From a shell:

```bash
npm install -g codexus
codexus run --verify "npm test" "fix the parser regression"
```

Codexus is a command-line tool, so install it globally. The npmjs sidebar may
show `npm i codexus`; that is npm's local dependency form and will not put the
`codexus` command or the `cx` short alias on your normal `PATH`.

Codexus runs Codex, then runs `npm test`. If the test fails, Codexus gives Codex
the real failing output and retries within the configured repair budget. The run
is `complete` only when the verification command passes.

![Redacted Codexus supervised run demo](https://raw.githubusercontent.com/raeseoklee/codexus/main/docs/assets/codexus-supervised-run.gif)

This is a redacted fixture tape, not a live model transcript. It shows the
user-facing loop without exposing local paths, auth state, or private output.
The media uses the clean pass path for first-impression clarity; repair behavior
is described above and validated in release evidence.
The reproducible VHS source is in
[docs/demo](https://github.com/raeseoklee/codexus/blob/main/docs/demo/README.md);
full release verification remains in
[release evidence](https://github.com/raeseoklee/codexus/blob/main/docs/release-evidence/0.2.6.md).

> The 0.2 stable contract is intentionally narrow: live app-server turns,
> routine live model replay, and automatic prompt injection remain gated off.
> Architecture checks and manual wiki context are stable only for the bounded
> evidence surfaces documented in [Status](#status).

## Use It In Codex CLI Chat

Codexus is not only a standalone `codexus` command. The npm package installs a
Codex-native `codexus` skill, so you can stay inside your current Codex CLI/TUI
chat and ask Codex to call the local Codexus core for evidence.

One-time project setup from a shell:

```bash
codexus setup codex-session --scope project --enable-notify-hook --json
```

Then type normal requests in the Codex chat:

```text
Use the codexus skill and show the current session status.
```

```text
Codexus, create a checkpoint named "before parser cleanup".
```

```text
Codexus, run session verification with "npm test" and summarize the evidence.
```

```text
Codexus, search memory for "parser regression" and use only relevant findings.
```

The current Codex conversation remains the main working loop. Codexus adds
durable state, checkpoints, verification artifacts, memory lookup, replay, and
skill evidence. It does not create a competing chat session.

Full guide: [Using Codexus inside Codex](https://github.com/raeseoklee/codexus/blob/main/docs/codex-session-usage.md).

## Project Management Wiki

Maintainers and LLM agents should use the checked-in
[Project LLM Wiki](https://github.com/raeseoklee/codexus/blob/main/docs/project-wiki/README.md) for fast project context. It is
a management/navigation artifact, not the experimental generated repository
wiki and not a completion authority.

## Quick Start

Install the current stable package:

```bash
npm install -g codexus
codexus --version
codexus doctor --json
```

Use the global form above for normal CLI use. A local `npm i codexus` installs
Codexus into the current project's `node_modules` and is not the recommended
user install path.

Run a supervised task with verification:

```bash
codexus run --verify "npm test" "fix the failing tests"
```

Global npm installs also install the Codex-native skill adapter into
`${CODEX_HOME:-~/.codex}/skills/codexus` by default. Set
`CODEXUS_INSTALL_CODEX_SKILL=0` when you need a CLI-only install.

Detailed setup: [Quick start](https://github.com/raeseoklee/codexus/blob/main/docs/quickstart.md).

## Install Options

Install from npm:

```bash
npm install -g codexus
```

Install with GitHub Pages if you prefer a reviewable shell installer:

```bash
curl -fsSL https://raeseoklee.github.io/codexus/install.sh | sh
```

For a review-first install:

```bash
curl -fsSLO https://raeseoklee.github.io/codexus/install.sh
less install.sh
sh install.sh
```

Run `sh install.sh --help` to print the options (configured through environment variables) without installing anything.

Clone and verify the repository:

```bash
git clone https://github.com/raeseoklee/codexus.git
cd codexus
npm run ci
npm run lsp:check
npm run package:smoke
```

## Core Features

- Evidence-backed run ledgers under `.codexus/runs/<run-id>/`
- Verification gates with bounded repair loops
- Timeout, SIGINT, and external `cx cancel <run-id>` cancellation paths
- Structured JSON error envelopes for automation
- Memory records, curation, and bounded retrieval
- Replay-gated skill proposal, review, promotion, improvement, export, and deprecation
- Codex-native `$codexus` adapter for using the same core inside a Codex session
- Session-native quality evidence guard and subagent claim recorder/completion handoff
- Schema artifact validation, stale-lock recovery, and local CI parity
- Automatic migration from legacy `.codex-harness/` into `.codexus/`
- Gated app-server and model-replay experiments plus experimental app-instance
  and explicit-approval cron/gateway dispatch surfaces that do not affect the
  stable `codex exec --json` path

## Status

Codexus 0.2.x is usable as a local harness with a narrow stable path around
`codex exec --json`, stable local evidence gates, and a first stable promotion
of architecture and manual wiki context surfaces. Live app-server turns,
routine live model replay, and automatic prompt injection remain intentionally
gated.

## Support Matrix

| Surface | 0.2 status |
| --- | --- |
| Supervised `codex exec --json` runs, verification/repair, run ledger, resume/cancel/status/events | Stable path |
| Codex-native `$codexus` skill, session status/checkpoint/verify/hud, notify-hook evidence | Stable session evidence surface |
| `slop check`, `supply-chain check`, schema subset engine, replay parity, memory/skill lifecycle | Stable local evidence surfaces |
| `architecture check --gate`, `repo check --gate`, `release check --gate`, `lsp check --gate`, `wiki context --fresh-only --gate` | Stable local evidence gates for their documented bounded contracts |
| `repo graph build/check/import/search/explain`, `wiki build/check/export`, `wiki context approve/approvals` | Experimental graph/wiki evidence surface; context approval artifacts are visible, listable, and non-injected |
| `app instance profile list/status/logs/start/stop/evidence record/evidence list/evidence summary/probe/logs/metrics/screenshot/browser/adapters` | Experimental owned-process and observation-evidence surface; live start/stop work only for Codexus-owned instances, and observations cite an `instanceId` without becoming authority |
| app-server, cron/gateway, LSP adapters, model replay, adapter injection, tmux workers, native subagent launch | Experimental/deferred; app-server remains read-only, cron/gateway can dispatch with explicit approval while reporting scheduler readiness gaps, LSP protocol-server lifecycle remains unavailable, and other surfaces stay status/record/launch-contract/gated |
| autopilot contract layer | Experimental foundation slice implemented (`plan`, `contract validate/approve/scope-check`, `run-gate`, relay recorder/checker, relay adapter status); live `autopilot run` and active relay drivers remain deferred to the 0.2/0.3 track |

See [Feature reference](https://github.com/raeseoklee/codexus/blob/main/docs/features.md),
[Implementation status](https://github.com/raeseoklee/codexus/blob/main/docs/implementation-status.md),
and [Remaining work](https://github.com/raeseoklee/codexus/blob/main/docs/remaining-work.md)
for exact coverage and gaps.

## Requirements

- Node.js 22 or newer
- npm for the installer and package workflow
- Git
- The local `codex` CLI for real Codex runs
- A logged-in Codex CLI session for the `codex-exec` driver

Most tests use a deterministic mock driver so CI does not require model or
network access; real runs use the local authenticated Codex CLI.

## Common Commands

```bash
codexus doctor --json
codexus init --with-docs --json
codexus setup codex-session --scope project --always-on --enable-notify-hook --json
codexus session status --json
codexus session hud --json
codexus session checkpoint "before risky refactor" --json
codexus session verify --auto --json
codexus session verify --verify "npm test" --json
codexus session slop --json
codexus session subagent probe --record --json
codexus session subagent launch --role reviewer --task "review the staged diff" --json
codexus session subagent complete --task-id <id> --claim "review found no API drift" --assumptions-surfaced pass --json
codexus session subagent record --file <result.json> --json
codexus session workers status --json
codexus lsp status --json
codexus lsp check --gate --json
codexus schema engine --json
codexus replay parity --json
codexus repo graph build --graph-provider codexus-lite --scope "src/**" --json
codexus repo graph check --graph <graph-id-or-path> --gate --json
codexus wiki build --json
codexus wiki context --topic verification --fresh-only --gate --json
codexus wiki context --topic verification --approve --approved-by "$USER" --json
codexus wiki context approvals --json
codexus slop check --scope "src/**" --gate --json
codexus supply-chain check --gate --json
codexus release check --gate --json
codexus app instance profile list --json
codexus app instance start --profile web --worktree . --json
codexus app instance status --json
codexus app instance evidence record --instance-id <id> --kind browser --source manual --summary "checked app" --json
codexus app instance evidence probe --instance-id <id> --url http://127.0.0.1:<port>/ --json
codexus app instance evidence logs --instance-id <id> --json
codexus app instance evidence metrics --instance-id <id> --json
codexus app instance evidence screenshot --instance-id <id> --evidence-path ./screen.png --json
codexus app instance evidence browser --instance-id <id> --capture ./browser-capture.json --json
codexus app instance evidence adapters --json
codexus app instance evidence summary --json
codexus app instance stop --instance-id <id> --json
codexus run --verify "npm test" "fix the parser regression"
codexus cancel <run-id> --reason "no longer needed" --json
codexus status <run-id> --json
codexus events tail <run-id> --json
codexus verify <run-id> --json
codexus replay skill <skill-id> --json
codexus memory search "parser regression" --json
codexus skill review <skill-id> --json
codexus skill export <skill-id> --target codex --json
codexus schema check --json
codexus lsp adapters --json
codexus autopilot run-gate --policy <path> --json
codexus app-server experiment --dry-run --record --supervise-fake --json
```

Canonical bin: `codexus`. Supported short alias: `cx`.

## Documentation

- [Documentation index](https://github.com/raeseoklee/codexus/blob/main/docs/README.md)
- [Quick start](https://github.com/raeseoklee/codexus/blob/main/docs/quickstart.md)
- [Feature reference](https://github.com/raeseoklee/codexus/blob/main/docs/features.md)
- [Using Codexus inside Codex](https://github.com/raeseoklee/codexus/blob/main/docs/codex-session-usage.md)
- [Architecture](https://github.com/raeseoklee/codexus/blob/main/docs/design/01-architecture.md)
- [Detailed design](https://github.com/raeseoklee/codexus/blob/main/docs/design/02-detailed-design.md)
- [Evolution engine](https://github.com/raeseoklee/codexus/blob/main/docs/design/03-evolution-engine.md)
- [Codex-native adapter](https://github.com/raeseoklee/codexus/blob/main/docs/design/06-codex-native-adapter.md)
- [Session-native supervision](https://github.com/raeseoklee/codexus/blob/main/docs/design/07-supervised-sessions.md)
- [Supply-chain evidence](https://github.com/raeseoklee/codexus/blob/main/docs/design/11-supply-chain-evidence.md)
- [Autopilot contract](https://github.com/raeseoklee/codexus/blob/main/docs/design/12-autopilot-contract.md)
- [Reference governance](https://github.com/raeseoklee/codexus/blob/main/docs/references/README.md)
- [Implementation status](https://github.com/raeseoklee/codexus/blob/main/docs/implementation-status.md)
- [Remaining work](https://github.com/raeseoklee/codexus/blob/main/docs/remaining-work.md)
- [0.1.0 stable readiness plan](https://github.com/raeseoklee/codexus/blob/main/docs/plans/2026-05-31-0.1.0-stable-readiness-plan.md)
- [0.2.6 release evidence](https://github.com/raeseoklee/codexus/blob/main/docs/release-evidence/0.2.6.md)
- [JSON contract](https://github.com/raeseoklee/codexus/blob/main/docs/json-contract.md)
- [Public release checklist](https://github.com/raeseoklee/codexus/blob/main/docs/public-release.md)

Selected documents have Korean translations under `docs/ko/`, and English
documents link to them as `Korean`.

## Safety Boundaries

Codexus intentionally avoids private ChatGPT/Codex backend APIs. The stable
driver boundary is the local authenticated Codex CLI. Experimental surfaces are
feature-gated and report dry-run, policy, approval, and evidence records before
any live dispatch path is enabled.

<details>
<summary>Codexus banner</summary>

```text
 ░▒▓██████▓▒░ ░▒▓██████▓▒░░▒▓███████▓▒░░▒▓████████▓▒░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░░▒▓█▓▒░░▒▓███████▓▒░
░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░      ░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░
░▒▓█▓▒░      ░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░      ░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░
░▒▓█▓▒░      ░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░░▒▓█▓▒░▒▓██████▓▒░  ░▒▓██████▓▒░░▒▓█▓▒░░▒▓█▓▒░░▒▓██████▓▒░
░▒▓█▓▒░      ░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░      ░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░░▒▓█▓▒░      ░▒▓█▓▒░
░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░      ░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░░▒▓█▓▒░      ░▒▓█▓▒░
 ░▒▓██████▓▒░ ░▒▓██████▓▒░░▒▓███████▓▒░░▒▓████████▓▒░▒▓█▓▒░░▒▓█▓▒░░▒▓██████▓▒░░▒▓███████▓▒░
```

</details>

## Contributing

Contributions are welcome after the repository is public. Start with
[CONTRIBUTING.md](https://github.com/raeseoklee/codexus/blob/main/CONTRIBUTING.md), [SECURITY.md](https://github.com/raeseoklee/codexus/blob/main/SECURITY.md), and
[ROADMAP.md](https://github.com/raeseoklee/codexus/blob/main/ROADMAP.md).

## License

Codexus is released under the [MIT License](https://github.com/raeseoklee/codexus/blob/main/LICENSE).

OpenAI and Codex are trademarks of their respective owners. This project is not
affiliated with or endorsed by OpenAI.
