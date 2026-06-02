# Operational Control Invariants

[Korean](../ko/design/17-operational-control-invariants.md)

Date: 2026-06-02
Status: experimental first slice implemented; broader task-artifact and promotion work remains on the 0.2 / 0.3 track.

## Implementation Status

Implemented now:

- `cx autopilot presets list --json` exposes the named autonomy presets and the
  default preset.
- Autopilot draft contracts carry `autonomyPreset` as schema-validated contract
  metadata.
- `cx policy catalog check --json` reports observed/advisory/unavailable control
  findings without turning warnings into completion gates.
- Change evidence now derives `riskFacts` for blast radius, dependency,
  schema, migration, and out-of-scope paths.

Still deferred:

- task artifacts and task-panel projection promotion;
- active policy enforcement beyond existing start/stop gates;
- broader runtime control dashboards beyond the current deferred self-report
  summary.

## Decision

Codexus should add an **operational control invariant** layer for long-running
agent work. This layer turns recurring operational concerns into local,
auditable artifacts and derivable checks:

- autonomy presets for how far a run may proceed without new human input;
- policy catalogs for destructive intent, blast radius, and unsupported driver
  capabilities;
- docs-code invariants that compare declared project shape with measured files;
- ledger-derived loop breakers for repeated failures and unproductive repair;
- decision records that preserve constraints, rejected alternatives, and
  verification links;
- read-only task and HUD projections for human situational awareness.

This is not a new completion authority. It is a control plane over the existing
Codexus evidence model:

```text
declared control policy
  -> capability check
  -> bounded execution
  -> local evidence
  -> structural gates + verification gates
  -> advisory summaries
```

Completion remains the responsibility of evidence gates: verification results,
scope checks, supply-chain facts, slop checks, graph freshness, schema validity,
and other derivable local facts.

## Problem Framing

Long supervised runs become unsafe or inefficient when the harness cannot answer
basic operational questions:

- How much autonomy was actually granted?
- Which files, commands, and repository areas were in scope?
- Which declared docs, skills, schemas, commands, or design notes have drifted
  from the measured repository?
- Which risky changes were detected, and were they enforced, only observed, or
  merely advisory?
- Why did the agent choose one approach over another?
- Is a repair loop making progress, or repeating the same failure?
- Can the user see progress without trusting ephemeral UI state?

Codexus already has the important foundation: local ledgers, schema artifacts,
verification events, workspace fingerprints, and an evidence-first completion
model. The operational control invariant layer should make those controls
explicit, inspectable, and reusable.

## Core Rule

Separate **control**, **evidence**, and **judgment**.

- Control decides how far an agent is allowed to continue before stopping.
- Evidence decides what can be accepted as true.
- Judgment explains, summarizes, prioritizes, or recommends.

Only evidence can gate completion. Control can stop a run at a boundary, but it
does not prove that the result is correct. Judgment can help humans understand a
run, but it cannot become a pass condition unless backed by a derivable artifact.

## Autonomy Presets

Autopilot should expose named autonomy presets rather than a single vague
"automatic" mode. A preset is a contract template, not a trust score.

Candidate presets:

| Preset | Behavior |
| --- | --- |
| `manual` | Produce plans, evidence, and status only. Do not execute unattended change steps. |
| `guided` | Execute one approved stage, then stop at the next decision boundary. |
| `contracted` | Execute within an approved autopilot contract until a verification or scope boundary is reached. |
| `gated-auto` | Run bounded repair loops while scope, capability, and verification gates remain satisfied. |
| `extended-auto` | Continue through multiple stages only when every policy field is enforceable or observable and checkpoints stay fresh. |

Preset selection should materialize into an approved contract. Runtime code should
not infer a higher autonomy level from historical success, model confidence, or a
reviewer's agreement.

Gateable facts:

