# Changelog

[한국어](docs/ko/CHANGELOG.md)

All notable changes to Codexus will be documented in this file.

This project follows a practical pre-1.0 changelog format. Breaking changes can
occur before 1.0, but they should be called out clearly.

## Unreleased

### Added

- The deterministic compiled wiki now emits `release.md` and `runtime.md`
  pages alongside overview, commands, and verification. These pages summarize
  release/contract pointers and runtime authority boundaries as regenerable
  projections without gaining source-truth, injection, health, cleanup, or
  completion authority.
- `cx session subagent probe --record --json` now records a schema-valid
  bridge-availability artifact. The current local CLI bridge reports
  `unavailable` and keeps native spawn, workspace mutation, and completion
  authority false.
- `cx session status --json` and `cx session hud --json` now project recorded
  app-server observer evidence into the session evidence loop. `desktop-app-server`
  still appears only from recorded Stage B turn-boundary evidence, and the
  projection never connects to live sockets or gains completion authority.
- `cx app instance evidence browser --instance-id <id> --capture <file> --json`
  now binds a Browser/DevTools capture JSON file to one Codexus-owned app
  instance. The capture records bounded, redacted URL/title evidence and reports
  whether the observed loopback endpoint matches the instance endpoint, while
  keeping process-identity proof, health, control, cleanup, and completion
  authority false.
- Deterministic `cx wiki build --mode deterministic --json` now emits
  `graph.md`, `sessions.md`, `architecture.md`, `decisions.md`, and `risks.md`
  projection pages in addition to overview, commands, verification, release,
  and runtime pages. The new pages summarize repository graph, session,
  architecture, decision, and change-risk artifacts without becoming source
  truth, injection approval, or task completion evidence.
- `cx wiki context --approve --json` now records an explicit manual-only
  context-pack handoff policy. Handoff requires fresh context and explicit
  reference, keeps automatic injection and applied state false, and never gains
  source-truth or completion authority.
- `cx wiki injection-policy --json` now reports the explicit wiki context
  injection boundary. The policy is manual-only, keeps automatic injection
  deferred, and lists the evidence required before any future injection path can
  be considered.

### Fixed

- `cx wiki context --topic <text> --json` now ranks canonical page title and
  page-id matches above incidental body/link mentions, so small context budgets
  still include the topic's primary page.
- `cx wiki context --approve --json` now rejects stale selected pages even when
  `--fresh-only` is not passed, preventing stale context packs from being
  approved for handoff.
- Update summaries now distinguish fresh update facts from stale cache entries.
  Cache-only primary commands (`version --json`, `doctor --json`, and
  `session status --json`) report stale update cache as non-fresh evidence
  instead of implying that the installed version is current. Explicit
  `update check` also avoids using stale cache to claim current/available when
  the registry is unavailable.
- The default npm package now explicitly forbids `dist/**/*.map` while exposing
  a maintainer-only `npm run build:sourcemap` helper that emits an external
  debug source map with `sourcesContent: false`.
- App-instance observation artifacts now include process reason, heartbeat
  freshness/age, and lifecycle state snapshots so observations are more clearly
  bound to instance evidence without gaining health, cleanup, or completion
  authority.
- CLI schema error hints now include the `subagent-bridge-probe` validation type.

## 0.2.0 - 2026-06-08

This release is Codexus's first stable-contract promotion milestone. It promotes
the narrow architecture check and manual fresh-only wiki context surfaces into
the stable JSON contract, while keeping live app control, Desktop attachment,
autopilot live execution, active relay adapters, automatic context injection,
LSP protocol-server lifecycle, and plugin always-on supervision explicitly
experimental or deferred.

### Stable Contract

- Promoted `cx architecture check --gate --json` to stable for declared-policy
  `forbidden-import` facts derived from the static best-effort import scan.
  Broad layering, type-aware graph claims, and design-quality judgments remain
  advisory/deferred.
