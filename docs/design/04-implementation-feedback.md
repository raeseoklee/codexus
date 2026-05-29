# Implementation Feedback Review

[한국어](../ko/design/04-implementation-feedback.md)

Date: 2026-05-29

## Verdict

The core architecture direction should remain unchanged:

- keep Codex as the execution engine,
- keep the harness CLI-first,
- keep `codex exec --json` as the stable MVP driver,
- keep app-server behind an experimental driver gate,
- keep the run ledger as the source of truth,
- keep self-improvement explicit and promotion-gated.

The implementation blockers did not invalidate the architecture. They mainly show that the driver layer must be more capability-driven and conservative than the initial prose implied.

## Findings From Implementation

### Claw Reference Correction Changes The Hardening Bar

Observed: the correct Claw reference is `ultraworkers/claw-code`, and the
source is inspectable. Its active baseline is the Rust CLI under `rust/`, with
JSON command contracts, typed error behavior, worker state inspection,
permission modes, mock parity fixtures, and event/report contract guidance.

Decision: keep the Codexus architecture, but raise the detailed design bar for
automation-facing surfaces. Codexus should add typed JSON errors, permission and
approval ledger events, richer replay parity fixtures, and truthful
capability/status envelopes for experimental app-server or daemon-like
surfaces.

Design impact: this is a hardening change, not a runtime pivot. `codex exec
--json` remains the MVP driver because Codexus' core divergence from Claw is
intentional: Codexus wraps authenticated local Codex CLI sessions, while Claw
does not support Codex CLI session import/export.

### ChatGPT Account Subagent Model Limitation

Observed: Codex native subagents using fixed role models such as `gpt-5.1-codex-max` failed with the ChatGPT account:

```text
The 'gpt-5.1-codex-max' model is not supported when using Codex with a ChatGPT account.
```

Decision: do not make native subagents a required implementation path. Use them opportunistically, and prefer inherited/default models when the user explicitly asks for subagents.

Design impact: no architectural change. This reinforces the existing driver/capability-probe strategy.

### `codex exec` Flag Surface Differs From Top-Level `codex`

Observed: `codex exec` in `codex-cli 0.135.0` rejected `--ask-for-approval` even though top-level `codex` supports `--ask-for-approval`.

Decision: driver implementations must not blindly forward global Codex flags. Each driver owns flag mapping and must be backed by `--help`/probe behavior or tested fixtures.

Design impact: small design correction. `approval` remains in config for future drivers, but `CodexExecDriver` does not pass it unless support is detected.

### Codex Uses stderr For Warnings On Successful Runs

Observed: successful Codex runs may write warnings to stderr while exiting 0.

Decision: preserve stderr as raw evidence, but do not classify it as `DriverResult.error` when exit code is 0.

Design impact: no architecture change. This confirms raw preservation is necessary.

### Codex JSONL Event Shape Is Nested

Observed: final assistant text arrived as:

```json
{"type":"item.completed","item":{"type":"agent_message","text":"CHX-CODEX-OK"}}
```

Decision: event parsing must be tolerant and inspect nested payloads. Raw events stay preserved so parser drift can be fixed without losing evidence.

Design impact: no architecture change. This confirms event normalization should stay tolerant and source-linked.

### Repair Loop Should Start Narrow

Observed: verification-failure repair is straightforward and testable. Driver-failure repair needs stronger classification, otherwise the harness risks retrying configuration/auth/permission errors as if they were code failures.

Decision: MVP repair loop handles only `driver succeeded + verification failed`. Driver failures remain terminal for now.

Design impact: no architecture change. This is a scope constraint for the first repair implementation.

### CLI Argument Parser Needs Explicit Boolean Flags

Observed: `--json` consumed the prompt as its value before boolean flag handling was added.

Decision: keep the dependency-free parser for now, but explicitly list boolean flags and add regression tests.

Design impact: no architecture change. A mature parser can be introduced later if command complexity grows.

## Direction Changes Required

Required changes:

- Make driver flag handling capability-gated.
- Treat stderr as evidence, not error, unless exit status indicates failure.
- Document repair scope as verification-only for MVP.
- Keep subagent usage opportunistic under ChatGPT account constraints.
- Add typed JSON error envelopes for automation-facing commands.
- Promote permission, approval, and policy-block events to first-class ledger events.
- Expand replay fixtures using Claw's mock parity categories.
- Require truthful capability/status envelopes for disabled experimental surfaces.

These are now reflected in the main architecture and detailed design documents, not only this feedback note.

Not required:

- No need to move away from `codex exec --json`.
- No need to make app-server the primary path.
- No need to introduce a server daemon yet.
- No need to depend on OMX for core runtime.
- No need to abandon the Hermes-style evolution loop.

## Next Implementation Priority

The P0-P2 safe MVP surfaces and the first high-risk promotion slice are now
implemented: expanded JSON error contracts, ledger decision events,
driver-failure classification, stale-lock inspection/recovery, schema artifacts,
active skill index/export/improvement, approved adapter retrieval/context
formatting, memory lifecycle/curation commands, replay gates with an explicit
live policy, focused schema enforcement and migration fixtures, app-server
fixture/status/dry-run roundtrip/experiment gating, project initialization,
observability commands, packaging/static checks, explicit-budget driver-failure
repair, and cron/gateway dry-run plans.

The next slice should deepen evidence on those surfaces rather than adding
another runtime path:

1. Replace focused validators with a full JSON Schema engine only if dependency policy allows it.
2. Expand Claw-style replay parity scenarios before spending more live model budget.
3. Upgrade the app-server experiment manifest into supervised process lifecycle evidence before live roundtrips.
4. Add approval/policy events for cron/gateway live dispatch.
5. Keep automatic adapter injection behind an explicit user-visible step.

The full backlog is maintained in [Remaining work](../remaining-work.md).