- the selected preset is known;
- the approved contract records the selected preset;
- driver capabilities satisfy every required policy field;
- stop conditions, repair budgets, and scope limits are present;
- a run stopped when a hard boundary was reached.

Advisory claims:

- a higher preset seems safe;
- a task is simple enough for longer autonomy;
- a model or reviewer is confident;
- a prior run history implies future reliability.

## Policy Catalogs

Risk detection should be expressed as a policy catalog with transparent status:

```json
{
  "ruleId": "command.destructive.remove-recursive",
  "category": "destructive-command",
  "severity": "high",
  "signal": {
    "kind": "command-pattern",
    "pattern": "recursive removal"
  },
  "capabilityRequirement": "driver.command.preflight",
  "defaultAction": "block-or-boundary-stop"
}
```

Every finding must state whether it was:

- `enforced`: the selected driver or sandbox blocked the action;
- `observed`: Codexus detected the action or diff after it occurred;
- `advisory`: Codexus inferred risk but cannot prove or enforce it;
- `unavailable`: the policy requires a capability the current runtime lacks.

This prevents a warning from being mistaken for a gate.

Useful catalogs:

- destructive command intent;
- protected branch and force-push attempts;
- secret or environment variable access;
- dependency and lockfile changes;
- schema, migration, or data-destructive changes;
- mass deletion, mass creation, and large diff size;
- cross-worktree, symlink, path traversal, and out-of-scope paths.

The catalog can guide both autopilot start gates and post-step boundary stops.
It must report unsupported capability fields loudly instead of silently
downgrading them.

## Docs-Code Invariants

Codexus should treat project documentation as a declared interface and compare it
with the measured repository. This is a natural extension of `cx repo check`.

Examples of gateable docs-code invariants:

- every design document listed in the documentation index exists;
- every design document with a translation link points to an existing file;
- schemas referenced by docs or CLI help exist and validate;
- command names advertised in docs are present in the CLI registry;
- public package version, changelog, and release evidence agree when a release
  check is running;
- skills have required metadata and referenced helper scripts exist;
- generated indexes are fresh relative to the scoped workspace fingerprint.

Examples that are not gateable without review:

- a design document is persuasive;
- a README explains the product well;
- a command's docs are complete enough for all users;
- a skill prompt is high quality.

Docs-code checks should prefer measured facts over hard-coded counts. Counts are
useful only when they are declared as part of a release contract and scoped to a
known inventory.

## Decision Records

Long runs need explicit decision artifacts. A decision record should capture why
a path was chosen and which alternatives were rejected:

```json
{
  "schemaVersion": 1,
  "stability": "experimental",
  "type": "codexus.decision",
  "decisionId": "decision_...",
  "kind": "boundary",
  "createdAt": "2026-06-02T00:00:00.000Z",
  "cwd": "/path/to/workspace",
  "summary": "Use post-step scope gates with worktree isolation",
  "rationale": "Codexus cannot pre-block writes made by the engine.",
  "constraints": [
    "Codexus cannot pre-block writes made by the engine"
  ],
  "rejectedAlternatives": [
    "Treat scope extraction as a derivable fact"
  ],
  "evidenceLinks": [
    ".codexus/runs/run_.../verification/verification.json"
  ],
  "authority": "advisory",
  "completionAuthority": false
}
```

Gateable facts:

- decision artifact schema is valid;
- linked evidence paths are relative and sanitized;
- rejected alternatives are non-empty strings when present.

Advisory claims:

- the rationale is correct;
- the chosen path is optimal;
- the reversibility label is accurate.

Decision records complement commit trailers. Commits preserve repository history;
run decisions preserve agent reasoning at the moment the work was performed.

## Loop Breakers

Loop detection should be reconstructed from the ledger, not held only in process
memory. Codexus can stop a run when evidence shows repeated non-progress.

Candidate loop signals:

- the same verification command fails with the same normalized error repeatedly;
- the same file is edited and reverted across multiple repair attempts;
- repair attempts exceed the approved budget;
- an agent repeatedly changes files outside the same scope boundary;
- the active task remains `in_progress` while no new evidence appears;
- graph, supply-chain, or slop gates fail with the same finding after repair.

Loop breakers are boundary stops, not proof of failure. The output should say:

```text
Stopped: repeated verification failure boundary reached.
Reason: npm test failed 3 times with the same normalized error.
Next action: human review or contract update required.
```

## Task And HUD Projection

Operational state should be visible without making UI state authoritative.

Task and HUD projections should read from durable Codexus artifacts:

- task state from the session task artifact;
- run status from the ledger;
- active verification from verification artifacts;
- policy findings from change evidence;
- loop status from ledger-derived counters;
- decision summaries from decision artifacts.

The projection may appear in a native host task panel, CLI HUD, or JSON output.
The source of truth remains Codexus state. A checked-off UI item is never
verification evidence.

See [doc 16](16-codex-task-panel-projection.md) for the task panel projection
model.

## Command Surface

Possible future commands:

```bash
cx repo check --include docs-code --json
cx autopilot presets list --json
cx autopilot contract validate .codexus/autopilot.json --json
cx policy catalog check --json
cx session decision record --summary <text> --json
cx session decision list --json
cx session decision status <decision-id> --json
cx session loop --json
cx session hud --json
```

These commands should be additive. `cx repo check --gate` can include stable
docs-code invariants only after the checks are scoped, deterministic, and free of
semantic judgment.

## Clean Implementation Boundary

Implementation must be Codexus-native:

- do not copy external source code, prompts, tables, thresholds, identifiers,
  command names, or user-facing prose;
- write Codexus contracts first, then implement against those contracts;
- use existing Codexus utilities for globbing, fingerprints, schemas, ledger
  events, and CLI JSON output;
- classify every finding as derivable fact, enforceable policy, observed fact,
  advisory claim, or unavailable capability;
- if any outside implementation artifact is intentionally reused, handle license
  and notice obligations explicitly before merge.

The desired output is not a port of another system. It is a Codexus control model
that preserves the existing evidence-first identity.

## Non-Goals

- Do not add a new hidden trust score that can approve work.
- Do not treat model confidence, reviewer convergence, or task completion as a
  gate.
- Do not implement a host-specific pre-write firewall in Codexus core.
- Do not make policy warnings look like enforced blocks.
- Do not require a native UI for task visibility.
- Do not make docs-code checks depend on network calls.
- Do not copy third-party implementation details into Codexus.

## First Slice

1. Implemented first pass: add a small docs-code invariant pass to
   `cx repo check`:
   - documentation index links exist;
   - English/Korean design translation links resolve;
   - schema references point to existing schema files where declared;
   - source `*_deferred` self-report claims are mirrored in both
     implementation-status documents;
   - the JSON output aggregates deferred self-reports so intentionally unbuilt
     surfaces do not stay hidden in individual command artifacts.
2. Add `riskFacts` to change evidence:
   - changed file count;
   - diff size;
   - dependency/config/schema/migration file touch;
   - out-of-scope path touch.
3. Add autonomy preset names to the autopilot contract schema as contract
   metadata, without changing completion gates.
4. Implemented: add a `codexus.decision` artifact schema and
   `cx session decision record/list/status` commands. The artifact is advisory
   and always carries `completionAuthority: false`.
5. Implemented: add `cx session loop --json`, a ledger-derived repeated
   verification failure checker. The loop result is a boundary signal, not
   completion evidence.
6. Implemented: extend `cx session status --json`, `cx session hud --json`,
   and `doctor --json` with a deferred self-report control summary derived from
   the same docs-code invariant model as `cx repo check`. The summary is
   advisory/control metadata and carries `completionAuthority: false`.
7. Partially implemented: extend `cx session status --json` and
   `cx session hud --json` with decision, risk, and loop summaries. Task
   artifacts remain a separate future slice.
