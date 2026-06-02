# Subagent Evidence Supervision

[Korean](../ko/design/09-subagent-evidence-supervision.md)

Date: 2026-05-30
Status: recorder, completion handoff, and launcher contract implemented; active spawn deferred

## Decision

Codexus should add a Codex-native subagent evidence lane, but not replace the
CLI harness core with subagents and not become a general subagent orchestrator.

The stable core remains:

```text
Codexus kernel / ledger / verification / policy / memory / replay
```

Subagents are claim producers. Codexus is the supervisor and recorder. In the
first slice, subagents may gather read-only observations, review changes, or
propose patches, but Codexus only records their claims and links them to later
verification or review evidence. Completion remains verification-gated.

The invariant:

> Subagents may produce claims; Codexus records claims, but only verification
> promotes them to completion evidence.

## Why Add This

The external `cx run --driver codex-exec` path is strong for automation and
reproducible supervised runs, but it starts a separate non-interactive Codex
process. Inside an active Codex session, native subagents can feel more natural:

- read-only exploration can run in parallel with the main session,
- review and test-diagnosis lanes can produce bounded evidence without leaving
  the current conversation,
- always-on session UX can use subagents for low-risk evidence gathering without
  forcing the user to type `codexus` explicitly.

The value is not "more agents" or parallel task execution. The value is putting
subagent output through the same evidence-first supervision model. Codexus
accepts claim capture, ledger linkage, and verification gating; it does not need
to become a general task-parallel orchestration layer.

## Runtime Shape

```text
Current Codex session
  -> user or Codex agent spawns/uses a native subagent
  -> Codexus records the subagent claim bundle
  -> .codexus/session/subagents/<task-id>/result.json
  -> Codexus status reports unverified claims separately from evidence
  -> verification/review may later promote claims to evidence
```

The session supervisor owns record shape, state writes, status projection, and
verification handoff. It does not need to own subagent spawning in the first
slice.

## Evidence Contract

Each subagent result should be recorded as a typed artifact:

```json
{
  "schemaVersion": 1,
  "type": "codexus.session.subagent_result",
  "taskId": "subagent_...",
  "createdAt": "2026-05-30T00:00:00.000Z",
  "role": "explore",
  "mode": "read_only",
  "promptHash": "sha256:...",
  "contextHash": "sha256:...",
  "claims": [],
  "filesRead": [],
  "filesSuggested": [],
  "commandsSuggested": [],
  "confidence": "low|medium|high",
  "limitations": [],
  "verificationRequired": true,
  "verificationStatus": "not_run|passed|failed|stale"
}
```

Claims and evidence stay structurally separate:

- `claims`: what the subagent says,
- `evidenceLinks`: verification, replay, manual review, or artifact references
  that support or reject those claims,
- `verificationStatus`: the claim bundle's current gate state.

The session state should link these artifacts by id rather than embedding large
reports directly:

```text
.codexus/session/subagents/<task-id>/
  result.json
  report.md
```

Subagent output is evidence-adjacent until a verification or explicit review
artifact promotes it. It must never contribute to `evidenceFresh`; Bundle A
freshness remains verification-only.

## Bundle A: Recorder Only

Implemented: the first implementation bundle is the recording half:

- define the subagent result envelope,
- write subagent artifacts under `.codexus/session/subagents/`,
- validate result and launch artifacts with `subagent-result` and
  `subagent-launch-contract` schema artifacts,
- link artifact ids from session state,
- make `session status` report unverified subagent claims separately from
  verification evidence,
- keep `evidenceFresh` driven only by session verification.

The active generation half is still deferred:

- Codexus does not spawn subagents from the CLI,
- Codexus does not schedule parallel work,
- Codexus does not apply patches from subagents,
- Codexus does not treat a subagent result as completion.

Active subagent drivers or delegation commands can come later, after recorder
semantics are stable.

## Bundle B: Launcher Contract

Implemented: `cx session subagent launch --role <role> --task <task> --json`
records a launcher contract artifact without claiming native launch support.

The command writes:

```text
.codexus/session/subagents/<task-id>/launch.json
```

and links it from session state with `status: "launch_unavailable"`. The JSON
payload is intentionally explicit:

- `stability: "deferred"`,
- `launcher.supported: false`,
- `launcher.capability: "unavailable"`,
- `policy.maySpawn: false`,
- `policy.mayModifyWorkspace: false`,
- `policy.completionAuthority: "verification"`,
- `handoff.completeCommand` for recording final claims produced by a hosted
  native subagent,
- `handoff.recordCommand` for recording a later externally produced claim
  bundle.

This is a contract, not a launcher bridge. It makes the unsupported state
auditable and gives the current Codex session a reversible handoff path if a
human or native Codex tool runs a subagent outside Codexus.

