# Implementation Status

[Korean](ko/implementation-status.md)

Date: 2026-05-29

Product name: Codexus

Target CLI: `cx`

Public bins: `cx`, `codexus`

The npm package exposes `cx` and `codexus` as canonical bins. The historical
`chx` alias is not published.

## MVP Spine Implemented

- Node 22+ npm-installed CLI entrypoint: `dist/cli/main.js`
- Source development entrypoint: `node src/cli/main.ts`
- Commands:
  - `doctor`
  - `init`
  - `run`
  - `cancel`
  - `plan`
  - `runs list`
  - `status`
  - `events tail`
  - `report`
  - `resume`
  - `verify`
  - `replay`
  - `locks list`
  - `locks inspect`
  - `locks clear`
  - `schema check`
  - `schema validate`
  - `schema validate-run`
  - `app-server status`
  - `app-server roundtrip`
  - `app-server experiment`
  - `memory add`
  - `memory search`
  - `memory list`
  - `memory review`
  - `memory curate`
  - `memory prune`
  - `skill propose`
  - `skill index`
  - `skill list`
  - `skill review`
  - `skill promote`
  - `skill export`
  - `skill improve`
  - `skill deprecate`
  - `cron status`
  - `cron run-now`
  - `gateway status`
  - `gateway check`
- Config loader with defaults, project/user config merge, unknown-key warnings, normalization, and focused schema enforcement.
- Run ledger under `.codexus/runs/<run-id>/`.
- Atomic `state.json` writes and append-only `events.jsonl` with focused read-path validation.
- Typed JSON CLI error envelope for automation-facing failures when `--json` is set.
- State corruption is surfaced as a typed JSON error.
- Permission/policy/driver-failure classification events are written to run ledgers.
- Minimal lock/lease protection exists for mutable memory and active-skill stores, with stale-lock inspection and recovery commands.
- Workflow kernel extracted from the `run` command.
- Policy preflight for high-risk verification commands and non-git workspace warnings.
- Mock driver for deterministic local tests.
- Codex exec driver using local authenticated `codex exec --json`.
- Driver capability contract and selected-driver probe in `doctor`.
- Capability-gated Codex exec flag mapping.
- Raw driver stdout/stderr preservation.
- Verification runner for sequential shell checks with artifacts.
- Bounded repair loop when Codex succeeds but verification fails, including
  bounded verification failure context artifacts.
- Explicit-budget repair loop for repairable driver task failures, including
  bounded raw driver log context artifacts.
- Repair context redaction covers common API tokens, AWS keys, JWTs,
  key/value secret assignments, `.env`-style dumps, and private-key blocks.
- Driver events are phase-stamped from the explicit attempt phase.
- Driver failures before verification record `skipped` with a `not_reached_*`
  reason instead of leaving terminal state at `pending`.
- `codex-exec` supports `codex.runTimeoutMs`, AbortSignal cancellation, CLI
  SIGINT handling, `driver.timeout` evidence, and terminal `cancelled` ledgers.
- `cx cancel <run-id>` writes a cancel marker for live run owners and closes
  dead-owner running ledgers as orphan-cancelled with explicit events.
- `cx verify` can rerun stored verification for an existing ledger.
- `cx resume` creates a follow-up supervised run from an existing ledger.
- Experience record writer with decisions, failures, verification commands,
  repair history, driver-failure classification, and source-specific reusable
  lessons.
- Automatic memory entry writing from reusable lessons plus memory add/list/search/review/curate/prune lifecycle commands.
- Skill proposal writer with source-linked `evidence.json`, source-specific
  `replay.json`, replay review, active listing, active index, improvement
  proposal, promotion, export, and deprecation.
- Codexus-generated skills carry a Codex-facing `codexus:<skill-name>` display identity while keeping stable storage ids.
- Codex skill export and optional external harness bundle export write generated
  skill bundles through explicit commands.
