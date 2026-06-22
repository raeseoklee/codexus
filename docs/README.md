# Codexus Documentation

[Korean](ko/README.md)

Codexus is a harness engineering layer for OpenAI Codex CLI. It keeps the local Codex engine and authentication boundary, then adds durable run ledgers, verification gates, bounded repair loops, session evidence, memory, and truthful status reporting.

Category:

```text
Codex harness engineering layer
```

Target CLI:

```bash
codexus
```

The package exposes `codexus` as the canonical public bin and `cx` as a
supported short alias.

## Document Map

- [Quick start](quickstart.md): local setup, deterministic test run, real Codex run, and Codex-native adapter installation.
- [Feature reference](features.md): shipped stable, experimental, and deferred surfaces by command.
- [Using Codexus inside Codex](codex-session-usage.md): how to invoke the `$codexus` skill from an interactive Codex session, what to ask it to do, and when not to use it.
- [Demo tape](demo/README.md): reproducible VHS source for the redacted README demo.
- [Project LLM Wiki](project-wiki/README.md): checked-in project-management context for maintainers and LLM agents, separate from the generated experimental repository wiki.
- [Engineering plan](plans/2026-05-29-codex-harness-engineering-plan.md): migrated planning baseline, research findings, constraints, MVP scope, and risks.
- [Harness remediation plan](plans/2026-05-29-harness-remediation-plan.md): accepted review findings and implemented remediation slices for repair, supervision, and evolution depth.
- [npm packaging plan](plans/2026-05-30-npm-packaging-plan.md): bundled npm CLI entrypoint, package contents, installer strategy, and release gate.
- [Desktop app-server attachment evidence plan](plans/2026-05-30-desktop-app-server-attachment-evidence-plan.md): A/B evidence slice for Desktop attachment through Codex app-server with consent and read-only gates.
- [Memory quality curation plan](plans/2026-05-30-memory-quality-curation-plan.md): 29148-inspired memory quality characteristics, tri-state curator findings, conflict detection, and supersession review boundaries.
- [0.1.0 stable readiness plan](plans/2026-05-31-0.1.0-stable-readiness-plan.md): the 0.1.0 cut — supported vs deferred surface, contract-frozen 0.1.x JSON, trusted publishing, E2E smoke matrix, and the release procedure.
- [0.2.0 promotion readiness plan](plans/2026-06-04-0.2.0-promotion-readiness-plan.md): contract-promotion audit for deciding when experimental evidence surfaces are ready to become stable instead of treating 0.2.0 as a countdown.
- [JSON contract](json-contract.md): frozen stable JSON fields, stability markers, and breaking-change rules for automation consumers.
- [Release policy](release-policy.md): small commits, larger thematic releases, hotfix exceptions, version-boundary rules, and the executable `codexus release policy` gate.
- [0.1.0 release evidence](release-evidence/0.1.0.md): redacted manual sign-off template for the stable cut.
- [0.1.1 release evidence](release-evidence/0.1.1.md): trusted-publishing evidence and installed-package smoke for the harness-engineering first pass.
- [0.1.2 release evidence](release-evidence/0.1.2.md): trusted-publishing and post-publish evidence for additive experimental evidence surfaces and release-integrity hardening.
- [0.1.3 release evidence](release-evidence/0.1.3.md): trusted-publishing evidence for experimental action surfaces that remain gated and outside the frozen stable 0.1.x JSON contract.
- [0.1.4 release evidence](release-evidence/0.1.4.md): trusted-publishing evidence for the experimental app-server stdio proof harness.
- [0.1.5 release evidence](release-evidence/0.1.5.md): trusted-publishing evidence for the experimental app-instance HTTP evidence probe.
- [0.1.6 release evidence](release-evidence/0.1.6.md): trusted-publishing evidence for the experimental app-instance log snapshot evidence adapter.
- [0.1.7 release evidence](release-evidence/0.1.7.md): trusted-publishing evidence for experimental project LSP diagnostics and update/plugin planning boundaries.
- [0.1.8 release evidence](release-evidence/0.1.8.md): trusted-publishing evidence for the experimental 0.2.0 contract-readiness audit.
- [0.1.9 release evidence](release-evidence/0.1.9.md): trusted-publishing evidence for experimental update availability checks and cache-only advisory summaries.
- [0.1.10 release evidence](release-evidence/0.1.10.md): trusted-publishing evidence for experimental Codex plugin packaging diagnostics.
- [0.1.11 release evidence](release-evidence/0.1.11.md): trusted-publishing evidence for explicit npm `next` update-check opt-in.
- [0.1.12 release evidence](release-evidence/0.1.12.md): trusted-publishing evidence for the executable release cadence policy.
- [0.1.13 release evidence](release-evidence/0.1.13.md): trusted-publishing evidence for the five-surface evidence projection patch.
- [0.1.14 release evidence](release-evidence/0.1.14.md): trusted-publishing evidence for the evidence operating loop patch.
- [0.1.15 release evidence](release-evidence/0.1.15.md): trusted-publishing evidence for roadmap-sequence hardening before the 0.2 promotion.
- [0.2.0 release evidence](release-evidence/0.2.0.md): trusted-publishing evidence for the first stable-contract promotion milestone.
- [0.2.1 release evidence](release-evidence/0.2.1.md): pre-tag release-prep evidence for the action-readiness evidence bundle.
- [0.2.2 release evidence](release-evidence/0.2.2.md): release/update-channel hardening evidence for trusted-publishing dist-tag boundaries.
- [0.2.3 release evidence](release-evidence/0.2.3.md): trusted-publishing evidence for update notices, app evidence summaries, wiki approval listings, and the redacted README demo.
- [0.2.4 release evidence](release-evidence/0.2.4.md): trusted-publishing evidence for structured npm `next` dist-tag action reporting and documentation baseline cleanup.
- [0.2.5 release evidence](release-evidence/0.2.5.md): trusted-publishing evidence for the evidence operations pack, aggregate evidence gate, explicit export bundle, and app-instance observation helpers.
- [0.2.6 release evidence](release-evidence/0.2.6.md): trusted-publishing evidence for the non-destructive installer help hotfix.
- [Reference governance](references/README.md): mandatory reference-first policy and current upstream harness audit.
- [Architecture](design/01-architecture.md): system boundaries, runtime layers, driver strategy, and major components.
- [Detailed design](design/02-detailed-design.md): CLI commands, state machine, storage layout, event schema, verification, and adapter contracts.
- [Evolution engine](design/03-evolution-engine.md): Hermes-inspired memory, skill proposal, replay validation, promotion, and rollback design.
- [Implementation feedback](design/04-implementation-feedback.md): decisions made after MVP implementation blockers and whether the architecture direction changes.
- [Naming and runtime positioning](design/05-naming-and-runtime-positioning.md): Codexus name, `cx` CLI target, external CLI runtime, and Codex-native session direction.
- [Codex-native adapter](design/06-codex-native-adapter.md): `$codexus` skill adapter, installation, supported first commands, and design rules.
- [Session-native supervision](design/07-supervised-sessions.md): Codex-native session integration using skills, AGENTS overlays, hooks/status state, and optional tmux workers inside the current Codex session.
- [Standalone identity and always-on evidence](design/08-standalone-identity-and-always-on-evidence.md): evidence-first identity, standalone identity, the always-on evidence model (derived dirty/stale, verify auto-detection, evidence-bearing-only gate), and engine-agnostic invariants.
- [Subagent evidence supervision](design/09-subagent-evidence-supervision.md): Codex-native subagents as bounded evidence-producing adapters, not completion authorities.
- [Quality evidence guard (slop guard)](design/10-quality-evidence-guard.md): evidence-first change-quality gate that splits derivable evidence gaps from advisory heuristic claims, built on the session evidence model.
- [Supply-chain evidence](design/11-supply-chain-evidence.md): local, derivable supply-chain facts and an optional pre-publish gate, reusing the change-evidence model — not a CVE/network scanner.
- [Autopilot contract](design/12-autopilot-contract.md): experimental foundation slice for long supervised runs — `cx autopilot plan`, contract validate/approve/scope-check, run-gate readiness, human-approved scope, worktree isolation, detect-then-stop enforcement, and evidence-gated acceptance; live `autopilot run` remains deferred.
- [Harness engineering alignment](design/13-harness-engineering-alignment.md): synthesis of OpenAI harness engineering and Karpathy-style behavior contracts for repository maps, architecture gates, behavior evidence, and non-goals.
- [Repository knowledge graph](design/14-repository-knowledge-graph.md): experimental codexus-lite graph build/check first slice, plus the deferred graph-provider boundary for Understand-Anything JSON import, scoped freshness, and structural graph gates.
- [Multi-engine relay autopilot](design/15-multi-engine-relay-autopilot.md): experimental recorder/checker first slice for author/reviewer artifacts, stage-gate evidence, relay adapter status, and convergence validation without making convergence completion authority.
- [Codex task panel projection](design/16-codex-task-panel-projection.md): proposed durable Codexus task state that can be projected into the native Codex task panel without making host UI the source of truth.
- [Operational control invariants](design/17-operational-control-invariants.md): experimental first slice for autonomy presets, policy-catalog reporting, docs-code invariants, decision records, loop breakers, and HUD projection without adding a new completion authority.
- [Compiled repository wiki](design/18-compiled-repository-wiki.md): experimental deterministic first slice for regenerable markdown pages over repository facts, ledgers, graph artifacts, decisions, and verification evidence. `cx wiki map/build/check/context/export` exist locally; advisory synthesis remains deferred, and export is explicit rather than automatic.
- [Worktree app instance launcher](design/19-worktree-app-instance-launcher.md): experimental live ownership and observation-evidence app instance surface for per-worktree app evidence; live start/stop works for Codexus-owned instances and observations cite `instanceId` without becoming authority.
- [Observability adapter boundary](design/20-observability-adapter-boundary.md): boundary design for optional live Browser/DevTools capture drivers; adapters may produce bounded capture artifacts but must not become health, control, prompt-injection, or completion authority.
- [Implementation status](implementation-status.md): current MVP spine, verification evidence, and known gaps.
- [Remaining work](remaining-work.md): prioritized backlog, additional design considerations, and suggested next slice.
- [Roadmap Kanban](roadmap-kanban.html): four-column HTML board of the remaining ready, evidence, gated, and later work.
- [Public release checklist](public-release.md): metadata, safety, verification, and visibility checklist for open-source publication.
- [Roadmap](../ROADMAP.md): public-facing project direction.
- [Changelog](../CHANGELOG.md): release notes.

