# Implementation Status

[Korean](ko/implementation-status.md)

Date: 2026-06-07

Product name: Codexus

Target CLI: `cx`

Public bins: `cx`, `codexus`

Current stable baseline: `0.2.0`

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
  - `replay parity`
  - `locks list`
  - `locks inspect`
  - `locks clear`
  - `schema check`
  - `schema engine`
  - `schema validate`
  - `schema validate-run`
  - `slop check`
  - `lsp status`
  - `lsp check`
  - `release check`
  - `contract check`
  - `update check`
  - `wiki map`
  - `wiki build`
  - `wiki check`
  - `wiki context`
  - `wiki export`
  - `app-server status`
  - `app-server roundtrip`
  - `app-server experiment`
  - `app instance profile list`
  - `app instance status`
  - `app instance logs`
  - `app instance start`
  - `app instance stop`
  - `app instance evidence record`
  - `app instance evidence list`
  - `app instance evidence probe`
  - `app instance evidence logs`
  - `app instance evidence metrics`
  - `app instance evidence screenshot`
  - `memory add`
  - `memory search`
  - `memory list`
  - `memory review`
  - `memory curate` with advisory conflict candidates and curator-derived tri-state quality findings
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
  - `cron recovery`
  - `cron run-now`
  - `gateway status`
  - `gateway recovery`
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
- App-server schema fixture/status, dry-run roundtrip contract, sandboxed experiment manifest recording, optional `codex app-server --help` process-probe evidence, deterministic fake lifecycle supervision, isolated real Stage A evidence, explicit opt-in Stage B read-only socket observation, and fake/Codexus-owned stdio proof evidence are present, while live app-server execution remains gated off. Discovery, Stage A, Stage B, and stdio-proof app-server evidence manifests are registered as experimental schema-validatable artifacts.
- Cron/gateway now expose an experimental explicit-approval live dispatch slice
  on top of the existing dry-run contract: `cx cron run-now` / `cx gateway
  check` can acquire an automation lock, record policy and approval artifacts,
  dispatch a normal supervised run, and return the linked run ledger. Blocked
  live attempts now write schema-validatable automation dispatch records with
  `automation.boundary_stop` payloads for feature-gate, approval, and lock
  boundaries. Each dispatch plan also records `automation-action-authority-v1`
  so consumers can see that the dispatcher may start only a linked Codexus run
  when approved, never mutates scheduler/listener state, and never claims
  cleanup, health, or completion authority for the action surface itself.
  `cx cron recovery` and `cx gateway recovery` scan foreground dispatch records
  and can record `automation-recovery` projections with manual-review
  candidates; these projections do not own a scheduler queue, retry
  automatically, clean up, claim health authority, or claim completion authority.
- Versioned schema artifacts exist for config, state, events, memory entries,
  skills, session state, supply-chain policy, decision artifacts, app instance
  descriptors, app instance artifacts, automation dispatch records, subagent
  result/launch artifacts, and app-server discovery/experiment evidence
  manifests, with focused enforcement plus
  zero-dependency schema-artifact subset validation on single-record and
  run-ledger checks.
- Codex JSONL usage is captured when present and terminal state records usage or
  `{ "available": false }`.
- Unsupported Codex exec config options emit `config.option_ignored` ledger
  events instead of being silently dropped.
- `npm run build` bundles the TypeScript source with esbuild into
  `dist/cli/main.js` for npm installation.
- `npm run package:smoke` runs `npm pack`, installs the tarball into a temporary
  global prefix, and verifies `codexus` / `cx` help and version output,
  runtime schema assets, postinstall Codex skill adapter installation,
  `doctor --json --strict` through a fake Codex fixture, `supply-chain check
  --gate`, local-mode `release check --gate`, `lsp check --gate`, and
  installed-package mock pass/fail/repair/status/events/resume/cancel flows.
- `prepublishOnly` runs `npm run release:check`, which combines local CI,
  source-tree `lsp:check` dogfood, package smoke verification, report-only
  supply-chain dogfood, and `cx release check --gate --json`. Package smoke
  includes the gate-mode supply-chain and LSP checks for the installed package.