- Codex-native adapter retrieval can return bounded relevant approved active skills and memory entries, and can format them into a prompt-safe context block with replay approval metadata.
- The Codex-native adapter can write an explicitly approved context artifact (`context.md` and `context.json`) without injecting it automatically.
- Model replay has a deterministic first gate plus an explicit budget/policy/live-environment gate for local experiments.
- `cx init` creates project-local config/state directories without mutating
  unrelated tool state.
- Run observability commands list runs, tail events, and preview reports.
- App-server schema fixture/status, dry-run roundtrip contract, sandboxed experiment manifest recording, optional `codex app-server --help` process-probe evidence, and deterministic fake lifecycle supervision are present, while live app-server execution remains gated off.
- Cron/gateway feature gates expose disabled status by default and dry-run automation plans plus optional audit records with policy/approval contract fields for future dispatch.
- Versioned schema artifacts exist for config, state, events, memory entries, and skills, with focused enforcement plus zero-dependency schema-artifact subset validation on single-record and run-ledger checks.
- Codex JSONL usage is captured when present and terminal state records usage or
  `{ "available": false }`.
- Unsupported Codex exec config options emit `config.option_ignored` ledger
  events instead of being silently dropped.
- `npm run build` bundles the TypeScript source with esbuild into
  `dist/cli/main.js` for npm installation.
- `npm run package:smoke` runs `npm pack`, installs the tarball into a temporary
  global prefix, and verifies `codexus --help`, `cx --help`, runtime schema
  assets, postinstall Codex skill adapter installation, and a mock run.
- `prepublishOnly` runs `npm run release:check`, which combines local CI and
  package smoke verification.
- The npm tarball ships `dist`, `schemas`, the Codex skill adapter,
  `fixtures/app-server/schema.fixture.json`, `install.sh`, package installer
  scripts, and top-level release metadata. It excludes source, tests, docs,
  replay fixtures, and migration fixtures.
- `npm run typecheck` performs syntax/static validation with the local Node runtime.
- Optional advanced interop capability probes and export commands remain
  outside the normal Codexus runtime path.
- Codex-native skill adapter source under `codex/skills/codexus`.
- Global npm installs run `scripts/postinstall.mjs`, which installs the adapter
  into `${CODEX_HOME:-~/.codex}/skills/codexus` unless
  `CODEXUS_INSTALL_CODEX_SKILL=0` is set.
- `scripts/install-codex-skill.mjs` remains available for explicit adapter
  refresh or cloned-repository installs.
- `doctor --json` diagnoses whether the installed Codexus skill tree matches this repository, and the installer writes source/installed tree hashes.
- `doctor --json --strict` preserves the JSON diagnostic body while returning nonzero when a fail-level check is present.
- `.codexus` is the canonical project runtime root. If the CLI finds legacy
  `.codex-harness`, it migrates it into `.codexus` and removes the legacy
  directory; conflicting files are preserved under `.codexus/migration-conflicts/`.
- `cx setup codex-session` installs or refreshes a marker-bounded Codexus
  runtime overlay in project or user `AGENTS.md` without changing content
  outside the markers.
- Codexus AGENTS overlay writes are atomic, create a one-time `.codexus.bak`
  backup, and append a fresh marker block when existing markers are damaged.
- `cx session status`, `cx session checkpoint`, and `cx session verify` provide
  the first Codex-native session surface under `.codexus/session/`.
- `cx setup codex-session --enable-notify-hook` installs a Codex notify hook
  only when the current project is trusted in Codex config; existing top-level
  `notify = [...]` commands are preserved through `--previous-notify` chaining.
- Notify-hook setup writes `${CODEX_HOME:-~/.codex}/config.toml` atomically,
  creates a one-time `config.toml.codexus.bak` backup, and
  `--disable-notify-hook` restores the previous notify command or removes a
  Codexus-only notify line without refreshing the AGENTS overlay.
- `cx session notify --event <name>` is the internal notify-hook write surface
  and records bounded hook events in `.codexus/session/state.json`.
- Session state schema v2 separates notify installation from dispatch:
  `capabilities.hooks` is `configured` after install and `available` only after
  a real `turn-ended` event is observed. Manual smoke events do not mark
  dispatch observed.
