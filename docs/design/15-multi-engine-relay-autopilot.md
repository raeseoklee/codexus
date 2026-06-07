# Multi-Engine Relay Autopilot

[Korean](../ko/design/15-multi-engine-relay-autopilot.md)

Status: experimental recorder/checker first slice implemented; active relay
execution and external engine adapters remain deferred 0.2/0.3 design work.

This document extends the [autopilot contract](12-autopilot-contract.md) with a
multi-engine review loop. It is informed by the ai-devkit `agent-relay` /
`pipe-prop` / `pipe-rv` workflow, but Codexus must not import that MCP server or
its dotfiles/hook system into core.

## Decision

Codexus should add a future **multi-engine relay mode** for autopilot:

```text
author engine proposes work → review engine reviews → author responds →
rounds continue until convergence or boundary stop → completion still requires evidence gates
```

The relay is useful because it turns the manual Codex-author / Claude-reviewer
workflow into a durable, bounded, resumable protocol. The relay is not completion
authority. A convergence agreement is a model-judgment artifact; completion
authority remains the existing verification, scope, supply-chain, slop, and
future graph gates.

## Fit With Codexus

This feature belongs above the autopilot contract, not inside the workflow
kernel:

- the approved contract still defines scope, acceptance criteria, verification
  commands, budgets, stop conditions, and the approval artifact;
- the relay adds an independent reviewer lane and round protocol;
- the ledger records submissions, reviews, rebuttals, convergence declarations,
  stops, and stage-gate evidence;
- the final state is accepted only if the normal Codexus gates are green.

This preserves Codexus's core rule: agent prose and model consensus can help
choose the next action, but cannot replace evidence.

## Relay Roles

Initial roles:

- `author-engine`: proposes or edits the work. In the first product path this is
  likely Codex through the existing driver.
- `review-engine`: performs independent review and does not mutate source files.
  In an external setup this may be Claude Code, another Codex driver, a human
  reviewer artifact, or an MCP-backed external relay.

Both roles are descriptors:

```json
{
  "engine": "codex",
  "driverId": "codex-exec",
  "role": "author-engine",
  "capabilities": {
    "writes": "gated",
    "review": false,
    "verification": "external"
  }
}
```

The descriptor model prevents a second engine from leaking into the normalized
ledger schema. Engine-specific communication belongs in an adapter, not in the
kernel.

## Command Surface

Implemented first-slice surface:

```bash
cx autopilot relay record --stage plan --artifact docs/plan.md --author-file author.json --review-file review.json --json
cx autopilot relay stage-gate --stage plan --scope full-gate --artifact docs/plan.md --verification-status passed --json
cx autopilot relay check-agreement --agreement agreement.json --stage-gate <stage-gate.json> --verification-status failed --gate --json
cx autopilot relay status <relay-id> --json
```

This surface is `stability: "experimental"` and recorder/checker only. It
imports externally produced author/reviewer artifacts, records stage-gate
evidence, validates convergence agreements, and proves that convergence cannot
complete work when verification fails. It does not spawn a second engine.

Proposed future active relay surface:

```bash
cx autopilot relay plan --from docs/PRD.md --review-engine claude-code --json
cx autopilot relay run --policy .codexus/autopilot.json --review-engine claude-code --json
cx autopilot relay status <relay-id> --json
cx autopilot relay resume <relay-id> --json
```

`relay plan` still produces a draft contract. `relay run` requires an approved
contract and a start-gate proof, exactly like normal autopilot.

The first implementation can be report-only: run a single author/reviewer round,
record artifacts, and prove that convergence does not bypass verification.
For that first slice, `review-engine` means **artifact import only** unless a
supported adapter already exists. Codexus should record an externally produced
review artifact and validate its shape; it must not imply that it can spawn
Claude Code, another engine, or an MCP relay before a descriptor-backed adapter
is implemented and gated.

## Stage Model

Relay stages are intentionally small:

- `issue`: problem statement and evidence scope;
- `design`: design and non-goals;
- `plan`: implementation plan and verification matrix;
- `implementation`: code, tests, docs, and evidence bundle.

Stages may be skipped when the approved contract already provides equivalent
artifacts, but the skip must be explicit and recorded.

Each stage has two review scopes:

- `delta-check`: checks whether the previous round's findings were addressed.
  Useful for iteration, never sufficient for stage convergence.
- `full-gate`: fresh-read review of the current stage artifact and relevant
  sources. Required before stage convergence can be accepted.

## Artifact Shapes

Relay session artifact:

```json
{
  "schemaVersion": 1,
  "type": "codexus.autopilot.relay.session",
  "stability": "experimental",
  "relayId": "relay-...",
  "contractSubjectHash": "sha256:...",
  "stage": "design",
  "round": 3,
  "status": "in_progress",
  "authorEngine": { "engine": "codex", "driverId": "codex-exec" },
  "reviewEngine": { "engine": "claude-code", "driverId": "external-relay" },
  "submissions": [],
  "reviews": [],
  "stageGateEvidence": [],
  "convergenceAgreement": null,
  "stop": null
}
```

Stage-gate evidence artifact:

```json
{
  "schemaVersion": 1,
  "type": "codexus.autopilot.stage-gate-evidence",
  "stage": "plan",
  "scope": "full-gate",
  "role": "review-engine",
  "freshReadArtifacts": [],
  "verificationMatrix": [],
  "findings": [],
  "residualFindingCount": 0,
  "verificationResults": [],
  "heuristicClaims": [],
  "derivableFacts": []
}
```

Convergence agreement artifact:

