# Codexus Documentation

[한국어](ko/README.md)

Codexus is a local runtime harness for Codex orchestration. It keeps OpenAI Codex as the model/runtime engine, then adds the harness engineering layer that makes Codex feel more durable, observable, recoverable, and self-improving.

Category:

```text
Codex execution harness
```

Target CLI:

```bash
cx
```

The MVP implementation still exposes `chx`; documentation now treats `cx` as the target CLI name and `chx` as a temporary compatibility alias until the code/package rename is done.

## Document Map

- [Engineering plan](plans/2026-05-29-codex-harness-engineering-plan.md): migrated planning baseline, research findings, constraints, MVP scope, and risks.
- [Reference governance](references/README.md): mandatory reference-first policy and current upstream harness audit.
- [Architecture](design/01-architecture.md): system boundaries, runtime layers, driver strategy, and major components.
- [Detailed design](design/02-detailed-design.md): CLI commands, state machine, storage layout, event schema, verification, and adapter contracts.
- [Evolution engine](design/03-evolution-engine.md): Hermes-inspired memory, skill proposal, replay validation, promotion, and rollback design.
- [Implementation feedback](design/04-implementation-feedback.md): decisions made after MVP implementation blockers and whether the architecture direction changes.
- [Naming and runtime positioning](design/05-naming-and-runtime-positioning.md): Codexus name, `cx` CLI target, external CLI runtime, and future Codex-native adapter.
- [Codex-native adapter](design/06-codex-native-adapter.md): `$codexus` skill adapter, installation, supported first commands, and design rules.
- [Implementation status](implementation-status.md): current MVP spine, verification evidence, and known gaps.
- [Remaining work](remaining-work.md): prioritized backlog, additional design considerations, and suggested next slice.

## Positioning

OMC and OMX are the same family of harness idea:

- OMC targets Claude Code.
- OMX targets Codex.
- This project targets Codex too, but it is not an OMX fork. It should learn from OMC/OMX and interoperate with OMX where useful.

Codexus should be used alongside Codex, not instead of Codex. The first stable model access boundary is the local authenticated `codex` CLI, especially `codex exec --json`.

Runtime positioning:

- implemented now: external supervisor CLI that drives `codex exec --json`,
- intended next: Codex-native adapter invoked from inside a Codex session,
- shared core: both surfaces should use the same ledger, verification, memory, and replay-gated skill system.

## Design Principles

- Keep Codex as the execution engine.
- Treat harness work as reference-first: consult `ultraworkers/claw-code`, `NousResearch/hermes-agent`, and `Gitlawb/openclaude` before changing core harness behavior.
- Avoid undocumented ChatGPT/Codex backend APIs.
- Prefer local, auditable files over hidden service state.
- Treat every run as resumable until it reaches an explicit terminal outcome.
- Require verification evidence before claiming completion.
- Make self-improvement explicit, reviewable, versioned, and reversible.
- Use OMX as an optional sibling integration, not a required dependency.

## Current Status

The repository now has a working MVP harness spine:

- durable run ledger and workflow kernel,
- `codex exec --json` and mock drivers,
- verification gate and bounded repair loop,
- `init`, `status`, `runs`, `events`, `report`, `verify`, `resume`, `plan`, and `replay` CLI surfaces,
- policy preflight for high-risk verification commands,
- automatic experience and memory records with memory lifecycle and curation commands,
- replay-gated skill proposal, review, improvement, promotion, active index, explicit export, listing, and deprecation,
- optional OMX status/retrieval/context formatting and `.omx/plans` export without mutating `.omx/state`,
- lock inspection/stale recovery, versioned schema artifacts, focused read-path enforcement, and run-ledger validation,
- approved adapter context artifacts, replay pass/failure/extended fixtures, gated model replay, app-server dry-run roundtrip/recorded experiment manifests/process-probe evidence, explicit-budget driver-failure repair, cron/gateway dry-run audit records with policy/approval contracts, installed skill diagnosis, and local syntax/static validation.

The remaining work is no longer P0-P2 surface construction; it is deeper hardening: full schema-engine enforcement if dependency policy allows it, richer replay parity, supervised live app-server process experiments, and eventually policy-gated cron/gateway automation. See [Remaining work](remaining-work.md).
