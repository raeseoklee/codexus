# Autopilot Contract

[Korean](../ko/design/12-autopilot-contract.md)

Date: 2026-05-31
Status: proposed design (deferred from 0.1.0; 0.2 / 0.3 track)

## Decision

Codexus should add an **autopilot contract layer**: a declared, schema-validated
policy that lets a supervised Codex run go **unattended for a long time** without
per-step human approval — while Codexus acceptance, promotion, and merge flows
block output outside the documented contract or verification evidence. The
pipeline is:

```
documented contract → policy gate → bounded execution → evidence gate → auto-repair / stop
```

The differentiator is not "let the AI run longer." It is: **let it run long, but
keep it inside a documented contract and inside checkable evidence.** Autopilot
is an *orchestrator over existing gates*, not a new judgment engine.

## Why It Fits Codexus

- The kernel already creates a run ledger, emits `permission.checked` /
  `policy.blocked` / verification events, only reaches `complete` when
  verification passes, and runs a bounded repair loop. That is the right
  sub-engine for autopilot.
- The completion authority is already evidence, not human approval. Autopilot
  composes the gates that already exist (`verification`, `slop`, `supply-chain`,
  and a new `scope` gate) rather than inventing a parallel decision system.
- The honesty model already says enforcement comes from evidence, not from a
  best-effort overlay (see [doc 08](08-standalone-identity-and-always-on-evidence.md)).
  Autopilot extends the same line: it does not pretend to prevent; it detects and
  stops.

## The Hard Boundary (make-or-break)

> Autopilot keeps a long run's accepted output **inside a human-approved contract
> and inside checkable evidence**. It does not generally prevent the agent from
> acting; it isolates, detects, stops, and refuses to promote out-of-contract
> output.

Two truths must be stated plainly, because crossing them turns an honest harness
into "just let the AI run longer":

- **Enforcement is detect-then-stop, not prevent.** Codexus supervises Codex, but
  **Codex writes the files.** Codexus cannot pre-block an out-of-scope write — that
  is the Codex sandbox's job. Codexus can only compare a post-step diff against
  the contract and **stop on violation**. Therefore worktree isolation is a
  required safety net, not an option: without it, a violation is already in the
  working tree before it is detected. The scope gate is post-step evidence, not a
  pre-write firewall. The docs and output must say so.
- **Acceptance criteria are heuristic, so the contract is human-approved, not
  derived.** Turning a PRD / `AGENTS.md` / roadmap into `acceptanceCriteria[]`,
  `forbiddenChanges[]`, and `verificationRequired[]` is an extraction two honest
  reviewers could disagree on — it is not a derivable fact. So `autopilot plan`
  produces a *proposed* contract that a human approves **once**; `autopilot run`
  then enforces only the approved contract. This is not "remove approval." It is
  **"compress approval into one up-front contract review."** The contract is
  asserted (human-approved); execution inside it is derived-gated.

Supporting boundaries:

- **No unattended guarantee without capability proof.** `codex.approval = never`
  is silently ignored when the installed Codex lacks `--ask-for-approval`
  (recorded today as `config.option_ignored`). Autopilot must cross-check driver
  capability against policy at start time (see "Capability × Policy start gate").
- **No policy promise without an observation/enforcement surface.** Some bounds,
  such as network access, destructive shell commands, or secret/env reads, cannot
  be proven from a post-step diff. If the selected driver/sandbox cannot enforce
  or observe one of these policy fields, `autopilot run` must block at start or
  reject that contract field. It must not silently downgrade the bound into a
  best-effort warning.
- **Stop is not failure.** Hitting a contract bound (max diff, scope edge,
  timeout) is "reached a boundary that needs a human," not "autopilot failed."
- **No new gate subsystem.** Completion is the AND of existing gates plus the
  scope gate; no parallel scanner.
- **Engine-agnostic.** The contract, scope gate, worktree, and gate composition
  live above the driver abstraction. Only the capability check is driver-specific;
  the whole loop must be testable with the mock driver.

## The Contract

The autopilot contract lives in `.codexus/autopilot.json` (or a `autopilot`
section in config) and is **schema-validated** (a schema artifact, like the
supply-chain policy — a malformed contract must fail loudly, never silently
weaken a gate). Candidate fields:

