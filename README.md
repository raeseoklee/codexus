```text
 ░▒▓██████▓▒░ ░▒▓██████▓▒░░▒▓███████▓▒░░▒▓████████▓▒░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░░▒▓█▓▒░░▒▓███████▓▒░
░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░      ░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░
░▒▓█▓▒░      ░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░      ░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░
░▒▓█▓▒░      ░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░░▒▓█▓▒░▒▓██████▓▒░  ░▒▓██████▓▒░░▒▓█▓▒░░▒▓█▓▒░░▒▓██████▓▒░
░▒▓█▓▒░      ░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░      ░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░░▒▓█▓▒░      ░▒▓█▓▒░
░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░      ░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░░▒▓█▓▒░      ░▒▓█▓▒░
 ░▒▓██████▓▒░ ░▒▓██████▓▒░░▒▓███████▓▒░░▒▓████████▓▒░▒▓█▓▒░░▒▓█▓▒░░▒▓██████▓▒░░▒▓███████▓▒░
```

# Codexus

[![CI](https://github.com/raeseoklee/codexus/actions/workflows/ci.yml/badge.svg)](https://github.com/raeseoklee/codexus/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js >=22](https://img.shields.io/badge/Node.js-%3E%3D22-339933.svg)](package.json)

[Korean](docs/ko/README.md)

Codexus is a local execution harness for OpenAI Codex. It keeps Codex as the
model and execution engine, then adds the engineering layer needed for durable
runs, verification gates, recovery loops, memory, and replay-gated skills.

Codexus is not a Codex replacement. It is an orchestration layer around the
authenticated local Codex CLI. The stable engine is still `cx`, while the
product direction is an OMX-like Codex-native session runtime through the
installed `codexus` skill, guidance overlays, local state, and optional notify hooks.

```text
User -> cx/codexus -> Codexus core -> codex exec --json -> Codex
```

## What It Provides

- Durable run ledgers under `.codexus/runs/<run-id>/`
- Automatic migration from legacy `.codex-harness/` into `.codexus/`
- Verification gates with bounded repair loops
- Timeout, SIGINT, and external `cx cancel <run-id>` cancellation paths
- Structured JSON error envelopes for automation
- Memory records, curation, and bounded retrieval
- Replay-gated skill proposal, review, promotion, improvement, export, and deprecation
- Codex-native `$codexus` adapter for using the same core inside a Codex session
- Optional advanced interop commands that stay outside the core runtime path
- Schema artifact validation, stale-lock recovery, and local CI parity
- Gated app-server, cron, gateway, and model-replay experiments that do not affect the stable `codex exec --json` path

## Status

Codexus is usable as an early local harness. The stable path is the CLI around
`codex exec --json`; live app-server turns, routine live model replay, automatic
prompt injection, and live cron/gateway dispatch remain intentionally gated.

See [Implementation status](docs/implementation-status.md) and
[Remaining work](docs/remaining-work.md) for exact coverage and gaps.

## Requirements

- Node.js 22 or newer
- npm for the installer and npm package workflow
- Git
- The local `codex` CLI for real Codex runs
- A logged-in Codex CLI session for the `codex-exec` driver

Most tests use a deterministic mock driver so CI does not require model or
network access; real runs use the local authenticated Codex CLI.

## Quick Start

Install from npm:

```bash
npm install -g codexus@next
codexus doctor --json
```

The package is currently published on the alpha channel. Use `codexus@next` to
avoid depending on future dist-tag changes.

Global npm installs also install the Codex-native skill adapter into
`${CODEX_HOME:-~/.codex}/skills/codexus` by default. Set
`CODEXUS_INSTALL_CODEX_SKILL=0` when you need a CLI-only install.

Install with GitHub Pages if you prefer a reviewable shell installer:

```bash
curl -fsSL https://raeseoklee.github.io/codexus/install.sh | sh
```

The installer delegates to the npm package channel (`codexus@next` by default),
installs the `codexus` and `cx` bins, and installs the Codex skill adapter
unless `CODEXUS_INSTALL_CODEX_SKILL=0` is set.

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

Run the CLI directly:

```bash
node src/cli/main.ts doctor --json
```

Use the canonical bin names during local development:

```bash
npm link
cx doctor --json
codexus runs list --json
```

Refresh or reinstall the Codex-native skill adapter from the published npm
package:

```bash
node "$(npm root -g)/codexus/scripts/install-codex-skill.mjs" --json
```

Or install it from a cloned repository:

```bash
npm run install:codex-skill
```

Then invoke the `codexus` skill from inside an interactive Codex session when
you need durable status, replay, memory, or schema evidence.

Detailed setup: [Quick start](docs/quickstart.md).
Codex-session usage: [Using Codexus inside Codex](docs/codex-session-usage.md).

## Common Commands

```bash
cx doctor --json
cx init --with-docs --json
cx setup codex-session --scope project --enable-notify-hook --json
cx session status --json
cx session checkpoint "before risky refactor" --json
cx session verify --verify "npm test" --json
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
- [Reference governance](docs/references/README.md)
- [Implementation status](docs/implementation-status.md)
- [Remaining work](docs/remaining-work.md)
- [Public release checklist](docs/public-release.md)

Documentation is written in English first. Korean translations live under
`docs/ko/`, and English documents link to them as `Korean`.

## Safety Boundaries

Codexus intentionally avoids private ChatGPT/Codex backend APIs. The stable
driver boundary is the local authenticated Codex CLI. Experimental surfaces are
feature-gated and report dry-run, policy, approval, and evidence records before
any live dispatch path is enabled.

## Contributing

Contributions are welcome after the repository is public. Start with
[CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), and
[ROADMAP.md](ROADMAP.md).

## License

Codexus is released under the [MIT License](LICENSE).

OpenAI and Codex are trademarks of their respective owners. This project is not
affiliated with or endorsed by OpenAI.