- `cx release check --json` reports stable local-mode release-integrity evidence
  for the source checkout: stable installer default, expected-version guard,
  pinned trusted-publishing workflow, stable dist-tag sync wiring, GitHub
  Release `install.sh` asset wiring, and local release-evidence docs. `--live`
  remains an explicit experimental post-publish sign-off for npm `latest`, npm
  `next` not trailing `latest`, GitHub latest, and installer asset hash
  identity.
- `cx release policy --json` reports the active release cadence policy:
  small commits but larger thematic stable releases, hotfix exceptions, the
  stable-contract version boundary, and English/Korean policy document
  presence. `npm run release:check` includes `release:policy` so missing policy
  docs block release prep before tag publish.
- `cx contract check --json` reports the experimental `0.2.0` promotion
  readiness audit. `repo check --gate`, local-mode `release check --gate`,
  `lsp check --gate`, the narrow `architecture check --gate` forbidden-import
  subset, and manual `wiki context --fresh-only --gate` are promoted stable
  surfaces and are frozen in `docs/json-contract.md`, so
  `cx contract check --target 0.2.0 --gate --json` can pass the
  stable-promotion requirement. Action surfaces such as app-instance start/stop,
  live autopilot, active relay adapters, Desktop app-server attachment,
  automatic injection, and plugin always-on claims remain deferred.
- `cx update check --json` reports experimental update availability facts from
  the npm `latest` dist-tag through a bounded TTL cache. The explicit opt-in
  path for npm `next` prerelease facts is
  `cx update check --channel next --json`; it uses a separate cache file.
  `CODEXUS_NO_UPDATE_CHECK=1` disables registry access, CI/cache-only paths
  avoid network lookup, and the command never mutates installation or becomes
  completion, verification, or release authority.
- `version --json`, `doctor --json`, and `session status --json` include an
  additive cache-only experimental `update` summary. These primary commands do
  not query the registry and cannot fail because update lookup is unavailable.
  Stale cache entries are reported with `cacheState: "stale"` and
  `versionFresh: false`; they must not be interpreted as proof that the current
  installation is up to date.
- `cx plugin status --json` reports experimental Codex plugin package evidence:
  packaged manifest validity, bundled skill count, wrapper-script presence, and
  explicit non-authority fields. Installed-plugin state remains deferred until
  Codex exposes a documented plugin install-location contract
  (`codex_plugin_install_location_contract_deferred`), and plugin packaging
  never proves always-on supervision by itself.
- The npm tarball ships `dist`, `schemas`, the Codex skill adapter,
  the experimental Codex plugin package, `fixtures/app-server/schema.fixture.json`,
  `install.sh`, package installer scripts, and top-level release metadata. It
  excludes source, tests, docs, replay fixtures, migration fixtures, and source
  maps. Maintainers can build an external debug source map with
  `npm run build:sourcemap`; it uses `sourcesContent: false` and is not part of
  the default npm package.
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
- `cx setup codex-session --always-on` installs an overlay profile that asks
  Codex to checkpoint before risky changes and verify before completion, while
  keeping `cx session status --json` as the source of truth.
- Codexus AGENTS overlay writes are atomic, create a one-time `.codexus.bak`
  backup, and append a fresh marker block when existing markers are damaged.
- `cx session status`, `cx session checkpoint`, and `cx session verify` provide
  the first Codex-native session surface under `.codexus/session/`.
- `cx session verify --auto` detects conservative verification candidates
  without execution; `--execute` is required before running the recommended
  command through the existing policy preflight.
- `cx session hud --json` reports a compact read-only session summary for Codex
  chat/status workflows while statusline integration remains unavailable.
- `cx session decision record/list/status` records and reads schema-valid
  `codexus.decision` artifacts under `.codexus/session/decisions/`. These
  artifacts preserve constraints, rejected alternatives, rationale, and relative
  evidence links as advisory control-plane evidence; they never become
  completion authority.
- `cx session loop --json`, `cx session status --json`, and `cx session hud
  --json` report a ledger-derived repeated-verification-failure summary. Loop
  boundaries are decision stops and do not prove task failure or completion.