```json
{
  "schemaVersion": 1,
  "type": "codexus.autopilot.contract",
  "status": "approved",
  "approval": {
    "approvedAt": "2026-05-31T00:00:00.000Z",
    "approvedBy": "maintainer-or-local-operator",
    "sourceDocs": [{ "path": "docs/PRD.md", "sha256": "sha256:..." }],
    "subjectHash": "sha256:<canonical-autopilot-body>",
    "approvalRecordPath": ".codexus/autopilot/approvals/<id>.json"
  },
  "autopilot": {
    "scope": { "allow": ["src/**", "tests/**"], "forbiddenChanges": [".github/**", "package.json", "**/.env*"] },
    "acceptanceCriteria": ["<human-approved, from autopilot plan>"],
    "verificationRequired": ["npm test", "npm run typecheck"],
    "commandAllowlist": ["npm test", "npm run typecheck", "npm run lint"],
    "networkPolicy": { "mode": "none", "requiresDriverEnforcement": true },
    "maxRuntimeMs": 3600000,
    "maxRepairIterations": 3,
    "maxChangedFiles": 40,
    "maxDiffLines": 2000,
    "approval": "enforced-never-with-isolation",
    "stopOnPolicyViolation": true
  }
}
```

Validation rules that matter:

- An **empty `scope.allow` is rejected**, not treated as "allow all" — the most
  dangerous silent misread.
- `forbiddenChanges` always wins over `scope.allow`.
- An approved contract records an approval artifact, source-document hashes, and
  a canonical subject hash. The subject hash is computed over a **canonical
  serialization** of the `autopilot` body (sorted keys, normalized whitespace,
  excluding the `approval` block) so it is stable; `autopilot run` refuses a
  contract whose approved subject hash does not match the runnable body.
- `sourceDocs` hashes are **provenance, not a run-time gate**: they record which
  document versions the contract was distilled from. Because the approved
  `subjectHash` fixes the contract, later edits to a source doc do **not**
  invalidate an already-approved contract and must not block a run.
- Unknown keys are rejected (like the supply-chain policy validator).

## plan → approve → run lifecycle

1. **`cx autopilot plan --from docs/...`** reads the documents and emits a
   *proposed* contract (`acceptanceCriteria` / `forbiddenChanges` /
   `verificationRequired` derived heuristically). It is explicitly labeled as a
   draft needing review.
2. **Human approval (once).** The maintainer reviews and approves the contract.
   This writes an approval artifact with source document hashes and the canonical
   contract-body hash. This is the single approval that replaces per-step
   approval.
3. **`cx autopilot run --policy <contract>`** runs the supervised loop inside a
   worktree, under the approved contract, with strict gates and stop conditions.

## Gate composition (completion authority)

`autopilot run` is `complete` only when **all** of these are green, reusing the
existing `gateFor` tri-state mechanism — never a new judgment:

- **verification gate** — `verificationRequired` commands pass (kernel).
- **slop gate** — `slop check` evidence gaps are clear.
- **supply-chain gate** — `supply-chain check` gaps/blocking-unknowns clear (also
  catches new dependencies / manifest changes).
- **scope gate** — the post-step diff stays inside `scope.allow` plus
  Codexus-owned artifact buckets (the worktree's `.codexus/**` ledger/evidence
  paths), and touches no `forbiddenChanges`.

`heuristicClaims` and informational unknowns never move the completion exit code,
exactly as in the other gates.

## Capability × Policy start gate

Before the first step, `autopilot run` probes the driver and **blocks on a
mismatch** (it does not silently proceed like `config.option_ignored`):

- If `approval = never` is requested but the driver cannot prove that approval
  mode is supported and applied, autopilot refuses to start. A worktree limits
  blast radius, but it is not a substitute for approval-mode enforcement.
- If the sandbox mode is not actually applied, autopilot refuses to start.
- If `networkPolicy`, destructive-command blocking, or secret/env access
  controls are requested but cannot be enforced or observed by the driver/sandbox,
  autopilot refuses to start or rejects the contract as unsupported.
- The kernel's `permission.checked → "delegated_to_driver"` becomes, for
  autopilot, `enforced_or_blocked`.

**Enforceable bounds in the first driver.** Because the scope gate reads a
post-step diff, the bounds `codex-exec` can actually enforce or observe today are:
file scope, `forbiddenChanges`, `maxChangedFiles` / `maxDiffLines`, the verify
matrix, and `maxRuntimeMs` / `maxRepairIterations`. Non-file bounds
(`networkPolicy`, destructive-command blocking, secret/env access) are honored
only when the sandbox mode observably enforces them; otherwise the start gate
blocks or rejects that field as unsupported rather than pretending to enforce it.

