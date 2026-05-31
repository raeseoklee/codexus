# Codexus

[![CI](https://github.com/raeseoklee/codexus/actions/workflows/ci.yml/badge.svg)](https://github.com/raeseoklee/codexus/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js >=22](https://img.shields.io/badge/Node.js-%3E%3D22-339933.svg)](package.json)

[Korean](docs/ko/README.md)

**Codexus runs OpenAI's Codex CLI with evidence.**

Tell it what to change and how to verify it. Codexus runs the local authenticated
Codex CLI, runs your verification command, feeds real failure output back into a
bounded repair loop when the check fails, and reports `complete` only when the
check passes.

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
npm install -g codexus@next
codexus run --verify "npm test" "fix the failing parser tests"
```

Codexus runs Codex, then runs `npm test`. If the test fails, Codexus gives Codex
the real failing output and retries within the configured repair budget. The run
is `complete` only when the verification command passes.

> Early alpha, and intentionally honest about it: live app-server turns, routine
> live model replay, automatic prompt injection, and live cron/gateway dispatch
> remain gated off. See [Status](#status).

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

## Quick Start

Install the current alpha package:

```bash
npm install -g codexus@next
codexus --version
codexus doctor --json
```

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
npm install -g codexus@next
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
- Gated app-server, cron, gateway, and model-replay experiments that do not affect the stable `codex exec --json` path

## Status

Codexus is usable as an early local harness. The stable path is the CLI around
`codex exec --json`; live app-server turns, routine live model replay, automatic
prompt injection, and live cron/gateway dispatch remain intentionally gated.

## Support Matrix

| Surface | 0.1.0 status |
| --- | --- |
| Supervised `codex exec --json` runs, verification/repair, run ledger, resume/cancel/status/events | Stable path |
| Codex-native `$codexus` skill, session status/checkpoint/verify/hud, notify-hook evidence | Stable session evidence surface |
| `slop check`, `supply-chain check`, schema subset engine, replay parity, memory/skill lifecycle | Stable local evidence/gate surface |
| app-server, cron/gateway, model replay, adapter injection, tmux workers, native subagent launch | Experimental/deferred; dry-run, status, record/attach/complete, launch-contract, or explicitly gated |
| autopilot contract layer | Proposed design, deferred to the 0.2/0.3 track |

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
cx session subagent complete --task-id <id> --claim "review found no API drift" --json
cx session subagent record --file <result.json> --json
cx session workers status --json
cx schema engine --json
cx replay parity --json
cx adapt omx injection --task "parser cleanup" --approve --json
cx slop check --scope "src/**" --gate --json
cx supply-chain check --gate --json
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