- Notify-hook `turn-ended` heartbeats can record read-only `heartbeatEvidence`
  and compact `heartbeatChangeEvidence` snapshots; they do not execute
  verification and cannot refresh stale evidence.
- `cx slop check` and `cx session slop` expose the quality evidence guard:
  tri-state `changeEvidence`, derivable evidence gaps, non-gating derivable
  facts, advisory heuristic claims, explicit diff base metadata, and optional
  declared-scope and explicit review-artifact checks. `--gate` converts the
  same tri-state evidence status into an automation exit code without letting
  heuristics fail a change.
- `cx lsp status` and `cx lsp check` expose experimental project LSP diagnostics
  evidence. The first slice auto-detects TypeScript diagnostics from local
  project files and explicit package scripts, runs only an explicit diagnostics
  command such as `npm run typecheck`, redacts bounded stdout/stderr tails, and
  self-reports that no long-lived LSP protocol server is started or controlled.
  The surface does not edit files and does not become completion authority.
- `cx session subagent record/attach/status` records subagent claim bundles
  under `.codexus/session/subagents/`, links them from session state, and keeps
  subagent claims separate from verification freshness. `cx session subagent
  launch` records a deferred launcher contract with `launcher.supported: false`;
  `cx session subagent probe --record` records bridge-availability evidence that
  reports the current local CLI bridge as `unavailable` without spawn,
  workspace-mutation, or completion authority;
  `cx session subagent complete` records final claims from a native subagent
  used in the current Codex session and optional `pass|fail|unknown` behavior
  checklist assertions without claiming Codexus spawned it. Result and launch
  artifacts are schema-validatable via `subagent-result`,
  `subagent-launch-contract`, and `subagent-bridge-probe`. Codexus still does
  not spawn native subagents from the CLI.
- `cx session workers status --json` reports the tmux-backed worker launch gate
  without starting worker panes.
- `cx setup codex-session --enable-notify-hook` installs a Codex notify hook
  only when the current project is trusted in Codex config; existing top-level
  `notify = [...]` commands are preserved through `--previous-notify` chaining.
- Notify-hook setup writes `${CODEX_HOME:-~/.codex}/config.toml` atomically,
  creates a one-time `config.toml.codexus.bak` backup, and
  `--disable-notify-hook` restores the previous notify command or removes a
  Codexus-only notify line without refreshing the AGENTS overlay.
- `cx session notify --event <name>` is the internal notify-hook write surface
  and records bounded hook events in `.codexus/session/state.json`.
- On real `turn-ended` dispatch, notify events can include a bounded
  `heartbeatEvidence` snapshot of the derived evidence model. The hook never
  executes verification and cannot make stale evidence fresh.
- Session state schema v5 separates notify installation from dispatch, adds
  workspace-fingerprint evidence, and links read-only subagent claim and launch
  contract artifacts:
  `capabilities.hooks` is `configured` after install and `available` only after
  a real `turn-ended` event is observed. Manual smoke events do not mark
  dispatch observed.
- `cx session migrate [--dry-run]` is the explicit migration boundary for
  `.codexus/session/state.json`; it reports pending migrations and persists
  them unless `--dry-run` is used.
- `cx session verify` reuses the verification policy preflight and records
  blocked verification attempts instead of executing dangerous commands.
- `cx schema engine --json` reports the active local schema subset engine and
  the unavailable full JSON Schema engine without adding a dependency.
- `cx architecture check --json` reports schema-validated architecture policy
  facts and forbidden-import evidence. Broad layering analysis remains heuristic
  in the first slice and self-reports `broad_layering_rule_deferred`.
- `cx supply-chain check --json` reports local derivable package evidence with
  `evidenceGaps`, `derivableFacts`, `heuristicClaims`, `blockingUnknowns`, and
  `informationalUnknowns`; `--gate` exits only from evidence gaps and blocking
  unknowns. The default path uses static package projection and does not execute
  package lifecycle scripts. Dependency name similarity / typosquat evaluation
  remains advisory and self-reports `typosquat_name_similarity_deferred`.
- `cx replay parity --json` reports canonical replay parity label coverage from
  committed fixtures and preserves the no-new-label-without-fixture contract.