- Promoted `cx wiki context --topic <name> --fresh-only --gate --json` to stable
  for explicit manual context selection and local freshness gating. The surface
  remains ineligible for automatic prompt injection and does not claim
  source-truth or completion authority.
- Expanded `docs/json-contract.md` and the Korean counterpart with the 0.2
  frozen fields for architecture and manual wiki context, while generalizing
  patch/minor release language for the current stable line.

### Added

- Added installed-package smoke coverage for promoted architecture output and
  both fresh and stale `wiki context --fresh-only --gate` branches.
- Updated the 0.2 promotion readiness plan, implementation status, remaining
  work, roadmap kanban, project wiki, README, and release policy to reflect the
  promoted surfaces and the still-deferred authority surfaces.

### Deferred

- Live app-instance health authority, live `autopilot run`, active relay engine
  spawning, Desktop app-server attachment, automatic prompt injection, LSP
  protocol-server lifecycle, and plugin always-on supervision are not part of
  the 0.2 stable contract.

## 0.1.15 - 2026-06-08

This release closes the recommended roadmap sequence with evidence-first
hardening. It keeps the 0.1.x stable JSON contract boundary unchanged: new
runtime surfaces remain experimental, manual context stays non-injected, and
deferred tracks are made more visible instead of being promoted.

### Added

- Added experimental app-instance screenshot-file evidence:
  `cx app instance evidence screenshot --instance-id <id> --evidence-path <path>
  --json` records metadata, media type, size, mtime, and SHA-256 for an already
  captured local screenshot file and binds it to one `instanceId`. The adapter
  does not open browsers, capture pixels itself, or claim health, control,
  cleanup, or completion authority.
- Added an experimental fresh-only wiki context gate:
  `cx wiki context --topic <name> --fresh-only --gate --json` fails instead of
  returning stale topic context when no fresh wiki page is available. Context
  remains visible, manual, and ineligible for automatic injection.
- Added `wiki context --fresh-only --gate` to the `cx contract check --target
  0.2.0` candidate audit as a manual-context hardening candidate, not an
  automatic-injection promotion.
- Made `cx contract check --target 0.2.0` explicitly track deferred evidence
  tracks for app-instance health modeling, automatic context injection, LSP
  protocol-server lifecycle, and plugin always-on supervision.

### Fixed

- Hardened experimental relay implementation-stage convergence checks so an
  acceptance-criteria matrix cannot pass without approved criteria and each
  matrix evidence path must resolve to a concrete local evidence file.

## 0.1.14 - 2026-06-07

This release adds an evidence operating loop between compiled wiki context,
session HUD/status, and installed-package smoke. The new outputs are
experimental projections only: they make approved context and app observations
visible without injecting prompts automatically or claiming health, control,
source-truth, or completion authority.

### Added

- Added experimental wiki context approval artifacts:
  `cx wiki context --topic <name> --approve --approved-by <name> --json`
  writes a visible `codexus.wiki.context-approval` artifact with
  `approved_not_injected`, `automatic:false`, and `completionAuthority:false`.
  The context remains bounded and explicit; Codexus still does not inject it
  into the active Codex prompt automatically.
- Added session evidence-loop summaries for app-instance observations and wiki
  context approvals. `cx session status --json` and `cx session hud --json`
  now report these counts under `evidenceLoop` without granting health,
  control, source-truth, or completion authority.
- Extended the installed package smoke to validate wiki context approval
  artifacts and the new session evidence-loop projection.

## 0.1.13 - 2026-06-07

This release closes a five-surface evidence-projection batch. It keeps the
0.1.x stable JSON contract boundary unchanged: the new task, graph, wiki,
metric, and automation recovery outputs are experimental or advisory and do not
claim completion, health, scheduler, retry, cleanup, or prompt-injection
authority.

### Added

