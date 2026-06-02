# Remaining Work

[Korean](ko/remaining-work.md)

Date: 2026-05-31

This document is the current backlog after the MVP spine and the high-risk
promotion slice. It lists what remains, why it matters, and what design
constraints should guide the next implementation passes.

## Reference Recheck

The remaining work was reviewed against the required harness references:

- [UltraWorkers Claw Code](https://github.com/ultraworkers/claw-code): public
  Rust CLI harness with `rust/` as the canonical implementation, doctor/status
  workflows, parity references, and explicit unsupported-protocol status.
- [NousResearch Hermes Agent](https://github.com/nousresearch/hermes-agent):
  learning-loop reference with memory, skill creation/improvement, past-session
  search, cron, gateway, toolset, and skill directories.
- [Gitlawb OpenClaude](https://github.com/Gitlawb/openclaude): provider/session
  reference for one terminal workflow across model providers, Codex OAuth,
  existing Codex CLI auth, tools, agents, tasks, MCP, slash commands, streaming,
  and tool calling.

Codexus should continue to diverge intentionally on the auth/runtime boundary:
it wraps the authenticated local Codex CLI and should not depend on private
ChatGPT/Codex backend APIs.

## Priority Backlog

Status after the P0-P2 implementation pass and high-risk promotion slice:

- Implemented safe MVP surfaces: expanded JSON error contract tests, state
  corruption errors, permission/policy/driver-classification ledger events,
  minimal locks, state migration reader, active skill index, explicit Codex
  export plus optional third-party bundle export, bounded adapter retrieval,
  deterministic replay and model replay gate, memory lifecycle
  commands, app-server fixture/status gate, `cx init`, packaging/typecheck
  smoke, run observability commands, and cron/gateway disabled gates.
- Promoted hardening surfaces: stale-lock metadata inspection/recovery,
  versioned schema artifacts, budget/policy-gated model replay runner,
  Codex-native bounded context formatter plus non-injected approved context
  artifacts, app-server dry-run roundtrip contract and recorded sandbox
  experiment manifests with a live gate, explicit-budget repairable
  driver-failure retry, cron/gateway dry-run automation plans and audit
  records with policy/approval contract fields, run-ledger validation, installed
  Codexus skill diagnostics, app-server process-probe evidence, and replay
  pass/failure/extended fixtures.
- Remediation hardening implemented from the accepted harness review:
  bounded repair context artifacts, terminal verification not-reached reasons,
  expanded repair-context redaction, in-process timeout/SIGINT cancellation,
  external owner/liveness-based `cx cancel <run-id>`, source-specific evolution
  lessons and replay gates, usage accounting, config option ignored events, and
  docs alignment for reserved phases/gated tool expansion.
- Session-native follow-up implemented after this review: thin Codex-session
  walkthrough, first-class `session-state` schema artifact validation, and
  explicit notify-hook attachment that preserves existing notify chains and
  refuses install without Codex project trust. The follow-up hardening pass also
  added atomic config writes, one-time config backup, notify-hook detach, and
  validator/schema drift tests. A later session-native hardening pass added an
  explicit `cx session migrate` boundary for `.codexus/session/state.json` and
  v2 notify dispatch semantics that distinguish configured hooks from observed
  `turn-ended` dispatch.
- Desktop app-server attachment evidence advanced through Stage A isolated
  real evidence and a Stage B read-only command surface that requires explicit
  opt-in and a user-provided socket. It records method shapes, not transcript
  values, and still does not enable product behavior.
- Session-native evidence surfaces advanced further: `cx session verify --auto`
  now detects verification candidates without execution, the quality evidence
  guard is available as `cx slop check` / `cx session slop`, and subagent claim
  bundles can be recorded under `.codexus/session/subagents/` without promoting
  them to completion evidence.
- The ten-item evidence-contract pass is implemented without removing gates:
  schema engine status reports the local subset engine and unavailable full
  engine, replay parity can be audited, adapter injection writes visible
  approval artifacts without auto-injection, HUD is available as a read-only
  JSON summary, tmux/native-subagent launch surfaces are truthful gates, and
  automation live contracts remain blocked until a dispatcher exists.
- Still intentionally deferred: routine live model-in-the-loop replay, live
  app-server turn execution, automatic prompt injection of retrieved skills,
  full external JSON Schema engine enforcement/migrations, real cron/gateway
  automation dispatch, statusline/HUD integration, tmux-backed workers, and
  richer wait/remote-host UX around cancellation. The repository knowledge graph
  now has an experimental first slice (`cx repo graph build/check`) for
  codexus-lite graph artifacts, scoped freshness, and structural gates. Autopilot,
  graph import/search/explain/context injection, and multi-engine relay autopilot
  remain deferred to the 0.2/0.3 track.

### P0: Contract and Safety Hardening

1. Complete CLI JSON output contract coverage. Status: safe MVP implemented.
   - Already covered: unknown command and argument validation failure.
   - Remaining: unexpected arguments, unsupported capabilities, missing/corrupt
     state, disabled drivers, and command-specific failure envelopes.
   - Design rule: automation callers must never parse stderr or prose.

2. Make permission, approval, and policy decisions first-class ledger events. Status: initial ledger events implemented.
   - Add typed events such as `permission.checked`, `permission.denied`,
     `approval.requested`, `approval.resolved`, and `policy.blocked`.
   - Gate unattended, app-server, cron, or external export behavior behind this
     event model.

3. Add driver-failure classification before driver-failure repair. Status: classification and explicit-budget task-failure repair implemented.
   - Distinguish auth/config/unsupported-flag/sandbox/policy/model/network
     failures from task failures.
   - Retry only task-repairable failures; surface capability and auth failures
     as terminal typed errors.

4. Add state schema migrations and lock/lease protection. Status: migration reader, minimal lock, stale-lock recovery, schema artifacts, focused record validation, and run-ledger validation implemented.
   - Active skill index, export, cron, and future app-server runs introduce
     concurrent writes.
   - Before those features, add a minimal lock/lease around mutable stores and a
     migration reader for versioned state records.

### P1: Evolution and Codex-Native Skill Surface

5. Add active skill index files. Status: implemented.
   - Keep scan-based listing as fallback.
   - Write an index entry on promotion/deprecation with skill id, display name,
     version, source runs, replay status, and export state.

6. Add explicit skill export commands. Status: implemented for explicit Codex export plus optional external harness bundle export.
   - Proposed command shape: `cx skill export <skill-id> --target <target>`.
   - Keep storage ids filesystem-safe.
   - Use `displayName` for the Codex-facing `codexus:<skill-name>` identity.
   - Run Codex skill validation before writing to external skill stores because
     external skill-name constraints may differ from Codexus storage rules.

7. Add active skill retrieval to the Codex-native adapter. Status: bounded retrieval and approved context artifact writing implemented through the shared core.
   - The adapter should retrieve a bounded set of relevant active skills and
     memory entries for the current task.
   - It should still avoid building a separate chat loop; the current Codex
     conversation remains the primary interaction surface.

8. Add model-in-the-loop replay behind deterministic replay. Status: structural pass/failure/extended fixtures and budget/policy-gated runner implemented; routine live replay remains opt-in and env-gated.
   - The current structural replay gate remains first.
   - Model replay should be opt-in or budget-gated because it consumes Codex
     usage.
   - Add Claw-style parity scenarios: tool success, denial, permission prompt,
     multi-tool turns, plugin/skill paths, large output, interruption, and usage
     accounting.

9. Expand memory lifecycle commands. Status: implemented.
   - Add explicit `cx memory add/list/prune/review` surfaces.
   - Add summaries and indexes while preserving source links, redaction, and
     bounded retrieval.
   - Memory quality slice implemented: advisory conflict/contradiction
     detection and curator-derived tri-state quality findings without claiming
     standards compliance.

### P2: Runtime Expansion

10. Add app-server schema fixtures and gated roundtrip. Status: fixture/status gate, dry-run roundtrip contract, recorded sandbox experiment manifests, and optional supervised help-process probe evidence implemented; live roundtrip deferred.
    - Keep the driver disabled by default.
    - Add truthful status/capability output before any live turn execution.
    - Do not let app-server failure affect the stable `codex exec --json` path.

11. Add git-aware project initialization. Status: `cx init` implemented.
    - Proposed command shape: `cx init`.
    - Create config, ignored state directories, and optional project docs
      snippets without mutating unrelated tool state.

12. Finish packaging and alias migration. Status: npm-installed CLI packaging,
    guarded alpha publish, trusted-publishing release workflow, Node 22 package
    smoke compatibility, stable-readiness smoke coverage, and local release
    integrity gating implemented.
    - Keep `cx` and `codexus` as canonical public bins.
    - Current npm baseline is `0.1.1`; prereleases publish through
      `publish:next` as a fallback/dev path, while stable releases publish from
      trusted GitHub Actions tag runs.
    - Keep `npm run package:smoke` as the installed-tarball release gate for bin
      paths, runtime assets, strict doctor, supply-chain gate, mock
      pass/fail/repair/resume/cancel/events, and postinstall skill adapter
      behavior.
    - Keep `cx release check --gate --json` in `npm run release:check` so stable
      release candidates prove the installer default, expected-version guard,
      trusted-publishing workflow, GitHub Release asset wiring, and release
      evidence docs before tag publish. Use `--live` only for explicit
      post-publish sign-off against npm and GitHub.

13. Add TypeScript/static verification. Status: local syntax/static check,
    esbuild release bundle, versioned schema artifacts, and zero-dependency
    schema artifact subset validation implemented.
    - Keep source checks and package smoke separate: source tests use the local
      development runtime, while npm users execute bundled JavaScript.
    - Keep config and durable state validation covered by the focused validator plus schema artifact subset engine; replace with a full external engine only if dependency policy allows it.

14. Add run observability commands. Status: implemented.
    - Proposed command shapes: `cx runs list`, `cx events tail <run-id>`,
      `cx report <run-id>`.
    - Keep outputs bounded and JSON-first.

15. Add cron/gateway automation only after P0 safety work. Status: disabled feature gates plus dry-run automation plans, audit records, and policy/approval contract fields implemented; real automation deferred.
    - Hermes-style cron and gateway behavior should depend on locks, schema
      migration, permission events, and explicit user policy.

## Direction Changes From This Review

- Do not build a custom chat surface first. The next product direction is an
  Codex-native session runtime: skill adapter, marker-bounded AGENTS
  overlay, local session state, explicit checkpoints/verification, optional
  hooks/status, and optional tmux workers over the same core runtime.
- Treat `codex exec resume` sessions as a deferred external multi-turn feature,
  not as the primary session-native story.
- Reserve `cx session` for the Codex-native state/checkpoint/verification
  surface. If external exec-resume returns, prefer a separate namespace such as
  `cx thread start/continue`.
- Treat `codexus:<skill-name>` as display identity, not storage identity. This
  avoids filesystem churn and keeps generated skills visually distinct.
- Add lock/lease and schema migration earlier than originally implied. They are
  prerequisites for active indexes, export, cron, and app-server experiments.
- Keep app-server experimental. The stable path remains `codex exec --json`.
- Refresh the upstream reference snapshot whenever a new major runtime surface
  is designed, because the three reference projects are active and their
  contracts may drift.

## Suggested Next Slice

The previous ten-item slice is now covered by code-level gates and evidence
surfaces. The next implementation slice should turn those gates into deeper
evidence only when the supporting runtime exists:

1. Replace the local schema-artifact subset engine with a full JSON Schema
   engine only if dependency policy allows it; `cx schema engine --json` now
   reports the current unavailable full-engine status.
2. Preserve the replay parity matrix as a contract: `cx replay parity --json`
   reports canonical label coverage and must stay green before new labels land.
3. Complete the Desktop app-server attachment evidence loop before enabling any
   app-server product behavior: Stage A isolated temporary-state evidence is
   implemented, Stage B has a gated read-only socket command surface, and
   `cx app-server discover --json/--record` now records real Desktop discovery
   evidence. Current maintainer evidence is `stdio_only` with no managed control
   socket, so the next slice is either an explicit user-provided socket attempt
   or a separate stdio-observer design. Keep app-server driver enablement
   separate and still gated.
4. Cron/gateway dry-run and live paths now share
   `policy-reviewed-live-dispatch-v1`; implement the dispatcher only after
   permission, approval, lock, dispatch, and completion events are live.
5. Retrieved context surfaces only as approved, user-visible artifacts, with no
   auto-injection of prompt context.
6. `cx session hud --json` is the supported fallback; statusline integration
   remains blocked until Codex exposes a stable supported configuration surface.
7. `cx session workers status --json` reports the tmux worker launch gate; do
   not add launch until the session state protocol is stable.
8. Extend the versioned `.codexus/session/state.json` schema only through the
   explicit `cx session migrate` migration boundary.
9. The quality evidence guard now accepts explicit review artifact links and
   `--gate` automation mode. Further expansion must still come only from
   derivable artifacts such as coverage or lint/typecheck outputs; heuristics
   stay advisory.
10. Subagent support remains recorder/handoff/contract-only. Do not expose an
   active native spawn launcher until a supported Codex bridge exists; subagent
   claims must stay separate from verification freshness.
11. Autopilot remains a 0.2/0.3 design track. Start with schema artifacts and a
    report-only scope gate before exposing `cx autopilot run`; it must remain
    human-approved, worktree-isolated, and `stability: experimental`.
12. Repository knowledge graph now has an experimental first slice: canonical
    graph identity hashing, graph schema validation, scoped freshness, and
    structural graph gates. Keep external import, search/explain, and context
    injection deferred until freshness, sanitization, and gate behavior are
    stable.
13. Multi-engine relay autopilot now has an experimental recorder/checker first
    slice: external author/reviewer artifact import, stage-gate evidence,
    same-artifact convergence validation, and the proof that convergence cannot
    complete a run when verification fails. Keep active relay execution and
    external engine adapters deferred until descriptor-backed adapters and
    normal evidence gates are proven.
14. Harness-engineering alignment adds small 0.2 tracks before broader
    autonomy: `cx architecture check` now covers the first derivable import
    invariant, `cx repo map/check` now covers mechanical repository-knowledge
    validation, and `cx slop check` now includes the first behavior evidence
    expansion while keeping heuristic lanes advisory. See
    [doc 13](design/13-harness-engineering-alignment.md).

## Implementation Residue

These are the remaining implementation tracks after the 0.1.1
harness-engineering first pass:

Harness-engineering alignment adds these evidence-first tracks:

- Architecture check follow-up: first-slice `cx architecture check --json` now
  exists with schema-validated `codexus.architecture.policy`, `scanAccuracy:
  "best_effort"`, a dogfood `forbidden-import` rule, and a shared static import
  scanner also used by the repo-graph provider. Future rule kinds such as
  required files or simple layer edges must keep the same derivable-fact gate
  model.
- Repository knowledge follow-up: first-slice `cx repo map/check` now validates
  required indexes, index links, and English/Korean counterparts mechanically.
  Referenced `schemas/*.schema.json` docs links are now checked mechanically;
  future expansion can add other artifact link checks. Keep semantic staleness
  advisory.
- Repository knowledge graph follow-up: [doc 14](design/14-repository-knowledge-graph.md)
  now has an experimental first slice with `cx repo graph build/check`,
  canonical graph identity hashing, graph schema validation, scoped freshness,
  persisted Codexus graph artifacts, and structural graph gates. Next work is
  JSON-only external import, read-only search/explain, and context artifact
  approval. Do not expose graph context injection before freshness, sanitization,
  and gate behavior are stable.
- Behavior evidence follow-up: `cx slop check` now records first-slice
  surgicality, simplicity, assumption, verification-artifact, and diff-surface
  evidence while preserving the facts-vs-heuristics boundary. The subagent
  behavior checklist counterpart is implemented; remaining work is optional
  future artifacts such as lint/typecheck/coverage reports.
- Multi-engine relay follow-up: [doc 15](design/15-multi-engine-relay-autopilot.md)
  now has a recorder/checker first slice with `cx autopilot relay
  record/stage-gate/check-agreement`. Next work is AC-to-verification matrix
  import/enforcement, then adapter evidence: supported external engine
  descriptors, read-only handoff contracts, and eventual active relay execution
  without letting convergence replace verification.
- Observability adapters: add dev-server/browser/log evidence descriptors only
  after the architecture and repo-knowledge gates are stable; keep stack-specific
  behavior outside the workflow kernel.
- Operational control invariants: [doc 17](design/17-operational-control-invariants.md)
  defines autonomy presets, policy catalogs, docs-code invariants, decision
  records, loop breakers, and HUD projection as a control layer over existing
  evidence. The first deterministic docs-code invariant pass is implemented in
  `cx repo check`. The first session control-plane pass is also implemented:
  `cx session decision record/list/status` writes advisory decision artifacts,
  `cx session loop --json` summarizes repeated verification failures, and
  session status/HUD include decision, risk, and loop summaries. Next work is
  autonomy preset metadata, policy catalog reporting, richer risk facts, and
  task artifacts. Do not add active autonomy or a new completion authority.
- Compiled repository wiki: [doc 18](design/18-compiled-repository-wiki.md)
  defines a regenerable markdown projection over repository facts and Codexus
  artifacts. First work should add schemas, `cx wiki map`, deterministic
  build/check, and read-only context packs. Do not auto-inject stale or
  advisory pages into a run.

1. Desktop app-server attachment: current discovery evidence is `stdio_only`.
   Design a non-disruptive stdio observer or obtain an explicit user-provided
   app-server socket before attempting session-event mapping. Do not enable live
   app-server product behavior yet.
2. Cron/gateway dispatcher: implement only after permission, approval, lock,
   dispatch, and completion events are live.
3. Full JSON Schema engine: replace the local subset engine only if dependency
   policy allows it; keep current schema artifacts as regression fixtures.
4. Statusline integration: wait for a stable Codex-supported configuration
   surface; keep `cx session hud --json` as the fallback.
5. tmux-backed worker launch: keep `session workers status` as a gate report
   until the session state protocol and launch contract are stable.
6. Native subagent active launcher: keep record/attach/complete plus
   launcher-contract support until a supported Codex bridge exists and claims
   remain separate from verification freshness.
7. Automatic adapter injection: keep approval artifacts visible and no
   auto-injection until an explicit, reversible injection path is designed.
8. Routine live model replay: keep it opt-in, budget-gated, and outside the
   default stable path.
9. Autopilot contract layer: start as a 0.2/0.3 experimental track with schema
   artifacts and report-only scope gates before any `cx autopilot run`.
10. Multi-engine relay autopilot: the report-only artifact recorder/checker is
    implemented. Add AC-to-verification matrix enforcement before active
    adapters, keep review engines artifact-import-only until a supported adapter
    exists, and do not let convergence replace verification.
11. Operational control invariants: decision artifacts and ledger-derived loop
    summaries are implemented as advisory session evidence. Next implement
    autonomy preset metadata, policy catalog reporting, richer risk facts, and
    task artifacts. Autonomy presets remain contract metadata until enforceable
    policy fields exist.
12. Compiled repository wiki: implement deterministic `cx wiki map/build/check`
    before any advisory synthesis or context injection.