- Cron/gateway live paths share the `policy-reviewed-live-dispatch-v1` policy
  contract and now dispatch through the normal supervised run ledger when the
  feature gate is enabled and explicit approval is supplied. Blocked live paths
  share `automation-boundary-v1` audit payloads and
  `cx schema validate --type automation-dispatch --file <path> --json`.
  Dispatch records also carry `automation-action-authority-v1` to separate an
  approved linked-run dispatch from scheduler, listener, health, cleanup, or
  completion authority. Recovery projections are schema-validatable with
  `cx schema validate --type automation-recovery --file <path> --json` and
  remain advisory/manual-review only.
- Session state reads perform focused structure validation, and mutable session
  state updates are protected by the Codexus `session` lock.
- `schemas/session-state.schema.json` is a first-class schema artifact for the
  v5 session-state shape, and
  `cx schema validate --type session-state --file <path> --json` validates
  session state through the same local schema-artifact subset engine.
- `doctor --json` reports Codexus session state, project/user overlay status,
  notify-hook installation status, notify dispatch observation status, deferred
  self-report aggregation, and truthful unavailable status for statusline
  integration.
- GitHub Actions CI runs committed whitespace checks, static syntax validation, and unit tests on pushes to `main` and pull requests.
- Local CI parity is available with `npm run ci`; remote Actions execution still depends on repository/account runner availability.
- Public repository readiness files are present: MIT license, contributing guide, security policy, support guide, code of conduct, roadmap, changelog, issue templates, and PR template.
- Root `install.sh` supports GitHub Pages `curl | sh` installation by
  delegating to npm (`codexus` by default), linking canonical bins, and
  installing the Codex skill adapter unless `CODEXUS_INSTALL_CODEX_SKILL=0` is
  set.
- GitHub Pages deployment is repository-owned through
  `.github/workflows/pages.yml`, using pinned Node 24-compatible actions and an
  explicit Node 24 JavaScript action opt-in instead of the legacy
  GitHub-managed Pages deploy path.
- User-facing Codex-session usage docs now explain how to invoke the `$codexus` skill, what commands to prefer, and when to stay with normal Codex interaction.
- The session-native supervision design now makes Codex-native in-Codex usage the
  product direction, with `codex exec resume` deferred as a separate external
  multi-turn feature.
- The autopilot contract now has an experimental foundation slice:
  `cx autopilot plan --from ...`, `cx autopilot contract validate <file>`,
  `cx autopilot contract approve <file> --approved-by <name>`, and
  `cx autopilot contract scope-check <file> [--gate]` exist. The contract body
  is schema-validated, approval records include a canonical subject hash, and
  scope checking reuses change-evidence facts against the approved contract.
  Live `cx autopilot run` remains deferred outside the stable contract.
- A generic worktree app instance launcher now has an experimental live
  ownership first slice: `cx app instance profile list/status/logs/start/stop`
  reads descriptor-backed profiles, starts one Codexus-owned process per
  worktree, writes owned instance artifacts plus heartbeat, probes active HTTP
  health, tails bounded logs, and stops only owned processes. The surface
  remains outside the stable contract. `cx app instance evidence
  record/list` records browser/dev-server/log/screenshot/metric observations
  against one `instanceId`, and `cx app instance evidence probe` records
  loopback-only bounded/redacted HTTP dev-server evidence for a running owned
  instance. `cx app instance evidence logs` records bounded/redacted stdout and
  stderr tail evidence for the same owned instance. `cx app instance evidence
  metrics` records process, heartbeat, health-evidence, and log-file metrics
  for that same `instanceId`. `cx app instance evidence screenshot` records
  metadata, media type, size, mtime, and SHA-256 for an already captured local
  screenshot file and binds it to that same `instanceId`. None of these evidence
  surfaces claim control, health authority, or completion authority;
  Browser/DevTools live capture integration remains follow-up work.
- The repository knowledge graph has an experimental first slice:
  `cx repo graph build/check` emits persisted codexus-lite graph artifacts,
  scoped freshness, deterministic graph identity, and structural gates. External
  graph import, search/explain, and context injection remain deferred outside
  the stable contract.