```json
{
  "schemaVersion": 1,
  "stability": "experimental",
  "type": "codexus.autopilot.convergence-agreement",
  "stage": "plan",
  "round": 4,
  "declarations": [
    {
      "role": "author-engine",
      "engine": "codex",
      "artifactHash": "sha256:...",
      "declaredAt": "2026-06-01T00:00:00.000Z"
    },
    {
      "role": "review-engine",
      "engine": "claude-code",
      "artifactHash": "sha256:...",
      "declaredAt": "2026-06-01T00:01:00.000Z"
    }
  ],
  "unresolvedHighFindings": 0,
  "decisionNeeded": false
}
```

Unlike the ai-devkit prototype, a single `declare_convergence` call is not enough
for Codexus convergence. Codexus convergence requires a structurally valid
agreement artifact with declarations from every required role, plus fresh
full-gate evidence for the stage.

Required role declarations must also reference the same `artifactHash` for the
stage artifact under review. Declarations over different artifact hashes are not
convergence; they show that the roles agreed on different versions and should be
reported as a structural evidence gap.

## Gate Semantics

Gateable structural invariants:

- relay artifact schema is valid;
- contract subject hash matches the approved autopilot contract;
- required role descriptors are present and compatible with the requested relay;
- every stage transition is legal;
- every convergence agreement contains the required role declarations;
- every required convergence declaration references the same stage
  `artifactHash`;
- required stage-gate evidence artifacts are present and fresh;
- verification commands attached to the approved contract pass;
- scope, supply-chain, slop, and other Codexus gates pass.

Advisory-only claims:

- "both engines agree";
- "the reviewer found no issue";
- "the author rebuttal is convincing";
- "the design is good enough";
- "the implementation matches intent" unless backed by a derivable local check.

`convergenceAgreement` may unlock the next stage, but it does not mark the run
complete. Final completion still requires the approved verification and evidence
gates.

## Task Projection

Relay stages should project into the durable task model described in
[doc 16](16-codex-task-panel-projection.md):

- `issue`, `design`, `plan`, and `implementation` can appear as stage tasks;
- `delta-check` and `full-gate` rounds can update review tasks;
- convergence can complete a stage task only as workflow state;
- final run completion still depends on Codexus gates, not the host task panel.

## Acceptance Criteria To Verification Matrix

The relay should make `acceptanceCriteria` executable by requiring a verification
matrix before implementation:

```json
{
  "acceptanceCriterion": "AC-1",
  "planStep": "Step 2",
  "verification": "npm test -- parser.test.ts",
  "status": "planned",
  "evidencePath": null
}
```

Rules:

- implementation convergence requires at least one approved acceptance
  criterion before verification can be mapped;
- every approved acceptance criterion must map to at least one verification row;
- implementation cannot converge on `delta-check` only;
- implementation convergence requires the latest verification matrix rows to have
  passing local evidence paths or an approved deferred reason;
- a matrix evidence path must resolve to a local evidence artifact file, not just
  an existing path;
- a patch log is supporting evidence, not the source of truth for acceptance.

Current implementation status: the first structural matrix gate is implemented
for implementation-stage convergence. `cx autopilot relay stage-gate` can import
matrix rows with `--verification-matrix <path>` and approved acceptance criteria
with `--acceptance-criteria <path>` or repeated `--acceptance-criterion <id>`.
`cx autopilot relay check-agreement --gate` fails implementation convergence
when the matrix is missing, when no approved acceptance criteria are present,
when an approved criterion has no row, when a non-deferred row lacks passing
evidence, or when its evidence path does not resolve to a local artifact file.
Approved deferrals must be explicit in the matrix row; model agreement alone
never fills the matrix.

## Stop Conditions

Relay stops with `decision_needed`, not failure, when:

- the same material finding remains unresolved for three rounds;
- `maxRounds`, `maxRuntimeMs`, or wait budget is exceeded;
- either engine disconnects or cannot produce required full-gate evidence;
- a stage requires a product/policy decision not present in the approved
  contract;
- the relay adapter cannot prove it is communicating with the intended engine;
- normal autopilot scope or verification gates fail beyond the approved repair
  budget.

The stop artifact records the smallest decision question that would allow a
resume.

## Non-Goals

- Do not vendor ai-devkit's `agent-relay` MCP server into Codexus core.
- Do not make Telegram, warmup jobs, dotfiles sync, or MCP operations part of
  Codexus autopilot.
- Do not install global hooks or project hooks as part of relay mode.
- Do not treat model agreement as verification.
- Do not let the review engine mutate source files in the first slice.
- Do not merge ai-devkit's source-of-truth system with the Codexus ledger.

## First Slice

1. Done: relay session, stage-gate evidence, and convergence-agreement schema
   artifacts plus focused validation.
2. Done: report-only recording of a single author/reviewer round through
   `cx autopilot relay record`.
3. Done: the first review engine path is external artifact import only
   (`driverId: "external-relay"`, `spawn: false`).
4. Done: stage-gate evidence distinguishes `delta-check` from `full-gate`.
5. Done: convergence validation requires both role declarations over the same
   stage artifact hash.
6. Done: tests prove a valid convergence agreement cannot complete a run when
   verification fails.
7. Done: implementation-stage convergence enforces the acceptance-criteria to
   verification matrix before completion.
8. Deferred: only then consider an external relay adapter.

Dogfood target: use Codexus docs work where Codex authors a proposal and an
external reviewer produces a review artifact, but keep completion tied to
`repo check`, syntax checks, and other existing gates.
