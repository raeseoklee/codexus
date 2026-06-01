# Codex Task Panel Projection

[English](../../design/16-codex-task-panel-projection.md)

작성일: 2026-06-02
상태: 제안된 0.2 설계 트랙

## 결정

Codexus는 durable **session task state**를 추가하고, interactive Codex session 안에서
실행될 때 그 상태를 Codex native task panel로 projection합니다.

소유권 경계:

```text
.codexus/session/tasks.json
        -> cx session tasks list/update
        -> Codexus Codex adapter
        -> Codex host plan tool
        -> native lower task panel
```

Codexus가 durable task state를 소유합니다. Codex task panel은 projection일 뿐입니다.
host가 native task panel을 표시할 수 없어도 Codexus task state는 `cx session tasks`와
`cx session hud`로 그대로 접근할 수 있어야 합니다.

## 왜 Codexus에 맞나

장시간 supervised run에는 보이는 작업 큐가 필요합니다: 무엇이 완료됐고, 무엇이 진행 중이고,
무엇이 막혔고, 어떤 확인이 남았는지. Codex에는 이 형태에 맞는 native UI가 이미 있지만,
외부 `cx` 프로세스가 그 host UI를 직접 제어할 수 있다고 가정하면 안 됩니다. 대신
Codexus는 task list를 local evidence-backed state로 보유하고, Codex-native adapter가 그
상태를 host panel에 mirror하게 만들 수 있습니다.

Codexus 규칙은 그대로 유지됩니다:

- durable truth는 `.codexus`에 있다;
- host UI는 projection이다;
- model 또는 UI의 완료 표시는 advisory다;
- 최종 acceptance는 여전히 evidence gate가 결정한다.

## Task State

첫 artifact는 `.codexus/session/tasks.json`에 두거나, shape가 안정된 뒤 session state
migration으로 합칠 수 있습니다. 첫 slice에서는 별도 파일이 단순합니다. 전체 session record를
migration하지 않고도 shape를 발전시킬 수 있기 때문입니다.

후보 artifact:

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

허용 status:

- `pending`: 알려진 작업이지만 아직 시작하지 않음;
- `in_progress`: 현재 active item;
- `completed`: workflow상 완료로 표시된 item;
- `blocked`: 경계 도달 또는 입력 부족으로 멈춤;
- `skipped`: 이번 run에서 명시적으로 불필요하다고 기록.

동시에 하나의 task만 `in_progress`여야 합니다. 이 규칙은 structural invariant라 검증할 수
있습니다. 하지만 active task가 정확하거나 충분하다는 뜻은 아닙니다.

## Status Semantics

Task status는 workflow projection이지 완료 권한이 아닙니다.

Gate 가능한 사실:

- task artifact schema가 유효함;
- task id가 unique함;
- task order가 stable하고 unique함;
- `in_progress` task가 최대 하나임;
- 모든 evidence link가 path-sanitize됐고 허용된 Codexus artifact bucket 안을 가리킴;
- task가 verification evidence를 주장하면 연결된 verification artifact가 존재하고 fresh함.

Advisory claim:

- task title이 필요한 작업을 정확히 요약함;
- `completed`가 사용자 목표 충족을 의미함;
- acceptance criterion이 충족됨;
- review가 남은 이슈를 찾지 못함;
- projected Codex panel이 최신임.

Autopilot 또는 relay run의 완료는 여전히 [12번 문서](12-autopilot-contract.md)와
[15번 문서](15-multi-engine-relay-autopilot.md)의 gate가 결정합니다. task list는 진행상황을
보여주지만 verification, scope, supply-chain, slop, graph gate를 대체하지 않습니다.

## Command Surface

제안 명령:

```bash
cx session tasks list --json
cx session tasks add --title "Wire CLI and tests" --kind implementation --json
cx session tasks update <task-id> --status in_progress --json
cx session tasks complete <task-id> --evidence .codexus/session/verification/.../verification.json --json
cx session tasks block <task-id> --reason "scope boundary reached" --json
cx session tasks reconcile --from .codexus/autopilot/<id>/plan.json --json
```

