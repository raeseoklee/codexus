# Codexus

[![CI](https://github.com/raeseoklee/codexus/actions/workflows/ci.yml/badge.svg)](https://github.com/raeseoklee/codexus/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js >=22](https://img.shields.io/badge/Node.js-%3E%3D22-339933.svg)](package.json)

[Korean](docs/ko/README.md)

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
codexus run --verify "npm test" "fix the failing parser tests"
```

Codexus is a command-line tool, so install it globally. The npmjs sidebar may
show `npm i codexus`; that is npm's local dependency form and will not put the
`codexus` / `cx` commands on your normal `PATH`.

Codexus runs Codex, then runs `npm test`. If the test fails, Codexus gives Codex
the real failing output and retries within the configured repair budget. The run
is `complete` only when the verification command passes.

> The 0.1.x stable line is intentionally narrow: live app-server turns, routine
> live model replay, and automatic prompt injection remain gated off. Live
> cron/gateway dispatch now exists as an explicit-approval experimental surface.
> See [Status](#status).

## Use It In Codex CLI Chat

Codexus is not only a standalone `cx` command. The npm package installs a
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

Full guide: [Using Codexus inside Codex](docs/codex-session-usage.md).

## Project Management Wiki

Maintainers and LLM agents should use the checked-in
[Project LLM Wiki](docs/project-wiki/README.md) for fast project context. It is
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

Detailed setup: [Quick start](docs/quickstart.md).

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

Codexus 0.1.14 is usable as a local harness with a narrow stable path around
`codex exec --json`; live app-server turns, routine live model replay, and
automatic prompt injection remain intentionally gated. Live cron/gateway
dispatch is now available as an experimental explicit-approval surface.

## Support Matrix

| Surface | 0.1.x status |
| --- | --- |
| Supervised `codex exec --json` runs, verification/repair, run ledger, resume/cancel/status/events | Stable path |
| Codex-native `$codexus` skill, session status/checkpoint/verify/hud, notify-hook evidence | Stable session evidence surface |
| `slop check`, `supply-chain check`, `lsp status/check`, schema subset engine, replay parity, memory/skill lifecycle | Stable local evidence plus experimental LSP diagnostics surface; LSP protocol servers are detect-only in the first slice |
| `repo graph build/check/import/search/explain`, `wiki build/check/context/export` | Experimental graph/wiki evidence surface; context approval artifacts are visible and non-injected |
| `app instance profile list/status/logs/start/stop/evidence record/evidence list/probe/logs/metrics/screenshot` | Experimental owned-process and observation-evidence surface; live start/stop work only for Codexus-owned instances, and observations cite an `instanceId` without becoming authority |
| app-server, cron/gateway, model replay, adapter injection, tmux workers, native subagent launch | Experimental/deferred; app-server remains read-only, cron/gateway can dispatch with explicit approval, and other surfaces stay status/record/launch-contract/gated |
| autopilot contract layer | Experimental foundation slice implemented (`plan`, `contract validate/approve/scope-check`); live `autopilot run` remains deferred to the 0.2/0.3 track |

See [Implementation status](docs/implementation-status.md) and
[Remaining work](docs/remaining-work.md) for exact coverage and gaps.

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
cx doctor --json
cx init --with-docs --json
cx setup codex-session --scope project --always-on --enable-notify-hook --json
cx session status --json
cx session hud --json
cx session checkpoint "before risky refactor" --json
cx session verify --auto --json
cx session verify --verify "npm test" --json
cx session slop --json
cx session subagent launch --role reviewer --task "review the staged diff" --json
cx session subagent complete --task-id <id> --claim "review found no API drift" --assumptions-surfaced pass --json
cx session subagent record --file <result.json> --json
cx session workers status --json
cx lsp status --json
cx lsp check --gate --json
cx schema engine --json
cx replay parity --json
cx repo graph build --graph-provider codexus-lite --scope "src/**" --json
cx repo graph check --graph <graph-id-or-path> --gate --json
cx wiki build --json
cx wiki context --topic verification --fresh-only --gate --json
cx wiki context --topic verification --approve --approved-by "$USER" --json
cx slop check --scope "src/**" --gate --json
cx supply-chain check --gate --json
cx release check --gate --json
cx app instance profile list --json
cx app instance start --profile web --worktree . --json
cx app instance status --json
cx app instance evidence record --instance-id <id> --kind browser --source manual --summary "checked app" --json
cx app instance evidence probe --instance-id <id> --url http://127.0.0.1:<port>/ --json
cx app instance evidence logs --instance-id <id> --json
cx app instance evidence metrics --instance-id <id> --json
cx app instance evidence screenshot --instance-id <id> --evidence-path ./screen.png --json
cx app instance stop --instance-id <id> --json
cx run --verify "npm test" "fix the failing parser tests"
cx cancel <run-id> --reason "no longer needed" --json
cx status <run-id> --json
cx events tail <run-id> --json
cx verify <run-id> --json
cx replay skill <skill-id> --json
cx memory search "parser regression" --json
cx skill review <skill-id> --json
cx skill export <skill-id> --target codex --json
cx schema check --json
cx app-server experiment --dry-run --record --supervise-fake --json
```

Public bins: `cx` and `codexus` are canonical.

## Documentation

- [Documentation index](docs/README.md)
- [Quick start](docs/quickstart.md)
- [Using Codexus inside Codex](docs/codex-session-usage.md)
- [Architecture](docs/design/01-architecture.md)
- [Detailed design](docs/design/02-detailed-design.md)
- [Evolution engine](docs/design/03-evolution-engine.md)
- [Codex-native adapter](docs/design/06-codex-native-adapter.md)
- [Session-native supervision](docs/design/07-supervised-sessions.md)
- [Supply-chain evidence](docs/design/11-supply-chain-evidence.md)
- [Autopilot contract](docs/design/12-autopilot-contract.md)
- [Reference governance](docs/references/README.md)
- [Implementation status](docs/implementation-status.md)
- [Remaining work](docs/remaining-work.md)
- [0.1.0 stable readiness plan](docs/plans/2026-05-31-0.1.0-stable-readiness-plan.md)
- [0.1.1 release evidence](docs/release-evidence/0.1.1.md)
- [JSON contract](docs/json-contract.md)
- [Public release checklist](docs/public-release.md)

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
[CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), and
[ROADMAP.md](ROADMAP.md).

## License

Codexus is released under the [MIT License](LICENSE).

OpenAI and Codex are trademarks of their respective owners. This project is not
affiliated with or endorsed by OpenAI.
