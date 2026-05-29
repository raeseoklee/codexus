# Implementation Status

[한국어](ko/implementation-status.md)

Date: 2026-05-29

Product name: Codexus

Target CLI: `cx`

Compatibility alias: `chx`

The package exposes `cx` and `codexus` as canonical bins. `chx` remains as a
temporary compatibility alias.

## MVP Spine Implemented

- Dependency-free Node 26 CLI entrypoint: `node src/cli/main.ts`
- Commands:
  - `doctor`
  - `init`
  - `run`
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
  - `app-server status`
  - `app-server roundtrip`
  - `app-server experiment`
  - `adapt omx status`
  - `adapt omx retrieve`
  - `adapt omx context`
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
- Run ledger under `.codex-harness/runs/<run-id>/`.
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
- Bounded repair loop when Codex succeeds but verification fails.
- Explicit-budget repair loop for repairable driver task failures.
- `cx verify` can rerun stored verification for an existing ledger.
- `cx resume` creates a follow-up supervised run from an existing ledger.
- Experience record writer with decisions, failures, verification commands, and reusable lessons.
- Automatic memory entry writing from reusable lessons plus memory add/list/search/review/curate/prune lifecycle commands.
- Skill proposal writer with source-linked `evidence.json`, structural `replay.json`, replay review, active listing, active index, improvement proposal, promotion, export, and deprecation.
- Codexus-generated skills carry a Codex-facing `codexus:<skill-name>` display identity while keeping stable storage ids.
- Codex/OMX skill export writes generated skill bundles through explicit commands.
- Codex-native adapter retrieval can return bounded relevant approved active skills and memory entries, and can format them into a prompt-safe context block with replay approval metadata.
- Model replay has a deterministic first gate plus an explicit budget/policy/live-environment gate for local experiments.
- `cx init` creates project-local config/state directories without mutating `.omx/state`.
- Run observability commands list runs, tail events, and preview reports.
- App-server schema fixture/status, dry-run roundtrip contract, and sandboxed experiment manifest surface are present, while live app-server execution remains gated off.
- Cron/gateway feature gates expose disabled status by default and dry-run automation plans for future dispatch.
- Versioned schema artifacts exist for config, state, events, memory entries, and skills, with focused enforcement on durable read paths.
- `npm run typecheck` performs syntax/static validation with the local Node runtime.
- OMX capability probe with older-version warning.
- `cx plan --omx` writes harness and OMX-compatible plan artifacts without mutating `.omx/state`.
- Codex-native skill adapter source under `codex/skills/codexus`.
- `scripts/install-codex-skill.mjs` installs the adapter into `${CODEX_HOME:-~/.codex}/skills/codexus`.

## Verified

- Unit tests: `npm test`
- Current test count: 46.
- Static check: `npm run typecheck`
- Doctor smoke: `node src/cli/main.ts doctor --json`
- Doctor reports selected driver capabilities, including `supportsApprovalFlag: false` for local `codex exec`.
- Doctor reports Codex feature availability through `codex features list`.
- Mock run: `node src/cli/main.ts run --driver mock "hello mock" --json`
- Mock run with passing verification.
- Mock run with failing verification returning a failed outcome.
- Mock run with failed first verification, one repair iteration, and passing second verification.
- Mock run with blocked and cancelled driver outcomes.
- Policy-blocked run before driver execution for dangerous verification commands.
- `status --json` reconstructs state, verification, experience, and event tail from disk.
- `verify --json` reruns stored verification.
- `resume --json` creates a linked follow-up supervised run.
- `plan --omx --json` writes `.codex-harness/plans` and `.omx/plans` artifacts.
- Skill proposal/review/promotion/deprecation workflow through both unit and CLI tests.
- Structured JSON CLI error envelope for unknown commands and argument validation failures.
- Structured JSON CLI error coverage for unexpected arguments, corrupt state, and disabled app-server driver.
- Init, observability, active-skill index/export/improvement, adapter approved retrieval/context formatting, replay parity coverage, gated model replay, stale locks, schema enforcement, migration fixtures, driver-failure repair, app-server dry-run/experiment, memory lifecycle/curation, packaging, and feature-gate tests.
- Real Codex exec smoke through ChatGPT-authenticated local Codex:
  - command: `node src/cli/main.ts run --driver codex-exec "Reply exactly CHX-CODEX-OK" --json`
  - observed final artifact: `CHX-CODEX-OK`
- Real Codex exec smoke after capability-gated flag mapping:
  - command: `node src/cli/main.ts run --driver codex-exec "Reply exactly CHX-CAPABILITY-OK" --json`
  - observed final artifact: `CHX-CAPABILITY-OK`
- Real Codex exec smoke after workflow-kernel extraction:
  - command: `node src/cli/main.ts run --driver codex-exec "Reply exactly CHX-GOAL-OK" --json`
  - observed final artifact: `CHX-GOAL-OK`
- OMX adapter smoke:
  - command: `node src/cli/main.ts adapt omx status --json`
  - observed `.omx/state` hash unchanged before/after.
- Static source check found no direct HTTP/OpenAI/ChatGPT backend calls in `src`, `tests`, or `package.json`.
- Codex-native adapter wrapper root discovery is covered by tests.
- Codex skill structure is validated with the Codex skill validator.

## Acceptance Coverage

- `doctor --json` reports Codex auth/version, Codex feature availability, app-server help, OMX version/features, git status, tmux, state root, and selected driver capability.
- `run` completes with both mock and real `codex-exec` drivers and writes a ledger.
- Required verification failures prevent `complete`, and repair can recover when bounded budget remains.
- `status --json` reconstructs state, verification, experience, and event tail without a live process.
- `adapt omx status --json` is read-only against `.omx/state`; `adapt omx retrieve --json` returns approved bounded context candidates; `adapt omx context --json` formats prompt-safe context.
- Tests pass without model/network access through the mock driver.
- Evolution output writes source-linked experience and memory entries.
- Skill promotion requires trigger/scope/safety/evidence/replay and writes a versioned active copy, promotion-review evidence, and enriched active index entry.
- Explicit skill export writes generated Codex/OMX bundles without auto-installing them.

## Known Gaps

See [Remaining work](remaining-work.md) for the prioritized backlog and design
review. Current high-level gaps:

- Driver-failure repair is implemented only for repairable task failures and only with an explicit budget.
- Model replay is still local-experiment gated; routine full model-in-the-loop replay scenarios do not run by default.
- Codex app-server driver is intentionally disabled for live execution; fixture/status, dry-run roundtrip, and sandbox experiment manifest probing are implemented.
- Codex-native adapter retrieval exists, but it does not automatically inject active skills into the current Codex prompt.
- Cron/gateway live automation remains disabled behind feature gates; dry-run plans are implemented.
- Config/schema validation is focused local enforcement plus schema artifacts, not full draft-2020-12 JSON Schema engine enforcement.
- Git-aware checks still warn in non-git workspaces; this repository now passes git root detection.
