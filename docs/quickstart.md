# Quick Start

[Korean](ko/quickstart.md)

This guide gets Codexus running locally. The first verification pass avoids
model and network access; real Codex execution is covered after that.

## npm Install

Codexus is published on npm:

```bash
npm install -g codexus
codexus doctor --json
```

Global npm installation installs both the CLI and the Codex-native skill
adapter into `${CODEX_HOME:-~/.codex}/skills/codexus` by default. Set
`CODEXUS_INSTALL_CODEX_SKILL=0` for a CLI-only install:

```bash
CODEXUS_INSTALL_CODEX_SKILL=0 npm install -g codexus
```

## Install Script

Use the installer when you want the same npm package install through a
reviewable `curl | sh` path:

```bash
curl -fsSL https://raeseoklee.github.io/codexus/install.sh | sh
```

Review-first form:

```bash
curl -fsSLO https://raeseoklee.github.io/codexus/install.sh
less install.sh
sh install.sh
```

Installer environment variables:

- `CODEXUS_NPM_SPEC`: npm package spec to install, default `codexus`
- `CODEXUS_EXPECTED_VERSION`: optional installed package version check
- `CODEXUS_NPM_PREFIX`: npm global prefix, default `~/.local`
- `CODEXUS_BIN_DIR`: bin directory for `cx` and `codexus`, default `~/.local/bin`
- `CODEXUS_INSTALL_CODEX_SKILL=0`: skip Codex skill adapter installation

## 1. Clone

```bash
git clone https://github.com/raeseoklee/codexus.git
cd codexus
```

## 2. Verify Local Tooling

Codexus requires Node.js 22 or newer for the npm-installed CLI. Source tests
run with the repository's configured development Node runtime.

```bash
node --version
npm run ci
npm run package:smoke
```

The test suite uses the deterministic test driver, so it does not need Codex
model access.

## 3. Run Doctor

```bash
node src/cli/main.ts doctor --json
```

`doctor` reports Node, Codex CLI, Codex auth, driver capability, git, tmux,
Codexus state, and Codexus skill-install status.

## 4. Run a Deterministic Test Harness Task

```bash
node src/cli/main.ts run --driver mock --json "hello from codexus"
```

The command writes a run ledger under `.codexus/runs/<run-id>/`.

If an older `.codex-harness/` directory exists in the project, the CLI migrates
it into `.codexus/` on the next command and removes the legacy directory.
Conflicting files are preserved under `.codexus/migration-conflicts/`.

Inspect it:

```bash
node src/cli/main.ts runs list --json
node src/cli/main.ts status <run-id> --json
node src/cli/main.ts events tail <run-id> --json
node src/cli/main.ts schema validate-run <run-id> --json
```

Cancel a live supervised run from another terminal:

```bash
cx cancel <run-id> --reason "no longer needed" --json
```

## 5. Use the Local Bins

For development, link the package:

```bash
npm link
cx doctor --json
codexus runs list --json
```

The public bin names are `cx` and `codexus`.

## 6. Use Real Codex Execution

Install and authenticate the local Codex CLI first. Then run:

```bash
cx run --driver codex-exec --json "Reply exactly CODEXUS-OK"
```

For project work, add verification:

```bash
cx run --verify "npm test" "fix the failing parser tests"
```

## 7. Use Codexus From Codex CLI Chat

The adapter is installed automatically by the global npm install unless you set
`CODEXUS_INSTALL_CODEX_SKILL=0`.

To refresh or reinstall it from the published npm package:

```bash
node "$(npm root -g)/codexus/scripts/install-codex-skill.mjs" --json
```

From a cloned repository:

```bash
npm run install:codex-skill
```

The installer writes the `codexus` skill into `${CODEX_HOME:-~/.codex}/skills`.
Use it from Codex CLI/TUI chat when you need Codexus status, checkpoints,
verification, replay, memory, schema, or context evidence without starting a
separate manual flow.

Inside a target project, install the session-native overlay:

```bash
cx setup codex-session --scope project --always-on --enable-notify-hook --json
```

Then open Codex in that project and type chat requests like these:

```text
Use the codexus skill and show the current session status.
```

The always-on overlay is guidance, not proof. The notify hook records a bounded
`turn-ended` heartbeat and derived evidence snapshot when CLI/TUI dispatch
fires, but `cx session status --json` recomputes the current state on demand and
remains authoritative.

```text
Codexus, create a checkpoint named "before risky refactor".
```

```text
Codexus, run session verification with "npm test" and summarize the evidence.
```

Behind the scenes, the skill calls the local wrapper:

```bash
node codex/skills/codexus/scripts/cx.mjs <command>
```

Prefer explicit session evidence before nested supervised runs:

```bash
cx session status --json
cx session checkpoint "before risky refactor" --json
cx session verify --verify "npm test" --json
```

If you want a separate non-interactive Codex sub-run, ask for one explicitly:

```text
Codexus, start a supervised run for "<bounded task>" and report the run id.
```

For ordinary edits, keep working in the current Codex chat and use Codexus only
for evidence and state.

More examples: [Using Codexus inside Codex](codex-session-usage.md).

## 8. Initialize a Project Harness

Inside a target project:

```bash
cx init --with-docs --json
```

This creates `.codexus/` directories and config without mutating unrelated
tool state.

## Troubleshooting

- **Node version:** npm-installed Codexus requires Node.js 22 or newer. Run
  `node --version` when `cx` fails before rendering JSON.
- **Missing `codex` CLI:** real `codex-exec` runs require the local `codex`
  command. `cx doctor --json` reports this as a failed Codex check; mock-driver
  tests still work without it.
- **Codex auth:** real runs require an authenticated local Codex CLI session.
  Run `codex login status` directly if `doctor` reports an auth failure.
- **Notify hook not observed:** `cx setup codex-session --enable-notify-hook`
  installs configuration, but `cx session status --json` only reports dispatch
  as observed after a real CLI/TUI `turn-ended` event. Desktop/app-server
  sessions may not invoke the CLI notify hook.
- **npm install path:** global npm installs may place `cx` outside your shell
  `PATH`. Use `npm prefix -g` or install with `CODEXUS_NPM_PREFIX` /
  `CODEXUS_BIN_DIR` through `install.sh` when you need a specific bin directory.