- Desktop app-server discovery has an experimental read-only evidence command:
  `cx app-server discover --json/--record` reports default control-socket
  availability, running app-server transport modes, and Stage B readiness
  without connecting to live sockets or enabling remote control. Current
  maintainer evidence is `stdio_only`. The stdio-observer design contract is
  documented: existing Desktop stdio pipes are not attach targets, so positive
  Desktop attachment remains blocked pending an explicit socket, a fake or
  Codexus-owned stdio proof harness, or a future supported observer bridge.
  `cx app-server observer status --json` now projects recorded discovery,
  Stage B, and stdio-proof evidence into one bridge summary without connecting
  to live sockets; it reports `desktop-app-server` only from recorded Stage B
  turn-boundary evidence.
- `cx session status --json` and `cx session hud --json` include the same
  recorded app-server observer projection under `evidenceLoop.appServerObserver`.
  This maps turn-boundary evidence into session visibility without mutating
  session runtime surface, attaching to Desktop, or creating completion
  authority.
- Multi-engine relay autopilot has an experimental recorder/checker first slice:
  `cx autopilot relay record` imports external author/reviewer artifacts without
  spawning another engine, `cx autopilot relay stage-gate` records
  `delta-check`/`full-gate` evidence plus optional acceptance criteria and
  verification matrix rows, and `cx autopilot relay check-agreement` validates
  same-artifact convergence while proving convergence cannot complete work when
  verification fails. Implementation-stage convergence now requires a full-gate
  acceptance-criteria-to-verification matrix with passing evidence or explicit
  approved deferrals. Active relay execution and external engine adapters remain
  deferred outside the stable contract.
- Operational control invariants now have an experimental first slice:
  `cx autopilot presets list --json`, schema-validated `autonomyPreset`
  metadata in autopilot draft contracts, `cx policy catalog check --json`, and
  richer `riskFacts` derived from change evidence for blast radius,
  dependency, schema, migration, and scope findings. No new completion
  authority exists; these remain advisory/control metadata over the existing
  evidence gates. The stable deterministic docs-code invariant pass in
  `cx repo check --gate --json` checks required indexes, index links,
  English/Korean counterparts, declared `schemas/*.schema.json` references,
  and source `*_deferred` self-report claims mirrored in both
  implementation-status docs. Its stable contract does not make semantic
  freshness or prose quality gateable. `cx session status --json`,
  `cx session hud --json`, and `doctor --json` now aggregate deferred
  self-reports and policy catalog counts into one control-plane summary with
  `completionAuthority: false`; observed/advisory/unavailable control signals
  remain dashboard metadata, not completion evidence.
- Codexus session tasks now have an experimental projection artifact:
  `cx session tasks list/add/update/complete/block --json` writes
  `.codexus/session/tasks.json` with the `codexus.session.tasks` schema.
  `cx session status --json` and `cx session hud --json` include compact task
  summaries, but task status, checked-off items, and evidence links remain
  projection metadata only. They never turn failed verification into completion
  evidence and always carry `completionAuthority: false`.
- The compiled repository wiki now has an experimental deterministic first
  slice: `cx wiki map`, `cx wiki build --mode deterministic`, `cx wiki check
  --gate`, `cx wiki context --topic <name> --budget <n>`, and explicit
  `cx wiki export --target <path>`. `cx wiki context --fresh-only --gate` lets
  callers require fresh manual context; it fails instead of returning stale topic
  pages when no fresh page is selected. `cx wiki context --topic <name>
  --approve --approved-by <name>` records a visible
  `codexus.wiki.context-approval` artifact with `approved_not_injected`,
  `automatic:false`, and no completion authority. `cx wiki build --mode advisory` now records
  a schema-valid local source-bundle synthesis artifact with driver/model
  evidence (`modelInvoked: false`) and non-authority markers. The wiki generates
  regenerable markdown pages under `.codexus/wiki/` with source refs, local
  links, manifest/page/advisory schemas, and scoped freshness. The deterministic
  page set now includes release/contract and runtime-boundary projections in
  addition to overview, commands, and verification. Export requires a fresh
  passing wiki check and does not auto-commit or become source truth. Automatic
  context injection remains deferred.