- Added experimental session task projection:
  `cx session tasks list/add/update/complete/block --json` records
  Codexus-owned task state under the session ledger. Task completion remains a
  projection only and cannot make failed verification look complete.
- Added experimental repository graph import and retrieval:
  `cx repo graph import --graph-provider understand-anything --source <file>`,
  `cx repo graph search`, and `cx repo graph explain` can consume bounded
  JSON-only graph artifacts and answer read-only graph queries. Imported graph
  content is never injected into prompts automatically.
- Added experimental compiled-wiki advisory synthesis:
  `cx wiki build --mode advisory --json` creates a local deterministic
  advisory projection from fresh compiled wiki pages without invoking a model or
  becoming source truth.
- Added experimental app-instance metric evidence:
  `cx app instance evidence metrics --instance-id <id> --json` records process,
  heartbeat, network, health, and log file-size observations for a
  Codexus-owned app instance without claiming health or control authority.
- Added experimental automation recovery projection:
  `cx cron recovery --json` and `cx gateway recovery --json` summarize recorded
  foreground dispatch artifacts and manual-review candidates without owning an
  unattended scheduler or automatic retry loop.

## 0.1.12 - 2026-06-06

This release turns the project release cadence into executable policy evidence.
It keeps the 0.1.x JSON contract boundary unchanged: the new `release policy`
surface is experimental, while `release:check` now verifies that the release
policy itself is present before a stable tag is cut.

### Added

- Added an executable release cadence policy:
  `cx release policy --json` reports the active "small commits, larger
  releases" policy, hotfix exceptions, stable-contract version boundary, and
  English/Korean policy-doc presence. `npm run release:check` now includes the
  policy gate so release prep fails before tag publish if the policy docs are
  missing.

## 0.1.11 - 2026-06-05

### Added

- Added explicit prerelease update opt-in:
  `cx update check --channel next --json` reads the npm `next` dist-tag through
  a channel-specific bounded cache. Stable `latest` checks remain the default;
  prerelease checks are advisory only, never mutate installation, and never run
  from primary cache-only commands unless explicitly requested.

## 0.1.10 - 2026-06-05

### Added

- Added an experimental Codex plugin packaging surface:
  `cx plugin status --json` validates the packaged plugin manifest, skill, and
  wrapper script included under `codex/plugins/codexus`. The npm-installed
  `$codexus` skill remains the stable adapter; installed-plugin detection and
  always-on supervision claims stay deferred unless heartbeat evidence is
  observed.

## 0.1.9 - 2026-06-05

### Added

- Added experimental update availability checks: `cx update check --json`
  reads the npm `latest` dist-tag through a bounded TTL cache, supports
  `CODEXUS_NO_UPDATE_CHECK=1`, and reports only advisory update facts. The
  command never mutates the installation, never auto-installs, and never becomes
  completion or verification authority.
- Added cache-only experimental `update` summaries to `version --json`,
  `doctor --json`, and `session status --json`. These primary commands do not
  query the registry, and update lookup failure cannot fail the primary command.

## 0.1.8 - 2026-06-04

### Added

- Added experimental `cx contract check --target 0.2.0 --json`, a promotion
  readiness audit that turns the documented 0.2.0 rule into executable evidence.
  The command identifies viable stable-promotion candidates and keeps action
  surfaces deferred. `--gate` intentionally fails until at least one audited
  candidate is promoted to stable and frozen in `docs/json-contract.md`, so
  0.2.0 is not treated as a countdown after 0.1.9.

## 0.1.7 - 2026-06-04

### Added

- Added experimental project LSP diagnostics evidence:
  `cx lsp status` detects project language-server candidates without starting a
  long-lived server, and `cx lsp check [--gate]` runs explicit project
  diagnostics such as `npm run typecheck`. This first slice is detect/report
  only for LSP protocol servers: it does not auto-start language servers, does
  not edit files, and does not claim completion authority.
