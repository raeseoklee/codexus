# Subagent Evidence Supervision

[English](../../design/09-subagent-evidence-supervision.md)

작성일: 2026-05-30
상태: 제안된 설계

## 결정

Codexus는 Codex-native subagent evidence lane을 추가할 수 있지만, CLI harness core를
subagent로 대체하거나 일반 subagent orchestrator가 되면 안 됩니다.

안정적인 core는 그대로 유지합니다:

```text
Codexus kernel / ledger / verification / policy / memory / replay
```

Subagent는 claim producer입니다. Codexus는 supervisor와 recorder입니다. 첫 slice에서
subagent는 read-only observation, review, patch proposal을 만들 수 있지만, Codexus는 그 claim을
기록하고 나중의 verification/review evidence에 연결할 뿐입니다. 완료는 계속
verification-gated입니다.

불변식:

> Subagent는 claim을 만들 수 있다. Codexus는 claim을 기록한다. 하지만 completion evidence로
> 승격하는 것은 verification뿐이다.

## 왜 추가하는가

외부 `cx run --driver codex-exec` path는 automation과 재현 가능한 supervised run에 강하지만,
별도 non-interactive Codex process를 시작합니다. 활성 Codex session 안에서는 native subagent가
더 자연스럽게 느껴질 수 있습니다:

- read-only exploration을 main session과 병렬로 실행,
- review와 test-diagnosis lane이 현재 대화를 떠나지 않고 bounded evidence 생성,
- always-on session UX가 사용자가 `codexus`를 명시하지 않아도 low-risk evidence gathering에
  subagent를 활용.

가치는 "agent 수를 늘리는 것"이나 병렬 작업 실행이 아닙니다. Subagent output을 같은
evidence-first supervision 모델에 넣는 것입니다. Codexus가 받아들이는 것은 claim capture,
ledger linkage, verification gating이고, 일반 task-parallel orchestration layer가 될 필요는
없습니다.

## Runtime Shape

```text
Current Codex session
  -> user or Codex agent spawns/uses a native subagent
  -> Codexus records the subagent claim bundle
  -> .codexus/session/subagents/<task-id>/result.json
  -> Codexus status reports unverified claims separately from evidence
  -> verification/review may later promote claims to evidence
```

Session supervisor는 record shape, state write, status projection, verification handoff를
소유합니다. 첫 slice에서는 subagent spawning을 소유할 필요가 없습니다.

## Evidence Contract

각 subagent result는 typed artifact로 기록해야 합니다:

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

Claim과 evidence는 구조적으로 분리합니다:

- `claims`: subagent가 말한 것,
- `evidenceLinks`: 해당 claim을 지지하거나 반박하는 verification, replay, manual review,
  artifact reference,
- `verificationStatus`: claim bundle의 현재 gate 상태.

Session state는 큰 report를 직접 embed하지 않고 id로 artifact를 link해야 합니다:

```text
.codexus/session/subagents/<task-id>/
  result.json
  report.md
```

Subagent output은 verification 또는 explicit review artifact가 승격하기 전까지
evidence-adjacent입니다. 이것만으로 `evidenceFresh`에 기여하면 안 됩니다. Bundle A의 freshness는
verification-only입니다.

## Bundle A: Recorder Only

첫 구현 bundle은 기록 절반입니다:

- subagent result envelope 정의,
- `.codexus/session/subagents/` 아래 subagent artifact 기록,
- session state에서 artifact id link,
- `session status`가 unverified subagent claim을 verification evidence와 분리 보고,
- `evidenceFresh`는 session verification만으로 결정.

생성 절반은 deferred입니다:

- Codexus가 subagent를 자동 spawn하지 않음,
- Codexus가 parallel work를 schedule하지 않음,
- Codexus가 subagent patch를 적용하지 않음,
- Codexus가 subagent result를 completion으로 취급하지 않음.

Active subagent driver 또는 delegation command는 recorder semantics가 안정된 뒤 추가합니다.

## 자동화 정책

자동 허용:

- read-only repository exploration,
- 이미 capture된 log 기반 test-failure analysis,
- 기존 diff review,
- verification command recommendation.

조건부 허용:

- 현재 session agent가 나중에 의도적으로 적용할 수 있는 patch suggestion 기록,
- Codexus 밖에서 launch된 parallel analysis 기록,
- `.codexus/` state만 쓰는 bounded subagent artifact.

자동 금지:

- destructive command,
- unverified final completion,
- automatic skill promotion,
- automatic prompt injection,
- separate external `cx run` sub-run,
- 첫 bundle에서 Codexus-spawned parallel task execution,
- 명시적 session step 없이 source file을 변경하는 subagent.

## Driver Boundary

장기적으로 Codexus가 active subagent spawning을 추가한다면 descriptor driver model에 들어가야
합니다:

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

이렇게 해야 kernel이 engine-neutral로 남습니다. Codex-specific subagent launch detail은
driver/adapter에 속하고, workflow kernel이나 normalized ledger schema에 들어가면 안 됩니다.

이것은 Bundle A가 아니라 나중의 active-driver bundle입니다.

## Command Surface

첫 slice:

```bash
cx session subagent record --file <result.json> --json
cx session subagent attach --role explore --claim-file <claims.json> --json
cx session subagent status <task-id> --json
```

나중에 Codex 안에서는 이런 alias가 가능합니다:

```text
codexus, 방금 subagent review 결과를 claim bundle로 기록해줘.
codexus, failing test log 분석 claim을 verification evidence와 연결해줘.
codexus, subagent claims를 evidence와 분리해서 status에 보여줘.
```

## 수용 기준

- Recorder command는 Codex native subagent spawning이 unavailable이어도 동작.
- 나중의 active subagent launch가 실패하면 operational evidence로 기록하고 harness correctness
  path를 실패로 만들지 않음.
- Subagent result만으로 `session status`가 `evidenceFresh: true`를 보고하지 않음.
- Subagent claim은 `session verify`, `replay`, manual review evidence에 link될 수 있지만
  대체할 수 없음.
- 모든 subagent artifact는 `.codexus/session/subagents/`에서 재구성 가능.
- `session status`는 unverified subagent claim과 verification evidence를 구분.
- Active spawning command는 capability-gated입니다. Codex native subagent가 unavailable이면
  Codexus는 `unavailable`과 recovery hint를 보고.
- fixed frontier model name을 hardcode하지 않음. 호출자가 명시하지 않는 한 inherited/default
  routing을 선호.

## 구현 슬라이스

1. Read-only subagent artifact schema와 session-state link 추가.
2. `.codexus/` artifact만 쓰는 `cx session subagent record/attach` command 추가.
3. Status integration 추가: linked subagent id, claim count, limitation,
   verification handoff hint, 명시적 `unverifiedClaims` section.
4. `evidenceFresh`를 verification-only로 유지하고 이 invariant의 regression test 추가.
5. Native subagent capability detection, spawning, parallel planning은 recorder semantics가
   안정된 뒤로 defer.
