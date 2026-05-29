# Harness Remediation Plan

[한국어](../ko/plans/2026-05-29-harness-remediation-plan.md)

Date: 2026-05-29
Status: accepted. Implemented in the remediation passes: R1, R2a, R2b, R3, R4,
R5, R6, R7, and R8, plus the follow-up repair-context redaction expansion.
Scope: turn the existing scaffolding into a harness that actually repairs,
supervises, and learns — without breaking the gating/JSON/ledger contracts that
already work.

## Verdict

The skeleton and safety discipline are strong: zero-dependency runtime, JSON-first
contract, append-only ledger with atomic writes, capability-gated flag mapping,
lock/lease with stale recovery, honest feature gates with truthful status. The
architecture direction should not change.

Original review finding: the missing substance was concentrated behind three
headline promises:

1. **Self-repair** runs blind — it never sees the failing output.
2. **Durable supervision** has no timeout and no cancel path.
3. **Evolution** writes structurally valid but semantically empty skills/memories,
   and its promotion gate is tautological.

This plan fixed those in priority order while preserving the existing contracts:
JSON output stays the automation surface, the ledger stays the source of truth,
experimental surfaces stay gated, and `codex exec --json` stays the stable
driver. R2b is now implemented as an owner heartbeat plus cancel-marker
protocol.

## Remediation Slices

Severity legend: P0 (defeats the harness's reason to exist), P1 (ledger truth /
consistency), P2 (positioning / depth).

---

### R1 (P0) — Feed real failure output into the repair loop

Implementation status: implemented. Verification repair now records and injects
bounded verification artifact tails. Driver-failure repair now records and
injects bounded raw driver log tails. Follow-up hardening expanded redaction for
common stdout/stderr secret shapes before those tails enter prompts or artifacts.

Problem. There are two distinct repair paths and *each blinds the model in its
own way*:
- Verification repair (`kernel.ts:35-42`, `repairPrompt`) gives the model only
  `verification failed with status: <word>`. The captured `stdout`/`stderr` of the
  failing command (`runner.ts` writes them to `verify_NNN.stdout.log` /
  `.stderr.log`) is never read back into the repair prompt.
- Driver-failure repair (`driverFailureRepairPrompt`) carries `result.error` but
  not the *raw driver* `stdout`/`stderr` tail preserved under `raw/`.

These are different fixes: verification repair needs the failing *verification
command's* output tail; driver-failure repair needs the *raw driver log* tail
(verification never ran on a driver failure, so verification artifacts do not
exist for that path). `01-architecture.md:326` claims repair runs "with bounded
failure context"; neither path delivers it today.

Why it matters. The verify→repair loop is the harness's single biggest
differentiator over raw `codex exec`. Repairing without the diagnostic halves its
effectiveness and produces low-value experience records downstream.

Approach.
- Verification path: return the per-command records from `runVerification` up to
  the kernel (already in `VerificationResult.commands`), read the first
  non-passing command's `stdout`/`stderr` tail, and inject a bounded block into
  `repairPrompt`.
- Driver-failure path: read the preserved `raw/<driver>...-stdout.jsonl` /
  `-stderr.log` tail and inject it into `driverFailureRepairPrompt`.
- Shared bounded-context builder: command/exit code + trailing slice (e.g. last
  2–4 KB, head+tail if very large), clearly delimited so it cannot crowd out the
  original task.
- Record the exact context handed to the model as a ledger artifact
  (`repair-context-<n>.md`) so repair input is auditable, matching the
  ledger-as-truth principle.

Design constraints. Bound the size (no unbounded log replay into a prompt — this
is also a prompt-hygiene/secret-surface concern; route through redaction before
injection). Redaction covers common API tokens, AWS keys, JWTs, key/value secret
assignments, `.env`-style dumps, and PEM/private-key blocks. Do not change the
verification record schema shape beyond additive fields.

Acceptance.
- A mock scenario where verification fails with a known marker string asserts that
  marker appears in the repair prompt artifact.
- Repair-context artifact is written and listed in `state.artifacts`.
- Bound is enforced (oversized logs are truncated deterministically).

Effort. Small. High ROI — do this first.

---

R2 is split into two slices because in-process termination and out-of-band
cancellation are different mechanisms (same process tree control vs.
owner/liveness/cancel-marker polling) and should not share a PR.

#### R2a (P0) — In-process timeout, SIGINT, and a reachable terminal ledger

Implementation status: implemented. `codex.runTimeoutMs`, AbortSignal
propagation, CLI SIGINT handling, `driver.timeout` evidence, and terminal
`cancelled` ledger reconstruction are present.