`cx session hud --json`은 compact summary를 포함해야 합니다:

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

Non-JSON HUD도 같은 내용을 짧게 표시할 수 있습니다:

```text
Tasks: 1/5 complete, active task_...
```

## Codex Native Projection

Codexus skill이 Codex 안에서 active일 때 adapter는 다음을 수행할 수 있습니다:

1. `cx session tasks list --json` 실행;
2. Codexus task status를 host plan status로 변환;
3. 정렬된 task list로 Codex host plan tool 호출;
4. projection 성공 시 Codexus state에 projection timestamp 기록.

매핑:

| Codexus status | Host panel status |
| --- | --- |
| `pending` | `pending` |
| `in_progress` | `in_progress` |
| `completed` | `completed` |
| `blocked` | `pending` + title 또는 side summary에 blocked reason |
| `skipped` | 기본적으로 생략, JSON/history에는 보존 |

Host panel API는 core dependency가 아닙니다. adapter가 plan tool을 제공하는 Codex host 안에서
실행되지 않으면 projection은 일반 CLI/HUD 출력으로 degrade합니다. Codexus core package는 private
backend API나 undocumented host internal에 의존하면 안 됩니다.

## Autopilot Integration

Autopilot은 승인된 contract에서 task row를 만들 수 있습니다:

- 각 implementation plan step은 task가 됨;
- 각 acceptance criterion은 하나 이상의 verification matrix row에 연결됨;
- verification task는 verification artifact에 연결됨;
- scope, slop, supply-chain, graph check는 gate task로 표시됨;
- boundary stop은 active task를 `blocked`로 바꾸고 stop artifact를 연결함.

이렇게 하면 장시간 무인 run도 수동 Codex plan과 같은 UX를 갖지만, source of truth는 ledger에
남습니다.

## Relay Integration

Multi-engine relay는 stage work를 projection할 수 있습니다:

- `issue`, `design`, `plan`, `implementation` stage가 task group이 됨;
- `delta-check` round는 active task를 갱신할 수 있음;
- `full-gate` review는 verification/review task가 됨;
- convergence agreement는 stage task를 완료 표시할 수 있지만, 최종 run completion은 여전히
  evidence gate가 필요함.

## Rehydration

Codex conversation이 재개되면 adapter는 task artifact를 읽고 이어서 작업하기 전에 다시
projection해야 합니다. native panel을 ephemeral host memory가 아니라 local Codexus state에서
복구하게 만드는 방식입니다.

Rehydration은 오래된 host panel state로 더 최신 Codexus task state를 덮어쓰면 안 됩니다.
기본 방향은 한쪽입니다:

```text
Codexus task state -> host panel projection
```

향후 host가 panel 편집을 지원하더라도, 그 값은 명시적 import path와 conflict check를 거쳐야
합니다.

## 비목표

- native Codex panel을 source of truth로 만들지 않음.
- Codexus session task가 작동하기 위해 native host panel을 요구하지 않음.
- panel 제어를 위해 private Codex backend API를 사용하지 않음.
- 체크된 UI item을 verification evidence로 취급하지 않음.
- 이 UI projection 때문에 0.1.x stable CLI를 막지 않음.

## 첫 슬라이스

1. `codexus.session.tasks` schema artifact 추가.
2. `cx session tasks list/add/update/complete/block --json` 추가.
3. `cx session hud --json`에 task summary 추가.
4. plan tool이 있을 때 adapter가 task를 host plan panel에 mirror하도록 Codexus skill guidance 갱신.
5. task status만으로 verification 실패 run을 complete할 수 없음을 테스트로 증명.
6. code-writing autopilot에 연결하기 전에 docs-only autopilot plan으로 dogfood.
