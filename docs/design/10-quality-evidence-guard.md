# Quality Evidence Guard (Slop Guard)

[Korean](../ko/design/10-quality-evidence-guard.md)

Date: 2026-05-30
Status: first slice implemented

## Decision

Codexus should add a quality evidence guard ("slop guard"), but as an
evidence-first quality gate, not a style linter. Its job is not "is this code
pretty" but:

> Does this change look like a verifiable problem-solution, or like an ungrounded
> generation with no backing evidence?

The guard surfaces ungrounded change as an evidence gap. It does not judge taste,
does not estimate whether a human or an AI wrote the code, and does not auto-edit.

"Slop guard" is the feature name. The output is not a risk grade (see below).

## The Honesty Constraint (most important)

Slop judgment is inherently heuristic, and heuristics are frequently wrong.
Codexus's core discipline is "never assert what cannot be derived." A guard that
emits a confident risk grade from heuristics would itself be ungrounded output —
the slop guard producing slop. That is the failure mode to avoid.

Therefore every finding is split into two claim tiers plus an explicit unknown
state, reusing the same claim/evidence model as
[subagent evidence supervision](09-subagent-evidence-supervision.md).

The line between the tiers is a single test:

> **Derivable test:** could two honest reviewers disagree about it, or could it be
> wrong because a tool/artifact is missing? If yes, it is **not** derivable.

- **Derivable fact/evidence** — objective facts that pass the test.
  Authoritative, but not always a gap or a gate.
- **Heuristic claim** — anything that fails the test (a judgment, an inference).
  Advisory only; never an automatic failure; always labeled heuristic with a
  confidence.
- **Unknown** — a fact that depends on a tool/artifact that is absent. Reported as
  `unknown`, never as a gap or a fail.

| Tier | Examples | Authority |
| --- | --- | --- |
| Derivable fact/evidence | test/typecheck/lint exit status; `verification: missing/stale` (the Bundle A evidence model); a new dependency in the manifest diff; source files changed with no test-file change in the same diff; files changed outside the declared scope **when a scope was declared** | fact — may gate only when the finding kind explicitly says so |
| Unknown | changed-line coverage when no coverage artifact exists; verification status when no session state exists | not a gap, not a fail |
| Heuristic claim | "this is a behavior change that needs a test", "unnecessary abstraction", dead code, duplicate function, name-only layer, placeholder/TODO | guess — advisory, never auto-fail |

Note what moved here: deciding that a diff is a *behavior change* (versus a
comment, rename, or pure refactor) is a judgment, so "behavior change needs a
test" is a heuristic claim. The derivable fact is only "source changed with no
test-file change in the same diff." Likewise, changed-line coverage is derivable
only when a coverage artifact is present; otherwise it is `unknown`.

A slop guard that does not itself separate derivable facts from heuristic guesses
and from unknowns would violate the project's own honesty principle.

Not every derivable fact is an evidence gap. For example, "source changed with no
test-file change" and "new dependency added" are objective facts, but they should
not automatically fail a change. The output therefore uses three buckets:

- `evidenceGaps`: derivable, gateable gaps such as missing/stale verification for
  the current workspace fingerprint.
- `derivableFacts`: objective non-gating facts or facts whose gate behavior is
  explicit in their `kind`.
- `heuristicClaims`: advisory guesses for human review.

## Evidence-Gap Is the Spine, Heuristics Are Garnish

The strongest and most honest slop signal is not heuristic at all: **a change
without fresh passing verification for the current workspace fingerprint.** That
is already implemented in the Bundle A evidence model (`verification: missing |
stale`, `dirtySinceLastVerify`, `evidenceFresh`).

So the guard is built spine-first:

1. Evidence-gap detection (objective, derived from the existing session evidence
   model) is the core.
2. Heuristic diff analysis is secondary, advisory garnish around it.

This keeps the guard from degrading into a heuristic linter and keeps its
authoritative output grounded in facts Codexus already proves.

## Three Lanes

### 1. Pre-change declaration (not enforcement)

A declared scope turns the diff lane's "unrelated change" finding from a guess
into an **objective** comparison (declared "fix parser" but touched
`src/billing/`). This cannot be enforced — a slop-producing agent will not
honestly declare bad intent — so treat it as a checklist/baseline, not a gate.

Declaration source (must exist for any scope finding to fire):

- First, a stateless flag: `cx slop check --scope "src/parser/**"` (no new state).
- Later, a persisted session intent (`cx session intent --scope ... --goal ...`)
  if the always-on overlay should carry it across turns.

Without a declared scope, scope findings are **not** produced (never fabricated).
The first implemented slice supports the stateless `--scope` flag; persisted
session intent remains deferred.

### 2. Diff lane

The diff base must be explicit. Codexus is session-native, so in-progress work is
usually the **uncommitted working tree**, not a past commit. Reuse the Bundle A
fingerprint scope model:

- Default: the working tree — staged + unstaged + untracked (the same scope the
  workspace fingerprint already covers).
- `--since <ref>`: an explicit committed range instead of the working tree.
- The output declares `diffBase`, `includesStaged`, and `includesUntracked` so the
  consumer knows exactly what was inspected.

From that diff:

- Derivable: source files changed with no test-file change in the same diff; a new
  dependency added; files changed outside the declared scope (only when a scope
  was declared).
- Heuristic claims (advisory, conservative): behavior-change-likely-needs-test,
  dead code, placeholder/TODO, unused/one-caller abstraction, near-duplicate
  function, name-only layer.