Problem. `codex-exec.ts:133-211` spawns `codex exec` with no timeout, no
`AbortSignal`, and no `SIGINT`/`SIGTERM` handling. `runner.ts` has a timeout but
the *model* process does not. The `cancelled` terminal outcome (`types.ts`,
`kernel.ts:31`) is unreachable from a real run because nothing ever returns driver
status `cancelled`.

Why it matters. A harness that advertises durable, recoverable supervision must
be able to stop its own run. A hung or runaway `codex exec` currently blocks
forever with no operator escape and no truthful terminal state.

Approach.
- Add `codex.runTimeoutMs` to config (default generous, e.g. 30 min; `null`
  disables). On expiry: `child.kill("SIGTERM")`, grace window, then `SIGKILL`;
  flush raw stdout/stderr first (the supervisor pattern in
  `experiments/process-supervisor.ts:79-91` is the reference implementation —
  reuse its escalation shape).
- Thread an `AbortSignal` from kernel → driver `run()`. On abort/timeout,
  terminate the child and resolve `DriverResult.status = "cancelled"`.
- Install a single SIGINT handler in the CLI run path that aborts the active run,
  lets the kernel write a terminal state + `run.terminal` event, then exits
  non-zero. The ledger must reflect cancellation, not a half-written `running`
  state.

Design constraints. Termination must leave a consistent terminal ledger
(`writeState` + terminal event) — never an orphaned `running` record. Timeout and
user-interrupt are distinct *events* even though both map to the `cancelled`
terminal outcome; record which fired.

Acceptance.
- Mock/fake driver honors an injected timeout and produces a `timed_out` event →
  `cancelled` terminal with raw output preserved.
- SIGINT during a (faked) long run yields terminal `cancelled` with a
  `run.terminal` event and non-zero exit.
- `status --json` on a cancelled run reconstructs `cancelled` from disk.

Effort. Medium.

#### R2b (P1) — External `cx cancel <run-id>`

Implementation status: implemented. `cx cancel <run-id>` now writes a
cancel-request marker for live owners and closes dead-owner ledgers directly.

Problem. There is no way to cancel a run owned by another process.

Approach. Each active run writes `owner.json` with pid, hostname, heartbeat, and
TTL. `cx cancel` writes `cancel-request.json` when the owner is live; the owning
kernel polls the marker and aborts its local `AbortSignal`. If the owner is
missing, stale, or dead, the canceller writes `run.cancel_orphaned` and
`run.terminal` and marks the ledger `cancelled`.

Design constraints. Depends on R2a's abort plumbing existing first. Must not
corrupt a ledger being written by a live owner — the owner performs the terminal
write, the canceller only requests.

Acceptance. Implemented with regression tests: `cx cancel <run-id>` against a
live faked run reaches `cancelled`; against a dead-owner run, the command marks
the orphan terminal with a recorded reason and report.

Effort. Medium.

---

### R3 (P0) — Make evolution carry real content; make the replay gate non-tautological

Implementation status: implemented. Experience records now derive lessons from
verification commands, repair history, and driver-failure classification.
Generated skills include source-specific procedure steps, and replay specs assert
source-specific verification requirements so boilerplate can fail.

Problem. Three linked weaknesses:
- `skills.ts:155-159` — every auto-proposed skill gets the *same* three
  boilerplate procedure lines. No task-specific reusable knowledge.
- `replay.ts:128-163` — the default replay spec only checks "procedure mentions
  verification" and "forbidden action present", and `buildSkillProposal` is
  constructed to always satisfy both. The promotion gate therefore always passes
  for generated skills; it validates *shape*, not *behavior*.
- `experience.ts:71-99` — `reusableLessons` are generic constant strings, so
  derived memory entries (`kernel.ts:382-399`) are also contentless.

Why it matters. "Each run leaves behind reusable leverage" is the core thesis
(`...engineering-plan.md:13`). Today the loop produces well-indexed, versioned,
exportable files with nothing useful inside, and a safety gate that cannot fail.

Approach (staged, conservative — do not flip `autoPromote`).
- Stage A — richer extraction: derive task-specific lesson content from ledger
  facts already available: which verification command failed then passed across a
  repair, the diff/touched-file summary (git is detectable via preflight), the
  failure category from `classifyDriverFailure`. Store these as the lesson body
  instead of constants. This raises memory/experience value with no new runtime
  surface.
