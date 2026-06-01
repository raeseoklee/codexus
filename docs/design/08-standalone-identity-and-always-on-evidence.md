# Standalone Identity and Always-On Evidence

[Korean](../ko/design/08-standalone-identity-and-always-on-evidence.md)

Date: 2026-05-30
Status: accepted product principles; always-on evidence first slices implemented; driver descriptor migration deferred

## Decision

Codexus evolves on its own axis. It keeps a Codex-native session
experience as the near-term product surface, but its identity is
**evidence-first**. Concretely:

- The product copy and near-term UX focus stay Codex-native.
- The core (kernel, ledger, verification, event/state schema) stays
  engine-agnostic.
- Codexus does not define itself relative to any sibling harness. It learns from
  prior harness work, but it has no dependency on or adapter for another harness;
  its identity is the evidence axis.

The differentiator Codexus owns is verifiable
completion, reproducible run evidence, honest capability reporting, and an
engine-agnostic driver boundary.

## Why a Standalone Identity

Workflow-first harnesses optimize runtime breadth (escalation flow, tmux teams,
worktrees, HUD, a wide skill vocabulary). They are broader on that axis. Trying
to match that breadth as a solo alpha would lose on their ground and dilute what
makes Codexus distinct.

Codexus is distinct on a different axis:

1. **Verify-gated completion as a hard contract.** A run is `complete` only after
   the verification command passes, with failure output fed back into a bounded
   repair loop.
2. **Honest capability reporting.** Every surface reports `observed`,
   `configured`, or `unavailable` from evidence, never from assumption.
3. **Durable evidence ledger and replay.** Runs and session state reconstruct
   from disk after a crash.
4. **Engine-agnostic driver boundary.** The driver abstraction keeps a second
   engine (for example Claude Code) open without a kernel rewrite — something a
   workflow-first harness is structurally not built for.

Standalone evolution means owning this axis, not replicating breadth.

## Non-Goals

- Do not replicate workflow-first breadth to "look broad": no large
  mode/skill/role catalog, no tmux team runtime, worktree parallelism, or
  workflow-escalation vocabulary as a near-term goal. These return only later,
  and only where they serve the evidence axis.
- Do not bake Codex-specific assumptions into the kernel, ledger, verification,
  or normalized event/state schema. Codex specifics live in the driver only.
- Do not promise that evidence actions always happen. The overlay can request
  best-effort behavior from a non-deterministic agent; it cannot enforce it.
- Do not auto-run heavy verification on every turn, auto-promote skills, auto
  prompt-inject, or launch sub-runs without an explicit, gated step.

## Always-On Evidence

The goal is that Codexus feels attached to the session lifecycle without the user
saying "codexus" every turn — but **not** that it runs heavy verification on
every turn.

### The honesty reframe (most important)

The always-on model is driven by an AGENTS overlay that asks the Codex agent to
checkpoint before changes and verify before finishing. That is a request to a
non-deterministic model, not enforcement. On any turn the agent may skip it.

Therefore:

> Always-on means the evidence **state** is always tracked and truthfully
> reported — not that evidence **actions** always happen.

The overlay requests best-effort actions. Truthfulness is owned by the session
status model, not by overlay compliance. The product never implies evidence is
present when it is not; it always reports whether the current work is verified,
stale, or unverified. That truthful gap report is itself the evidence-first
value.

### Ambient evidence model (do not wait for HUD)

`cx session status --json` is the small, always-on evidence data model now. HUD
and statusline are later projections of the same data. Status should always
summarize:

```text
verification:        passed | failed | missing | stale
evidenceFresh:       true | false
dirtySinceLastVerify: true | false
recommendedVerify:   <inferred command, or null>
lastCheckpoint:      <label / id / path>
lastVerification:    <status / path>
```

### Workspace fingerprint, not agent assertion

`dirtySinceLastVerify` and `evidenceFresh` must be computed deterministically
from a saved workspace fingerprint, never from agent self-report. A model that
forgets to mark dirty must not make the evidence state lie. This mirrors the
notify-dispatch lesson: empirical/derived beats self-asserted.

At verification time, Codexus should record a compact `workspaceFingerprint`
beside the verification artifact:

- git `HEAD` or an explicit `not_git` marker,
- staged diff hash,
- unstaged diff hash,
- relevant untracked file list/hash,
- the verification timestamp and cwd/project root used to compute the
  fingerprint.

`cx session status` recomputes the current fingerprint and compares it with the
last verified fingerprint. Timestamp and filesystem mtime checks are only a
degraded fallback for non-git or partially observable workspaces. If Codexus
cannot compute a reliable fingerprint, it must report the verification as
`stale` or explain the uncertainty instead of claiming `evidenceFresh: true`.

### Hook as a deterministic heartbeat

The Codex notify hook cannot understand work semantics, so it does not drive
always-on intelligence. Its reliable role is a heartbeat: on `turn-ended`,
recompute the derived evidence state so status stays fresh regardless of whether
the agent cooperated. Overlay + session commands + status model are the center;
the hook only keeps the derived state current.

If the hook is unavailable or no real dispatch has been observed, always-on does
not disappear. `cx session status` must recompute the evidence model on demand.
The hook is an observed heartbeat, not the source of truth.

### Verify auto-detection: detect and recommend always, execute on opt-in