## Worktree isolation

Long unattended runs execute in a **dedicated git worktree**, not the primary
checkout. This is the safety net that makes detect-then-stop safe: a scope
violation lands in the isolated worktree and is caught by the scope gate before
it can reach the user's working tree. It also separates autopilot output from
unfinished local work.

## Stop conditions

Autopilot stops (and reports a boundary, not a failure) on any of:

- policy/scope violation (out-of-`scope.allow` path, `forbiddenChanges` touched,
  new dependency, workflow change, or another bound that the start gate proved
  enforceable or observable);
- repeated verification failure beyond `maxRepairIterations`;
- `maxChangedFiles` / `maxDiffLines` exceeded;
- `maxRuntimeMs` timeout;
- dirty/stale evidence (workspace fingerprint says evidence is no longer fresh).

Each stop records the bound it hit. A future autopilot-specific resume path
should carry the original contract hash, stop reason, raised bound, and new
approval record forward. The existing `cx resume` can inspire the UX, but it is
not by itself sufficient for autopilot continuation semantics.

## Evidence bundle

The final artifact is a **PR-ready evidence bundle**: the approved contract, the
run ledger, the four gate results, the diff, and the criteria-satisfaction
evidence — enough to review and open a PR without trusting the agent's prose.

## Multi-engine relay extension

The future Codex-author / reviewer-engine workflow is split into
[doc 15](15-multi-engine-relay-autopilot.md). That extension records
author/reviewer rounds, stage full-gate evidence, and convergence agreements, but
keeps convergence advisory: final completion still requires the verification and
evidence gates in this contract.

## Surface

```bash
cx autopilot plan --from docs/PRD.md --json     # proposed contract (draft, needs approval)
cx autopilot run --policy .codexus/autopilot.json --json   # worktree + strict gates
```

Both are `--json`-first and reuse the ledger/event/gate shapes. `autopilot run`
output is `experimental`-stable-marked (see the readiness plan) until the surface
settles.

## Non-Goals

- Does not pre-block agent file writes (it isolates and detects; Codex sandbox
  owns prevention).
- Does not derive acceptance criteria as fact; the contract is human-approved.
- Does not add a parallel gate subsystem; it composes existing gates.
- Does not claim "unattended" without proving driver approval/sandbox capability.
- Does not claim network, command, or secret/env policy enforcement without a
  supported observation/enforcement surface.
- Does not treat a contract-bound stop as a failure.
- Does not bake Codex specifics into the contract/scope/gate layer.
- Not part of 0.1.0 stable; ships experimental on the 0.2 / 0.3 track.

## First Slice

1. autopilot contract **schema artifact + validation** (empty-scope rejected,
   unknown keys rejected, `forbiddenChanges` precedence).
2. **scope gate, report-only**: compute post-step diff vs contract in a worktree
   and report violations without enforcing.
3. gate composition over the existing four gates + stop conditions.
4. **capability × policy start gate** (blocking, not `option_ignored`).
5. `cx autopilot plan --from docs/...` → proposed contract (human-approval draft).
6. `cx autopilot run` (worktree + strict gates) once the report-only scope gate
   is trusted; then the evidence bundle.

Dogfood on a small Codexus task first.

## Acceptance Criteria

- The contract is schema-validated; an empty `scope.allow` and unknown keys are
  rejected; `forbiddenChanges` overrides `scope.allow`.
- An approved contract includes source document hashes, an approval artifact, and
  a canonical subject hash; a tampered contract is refused before execution.
- `autopilot plan` output is explicitly a *draft* requiring human approval, never
  a derived fact.
- A scope violation in a worktree is detected post-step and stops the run with
  the specific bound recorded; the primary checkout is never touched.
- `autopilot run` blocks at start when the driver cannot guarantee the requested
  approval/sandbox mode or any requested network/command/secret policy surface
  (no silent `option_ignored`, no warning-only downgrade).
- Completion requires all four gates green; heuristics/informational unknowns
  never move the completion exit code.
- A bound-hit stop is reported as a boundary (resumable), not a failure.
- The whole loop is exercised with the mock driver (engine-agnostic, no live
  Codex required).
- The feature self-reports `stability: experimental` and is excluded from the
  0.1.0 stable contract.