- `cx session migrate [--dry-run]` is the explicit migration boundary for
  `.codexus/session/state.json`; it reports pending migrations and persists
  them unless `--dry-run` is used.
- `cx session verify` reuses the verification policy preflight and records
  blocked verification attempts instead of executing dangerous commands.
- Session state reads perform focused structure validation, and mutable session
  state updates are protected by the Codexus `session` lock.
- `schemas/session-state.schema.json` is a first-class schema artifact for the
  v2 session-state shape, and
  `cx schema validate --type session-state --file <path> --json` validates
  session state through the same local schema-artifact subset engine.
- `doctor --json` reports Codexus session state, project/user overlay status,
  notify-hook installation status, notify dispatch observation status, and
  truthful unavailable status for statusline integration.
- GitHub Actions CI runs committed whitespace checks, static syntax validation, and unit tests on pushes to `main` and pull requests.
- Local CI parity is available with `npm run ci`; remote Actions execution still depends on repository/account runner availability.
- Public repository readiness files are present: MIT license, contributing guide, security policy, support guide, code of conduct, roadmap, changelog, issue templates, and PR template.
- Root `install.sh` supports GitHub Pages `curl | sh` installation by
  delegating to npm (`codexus@next` by default), linking canonical bins, and
  installing the Codex skill adapter unless `CODEXUS_INSTALL_CODEX_SKILL=0` is
  set.
- User-facing Codex-session usage docs now explain how to invoke the `$codexus` skill, what commands to prefer, and when to stay with normal Codex interaction.
- The session-native supervision design now makes OMX-like in-Codex usage the
  product direction, with `codex exec resume` deferred as a separate external
  multi-turn feature.

## Verified

- Unit tests: `npm test`
- Current test count: 87.
- Static check: `npm run typecheck`
- CI workflow: `.github/workflows/ci.yml`
- Local CI parity: `npm run ci`
- Package smoke: `npm run package:smoke`
- Node 22 installed-package smoke: `codexus --help`, `codexus schema check
  --json`, and a mock run executed through Node 22.22.3 against a packed and
  temporary globally installed tarball.
- Doctor smoke: `node src/cli/main.ts doctor --json`
- Doctor strict smoke: missing command diagnostics return `ok: false` and exit 1 with `--strict`.
- Doctor reports selected driver capabilities, including `supportsApprovalFlag: false` for local `codex exec`.
- Doctor reports Codex feature availability through `codex features list`.
- Mock run: `node src/cli/main.ts run --driver mock "hello mock" --json`
- Mock run with passing verification.
- Mock run with failing verification returning a failed outcome.
- Mock run with failed first verification, one repair iteration, and passing second verification.
- Mock run with blocked and cancelled driver outcomes.
- Verification repair context artifact includes failing command output.
- Driver failure with configured verification records `skipped` plus
  `not_reached_driver_failed` instead of terminal `pending`.
- AbortSignal cancellation reaches a terminal `cancelled` run ledger.
- Fake Codex exec timeout reaches `cancelled` and preserves raw output.
- Codex exec usage is captured into terminal state and `status --json`.
- Source-specific replay fails boilerplate skills that omit required
  verification evidence.
- Policy-blocked run before driver execution for dangerous verification commands.
- `status --json` reconstructs state, verification, experience, and event tail from disk.
- `verify --json` reruns stored verification.
- `resume --json` creates a linked follow-up supervised run.
- Advanced plan export writes Codexus plan artifacts and optional external
  compatibility artifacts.
- Skill proposal/review/promotion/deprecation workflow through both unit and CLI tests.
- Structured JSON CLI error envelope for unknown commands and argument validation failures.
- Structured JSON CLI error coverage for unexpected arguments, corrupt state, and disabled app-server driver.
- Init, observability, active-skill index/export/improvement, adapter approved retrieval/context artifact recording, full replay parity fixture-matrix coverage, gated model replay, stale locks, schema validation/run-ledger validation, migration fixtures, driver-failure repair, app-server dry-run/experiment process-probe and fake-supervision recording, memory lifecycle/curation, packaging, installed-skill tree diagnosis, and feature-gate policy/audit-record tests.
- Real Codex exec smoke through ChatGPT-authenticated local Codex:
  - command: `node src/cli/main.ts run --driver codex-exec "Reply exactly CHX-CODEX-OK" --json`
  - observed final artifact: `CHX-CODEX-OK`
