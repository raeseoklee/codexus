# Codexus

[![CI](https://github.com/raeseoklee/codexus/actions/workflows/ci.yml/badge.svg)](https://github.com/raeseoklee/codexus/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js >=26](https://img.shields.io/badge/Node.js-%3E%3D26-339933.svg)](package.json)

[한국어 문서](docs/ko/README.md)

Codexus is a local execution harness for OpenAI Codex. It keeps Codex as the
model and execution engine, then adds the engineering layer needed for durable
runs, verification gates, recovery loops, memory, and replay-gated skills.

Codexus is not a Codex replacement. It is an orchestration layer around the
authenticated local Codex CLI, with an optional Codex-native skill adapter for
interactive sessions.

```text
User -> cx/codexus -> Codexus core -> codex exec --json -> Codex
```

## Demo

![Codexus inside a Codex session](docs/assets/codexus-inside-codex.gif)

This capture shows the Codex-session path using the same `codexus` skill wrapper
that an installed adapter calls inside Codex. It avoids recording private Codex
UI, account state, prompts, or local project data.

## What It Provides

- Durable run ledgers under `.codex-harness/runs/<run-id>/`
- Verification gates with bounded repair loops
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

- Node.js 26 or newer
- Git
- The local `codex` CLI for real Codex runs
- A logged-in Codex CLI session for the `codex-exec` driver

Most tests use a deterministic mock driver so CI does not require model or
network access; real runs use the local authenticated Codex CLI.

## Quick Start

Install with GitHub Pages after the repository is public and Pages is enabled:

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

Install the Codex-native skill adapter:

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
cx run --verify "npm test" "fix the failing parser tests"
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

Compatibility note: `cx` and `codexus` are canonical. `chx` remains a temporary
compatibility alias.

## Documentation

- [Documentation index](docs/README.md)
- [Quick start](docs/quickstart.md)
- [Using Codexus inside Codex](docs/codex-session-usage.md)
- [Architecture](docs/design/01-architecture.md)
- [Detailed design](docs/design/02-detailed-design.md)
- [Evolution engine](docs/design/03-evolution-engine.md)
- [Codex-native adapter](docs/design/06-codex-native-adapter.md)
- [Reference governance](docs/references/README.md)
- [Implementation status](docs/implementation-status.md)
- [Remaining work](docs/remaining-work.md)
- [Public release checklist](docs/public-release.md)

English is the primary documentation language. Korean counterparts are kept
under `docs/ko/` and linked from the English documents.

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