- Added `npm run lsp:check` and wired it into `npm run release:check`; package
  smoke also verifies the installed CLI can run `cx lsp check --gate` without
  starting a language server.
- Documented the next update-notification slice: `cx update check --json`,
  TTL-cached additive update summaries on high-signal commands, opt-out/CI
  behavior, and the rule that update lookup cannot fail the primary command or
  mutate the installation.
- Documented the Codex plugin-packaging boundary: the npm-installed `$codexus`
  skill remains the stable Codex-native adapter, while plugin packaging is only
  an experimental distribution/discoverability layer until doctor can diagnose
  installed plugin state and observed heartbeat evidence.

## 0.1.6 - 2026-06-03

### Added

- Added an experimental app-instance log snapshot evidence adapter:
  `cx app instance evidence logs --instance-id <id> [--tail <n>]` records
  bounded, redacted stdout/stderr tail evidence for a Codexus-owned worktree app
  instance and links it to an `app-instance-observation` artifact. The snapshot
  never claims control, health authority, or completion authority.

## 0.1.5 - 2026-06-03

### Added

- Added an experimental app-instance HTTP evidence probe:
  `cx app instance evidence probe --instance-id <id> [--url <loopback-url>]`
  records bounded, redacted dev-server response evidence for a Codexus-owned
  worktree app instance and links it to an `app-instance-observation` artifact.
  The probe is loopback-only and never claims control, health authority, or
  completion authority. Browser/DevTools/screenshot adapters remain follow-up
  work.

## 0.1.4 - 2026-06-03

### Added

- Added the experimental app-server stdio proof harness:
  `cx app-server experiment --stdio-proof --record --json` starts only a
  fake/Codexus-owned stdio process, records a schema-validatable
  `app-server-stdio-proof` artifact, proves transcript exclusion and bounded
  method-shape observation, and keeps existing Desktop stdio pipes as
  non-targets. Live Desktop attachment remains unavailable until a
  non-disruptive observer bridge or explicit user-provided socket is proven.

## 0.1.3 - 2026-06-02

This release adds experimental action surfaces. They remain gated and are not
part of the frozen stable 0.1.x JSON contract. These action surfaces take effect
only behind owner-identity verification or explicit approval, and Codexus never
auto-cleans or claims completion/health authority over them.

### Added

- Added the worktree app instance launcher design note. The proposed surface is
  descriptor-backed, observe-before-act, and requires owned-process lifecycle
  evidence before Codexus can claim per-worktree app control.
- Added the experimental live ownership launcher slice: `cx app instance
  profile list/status/logs/start/stop`, descriptor and instance artifact schema
  validation, owned-process heartbeat artifacts, active HTTP health checks, and
  bounded log capture. Stop remains unavailable for non-owned or invalid
  artifacts.
- Added experimental instance-linked observation evidence:
  `cx app instance evidence record/list` and the `app-instance-observation`
  schema artifact let browser/dev-server/log/screenshot/metric observations cite
  one `instanceId` without becoming control, health, or completion authority.
- Added explicit stale/orphan lifecycle policy projection for experimental app
  instances. Status output now reports heartbeat age, stale thresholds, cleanup
  policy, stop policy, and non-authority guarantees so long-dead artifacts do not
  silently look healthy or controllable.
- Added the experimental autopilot contract foundation slice:
  `cx autopilot plan --from ...`, `cx autopilot contract validate`,
  `cx autopilot contract approve`, `cx autopilot contract scope-check`, and the
  `autopilot-contract` schema artifact. Live `cx autopilot run` remains
  intentionally deferred.
- Added the experimental compiled wiki first slice:
  `cx wiki map`, deterministic `cx wiki build`, `cx wiki check --gate`, and
  `cx wiki context --topic ...`, plus `wiki-manifest` / `wiki-page` schema
  artifacts. Automatic context injection, checked-in export, and advisory
  synthesis remain deferred.