- Real Codex exec smoke after capability-gated flag mapping:
  - command: `node src/cli/main.ts run --driver codex-exec "Reply exactly CHX-CAPABILITY-OK" --json`
  - observed final artifact: `CHX-CAPABILITY-OK`
- Real Codex exec smoke after workflow-kernel extraction:
  - command: `node src/cli/main.ts run --driver codex-exec "Reply exactly CHX-GOAL-OK" --json`
  - observed final artifact: `CHX-GOAL-OK`
- Advanced interop smoke verified read-only behavior against external harness
  state.
- Static source check found no direct HTTP/OpenAI/ChatGPT backend calls in `src`, `tests`, or `package.json`.
- Codex-native adapter wrapper root discovery is covered by tests.
- Codex skill structure is validated with the Codex skill validator.
- Session-native setup, damaged-marker recovery, session-state shape/schema
  validation, session lock handling, legacy root migration, status,
  checkpoint, verify, policy-blocked session verification, notify-hook trust
  refusal, notify-chain preservation, notify-hook disable, config backup, and
  focused/schema validator drift cases, explicit session-state migrations, and
  manual-smoke dispatch false-positive protection are covered by CLI tests.

## Acceptance Coverage

- `doctor --json` reports Codex auth/version, Codex feature availability,
  app-server help, git status, tmux, state root, selected driver capability,
  and optional advanced interop readiness.
- `doctor --json --strict` is the automation-facing form when fail-level checks must produce a nonzero process status.
- `run` completes with both mock and real `codex-exec` drivers and writes a ledger.
- Required verification failures prevent `complete`, and repair can recover when bounded budget remains.
- Repair prompts receive bounded failure context and record the exact context as
  ledger artifacts.
- `codex-exec` timeout and AbortSignal cancellation reach truthful terminal
  `cancelled` state.
- `status --json` reconstructs state, verification, experience, and event tail without a live process.
- `status --json` surfaces terminal usage accounting when the driver provides it.
- The Codex-native adapter returns approved bounded context candidates, formats
  prompt-safe context, and can write a non-injected approved context artifact.
- Tests pass without model/network access through the mock driver.
- Evolution output writes source-linked experience and memory entries.
- Skill promotion requires trigger/scope/safety/evidence/replay and writes a versioned active copy, promotion-review evidence, and enriched active index entry.
- Explicit skill export writes generated Codex and optional external bundles
  without auto-installing them.

## Known Gaps

See [Remaining work](remaining-work.md) for the prioritized backlog and design
review. Current high-level gaps:

- Driver-failure repair is implemented only for repairable task failures and only with an explicit budget.
- Model replay is still local-experiment gated; routine full model-in-the-loop replay scenarios do not run by default.
- Codex app-server driver is intentionally disabled for live execution; fixture/status, dry-run roundtrip, sandbox experiment manifest recording, help-process probe evidence, and deterministic fake lifecycle supervision are implemented.
- Codex-native adapter retrieval exists, but it does not automatically inject active skills into the current Codex prompt.
- Session state is currently a cwd-scoped singleton because Codex does not expose
  a stable per-conversation id to Codexus.
- Notify-hook integration is implemented behind explicit setup and Codex project
  trust checks. Statusline integration and tmux-backed Codexus workers are
  designed but not implemented.
- Cron/gateway live automation remains disabled behind feature gates; dry-run plans, optional audit records, and policy/approval contract fields are implemented.
- Config/schema validation is focused local enforcement plus local schema-artifact subset enforcement, not full draft-2020-12 JSON Schema engine enforcement.
- Git-aware checks still warn in non-git workspaces; this repository now passes git root detection.
