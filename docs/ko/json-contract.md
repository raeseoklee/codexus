# JSON Contract

[English](../json-contract.md)

상태: 0.2.0 stable contract. 0.1.0에서 도입했고 0.2.0에서 확장했습니다.

Codexus는 automation-facing harness이므로 JSON 출력 안정성 자체가 제품 contract입니다.
`0.2.0`은 1.0은 아니지만, supported command의 JSON contract를 `0.2.x` patch line
동안 freeze합니다.

## Stability Markers

JSON payload에는 다음 필드가 포함될 수 있습니다:

```json
{ "stability": "stable" }
```

허용 값:

- `stable`: named field는 현재 stable line 동안 frozen입니다. additive field만 추가될 수
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

## Frozen Stable Fields

Supported command에 대해 아래 top-level field name은 현재 stable line 동안 frozen입니다:

- 공통 supported JSON payload: `schemaVersion`, `stability`.
- Version output: `schemaVersion`, `stability`, `name`, `version`,
  `packageRoot`, `node`, `update`.
- Run output: `schemaVersion`, `stability`, `runId`, `outcome`,
  `statePath`, `reportPath`, `state`.
- Run status/report output: `state`, `paths`, `verification`, `experience`,
  `eventTail`.
- Doctor output: `schemaVersion`, `stability`, `ok`, `strict`, `checks`, `warnings`,
  `configFiles`, `driverProbe`, `update`.
- Schema output: `ok`, `schemas`, `appServerFixture`, 그리고 `schema engine`의
  `schemaVersion`, `stability`, `activeEngine`, `fullJsonSchemaEngine`, `decision`,
  `migrationFixtureBoundary`.
- Supply-chain output: `schemaVersion`, `stability`, `cwd`, `packageRoot`,
  `packageJsonPath`, `lifecycleExecuted`, `projectionMode`,
  `projectionAccuracy`, `policy`, `packageArtifact`, `evidenceGaps`,
  `derivableFacts`, `heuristicClaims`, `blockingUnknowns`,
  `informationalUnknowns`, `supplyChain`, `gate`.
- Session status output: `schemaVersion`, `stability`, `status`, `cwd`,
  `paths`, `evidence`, `changeEvidence`, `riskSummary`, `decisions`, `loop`,
  `subagents`, `controlPlane`, `evidenceLoop`, `verifyDetection`, `overlays`,
  `notifyHook`, `notifyDispatch`, `migration`, `state`, `update`.
- Session HUD output: `schemaVersion`, `stability`, `cwd`, `status`,
  `evidence`, `changeEvidence`, `riskSummary`, `decisions`, `loop`,
  `tasks`, `controlPlane`, `evidenceLoop`,
  `notifyDispatch`, `capabilities`, `counts`, `lastDecision`,
  `lastCheckpoint`, `lastVerification`.
  `evidenceLoop`는 app-instance observation, app-server observer evidence, wiki context
  approval 같은 experimental evidence surface의 projection입니다. Health, control,
  source-truth, prompt-injection, completion authority가 아닙니다.
- Quality evidence output(`slop check`, `session slop`): `schemaVersion`,
  `stability`, `cwd`, `scope`, `base`, `changeEvidence`, `evidenceGaps`,
  `derivableFacts`, `heuristicClaims`, `gate`.
- Repo knowledge output(`repo check --gate`, `repo map`): `schemaVersion`,
  `stability`, `command`, `cwd`, `packageRoot`, `scanMode`,
  `scanAccuracy`, `policy`, `indexes`, `documents`, `evidenceGaps`,
  `derivableFacts`, `heuristicClaims`, `blockingUnknowns`,
  `informationalUnknowns`, `repoKnowledge`, `deferredSelfReports`, `gate`.
  Stable contract는 기계적으로 검증 가능한 repository knowledge invariant만
  포함합니다: required docs index, local index link, 영문/한국어 counterpart,
  선언된 schema reference, source `*_deferred` self-report 문서화. Semantic
  freshness와 prose quality는 계속 advisory입니다.