## Bundle C: Hosted Completion Handoff

Implemented: `cx session subagent complete --task-id <id> --claim <text>
--json` records the final claims produced by a native subagent that ran in the
current Codex session or another supported host surface. It also accepts
optional behavior checklist flags:

```bash
--assumptions-surfaced pass|fail|unknown
--simplest-sufficient-change pass|fail|unknown
--surgical-scope pass|fail|unknown
--verification-evidence-present pass|fail|unknown
```

This command deliberately does not launch the subagent. It closes the handoff
loop created by `launch`: the launcher contract records the bounded task and
unsupported spawn capability, the current Codex session may run a native
subagent if the runtime supports it, and `complete` writes the resulting claims
to:

```text
.codexus/session/subagents/<task-id>/result.json
```

The result uses `source.mode: "complete"` and replaces the
`launch_unavailable` session link with an attached claim link. It still does not
promote `evidenceFresh`; claims remain unverified until a separate verification,
replay, or explicit review artifact supports them.

Checklist values are subagent assertions recorded for later review. They do not
gate completion, refresh verification evidence, or prove that Codexus launched
the subagent.

## Automation Policy

Auto-allowed:

- read-only repository exploration,
- test-failure analysis from already captured logs,
- review of existing diffs,
- verification command recommendation.

Conditionally allowed:

- recording patch suggestions that the current session agent may apply
  deliberately later,
- recording parallel analysis that was launched outside Codexus,
- bounded subagent artifacts that write only `.codexus/` state.

Never auto:

- destructive commands,
- unverified final completion,
- automatic skill promotion,
- automatic prompt injection,
- separate external `cx run` sub-runs,
- Codexus-spawned parallel task execution in the first bundle,
- subagents that mutate source files without an explicit session step.

## Driver Boundary

Long term, if Codexus adds active subagent spawning, it should fit the
descriptor driver model:

```json
{
  "engine": "codex",
  "driverId": "native-subagent",
  "capabilities": {
    "parallel": true,
    "readOnly": true,
    "writes": "gated",
    "verification": "external"
  }
}
```

This keeps the kernel engine-neutral. Codex-specific subagent launch details
belong in the driver/adapter, not in the workflow kernel or normalized ledger
schema.

This is a later active-driver bundle, not Bundle A.

## Command Surface

First slice:

```bash
cx session subagent record --file <result.json> --json
cx session subagent attach --role explore --claim-file <claims.json> --json
cx session subagent launch --role explore --task "review the staged diff" --json
cx session subagent complete --task-id <id> --claim "bounded claim" --assumptions-surfaced pass --json
cx session subagent status <task-id> --json
```

Possible later aliases inside Codex:

```text
codexus, 방금 subagent review 결과를 claim bundle로 기록해줘.
codexus, failing test log 분석 claim을 verification evidence와 연결해줘.
codexus, subagent claims를 evidence와 분리해서 status에 보여줘.
```

## Acceptance Criteria

- Recorder commands work even when Codex native subagent spawning is unavailable.
- If a future active subagent launch fails, that failure is recorded as
  operational evidence and does not fail the harness correctness path.
- Subagent results never make `session status` report `evidenceFresh: true`.
- A subagent claim can link to `session verify`, `replay`, or manual review
  evidence, but cannot replace it.
- All subagent artifacts are reconstructable from `.codexus/session/subagents/`.
- Hosted completion handoff can turn a launcher contract into a recorded claim
  artifact without claiming Codexus performed the native spawn.
- `session status` distinguishes unverified subagent claims from verification
  evidence.
- Active spawning commands are capability-gated: if Codex native subagents are
  unavailable, Codexus reports `unavailable` with a recovery hint and records
  only launcher-contract evidence.
- No fixed frontier model names are hardcoded; inherit/default routing is
  preferred unless the caller explicitly chooses otherwise.

## Implementation Slices

1. Implemented: add read-only subagent result/launch artifact schemas and
   session-state links.
2. Implemented: add `cx session subagent record/attach` commands that only write
   `.codexus/` artifacts.
3. Implemented: add status integration with linked subagent ids, claim count,
   limitations, evidence links, and an explicit `unverifiedClaims` section.
4. Implemented: keep `evidenceFresh` verification-only and add regression tests
   for that invariant.
5. Implemented: add a launcher-contract command that records unavailable native
   launch state without claiming support or changing evidence freshness.
6. Implemented: add a hosted completion handoff command that records final
   claims from a subagent run by the current Codex session without changing
   evidence freshness.
7. Deferred: native subagent capability detection, spawning, and parallel
   planning until a supported Codex bridge exists.