- Stage B — meaningful replay: a generated skill must encode at least one
  *checkable* assertion tied to its source run (e.g. "must run command X before
  claiming completion", "forbids action Y observed in the failing run"). The
  replay spec asserts those skill-specific claims, so a degenerate boilerplate
  skill *fails* the gate. Keep the structural checks as a floor, add behavioral
  checks as the real gate.
- Stage C — keep promotion explicit and human-reviewed (`cx skill review`); the
  improved gate makes review meaningful rather than ceremonial.

Design constraints. Stay within the deterministic mock-replay boundary
(`replay.ts` parity labels) — no live model spend required for the gate. Honor the
existing rule that promotion stays explicit and reversible (versioned + deprecate
path already exist). Do not silently mutate active behavior.

Acceptance.
- A deliberately empty/boilerplate skill proposal now produces replay status
  `failed` with a specific failure code (regression test for the gate).
- A skill generated from a real repair run carries a source-specific assertion and
  a lesson body referencing the actual failing command.
- Memory entries from a repaired run contain the failing-then-passing command,
  not a constant string.

Effort. Medium–large. This is the slice that converts "scaffolding" into "learning".

---

### R4 (P1) — Stop reporting `pending` verification on failed runs

Implementation status: implemented with Option A: `latestStatus: "skipped"` plus
`reason: "not_reached_*"`.

Problem. `kernel.ts:159` initializes `verificationStatus = "pending"`. If the
driver fails, `runChecks()` never runs and the terminal state keeps
`latestStatus: "pending"` even though verification will never run for that run.

Why it matters. The ledger is sold as the source of truth. A finished run that
claims verification is still "pending" is a truthfulness defect in the most
load-bearing artifact.

Schema note. `RunState.verification.latestStatus` currently allows only
`pending | passed | failed | skipped | timed_out | error`; there is no
`not_run`/`not_reached`. The plan must pick one, explicitly:
- Option A (recommended, additive, no migration): keep the existing enum, set
  `latestStatus: "skipped"`, and add an optional `reason` field
  (e.g. `"not_reached_driver_failed"`) to distinguish "no verification configured"
  (`skipped`, no reason) from "verification never reached" (`skipped`, reason set).
- Option B: add a new `not_reached` enum value — requires a state-schema version
  bump and a migration entry in the schema artifacts + migration reader.

Recommend Option A: it is purely additive, needs no migration, and keeps the
distinction in a typed field rather than overloading the status word.

Approach. When the run terminates without reaching verification, write the chosen
terminal representation (Option A: `skipped` + `reason`) instead of leaving
`pending`.

Acceptance. A driver-failure mock run with configured verification commands ends
with a terminal (non-`pending`) verification status carrying the not-reached
reason; `status --json` reflects it; the schema validator accepts the new field.

Effort. Small.

---

### R5 (P1) — Capture usage / cost accounting

Implementation status: implemented. Codex JSONL usage is parsed when present and
terminal state records usage or `{ "available": false }`.

Problem. `DriverResult.usage` exists (`contract.ts:40`) but no driver populates
it; `replay.ts:22` even lists `usage_accounting` as a parity label while real runs
record nothing.

Why it matters. Wrapping a metered model without recording token/cost usage is a
gap for any serious harness, and the plan's own risk section
(`...engineering-plan.md:191`) calls out usage limits and budgets.

Approach. Parse usage/token fields from the Codex JSONL events when present
(tolerant, capability-flagged like the rest of the driver), store on
`DriverResult.usage`, surface in the ledger and in `status --json`. Where Codex
does not emit usage, record `usage: { available: false }` truthfully rather than
omitting silently.

Acceptance. A fixture JSONL containing a usage event is parsed into the ledger;
absence is recorded explicitly.

Effort. Small–medium (depends on Codex event shape; keep tolerant + fixture-backed).

---

### R6 (P1) — Fix event phase labeling during async driver output

Implementation status: implemented. Driver events are stamped with the explicit
attempt phase rather than mutable shared state.

Problem. The `emit` callback in `kernel.ts:196-204` captures
`phase: state.phase`, but `state` is reassigned across phases. Raw events
arriving during driver execution can be stamped with whatever `state.phase`
currently is (possibly already `repair`).

Why it matters. Events are the designated live-truth layer; subtle mislabeling
undermines replay and post-mortem reconstruction.

Approach. Pass the phase explicitly into each `runDriverAttempt` call (it already
knows whether it is the initial or a repair attempt) and stamp events from that
captured value, not from mutable shared state.

Acceptance. A run with a repair iteration shows execute-phase driver events
labeled `execute` and repair-phase events labeled `repair`, asserted in a test.

Effort. Small.

---

### R7 (P2) — Make config surface honest about what it controls

Implementation status: implemented. Unsupported Codex driver options emit
`config.option_ignored` ledger events.

Problem. `config.codex.approval` is exposed and defaults to `"on-request"`.
`buildCodexExecArgs` *does* pass `--ask-for-approval` when the capability probe
reports `supportsApprovalFlag: true` (`codex-exec.ts:50-52`). The defect is the
silent-drop case: the fallback (`defaultCodexExecCapabilities`,
`codex-exec.ts:25`) and the observed local `codex exec 0.135.0` report the flag as
unsupported, so the configured `approval` value is dropped *without any signal to
the operator*. The setting then silently does nothing on that driver/version.

Why it matters. Exposing controls that have no effect misleads operators — the
opposite of the "truthful capability/status" value the project otherwise upholds.

Approach. When a configured option is dropped due to a missing capability, emit a
`config.option_ignored` warning event (driver, option, reason) and document the
exec-non-interactive limitation in the config schema docs. Keep `approval` in
config for future drivers (matches the prior decision in
`04-implementation-feedback.md:54-58`), but make the no-op visible.

Acceptance. Running codex-exec with `approval` set records a `config.option_ignored`
event naming the dropped flag.

Effort. Small.

---

### R8 (P2) — Align documentation with implemented behavior

Implementation status: implemented for the current docs surface. Reserved
`research`/`plan` phases are now labeled as reserved, and tool/MCP expansion is
described as gated.

Problem. The architecture advertises `intake/research/plan/execute/verify/repair/
evolve` phases (`01-architecture.md:160`), but the kernel implements
preflight → execute → verify → repair → evolve only; `research`/`plan` are not run
phases. Separately, positioning Codexus as a "tool-connecting runtime" overstates
current value: all tool execution is delegated to `codex exec`, and the only
tool-adding path (app-server/MCP) is gated off — today it is a supervision + ledger
+ verification wrapper.

Why it matters. The project's credibility rests on truthful status. Docs should
not promise phases or capabilities the runtime does not exercise yet.

Approach. Mark `research`/`plan` as reserved/aspirational phases (or implement
them as real no-op-able phases), and reframe the value proposition as
"supervision, verification, recovery, and evolution around Codex" until the
tool/MCP path is enabled. Keep retrieval limitations explicit: current
skill/memory retrieval is keyword-overlap (`skills.ts:518-535`), not semantic.

Acceptance. Docs reviewed so every claimed phase/capability maps to executed code
or is explicitly labeled reserved/experimental.

Effort. Small (docs), or medium if `research`/`plan` are implemented.

---

## Recommended Sequencing

1. R1 + R4 + R6 — repair diagnostics + ledger truthfulness (one small, high-value
   first PR).
2. R2a — in-process timeout / SIGINT / reachable `cancelled` (urgent safety).
3. R3 — real evolution content + non-tautological gate (the substance slice).
4. R5 — usage accounting.
5. R7 + R8 — honesty of config surface and docs.
6. R2b — external `cx cancel` owner/liveness protocol.

R1+R4+R6 was the single small first PR. R2a and R3 were the two substantial
slices, and R2b landed afterward once the AbortSignal plumbing existed.

## What I Would NOT Do (yet)

- Do not enable the app-server/cron/gateway live paths to "add tools". The gates
  are correct; depth-before-breadth.
- Do not flip `evolution.autoPromote`. Keep promotion explicit until R3 makes the
  gate meaningful.
- Do not add a semantic-search dependency or a chat surface. Both contradict the
  zero-dependency + "no competing chat loop" decisions and are premature.
- Do not introduce a daemon. The CLI-core boundary is a strength.

## Risks

- R3 can amplify bad procedures if the behavioral gate is weak — mitigate with
  fixtures that prove a degenerate skill fails, plus the existing
  version/deprecate rollback.
- Repair-context injection (R1) and usage parsing (R5) depend on Codex output
  shapes that may drift — keep both tolerant, fixture-backed, and capability-gated,
  consistent with the existing driver philosophy.
- Cancellation (R2a/R2b) risks orphaned `running` ledgers if interrupted
  mid-write — mitigate by routing live-owner termination through the owning
  process's `writeState` + terminal event, and letting the external canceller
  directly close only owners proven missing/stale/dead.

## Acceptance Summary

The remediation is done when: a failed verification hands the model the real
failing output (auditable in the ledger); a run can be timed out and cancelled
into a truthful terminal state; a boilerplate skill *fails* replay while a
real-run skill carries source-specific, checkable content; finished runs never
report `pending` verification; usage is recorded or explicitly marked
unavailable; and every documented phase/capability maps to executed code or is
labeled reserved. All of this lands without new dependencies, without enabling a
gated surface, and with mock-driver tests that need no model or network access.
