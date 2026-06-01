# Codex Task Panel Projection

[Korean](../ko/design/16-codex-task-panel-projection.md)

Date: 2026-06-02
Status: proposed 0.2 design track.

## Decision

Codexus should add a durable **session task state** and project it into the
Codex native task panel when Codexus is running inside an interactive Codex
session.

The ownership boundary is:

```text
.codexus/session/tasks.json
        -> cx session tasks list/update
        -> Codexus Codex adapter
        -> Codex host plan tool
        -> native lower task panel
```

Codexus owns the durable task state. The Codex task panel is only a projection.
If the host cannot display a native task panel, Codexus still has the same task
state through `cx session tasks` and `cx session hud`.

## Why This Fits Codexus

Long supervised runs need a visible work queue: what is done, what is active,
what is blocked, and which checks still remain. Codex already has a useful
native UI for this shape, but an external `cx` process cannot assume direct
control of that host UI. Codexus can still make the experience work by keeping
the task list as local evidence-backed state and asking the Codex-native adapter
to mirror that state into the host panel.

This keeps the Codexus rule intact:

- durable truth lives in `.codexus`;
- host UI is a projection;
- model or UI completion is advisory;
- final acceptance remains evidence-gated.

## Task State

The first artifact may live at `.codexus/session/tasks.json` or as a session
state migration once the shape is stable. A separate file is simpler for the
first slice because it can evolve without migrating the whole session record.

Candidate artifact:

```json
{
  "schemaVersion": 1,
  "type": "codexus.session.tasks",
  "sessionId": "session_...",
  "updatedAt": "2026-06-02T00:00:00.000Z",
  "tasks": [
    {
      "taskId": "task_...",
      "order": 1,
      "title": "Add graph schema and build/check core",
      "status": "in_progress",
      "kind": "implementation",
      "source": "autopilot",
      "createdAt": "2026-06-02T00:00:00.000Z",
      "updatedAt": "2026-06-02T00:10:00.000Z",
      "evidenceLinks": [
        ".codexus/session/verification/verification_.../verification.json"
      ],
      "related": {
        "acceptanceCriteria": ["AC-1"],
        "verificationRows": ["VM-1"],
        "relayStage": null,
        "subagentTaskId": null
      }
    }
  ],
  "projection": {
    "lastProjectedAt": null,
    "surface": null,
    "adapter": null
  }
}
```

Allowed task status:

- `pending`: known work that has not started;
- `in_progress`: the current active item;
- `completed`: the item is marked done for workflow purposes;
- `blocked`: progress stopped on a boundary or missing input;
- `skipped`: explicitly not needed for this run.

Only one task should be `in_progress` at a time. That rule is structural and can
be validated. It does not mean the active task is correct or sufficient.

## Status Semantics

Task status is a workflow projection, not completion authority.

Gateable facts:

- task artifact schema is valid;
- task ids are unique;
- task order is stable and unique;
- at most one task is `in_progress`;
- every evidence link is path-sanitized and points inside an allowed Codexus
  artifact bucket;
- linked verification artifacts exist and are fresh when the task claims
  verification evidence.

Advisory claims:

- a task title accurately captures the needed work;
- `completed` means the user-facing goal is satisfied;
- an acceptance criterion is satisfied;
- a review found no remaining issue;
- the projected Codex panel is up to date.

Completion of an autopilot or relay run still requires the gates in
[doc 12](12-autopilot-contract.md) and [doc 15](15-multi-engine-relay-autopilot.md).
The task list can make progress visible, but it cannot replace verification,
scope, supply-chain, slop, or graph gates.

## Command Surface

Proposed future commands:

```bash
cx session tasks list --json
cx session tasks add --title "Wire CLI and tests" --kind implementation --json
cx session tasks update <task-id> --status in_progress --json
cx session tasks complete <task-id> --evidence .codexus/session/verification/.../verification.json --json
cx session tasks block <task-id> --reason "scope boundary reached" --json
cx session tasks reconcile --from .codexus/autopilot/<id>/plan.json --json
```

`cx session hud --json` should include a compact summary:

```json
{
  "tasks": {
    "total": 5,
    "completed": 1,
    "inProgress": "task_...",
    "blocked": 0,
    "path": ".codexus/session/tasks.json"
  }
}
```

The non-JSON HUD can show the same line as a compact status:

```text
Tasks: 1/5 complete, active task_...
```

## Codex Native Projection

When the Codexus skill is active inside Codex, the adapter can:

1. run `cx session tasks list --json`;
2. map Codexus task statuses to the host plan statuses;
3. call the Codex host plan tool with the ordered task list;
4. write a projection timestamp back to Codexus state if the projection
   succeeds.

Mapping:

| Codexus status | Host panel status |
| --- | --- |
| `pending` | `pending` |
| `in_progress` | `in_progress` |
| `completed` | `completed` |
| `blocked` | `pending` plus a blocked reason in the title or side summary |
| `skipped` | omitted by default, included in JSON/history |

The host panel API is not a core dependency. If the adapter is not running in a
Codex host that exposes a plan tool, projection degrades to normal CLI/HUD
output. Codexus must not call private backend APIs or depend on undocumented
host internals from the core package.

## Autopilot Integration

Autopilot can produce task rows from the approved contract:

- each implementation plan step becomes a task;
- each acceptance criterion maps to one or more verification matrix rows;
- verification tasks link to verification artifacts;
- scope, slop, supply-chain, and graph checks appear as gate tasks;
- boundary stops turn the active task into `blocked` with the stop artifact
  linked.

This gives long unattended runs the same UX as a manual Codex plan, while keeping
the source of truth in the ledger.

## Relay Integration

The multi-engine relay can project stage work:

- `issue`, `design`, `plan`, and `implementation` stages become task groups;
- `delta-check` rounds may update the active task;
- `full-gate` reviews become verification/review tasks;
- convergence agreements may complete a stage task, but final run completion
  still requires evidence gates.

## Rehydration

When a Codex conversation resumes, the adapter should read the task artifact and
re-project it before continuing work. This makes the native panel recoverable
from local Codexus state instead of depending on ephemeral host memory.

Rehydration should not overwrite newer Codexus task state with stale host panel
state. Direction is one way by default:

```text
Codexus task state -> host panel projection
```

Host panel edits, if a future host supports them, need an explicit import path
and conflict check.

## Non-Goals

- Do not make the native Codex panel the source of truth.
- Do not require a native host panel for Codexus session tasks to work.
- Do not use private Codex backend APIs to control the panel.
- Do not treat a checked-off UI item as verification evidence.
- Do not block the 0.1.x stable CLI on this UI projection.

## First Slice

1. Add the `codexus.session.tasks` schema artifact.
2. Add `cx session tasks list/add/update/complete/block --json`.
3. Add task summary to `cx session hud --json`.
4. Update the Codexus skill guidance so the adapter mirrors tasks into the host
   plan panel when the plan tool is available.
5. Add tests proving task status cannot complete a run when verification fails.
6. Dogfood with a docs-only autopilot plan before connecting it to code-writing
   autopilot.