Heuristics bias toward **silence over false alarms**: high precision, stay quiet
when unsure. This mirrors the conflict-detection rule in
[memory quality curation](../plans/2026-05-30-memory-quality-curation-plan.md):
better to miss a real problem than to fabricate one. Crying wolf makes users
disable the guard.

### 3. Evidence lane

Derivable / unknown only: test/typecheck/lint status, a verification artifact
whose saved workspace fingerprint matches the current workspace fingerprint, and
a fail-then-fix trace when present. If there is no fresh passing verification for
the current workspace fingerprint, report it as an unresolved evidence gap. If
the data needed is absent (no coverage artifact, no session state), report
`unknown` — not a heuristic verdict and not a fabricated gap.

## Output: Tiered, Tri-State, No Risk Grade

Do not emit a single confident risk grade. Separate the authoritative gaps from
the advisory claims, and let the summary be a tri-state evidence status driven
only by derivable facts.

```json
{
  "evidenceGaps": [
    {
      "kind": "unverified_change",
      "verification": "stale",
      "evidence": ".codexus/session/verification/<id>/verification.json",
      "recommendation": "run session verify to cover this change"
    }
  ],
  "derivableFacts": [
    {
      "kind": "source_without_test_diff",
      "files": ["src/parser.ts"],
      "gate": false,
      "evidence": "working-tree diff"
    }
  ],
  "heuristicClaims": [
    {
      "kind": "suspicious_abstraction",
      "file": "src/...",
      "confidence": "low",
      "evidence": "new helper has one caller and no test coverage",
      "recommendation": "inline or add a behavior test"
    }
  ],
  "changeEvidence": {
    "status": "fail",
    "verification": "stale",
    "unverifiedChange": true,
    "coverage": "unknown",
    "diffBase": "working-tree",
    "includesStaged": true,
    "includesUntracked": true
  }
}
```

`changeEvidence.status` is `pass | fail | unknown` and reflects only derivable
gateable facts: `pass` when the current workspace fingerprint has a fresh passing
verification, `fail` when there is a derivable evidence gap or explicitly
gateable fact, `unknown` when the data needed to decide is absent. Non-gating
`derivableFacts` and heuristic claims are reported and counted but never move
`changeEvidence.status`. There is no `slopRisk` field.

## Surface (minimize new subsystem)

`changeEvidence` is a derivation of the existing `cx session status` evidence
model — the data is already there. Add a focused command for the diff lane rather
than a parallel subsystem:

```bash
cx slop check --json                       # working-tree by default
cx slop check --since <ref> --json         # explicit committed range
cx slop check --scope "<glob>" --json      # declare scope for out-of-scope findings
cx slop check --review <path> --json       # link an explicit review artifact
cx session slop --json
```

`cx session status` may surface the compact `changeEvidence` summary; `cx slop
check` adds the diff-lane claims.

## Non-Goals

- Not a code-style or taste judge.
- Does not treat a large diff as slop by itself.
- Does not estimate AI authorship.
- Does not auto-refactor or auto-delete.
- Does not emit a `slopRisk`/risk grade.
- Does not fail a change on subagent/heuristic review alone — only derivable
  evidence (or its absence) is authoritative.

## Naming

Use "quality evidence guard" or "slop guard", not "anti-slop". "Anti-slop"
implies AI-authorship detection, which is an explicit non-goal. The output field
is `changeEvidence` (tri-state), not a `slopRisk` grade.

## First Slice

Implemented: `cx slop check --json` and `cx session slop --json` read the
working-tree diff plus the existing session verification/evidence model and
conservatively report:

- unverified/stale change (evidence gap, derivable, from the Bundle A model),
- source changed with no test-file change in the same diff (derivable fact,
  non-gating by default),
- behavior-change-likely / suspicious abstraction (heuristic claim, advisory),
- out-of-declared-scope files when `--scope` is explicitly provided,
- linked explicit review artifacts when `--review` points at an existing file,
- missing review artifacts as evidence gaps when a declared `--review` file is
  absent,

plus a `changeEvidence` tri-state summary attached to `cx session status` that
reflects derivable gateable facts only. Persisted `cx session intent` remains
deferred; no out-of-scope finding is fabricated without an explicit declaration.

## Acceptance Criteria

- Findings are split into `evidenceGaps` (derivable and gateable),
  `derivableFacts` (objective, non-gating unless their `kind` explicitly gates),
  and `heuristicClaims` (advisory, never auto-fail), each evidence-linked.
- `changeEvidence.status` is `pass | fail | unknown`, driven only by derivable
  gateable facts; non-gating facts and heuristics never move it and there is no
  risk grade.
- A fact that depends on an absent tool/artifact (e.g. changed-line coverage with
  no coverage artifact) is reported as `unknown`, not as a gap or fail.
- "Behavior change needs a test" is a heuristic claim; the only derivable
  test-related fact is "source changed with no test-file change in the diff."
- An unverified or stale change is reported as an evidence gap, reusing the
  Bundle A fingerprint/verification model, and the output declares its
  `diffBase`/`includesStaged`/`includesUntracked`.
- Scope findings fire only when a scope was declared (`--scope` or session
  intent); without a declaration they are not fabricated.
- Explicit review links are evidence only when the file exists. A missing
  declared review artifact is a gateable evidence gap, not a silent pass.
- Heuristic claims stay silent when uncertain (precision over recall) and never
  auto-edit or auto-fail.
- The guard adds no parallel subsystem: it derives from the session evidence model
  plus a focused diff command.