Requiring `--verify "npm test"` every time is too weak for evidence-first UX.

- `cx session verify --auto --json` infers and returns a conservative
  recommendation from project signals. It does not run the command by itself.
  - `package.json` scripts: `test`, `typecheck`, `lint`, `ci`
  - `Cargo.toml` -> `cargo test`; `go.mod` -> `go test ./...`;
    `pyproject.toml` / `pytest.ini` -> `pytest`
- One strong candidate becomes the default recommendation. Multiple candidates return
  `recommended`, `candidates`, and `reason` as JSON.
- Execution requires an explicit run opt-in such as `cx session verify --auto
  --execute --json`, or an explicit command with `cx session verify --verify
  "<cmd>" --json`.
- Dangerous commands are blocked by the existing policy preflight.
- **Detection and recommendation are always on (P0). Execution is opt-in and
  bounded** (per-session opt-in, timeout, ideally at work boundaries rather than
  every turn). The conservative default is to report `stale`/`missing` plus the
  recommended command, not to run it.

### Staged automation policy

- Auto-allowed: `status`, `checkpoint`, memory lookup, evidence summary.
- Conditionally auto-allowed: an allowlisted, bounded `verify` command.
- Never auto: separate `cx run` sub-runs, destructive commands, live
  cron/gateway, automatic skill promotion, automatic prompt injection.

## Evidence-Bearing-Only Acceptance Gate

A positive design rule and command acceptance criterion. A new session-UX
surface is allowed only if it is evidence-bearing.

Allowed (each produces or surfaces evidence):

- `checkpoint` writes a durable artifact.
- `verify` writes completion evidence.
- `memory search` surfaces source-linked evidence.
- `replay` validates skill-promotion evidence.
- `status` / HUD makes evidence legible.

Rejected:

- A surface whose only value is a nice mode name.
- More roles/skills with no ledger effect.
- Wrapping something Codex already does under a new name.

## Engine-Agnostic Invariants

- Replace the `driver` enum (`codex-exec` / `mock` / `codex-app-server`) with an
  `engine` + `driverId` + `capabilities` descriptor over time, so a second engine
  does not force a schema migration.
- Audit the normalized event and state schemas for Codex-specific assumptions.
  Codex event shapes (`thread.started`, `item.completed`, `turn.completed`) are
  driver-internal; harness events must stay engine-neutral.
- Product copy may stay Codex-native; the kernel must not assume "Codex made this
  possible."

## Command Surface (first slice)

```bash
cx setup codex-session --scope project --always-on --json
cx session status --json        # ambient evidence model with derived dirty/fresh
cx session verify --auto --json # detect + recommend only; no execution
cx session verify --auto --execute --json # explicit bounded execution opt-in
```

The always-on overlay rule, in spirit: even when the user does not mention
Codexus, code-changing work should carry best-effort checkpoint and verification
evidence — while the session status model, not overlay compliance, guarantees the
truth of what is verified, stale, or missing.

The overlay requests behavior; it does not prove behavior. The notify hook's
role is similarly narrow: a `turn-ended` heartbeat records a bounded derived
evidence snapshot, but verification is never executed by the hook and
`cx session status --json` remains authoritative.

## Implementation Slices

1. Completed: strengthen `cx session status` into the ambient evidence model, with
   `dirtySinceLastVerify` / `evidenceFresh` derived from a saved
   `workspaceFingerprint` versus the current fingerprint. Use git hashes first;
   use timestamp/mtime only as a degraded fallback that cannot claim strong
   freshness.
2. Completed: add verify auto-detection with `cx session verify --auto`
   (detect + recommend always; execute only with an explicit run opt-in such as
   `--execute`; policy preflight for danger).
3. Completed: add the `--always-on` overlay profile and make the notify hook a
   heartbeat that records derived evidence state on `turn-ended`.
4. Completed: add the evidence-bearing-only rule to the design docs and to command
   acceptance criteria.
5. Begin isolating Codex-bound assumptions from the driver/kernel/event schema
   (descriptor-based driver identity), without changing product focus.

## Acceptance Criteria

- `cx session status --json` reports verification freshness, a deterministically
  derived dirty flag, a recommended verify command, and last checkpoint and
  verification — reconstructable from disk.
- `cx session verify --auto --json` infers a verification command from project
  signals, returns recommendation evidence, and does not execute.
- `cx session verify --auto --execute --json` executes only under an explicit,
  bounded opt-in after policy preflight.
- The dirty/stale flags are correct even when the agent never updates state,
  because they are derived from a workspace fingerprint; degraded fallbacks must
  report uncertainty or staleness instead of false freshness.
- No new session-UX surface ships unless it is evidence-bearing.
- Before a second engine ships, the driver identity migration plan is explicit:
  no new Codex-specific assumptions enter the kernel, ledger, verification, or
  normalized event/state schema, and descriptor fields (`engine`, `driverId`,
  `capabilities`) are introduced before broadening beyond Codex.

## Relationship to Sibling Harnesses

Codexus holds an independent, evidence-first identity. It treats other harnesses
(workflow-first or session-native) as prior art to learn from, but depends on
none of them and ships no cross-harness adapter. Independence here is identity,
not hostility: Codexus is defined by owning the evidence axis, not by comparison.