- Added the experimental operational control first slice:
  `cx autopilot presets list --json`, autopilot contract `autonomyPreset`
  metadata, `cx policy catalog check --json`, and richer change-evidence
  `riskFacts` for blast radius, dependency, schema, migration, and scope
  findings. These remain advisory/control metadata and do not add a new
  completion authority.
- Added the experimental explicit-approval automation live-dispatch slice:
  `cx cron run-now` / `cx gateway check` can now acquire automation locks,
  record policy and approval artifacts, dispatch a normal supervised run
  through the existing run ledger, and return the linked run outcome. Richer
  unattended scheduler/retry ownership remains deferred.

### Fixed

- Relay stage-gate evidence now imports acceptance criteria and verification
  matrix rows, and implementation-stage convergence fails when the matrix is
  missing, unmapped, lacks passing local evidence, or cites a missing evidence
  artifact. The previous `verification_matrix_enforcement_deferred` self-report
  has been removed because the first structural gate now exists.

## 0.1.2 - 2026-06-02

### Added

- Added design notes for operational control invariants and a compiled
  repository wiki. Both are proposed 0.2/0.3 tracks and preserve the existing
  rule that evidence gates completion while control and projections stay
  non-authoritative.
- Added experimental `cx app-server discover --json/--record`, a read-only
  Desktop app-server discovery report that records default control-socket
  availability, running app-server transport modes, and Stage B readiness
  without connecting to a live socket or enabling remote control.
- Added experimental `cx release check --json/--gate` and wired it into
  `npm run release:check`, so stable release candidates locally prove installer
  defaults, trusted-publishing wiring, GitHub Release `install.sh` attachment
  wiring, and release-evidence docs before tag publish. Live npm/GitHub
  reconciliation remains explicit via `--live`.
- Extended experimental `cx repo check --gate --json` with a docs-code invariant
  that validates declared `schemas/*.schema.json` documentation references
  against local schema artifacts.
- Extended experimental `cx repo check --gate --json` with a deferred
  self-report invariant: source `*_deferred` claims must be mirrored in both
  implementation-status documents, and the JSON output aggregates those claims.
- Added experimental session control-plane evidence: `cx session decision
  record/list/status` writes schema-valid advisory `codexus.decision`
  artifacts, and `cx session loop --json` plus HUD/status projections summarize
  repeated verification failures without gaining completion authority.
- Documented the autopilot/relay branch-protection boundary: protected-branch,
  required-review, or required-check rejection must stop for human decision
  rather than bypass repository rules.

### Fixed

- Stage-gate relay artifacts now self-report deferred acceptance-criteria matrix
  enforcement instead of leaving an empty `verificationMatrix` ambiguous.
- Release integrity checks now detect mutable third-party GitHub Action refs,
  not only `actions/*` refs.
- Architecture and repo-graph checks now share one static import scanner to
  reduce regex drift between evidence surfaces.
- Clarified that Codexus should be installed globally with
  `npm install -g codexus`; npmjs may still show its generated local
  `npm i codexus` snippet, which is not the recommended CLI install path.
- Stable tag publishes now create or refresh the matching GitHub Release and
  attach `install.sh`, keeping GitHub's latest release route aligned with npm
  `latest`.
- GitHub Pages deployment now has a repository-owned workflow with pinned
  Node 24-compatible actions and an explicit Node 24 JavaScript action opt-in,
  replacing the legacy GitHub-managed Pages deploy path that emitted Node.js 20
  action deprecation warnings.

## 0.1.1 - 2026-06-01

### Added

- Added the harness-engineering alignment design note, synthesizing OpenAI's
  harness-engineering guidance with Karpathy-style behavior contracts for future
  architecture, repository-knowledge, slop, subagent, and observability gates.
- Added top-level JSON `stability` markers across the remaining supported stable
  command outputs, with package smoke coverage for installed CLI surfaces.