## Positioning

Codexus is a standalone harness engineering layer for Codex. It should be used
alongside Codex, not instead of Codex. The first stable model access boundary is
the local authenticated `codex` CLI, especially `codex exec --json`.

Some design notes compare Codexus with sibling harness projects, and the CLI has
optional advanced interop surfaces. Those are compatibility paths, not product
requirements for normal Codexus use.

Runtime positioning:

- primary direction: Codex-native session runtime invoked from inside a Codex
  TUI session,
- stable engine: external supervisor CLI that drives `codex exec --json`,
- shared core: both surfaces use the same ledger, verification, memory, and
  replay-gated skill system.

## Design Principles

- Keep Codex as the execution engine.
- Treat harness work as reference-first: consult `ultraworkers/claw-code`, `NousResearch/hermes-agent`, and `Gitlawb/openclaude` before changing core harness behavior.
- Avoid undocumented ChatGPT/Codex backend APIs.
- Prefer local, auditable files over hidden service state.
- Treat every run as resumable until it reaches an explicit terminal outcome.
- Require verification evidence before claiming completion.
- Make self-improvement explicit, reviewable, versioned, and reversible.
- Keep third-party harness interop optional and visibly outside the core path.

## Current Status

The repository now has a working MVP harness spine:

- durable run ledger and workflow kernel,
- `codex exec --json` and mock drivers,
- verification gate and bounded repair loop,
- `init`, `run`, `cancel`, `status`, `runs`, `events`, `report`, `verify`, `resume`, `plan`, and `replay` CLI surfaces,
- policy preflight for high-risk verification commands,
- automatic experience and memory records with memory lifecycle and curation commands,
- replay-gated skill proposal, review, improvement, promotion, active index, explicit export, listing, and deprecation,
- optional advanced interop commands that do not affect the normal Codexus runtime,
- lock inspection/stale recovery, versioned schema artifacts, schema artifact subset enforcement, focused read-path enforcement, and run-ledger validation,
- owner/liveness-based external run cancellation, approved adapter context artifacts, full replay parity fixture-matrix coverage, gated model replay, app-server dry-run roundtrip/recorded experiment manifests/process-probe/fake-supervision evidence, explicit-budget driver-failure repair, experimental cron/gateway live dispatch with explicit approval plus audit records, installed skill tree diagnosis, and local syntax/static validation.
- experimental project LSP diagnostics evidence: `cx lsp status` detects
  candidate language-server diagnostics without starting a server,
  `cx lsp adapters` reports explicit diagnostics-command support while keeping
  protocol-server lifecycle unavailable, and `cx lsp check` runs explicit
  project diagnostics such as `npm run typecheck` without gaining completion
  authority.

The remaining work is no longer P0-P2 surface construction; it is deeper hardening: full external schema-engine enforcement if dependency policy allows it, preserving replay parity coverage, isolated real app-server process experiments, and maturing the experimental cron/gateway dispatcher into richer scheduler/recovery semantics. See [Remaining work](remaining-work.md).