- Deferred self-reports currently documented and enforced by `cx repo check
  --gate --json` are:
  - `acceptance_criteria_extraction_deferred`
  - `autopilot_run_deferred`
  - `broad_layering_rule_deferred`
  - `typosquat_name_similarity_deferred`

## Verified

- Unit tests: `npm test`
- Current test count: 221.
- Static check: `npm run typecheck`
- CI workflow: `.github/workflows/ci.yml`
- Local CI parity: `npm run ci`
- Package smoke: `npm run package:smoke`
- Node 22 installed-package smoke: `codexus --help`, `codexus schema check
  --json`, and a mock run executed through Node 22.22.3 against a packed and
  temporary globally installed tarball.
- Installed package release smoke: `codexus` / `cx` help and version,
  postinstall Codex skill adapter install, `doctor --json --strict` with a fake
  Codex fixture, `supply-chain check --gate`, mock pass/fail/repair,
  status/events/resume, and terminal cancel behavior.
- Installed package automation smoke: `cx cron run-now` and `cx gateway check`
  with enabled feature gates, explicit approval, and the mock driver prove that
  the experimental automation dispatcher acquires a lock and returns a linked
  run result from a packed global install while preserving the
  `automation-action-authority-v1` negative-authority contract.
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
- Init, observability, active-skill index/export/improvement, adapter approved retrieval/context artifact recording, full replay parity fixture-matrix coverage, gated model replay, stale locks, schema validation/run-ledger validation, migration fixtures, driver-failure repair, app-server dry-run/experiment process-probe, fake-supervision recording, Stage A isolated real evidence, Stage B read-only evidence, memory lifecycle/curation with conflict and quality findings, packaging, installed-skill tree diagnosis, and feature-gate policy/audit-record tests.
- Repository graph foundation tests cover `cx repo graph build/check`, repo-graph schema validation, scoped freshness that ignores out-of-scope changes, stale detection for in-scope changes, dangling edge failure, and stable graph ids that ignore volatile gate output.
- Multi-engine relay recorder tests cover artifact import-only behavior, relay
  session/stage-gate/convergence schema validation, same-artifact convergence
  requirements, `delta-check` rejection for convergence, and the invariant that
  valid convergence cannot complete work when verification fails. The
  implementation-stage AC-to-verification matrix gate is covered for missing
  matrix, unmapped criteria, missing evidence, approved deferrals, missing
  evidence paths, and passing evidence.
- Compiled wiki tests cover deterministic `map/build/check/context/export`,
  stale-page gate failure after scoped source changes, export blocking on stale
  pages, unsafe export target rejection, and honest rejection of advisory build
  mode.
- App instance launcher tests cover descriptor schema validation, `profile
  list`, `start --dry-run`, live start, duplicate-start rejection, active
  health promotion for a live owned process, bounded log tails, owned stop,
  unverifiable owner stop refusal, stale/orphan lifecycle policy projection, and
  instance-linked observation evidence, including loopback HTTP probe evidence,
  that never promotes control, health, or completion authority.
- Installed package smoke also covers deterministic wiki build, wiki-manifest
  schema validation, `wiki check --gate`, explicit wiki export, and bounded wiki
  context generation plus non-injected wiki context approval artifact validation
  and session evidence-loop projection.
- Installed package smoke also covers `cx policy catalog check --json`,
  `cx autopilot presets list --json`, and autopilot draft planning with an
  explicit preset.
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
- Session HUD, explicit review-artifact links in the quality evidence guard,
  schema engine status, replay parity status, adapter injection approval
  artifacts, session worker gates, subagent spawn rejection, deferred
  launcher-contract behavior, and hosted completion handoff are covered by CLI
  tests.
- Slop guard gate mode is covered for pass, fail, and unknown/blocked outcomes.
- Always-on notify heartbeat quality snapshots are covered by session-native
  tests and session-state schema validation.
- CLI version reporting is covered by source CLI tests and installed package
  smoke tests.