- Added experimental `cx architecture check --json/--gate` with a
  schema-validated `codexus.architecture.policy`, best-effort static import
  evidence, and a dogfood rule that keeps Codexus source free of runtime package
  imports.
- Added experimental `cx repo map/check --json` and `cx repo check --gate` for
  mechanical repository-knowledge evidence: required docs indexes, index link
  resolution, and English/Korean counterpart checks, with semantic freshness kept
  advisory.
- Expanded `cx slop check` behavior evidence with non-gating surgicality,
  verification-artifact, test-diff, and diff-surface facts plus advisory
  simplicity and unresolved-assumption heuristics that never affect `--gate`.
- Added optional subagent behavior checklist fields to `session subagent
  record/attach/complete` artifacts. The checklist supports `pass|fail|unknown`
  review assertions without refreshing verification evidence or claiming
  Codexus launched the subagent.

### Fixed

- `install.sh` now reports the actual `CODEXUS_BIN_DIR` when users install into
  a custom bin directory.

## 0.1.0 - 2026-06-01

### Added

- First stable 0.1.x release line. The supported JSON surfaces are frozen for
  0.1.x, while experimental/deferred surfaces continue to self-report their
  stability.

### Changed

- The public install path now targets the stable npm channel (`codexus`) instead
  of the prerelease `codexus@next` channel.
- Stable publishes use GitHub Actions trusted publishing with npm provenance.

## 0.1.0-alpha.7 - 2026-06-01

### Fixed

- Trusted-publishing workflow publishes no longer require post-publish
  `npm dist-tag add` permission. GitHub Actions verifies the tag created by
  `npm publish` itself, keeping the npm trusted-publisher permission surface to
  publish-only.

## 0.1.0-alpha.6 - 2026-06-01

### Removed

- Removed the legacy external-harness adapter surface, its config block, the
  related planning flag, and the non-Codex skill export target. Codexus has no
  dependency on another harness runtime. Stale legacy config keys are treated as
  removed/deprecated (ignored with a notice), never as unknown-key errors.

### Added

- `cx session subagent launch --role <role> --task <task> --json` now records a
  deferred native-subagent launcher contract with `launcher.supported: false`,
  a verification-only completion policy, and a handoff command for later claim
  recording.
- `cx session subagent complete --task-id <id> --claim <text> --json` records
  the final claims from a native subagent used in the current Codex session
  without claiming Codexus spawned it or refreshing verification evidence.

### Changed

- Session state moved to schema v5 so subagent state can link launcher-contract
  artifacts without treating them as verification evidence.

## 0.1.0-alpha.5 - 2026-05-31

### Added

- 0.1.0 readiness docs now include a README support matrix that separates
  stable, experimental, and deferred surfaces.
- Autopilot contract design docs were added as a deferred 0.2/0.3 track with
  worktree isolation, human-approved scope, and detect-then-stop boundaries.

### Changed

- Implementation status and remaining-work docs now reflect the current
  installed-package release smoke, `0.1.0-alpha.4` npm baseline, and stable
  release gates instead of the original alpha.0 packaging plan.
- Korean README copy now describes Codexus as checking Codex CLI work with tests
  and recording the result, avoiding the stiff direct translation of "with
  evidence."

## 0.1.0-alpha.4 - 2026-05-31

### Added

- CLI version reporting via `cx --version` and `cx version --json`, covered by
  source CLI tests and installed package smoke tests.
- Supply-chain evidence policy and `cx supply-chain check`, including
  report-only JSON output, `--gate` exit codes, lifecycle-safe static package
  projection, policy validation, package-smoke single-source file assertions,
  and a schema artifact for `codexus.supplyChain`.

### Fixed

- Supply-chain secret leak gates now use only high-confidence token/key patterns;
  broad redaction heuristics such as ordinary `token = value` assignments remain
  non-gating to avoid false-positive publish blockers.

## 0.1.0-alpha.3 - 2026-05-31