- Release integrity local output(`release check --gate`, `--live` 없음):
  `schemaVersion`, `stability`, `cwd`, `packageRoot`, `packageJsonPath`,
  `version`, `repository`, `live`, `releaseIntegrity`, `evidenceGaps`,
  `derivableFacts`, `heuristicClaims`, `blockingUnknowns`,
  `informationalUnknowns`, `gate`. Stable contract는 local static release wiring
  evidence만 포함합니다: installer 기본 channel, expected-version guard,
  trusted-publishing workflow shape, stable dist-tag sync wiring, pinned publish
  actions, installer asset workflow wiring, redacted release-evidence docs.
  GitHub/npm post-publish live sign-off는 계속 명시적 opt-in이 필요한
  experimental surface입니다. 사용할 경우 npm `latest`와 npm `next`를 모두
  보고하고, `next`가 `latest`보다 오래된 version을 가리키면 gate합니다.
- LSP diagnostics output(`lsp status`, `lsp check --gate`): `schemaVersion`,
  `stability`, `command`, `cwd`, `projectRoot`, `scanMode`, `scanAccuracy`,
  `limits`, `autoApply`, `lsp`, `providers`, `result`, `evidenceGaps`,
  `derivableFacts`, `heuristicClaims`, `blockingUnknowns`,
  `informationalUnknowns`, `gate`. Stable contract는 project detection과 명시적
  diagnostics command 실행만 포함합니다. `lsp status`는 diagnostics를 실행하지 않고,
  `lsp check`는 bounded timeout/output-tail field를 사용하며, 두 명령 모두 protocol
  server를 시작하거나 제어하지 않습니다.
- Architecture output(`architecture check --gate`): `schemaVersion`,
  `stability`, `cwd`, `packageRoot`, `packageJsonPath`, `scanMode`,
  `scanAccuracy`, `policy`, `importGraph`, `evidenceGaps`, `derivableFacts`,
  `heuristicClaims`, `blockingUnknowns`, `informationalUnknowns`,
  `architecture`, `gate`. Stable contract는 static best-effort import scan으로 도출한
  declared-policy `forbidden-import` fact만 포함합니다. Broad layering analysis,
  type-aware graph claim, design-quality judgment는 계속 advisory/deferred입니다.
- Wiki context output(`wiki context --fresh-only --gate`): `schemaVersion`,
  `stability`, `command`, `cwd`, `topic`, `budget`, `freshnessPolicy`,
  `selectedPages`, `tokenEstimate`, `eligibleForAutomaticInjection`,
  `evidenceGaps`, `derivableFacts`, `gate`, `text`. Stable contract는 명시적 manual
  context selection과 freshness gate만 포함합니다. `eligibleForAutomaticInjection`은
  계속 `false`이며, Codexus는 wiki context로 prompt를 변경하거나 source-truth/completion
  authority를 주장하지 않습니다.

이 필드를 제거하거나 의미를 재정의하려면 현재 stable line의 다음 minor release가
필요합니다. Patch release에서는 field 추가만 허용됩니다.

## Frozen 아님

- app-server live behavior, cron/gateway live dispatch, automatic injection,
  routine live model replay, statusline integration, worker launch,
  `release check --live`, LSP diagnostics protocol-server lifecycle 또는 자동 LSP
  적용, declared `forbidden-import` policy를 넘어서는 broad architecture layering,
  wiki build/check/export, wiki context approval artifact, contract-promotion readiness
  check의 experimental/deferred output.
- `heuristicClaims` 같은 advisory array의 membership.
- Additive `update` summary의 nested content. 이는 informational experimental
  update-availability report이며 release, verification, installation,
  completion authority가 아닙니다.
- `summary`, `reason`, `recommendation`, `hint` 같은 사람이 읽는 prose field. 단,
  bounded/non-secret이어야 합니다.

## Breaking Change Rule

Release cadence는 별도 [릴리즈 정책](release-policy.md)이 다룹니다. 작은 commit은
보통 더 큰 theme의 stable release로 묶지만, version number는 아래 frozen-contract
경계를 따릅니다.

- Patch release(`0.2.x`, `0.2.0` 이후): stable surface에는 additive JSON field만 허용.
- Minor release(`0.3.0` 이후): changelog notice와 함께 frozen field 제거/재정의 가능.
  또는 다른 experimental surface를 stable contract로 승격할 수 있습니다.
- Experimental/deferred surface는 supported처럼 보이지 않도록 stability를 자기보고해야 함.
- Experimental surface는 JSON contract를 freeze하지 않고 patch release에서 추가할 수
  있습니다. `0.2.0`은 첫 promotion point입니다: architecture check와 manual wiki
  context surface를 stable contract로 승격하면서, 더 위험한 action/injection surface는
  계속 deferred로 둡니다.
