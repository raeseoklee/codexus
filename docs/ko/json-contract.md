# JSON Contract

[English](../json-contract.md)

상태: 0.1.0 readiness contract

Codexus는 automation-facing harness이므로 JSON 출력 안정성 자체가 제품 contract입니다.
`0.1.0`은 1.0은 아니지만, supported command의 JSON contract를 `0.1.x` patch line
동안 freeze합니다.

## Stability Markers

JSON payload에는 다음 필드가 포함될 수 있습니다:

```json
{ "stability": "stable" }
```

허용 값:

- `stable`: named field는 `0.1.x` 동안 frozen입니다. additive field만 추가될 수
  있습니다.
- `experimental`: 유용한 evidence이지만 frozen contract 대상은 아닙니다.
- `deferred`: product behavior가 의도적으로 미구현/비활성 상태임을 보고합니다.

소비자는 알 수 없는 additive field를 무시해야 합니다.

`0.1.1` 안정화 slice부터 지원되는 stable JSON command output은 top-level
`schemaVersion: 1`과 `stability: "stable"` marker를 포함합니다. Experimental/deferred
command output은 stable처럼 보이지 않도록 계속 `"experimental"` 또는 `"deferred"`를
자기보고합니다.

`schemaVersion`은 Codexus package 전체가 아니라 각 command output별 contract에
적용됩니다. 특정 command의 JSON contract에 breaking change가 생길 때만 그 command의
schema version을 올리며, additive field 추가는 bump 대상이 아닙니다.

## 0.1.x에서 Frozen

Supported command에 대해 아래 top-level field name은 `0.1.x` 동안 frozen입니다:

- 공통 supported JSON payload: `schemaVersion`, `stability`.
- Run output: `schemaVersion`, `stability`, `runId`, `outcome`,
  `statePath`, `reportPath`, `state`.
- Run status/report output: `state`, `paths`, `verification`, `experience`,
  `eventTail`.
- Doctor output: `stability`, `ok`, `strict`, `checks`, `warnings`,
  `configFiles`, `driverProbe`.
- Schema output: `ok`, `schemas`, `appServerFixture`, 그리고 `schema engine`의
  `schemaVersion`, `stability`, `activeEngine`, `fullJsonSchemaEngine`,
  `migrationFixtureBoundary`.
- Supply-chain output: `schemaVersion`, `stability`, `cwd`, `packageRoot`,
  `packageJsonPath`, `lifecycleExecuted`, `projectionMode`,
  `projectionAccuracy`, `policy`, `packageArtifact`, `evidenceGaps`,
  `derivableFacts`, `heuristicClaims`, `blockingUnknowns`,
  `informationalUnknowns`, `supplyChain`, `gate`.
- Session status output: `schemaVersion`, `stability`, `status`, `cwd`,
  `paths`, `evidence`, `changeEvidence`, `subagents`, `verifyDetection`,
  `overlays`, `notifyHook`, `notifyDispatch`, `migration`, `state`.
- Quality evidence output(`slop check`, `session slop`): `schemaVersion`,
  `stability`, `cwd`, `scope`, `base`, `changeEvidence`, `evidenceGaps`,
  `derivableFacts`, `heuristicClaims`, `gate`.

이 필드를 제거하거나 의미를 재정의하려면 `0.2.0`이 필요합니다. `0.1.x`에서 field
추가는 허용됩니다.

## Frozen 아님

- app-server live behavior, cron/gateway live dispatch, automatic injection,
  routine live model replay, statusline integration, worker launch의
  experimental/deferred output.
- `heuristicClaims` 같은 advisory array의 membership.
- `summary`, `reason`, `recommendation`, `hint` 같은 사람이 읽는 prose field. 단,
  bounded/non-secret이어야 합니다.

## Breaking Change Rule

- Patch release(`0.1.x`): stable surface에는 additive JSON field만 허용.
- Minor release(`0.2.0`): changelog notice와 함께 frozen field 제거/재정의 가능.
- Experimental/deferred surface는 supported처럼 보이지 않도록 stability를 자기보고해야 함.