- Update availability is covered by CLI tests for registry-derived availability,
  `CODEXUS_NO_UPDATE_CHECK=1`, cache-only primary command summaries, unsupported
  update subcommands, and installed package smoke for `cx update check`.

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
- Codex app-server driver is intentionally disabled for live execution; fixture/status, dry-run roundtrip, sandbox experiment manifest recording, help-process probe evidence, deterministic fake lifecycle supervision, schema-validatable Stage A isolated real evidence, schema-validatable Stage B read-only evidence, stdio proof, and recorded observer bridge status are implemented behind explicit gates.
- First Stage B maintainer Desktop smoke was negative: no usable app-server
  WebSocket socket was found, and a discovered IPC socket closed before
  handshake. The fake/Codexus-owned stdio proof harness is implemented, but
  Desktop attachment remains unavailable/unobserved until a supported socket or
  future supported observer bridge is proven. The documented stdio-observer
  contract forbids attaching to existing Desktop stdio pipes.
- Codex-native adapter retrieval exists, but it does not automatically inject active skills into the current Codex prompt.
- Session state is currently a cwd-scoped singleton because Codex does not expose
  a stable per-conversation id to Codexus.
- Notify-hook integration is implemented behind explicit setup and Codex project
  trust checks. `cx session hud --json` is available as the statusline fallback;
  statusline integration and tmux-backed worker launch are designed but not
  implemented.
- Cron/gateway now have an experimental explicit-approval live dispatcher and
  schema-validatable blocked-dispatch boundary records plus foreground recovery
  projections. Future work is richer unattended scheduler semantics, retry
  policy, and asynchronous ownership beyond the first synchronous dispatch slice.
- Config/schema validation is focused local enforcement plus local schema-artifact subset enforcement, not full draft-2020-12 JSON Schema engine enforcement.
- Autopilot active execution remains deferred for the 0.2/0.3 track. The
  experimental foundation now covers `cx autopilot plan` plus contract
  validate/approve/scope-check, but `cx autopilot run` and worktree-attached
  long-running execution are still intentionally unbuilt. `cx repo graph
  build/check` and `cx autopilot relay record/stage-gate/check-agreement`
  exist as experimental foundations. `cx repo graph import` now imports bounded
  JSON-only external graphs without executing provider packages, and
  `cx repo graph search/explain` provide read-only advisory retrieval with
  `eligibleForAutomaticInjection: false`. Graph context injection and active
  multi-engine relay adapters remain deferred outside the stable surface.
- Worktree app instance launcher now has an experimental live ownership slice:
  start/stop, process ownership tokens, heartbeat, port allocation, liveness,
  and active health probes are implemented for Codexus-owned instances.
  Instance-linked observation evidence descriptors are implemented through
  `cx app instance evidence record/list`, with a first real adapter in
  `cx app instance evidence probe` for loopback HTTP dev-server evidence and
  `cx app instance evidence logs` for bounded/redacted stdout/stderr tail
  evidence. `cx app instance evidence metrics` records process, heartbeat,
  health-evidence, and log-file metrics for the same owned `instanceId`, and
  `cx app instance evidence screenshot` binds an already captured local
  screenshot file to the same `instanceId` by recording bounded file metadata
  and SHA-256. Explicit stale/orphan lifecycle policy projection is implemented.
  `cx session status --json` and `cx session hud --json` now summarize
  app-instance observations and wiki context approvals under `evidenceLoop`
  without adding health, control, source-truth, or completion authority.
  Actual Browser/DevTools live capture and worktree-aware launcher reuse remain
  follow-up work.
- Operational control invariants have deterministic docs-code checks plus an
  experimental control-plane first slice: decision artifacts, repeated
  verification loop summaries, HUD/status projections, autonomy preset
  metadata, policy-catalog reporting, and richer change-evidence risk facts are
  implemented. Task artifacts, broader policy promotion, and unified control
  aggregation remain future work.
- Compiled repository wiki now has an experimental deterministic first slice:
  source-linked page generation, structural freshness gates, bounded
  context-pack generation, and explicit export exist. Advisory synthesis and any
  automatic injection path remain future work.
- Git-aware checks still warn in non-git workspaces; this repository now passes git root detection.
