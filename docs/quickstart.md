# Quick Start

[한국어](ko/quickstart.md)

This guide gets Codexus running locally. The first verification pass avoids
model and network access; real Codex execution is covered after that.

## npm Install

Codexus is published on npm as an alpha package:

```bash
npm install -g codexus@next
codexus doctor --json
```

Global npm installation installs both the CLI and the Codex-native skill
adapter into `${CODEX_HOME:-~/.codex}/skills/codexus` by default. Set
`CODEXUS_INSTALL_CODEX_SKILL=0` for a CLI-only install:

```bash
CODEXUS_INSTALL_CODEX_SKILL=0 npm install -g codexus@next
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

- `CODEXUS_NPM_SPEC`: npm package spec to install, default `codexus@next`
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

The command writes a run ledger under `.codex-harness/runs/<run-id>/`.

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

## 7. Use or Refresh the Codex-Native Adapter

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
Use it from an interactive Codex session when you need Codexus status, replay,
memory, schema, or context evidence without starting a separate manual flow.

In Codex, ask for it explicitly:

```text
codexus로 schema check 실행하고 결과를 요약해줘.
```

```text
$codexus status <run-id> --json 확인해줘.
```

More examples: [Using Codexus inside Codex](codex-session-usage.md).

## 8. Initialize a Project Harness

Inside a target project:

```bash
cx init --with-docs --json
```

This creates `.codex-harness/` directories and config without mutating unrelated
tool state.