### Added

- Always-on Codex session evidence now reports workspace-fingerprint-derived
  dirty/stale state without running verification.
- `cx session status` and `cx session hud` expose ambient evidence freshness
  and compact change-evidence summaries.
- `cx session verify --auto` can recommend likely verification commands without
  executing them, while `--execute` keeps execution explicit and policy-gated.
- Notify-hook heartbeats can record derived `heartbeatEvidence` and compact
  `heartbeatChangeEvidence` snapshots without marking stale verification fresh.
- Quality evidence guard commands now include `cx slop check` and
  `cx session slop`, including `--gate` exit codes driven only by derivable
  evidence.
- Session subagent support is recorder-only: `record`, `attach`, and `status`
  store unverified claims without launching workers or changing evidence
  freshness.
- Additional honest-gated surfaces report current limits for schema-engine
  status, replay parity, worker launch, cron/gateway live dispatch, and external
  context injection approval.

### Known Gaps

- Desktop app-server attachment remains gated after Stage B produced negative
  live-dispatch evidence in the tested environment.
- Slop heuristics are advisory and partial; gate status is still derived only
  from explicit evidence gaps.
- Live app-server dispatch, cron/gateway live dispatch, full JSON Schema engine
  enforcement, tmux worker launch, and automatic context injection remain
  deferred.

## 0.1.0-alpha.2 - 2026-05-30

### Added

- Memory curation now reports advisory conflict candidates and
  curator-derived tri-state quality findings without changing memory entries.
- Session notify dispatch now distinguishes configured hooks from observed
  `turn-ended` dispatch and records CLI/TUI runtime surface evidence.
- Desktop app-server attachment is documented as an evidence-first A/B slice
  with isolated probing, consent, read-only, and non-disruptive socket gates.

### Changed

- Codexus session state now uses an explicit migration boundary for future
  schema changes.
- Memory quality is framed as 29148-inspired curation characteristics, not
  standards compliance.

## 0.1.0-alpha.1 - 2026-05-30

### Changed

- Global npm installs now install the Codex-native skill adapter by default.
- Set `CODEXUS_INSTALL_CODEX_SKILL=0` to keep npm installs CLI-only.
- The package smoke test now verifies the postinstall adapter path.

## 0.1.0-alpha.0 - 2026-05-30

First npm-ready alpha packaging slice.

### Changed

- Public npm bins now point to bundled `dist/cli/main.js` instead of source
  `.ts` files.
- Node engine floor is now `>=22` for the npm-installed CLI.
- The package tarball now ships only runtime assets: `dist`, schemas, the Codex
  skill adapter, the app-server runtime fixture, installer, and top-level
  release metadata.
- `install.sh` delegates to the npm package channel (`codexus@next` by default).

### Added

- `npm run build` with esbuild bundling.
- `npm run package:smoke` release gate for `npm pack`, temporary global install,
  public bin checks, runtime schema asset checks, and mock-run execution.

## 0.1.0 - 2026-05-29

Initial public-preparation release.

### Added

- Local `cx`/`codexus` CLI harness around `codex exec --json`.
- Durable run ledger, state, event JSONL, verification artifacts, and reports.
- Mock and Codex exec drivers.
- Verification gates and bounded repair loops.
- Memory lifecycle and replay-gated skill lifecycle.
- Codex-native `$codexus` skill adapter.
- Optional advanced interop commands kept outside the core runtime path.
- Schema artifacts and local schema subset enforcement.
- App-server dry-run/experiment surfaces behind live gates.
- Cron/gateway dry-run audit records behind feature gates.
- GitHub CI workflow and local `npm run ci` parity.

### Known Gaps

- Live app-server driver remains disabled.
- Routine live model-in-the-loop replay remains opt-in and gated.
- Cron/gateway live dispatch remains disabled.
- Automatic prompt injection of retrieved Codexus context is not implemented.
