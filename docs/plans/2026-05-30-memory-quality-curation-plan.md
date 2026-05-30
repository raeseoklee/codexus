# Memory Quality Curation Plan

[Korean](../ko/plans/2026-05-30-memory-quality-curation-plan.md)

Date: 2026-05-30

Status: planned lightweight curation slice, not standards adoption.

## Decision

Codexus should not adopt IEEE 29148 as a memory-management standard. The scope
does not match: Codexus memory is a compact, source-linked learning store, not a
system requirements specification.

Codexus should borrow a small set of proven requirement-quality characteristics
as a curator-derived memory quality profile. The framing is:

```text
29148-inspired quality characteristics, not 29148 compliance.
```

The first useful implementation slice is conflict and contradiction detection in
`cx memory curate`.

## Principles

- Do not claim standards compliance.
- Do not add a heavyweight requirements hierarchy to memory entries.
- Do not let memory entries self-assert quality flags.
- Derive quality from available evidence, source links, text shape, and
  relationships between entries.
- Use tri-state quality results: `pass`, `fail`, or `unknown`.
- Treat conflict detection as advisory. Curation should surface review
  candidates, not delete or rewrite memory automatically.
- Keep memory retrieval bounded and source-linked.

## Quality Profile

The curator may evaluate these characteristics:

| Characteristic | Meaning in Codexus memory | Result |
| --- | --- | --- |
| Traceable | Entry cites a source run and, when available, an artifact or event. | `pass/fail/unknown` |
| Singular | Entry makes one main claim or lesson. | `pass/fail/unknown` |
| Unambiguous | Entry avoids vague guidance such as "handle well" without concrete action. | `pass/fail/unknown` |
| Scope-bounded | Entry names an applicable repo, path, task shape, tag, or condition. | `pass/fail/unknown` |
| Verifiable | Entry suggests an observable check, test, replay, or inspection. | `pass/fail/unknown` |
| Conflict-reviewed | Entry has been compared against related entries for contradiction. | `pass/fail/unknown` |

These results belong in curation output, not in the memory entry as trusted
self-description. If later persisted, they should be stored as curator evidence
with a generated timestamp and curator version.

## Conflict Candidates

Add `conflictCandidates` to `MemoryCurationResult`:

```json
{
  "id": "mem_new",
  "conflictsWith": "mem_old",
  "reason": "same scope and opposite directive",
  "confidence": "medium",
  "suggestedResolution": "review_for_supersession"
}
```

Initial detection should be conservative and rule-based:

- same or overlapping tags,
- same kind,
- similar normalized subject terms,
- opposite directive markers such as `use` vs `do not use`, `always` vs
  `never`, `enabled` vs `disabled`, `available` vs `unavailable`, or
  `supported` vs `unsupported`,
- high-confidence conflict only for clear lexical opposition in a shared scope.

Unknown is acceptable. It is better to miss a subtle conflict than to fabricate
a contradiction.

## Supersession Model

Do not treat `supersedable` as a per-entry quality flag. Supersession is a
relationship between entries discovered during curation or chosen during review.

Later, if Codexus persists supersession, use a set-level review artifact or an
explicit entry link such as:

```json
{
  "schemaVersion": 1,
  "supersedes": "mem_old",
  "supersededBy": "mem_new",
  "reason": "newer observed app-server evidence replaces prior unsupported note",
  "reviewedAt": "2026-05-30T00:00:00.000Z"
}
```

Do not auto-supersede on detection alone.

## Optional Rationale

A `rationale` field can be useful, but only if it is source-backed. It should not
be freeform confidence theater.

Preferred shape for a later schema version:

```json
{
  "rationale": {
    "summary": "Derived from verification failure and successful repair run.",
    "evidence": ["run_.../verification/verification-001.json"]
  }
}
```

This requires a memory schema migration and should not be added silently to v1
records.

## Implementation Slices

1. Document this profile and keep existing memory schema unchanged.
2. Extend `MemoryCurationResult` with `qualityFindings` and
   `conflictCandidates`.
3. Add rule-based conflict detection tests for clear contradictions and
   non-conflicting near-duplicates.
4. Keep `cx memory curate --json` advisory and non-mutating.
5. Consider a later review command that writes explicit supersession artifacts.

## Verification

- Unit tests for duplicate, stale, invalid, and conflict candidates.
- Tests proving manual quality flags in memory entries are ignored or rejected
  unless the schema explicitly supports them.
- Tests proving ambiguous pairs produce `unknown` or no conflict, not false
  positives.
- `npm run ci` before merging.
