# Memory Quality Curation Plan

[English](../../plans/2026-05-30-memory-quality-curation-plan.md)

날짜: 2026-05-30

상태: 구현된 경량 curation slice이며, 표준 도입이 아닙니다.

## 결정

Codexus는 IEEE 29148을 memory 관리 표준으로 채택하지 않습니다. 범주가 맞지
않습니다. Codexus memory는 compact하고 source-linked된 learning store이지 system
requirements specification이 아닙니다.

대신 검증된 요구사항 품질 특성 일부를 curator가 도출하는 memory quality profile로
가볍게 차용합니다. 프레이밍은 다음과 같습니다:

```text
29148-inspired quality characteristics, not 29148 compliance.
```

첫 번째로 실익이 큰 구현 slice는 `cx memory curate`의 conflict/contradiction
탐지입니다.

## 원칙

- 표준 준수라고 주장하지 않습니다.
- Memory entry에 heavyweight requirements hierarchy를 추가하지 않습니다.
- Memory entry가 quality flag를 self-assert하게 두지 않습니다.
- Quality는 사용 가능한 evidence, source link, text shape, entry 간 관계에서
  curator가 도출합니다.
- Quality 결과는 `pass`, `fail`, `unknown`의 tri-state를 사용합니다.
- Conflict detection은 advisory입니다. Curation은 review 후보를 surface할 뿐,
  memory를 자동 삭제하거나 rewrite하지 않습니다.
- Memory retrieval은 bounded/source-linked 상태를 유지합니다.

## Quality Profile

Curator는 다음 특성을 평가할 수 있습니다:

| 특성 | Codexus memory에서의 의미 | 결과 |
| --- | --- | --- |
| Traceable | source run과 가능하면 artifact/event를 인용합니다. | `pass/fail/unknown` |
| Singular | 하나의 주요 claim 또는 lesson만 담습니다. | `pass/fail/unknown` |
| Unambiguous | "잘 처리" 같은 모호한 guidance가 아니라 구체적 action을 담습니다. | `pass/fail/unknown` |
| Scope-bounded | 적용 repo, path, task shape, tag, condition이 드러납니다. | `pass/fail/unknown` |
| Verifiable | 관찰 가능한 check, test, replay, inspection을 제안합니다. | `pass/fail/unknown` |
| Conflict-reviewed | 관련 entry와 contradiction 여부를 비교했습니다. | `pass/fail/unknown` |

이 결과는 memory entry의 trusted self-description이 아니라 curation output에
속합니다. 나중에 persist한다면 generated timestamp와 curator version을 가진 curator
evidence로 저장해야 합니다.

## Conflict Candidates

`MemoryCurationResult`는 이제 `conflictCandidates`를 보고합니다:

```json
{
  "id": "mem_new",
  "conflictsWith": "mem_old",
  "reason": "same scope and opposite directive",
  "confidence": "medium",
  "suggestedResolution": "review_for_supersession"
}
```

초기 탐지는 보수적인 rule-based 방식이어야 합니다:

- 같거나 겹치는 tag,
- 같은 kind,
- 비슷한 normalized subject term,
- `use` vs `do not use`, `always` vs `never`, `enabled` vs `disabled`,
  `available` vs `unavailable`, `supported` vs `unsupported` 같은 반대 directive
  marker,
- 공유 scope 안에서 명확한 lexical opposition이 있을 때만 high-confidence conflict.

`unknown`은 정상 결과입니다. 미묘한 conflict를 놓치는 편이 contradiction을 꾸며내는
것보다 낫습니다.

## Supersession Model

`supersedable`을 per-entry quality flag로 보지 않습니다. Supersession은 curation에서
발견되거나 review에서 선택되는 entry 간 관계입니다.

나중에 Codexus가 supersession을 persist한다면 set-level review artifact 또는 다음과
같은 explicit entry link를 사용합니다:

```json
{
  "schemaVersion": 1,
  "supersedes": "mem_old",
  "supersededBy": "mem_new",
  "reason": "newer observed app-server evidence replaces prior unsupported note",
  "reviewedAt": "2026-05-30T00:00:00.000Z"
}
```

탐지만으로 자동 supersede하지 않습니다.

## Optional Rationale

`rationale` field는 유용할 수 있지만 source-backed일 때만 허용합니다. Freeform
confidence theater가 되면 안 됩니다.

향후 schema version에서 선호하는 형태:

```json
{
  "rationale": {
    "summary": "Derived from verification failure and successful repair run.",
    "evidence": ["run_.../verification/verification-001.json"]
  }
}
```

이는 memory schema migration이 필요하며 v1 record에 조용히 추가하면 안 됩니다.

## 구현 Slice

1. 완료: 이 profile을 문서화하고 기존 memory schema는 유지합니다.
2. 완료: `MemoryCurationResult`에 `qualityFindings`와 `conflictCandidates`를 추가합니다.
3. 완료: 명확한 contradiction과 conflict가 아닌 near-duplicate에 대한 rule-based conflict
   detection test를 추가합니다.
4. 완료: `cx memory curate --json`은 advisory/non-mutating 상태로 유지합니다.
5. 나중에 explicit supersession artifact를 쓰는 review command를 검토합니다.

## 검증

- duplicate, stale, invalid, conflict candidate unit test.
- memory entry 안의 manual quality flag가 schema에서 명시 지원되기 전에는 무시되거나
  거부됨을 증명하는 test.
- 모호한 pair가 false positive가 아니라 `unknown` 또는 no conflict를 만든다는 test.
- merge 전 `npm run ci`.
