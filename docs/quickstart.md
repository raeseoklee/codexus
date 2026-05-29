# Quick Start

[한국어](ko/quickstart.md)

This guide gets Codexus running locally. The first verification pass avoids
model and network access; real Codex execution is covered after that.

## Install Script

After the repository is public and GitHub Pages is enabled for `main` `/`, the
installer URL is:

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

- `CODEXUS_REF`: branch or tag to install, default `main`
- `CODEXUS_INSTALL_DIR`: install directory, default `~/.local/share/codexus`
- `CODEXUS_BIN_DIR`: bin directory for `cx`, `codexus`, and `chx`, default `~/.local/bin`
- `CODEXUS_INSTALL_CODEX_SKILL=0`: skip Codex skill adapter installation

## 1. Clone

```bash
git clone https://github.com/raeseoklee/codexus.git
cd codexus
```

## 2. Verify Local Tooling

Codexus currently requires Node.js 26 or newer.

```bash
node --version
npm run ci
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

`chx` also exists as a temporary compatibility alias.

## 6. Use Real Codex Execution

Install and authenticate the local Codex CLI first. Then run:

```bash
cx run --driver codex-exec --json "Reply exactly CODEXUS-OK"
```

For project work, add verification:

```bash
cx run --verify "npm test" "fix the failing parser tests"
```

## 7. Install the Codex-Native Adapter

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
