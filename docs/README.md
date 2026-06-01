# Codexus Documentation

[Korean](ko/README.md)

Codexus is a local runtime harness for Codex orchestration. It keeps OpenAI Codex as the model/runtime engine, then adds the harness engineering layer that makes Codex feel more durable, observable, recoverable, and self-improving.

Category:

```text
Codex execution harness
```

Target CLI:

```bash
cx
```

The package now exposes `cx` and `codexus` as canonical public bins.

## Document Map

- [Quick start](quickstart.md): local setup, deterministic test run, real Codex run, and Codex-native adapter installation.
- [Using Codexus inside Codex](codex-session-usage.md): how to invoke the `$codexus` skill from an interactive Codex session, what to ask it to do, and when not to use it.
- [Engineering plan](plans/2026-05-29-codex-harness-engineering-plan.md): migrated planning baseline, research findings, constraints, MVP scope, and risks.
- [Harness remediation plan](plans/2026-05-29-harness-remediation-plan.md): accepted review findings and implemented remediation slices for repair, supervision, and evolution depth.
- [npm packaging plan](plans/2026-05-30-npm-packaging-plan.md): bundled npm CLI entrypoint, package contents, installer strategy, and release gate.
- [Desktop app-server attachment evidence plan](plans/2026-05-30-desktop-app-server-attachment-evidence-plan.md): A/B evidence slice for Desktop attachment through Codex app-server with consent and read-only gates.
- [Memory quality curation plan](plans/2026-05-30-memory-quality-curation-plan.md): 29148-inspired memory quality characteristics, tri-state curator findings, conflict detection, and supersession review boundaries.
- [0.1.0 stable readiness plan](plans/2026-05-31-0.1.0-stable-readiness-plan.md): the 0.1.0 cut — supported vs deferred surface, contract-frozen 0.1.x JSON, trusted publishing, E2E smoke matrix, and the release procedure.
- [JSON contract](json-contract.md): frozen `0.1.x` JSON fields, stability markers, and breaking-change rules for automation consumers.
- [0.1.0 release evidence](release-evidence/0.1.0.md): redacted manual sign-off template for the stable cut.
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
- [Autopilot contract](design/12-autopilot-contract.md): proposed 0.2/0.3 contract layer for long supervised runs — human-approved scope, worktree isolation, detect-then-stop enforcement, and evidence-gated acceptance.
- [Implementation status](implementation-status.md): current MVP spine, verification evidence, and known gaps.
- [Remaining work](remaining-work.md): prioritized backlog, additional design considerations, and suggested next slice.
- [Public release checklist](public-release.md): metadata, safety, verification, and visibility checklist for open-source publication.
- [Roadmap](../ROADMAP.md): public-facing project direction.
- [Changelog](../CHANGELOG.md): release notes.

## Positioning

Codexus is a standalone Codex execution harness. It should be used alongside
Codex, not instead of Codex. The first stable model access boundary is the
local authenticated `codex` CLI, especially `codex exec --json`.

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
- owner/liveness-based external run cancellation, approved adapter context artifacts, full replay parity fixture-matrix coverage, gated model replay, app-server dry-run roundtrip/recorded experiment manifests/process-probe/fake-supervision evidence, explicit-budget driver-failure repair, cron/gateway dry-run audit records with policy/approval contracts, installed skill tree diagnosis, and local syntax/static validation.

The remaining work is no longer P0-P2 surface construction; it is deeper hardening: full external schema-engine enforcement if dependency policy allows it, preserving replay parity coverage, isolated real app-server process experiments, and eventually policy-gated cron/gateway automation. See [Remaining work](remaining-work.md).
