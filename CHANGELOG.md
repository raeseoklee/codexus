# Changelog

[한국어](docs/ko/CHANGELOG.md)

All notable changes to Codexus will be documented in this file.

This project follows a practical pre-1.0 changelog format. Breaking changes can
occur before 1.0, but they should be called out clearly.

## Unreleased

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
