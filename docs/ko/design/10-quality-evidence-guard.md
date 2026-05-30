# 품질 증거 가드 (Slop Guard)

[English](../../design/10-quality-evidence-guard.md)

작성일: 2026-05-30
상태: 첫 슬라이스 구현됨

## 결정

Codexus는 품질 증거 가드("slop guard")를 추가하되, style linter가 아니라
evidence-first 품질 게이트로 만듭니다. 판정 기준은 "코드가 예쁜가"가 아니라:

> 이 변경이 검증 가능한 문제 해결처럼 보이는가, 아니면 근거 없는 생성물처럼
> 보이는가?

가드는 근거 없는 변경을 evidence gap으로 드러냅니다. 취향을 판정하지 않고, 사람이
썼는지 AI가 썼는지 추정하지 않으며, 자동으로 편집하지 않습니다.

"slop guard"는 기능 이름입니다. 출력은 risk 등급이 아닙니다(아래 참조).

## 정직성 제약 (가장 중요)

slop 판정은 본질적으로 휴리스틱이고, 휴리스틱은 자주 틀립니다. Codexus의 핵심 규율은
"도출할 수 없는 것을 단정하지 않는다"입니다. 휴리스틱으로 자신만만한 risk 등급을 내는
가드는 그 자체가 근거 없는 출력 — slop guard가 slop을 만드는 격입니다. 이것이 피해야 할
실패 모드입니다.

따라서 모든 finding을 두 claim 계층과 명시적 unknown 상태로 분리하며,
[subagent evidence supervision](09-subagent-evidence-supervision.md)의 claim/evidence
모델을 그대로 재사용합니다.

계층 경계는 단일 테스트입니다:

> **Derivable 테스트:** 두 정직한 리뷰어가 이견을 낼 수 있는가? 도구/artifact가 없으면
> 틀릴 수 있는가? 그렇다면 derivable이 **아닙니다.**

- **Derivable fact/evidence** — 테스트를 통과하는 객관적 사실. 권위는 있지만, 항상
  gap이나 gate는 아님.
- **Heuristic claim** — 테스트를 통과 못 하는 것(판단·추론). advisory 전용, 절대 자동
  fail 아님, 항상 휴리스틱·confidence로 라벨.
- **Unknown** — 부재한 도구/artifact에 의존하는 사실. `unknown`으로 보고하고, gap이나
  fail로 보지 않음.

| 계층 | 예 | 권한 |
| --- | --- | --- |
| Derivable fact/evidence | test/typecheck/lint exit status; `verification: missing/stale`(Bundle A evidence 모델); manifest diff의 새 dependency; 같은 diff에서 source 변경 ∧ test-file 무변경; **scope가 선언된 경우** 선언된 scope 밖 파일 변경 | 사실 — finding `kind`가 명시할 때만 게이트 가능 |
| Unknown | coverage artifact가 없을 때의 changed-line coverage; session state가 없을 때의 verification status | gap 아님, fail 아님 |
| Heuristic claim | "이건 test가 필요한 behavior change다", "불필요한 abstraction", dead code, 중복 함수, name-only layer, placeholder/TODO | 추측 — advisory, 자동 fail 금지 |

여기로 옮겨진 것을 보세요: diff가 *behavior change*인지(주석/rename/순수 refactor와 대비)
판정하는 것은 판단이므로, "behavior change엔 test 필요"는 heuristic claim입니다. derivable
사실은 "같은 diff에서 source 변경 ∧ test-file 무변경"뿐입니다. 마찬가지로 changed-line
coverage는 coverage artifact가 있을 때만 derivable이고, 없으면 `unknown`입니다.

derivable 사실과 heuristic 추측과 unknown을 스스로 분리하지 않는 slop guard는 이 프로젝트의
정직성 원칙을 위반합니다.

모든 derivable fact가 evidence gap은 아닙니다. 예를 들어 "source 변경 ∧ test-file 무변경"과
"새 dependency 추가"는 객관적 사실이지만, 그 자체로 변경을 자동 fail시켜서는 안 됩니다. 그래서
출력은 세 bucket을 사용합니다:

- `evidenceGaps`: 현재 workspace fingerprint에 대한 verification missing/stale처럼 derivable이고
  gate 가능한 gap.
- `derivableFacts`: 객관적 non-gating fact, 또는 `kind`가 gate 동작을 명시하는 fact.
- `heuristicClaims`: 사람 리뷰용 advisory 추측.

## Evidence-Gap이 척추, 휴리스틱은 고명

가장 강하고 정직한 slop 신호는 휴리스틱이 전혀 아닙니다: **현재 workspace fingerprint에 대한
fresh passing verification이 없다.** 이건 이미 Bundle A evidence 모델에 구현돼 있습니다
(`verification: missing | stale`, `dirtySinceLastVerify`, `evidenceFresh`).

그래서 가드는 척추부터 세웁니다:

1. evidence-gap 탐지(객관적, 기존 세션 evidence 모델에서 도출)가 코어.
2. 휴리스틱 diff 분석은 그 주위의 보조 고명.

이렇게 해야 가드가 휴리스틱 linter로 전락하지 않고, 권위 있는 출력이 Codexus가 이미
증명하는 사실에 근거합니다.

## 세 레인

### 1. Pre-change 선언 (enforcement 아님)

선언된 scope는 diff 레인의 "unrelated 변경" finding을 추측이 아니라 **객관적** 비교로
만듭니다("parser 고친다 선언했는데 `src/billing/` 건드림"). 이것은 강제할 수 없으므로
(slop 생성 에이전트가 나쁜 의도를 정직히 선언할 리 없음) 게이트가 아니라 체크리스트/baseline
으로 취급합니다.

선언 소스(모든 scope finding이 발동하려면 반드시 존재해야 함):

- 우선 stateless flag: `cx slop check --scope "src/parser/**"` (새 상태 없음).
- 나중에 always-on overlay가 턴 간에 이를 운반해야 하면 영속 session intent
  (`cx session intent --scope ... --goal ...`).

선언된 scope가 없으면 scope finding을 **만들지 않습니다**(날조 금지). 첫 구현 slice는
stateless `--scope` flag를 지원하며, persisted session intent는 deferred입니다.

### 2. Diff 레인

diff base는 명시되어야 합니다. Codexus는 session-native라 작업 중인 것은 보통 과거 커밋이
아니라 **미커밋 working tree**입니다. Bundle A fingerprint scope 모델을 재사용:

- 기본: working tree — staged + unstaged + untracked (workspace fingerprint가 이미 커버하는
  동일 scope).
- `--since <ref>`: working tree 대신 명시적 커밋 범위.
- 출력은 `diffBase`, `includesStaged`, `includesUntracked`를 선언해 소비자가 무엇을 검사했는지
  정확히 알게 함.

그 diff에서:

- Derivable: 같은 diff에서 source 변경 ∧ test-file 무변경; 새 dependency 추가; (scope가
  선언된 경우에만) 선언된 scope 밖 파일 변경.
- Heuristic claim(advisory, 보수적): behavior-change-likely-needs-test, dead code,
  placeholder/TODO, 미사용/호출자 하나뿐인 abstraction, near-duplicate 함수, name-only layer.

휴리스틱은 **false alarm보다 침묵으로 편향**: high precision, 확실치 않으면 조용히.
이는 [memory quality curation](../plans/2026-05-30-memory-quality-curation-plan.md)의
conflict 탐지 규칙과 같습니다: 진짜 문제를 놓칠지언정 없는 문제를 날조하지 않는다.
cry-wolf하면 사용자가 가드를 꺼버립니다.

### 3. Evidence 레인

Derivable / unknown만: test/typecheck/lint status, 저장된 workspace fingerprint가 현재
workspace fingerprint와 일치하는 verification artifact, 존재하는 경우 fail-then-fix 흔적. 현재
workspace fingerprint에 대한 fresh passing verification이 없으면 미해결 evidence gap으로 보고.
필요한 데이터가 부재하면(coverage artifact 없음, session state 없음) `unknown`으로 보고 —
휴리스틱 판정도 아니고 날조된 gap도 아님.

## 출력: 계층 분리, tri-state, risk 등급 없음

단일 자신만만 risk 등급을 내지 마세요. 권위 있는 gap과 advisory claim을 분리하고, 요약은
derivable 사실만 주도하는 tri-state evidence status로 합니다.

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

`changeEvidence.status`는 `pass | fail | unknown`이고 derivable gateable fact만 반영합니다:
현재 workspace fingerprint에 fresh passing verification이 있으면 `pass`, derivable evidence gap
또는 명시적으로 gate 가능한 fact가 있으면 `fail`, 판정에 필요한 데이터가 부재하면 `unknown`.
non-gating `derivableFacts`와 heuristic claim은 보고·집계되지만 `changeEvidence.status`를
움직이지 않습니다. `slopRisk` 필드는 없습니다.

## 표면 (새 subsystem 최소화)

`changeEvidence`는 기존 `cx session status` evidence 모델의 파생입니다 — 데이터는 이미 거기
있습니다. 병렬 subsystem 대신 diff 레인용 focused 명령만 추가:

```bash
cx slop check --json                       # 기본 working-tree
cx slop check --since <ref> --json         # 명시적 커밋 범위
cx slop check --scope "<glob>" --json      # out-of-scope finding용 scope 선언
cx session slop --json
```

`cx session status`는 compact한 `changeEvidence` 요약을 surface할 수 있고, `cx slop check`가
diff-레인 claim을 더합니다.

## 비목표

- 코드 스타일/취향 판정기 아님.
- 큰 diff를 그 자체로 slop으로 보지 않음.
- AI 작성 여부 추정 안 함.
- 자동 리팩터/삭제 안 함.
- `slopRisk`/risk 등급을 내지 않음.
- subagent/heuristic 리뷰만으로 변경을 fail시키지 않음 — derivable evidence(또는 그 부재)만
  권위 있음.

## 명명

"anti-slop"이 아니라 "quality evidence guard" 또는 "slop guard"를 사용하세요. "anti-slop"은
AI 작성 탐지를 함의하는데, 그건 명시적 비목표입니다. 출력 필드는 `slopRisk` 등급이 아니라
`changeEvidence`(tri-state)입니다.

## 첫 슬라이스

구현됨: `cx slop check --json`과 `cx session slop --json`은 working-tree diff와 기존 세션
verification/evidence 모델을 읽어 보수적으로 다음을 보고합니다:

- unverified/stale 변경 (evidence gap, derivable, Bundle A 모델에서),
- 같은 diff에서 source 변경 ∧ test-file 무변경 (derivable fact, 기본 non-gating),
- behavior-change-likely / suspicious abstraction (heuristic claim, advisory),
- `--scope`가 명시적으로 제공된 경우 선언 scope 밖 파일,

그리고 derivable gateable fact만 반영하는 `changeEvidence` tri-state 요약을
`cx session status`에 부착합니다. Persisted `cx session intent`는 deferred입니다. 명시적
선언 없이는 out-of-scope finding을 만들지 않습니다.

## 수용 기준

- finding이 `evidenceGaps`(derivable이고 gate 가능), `derivableFacts`(객관적, `kind`가
  명시하지 않는 한 non-gating), `heuristicClaims`(advisory, 자동 fail 금지)로 분리되며 각각
  evidence-linked.
- `changeEvidence.status`는 `pass | fail | unknown`이고 derivable gateable fact만 주도;
  non-gating fact와 휴리스틱이 움직이지 못하고 risk 등급이 없음.
- 부재한 도구/artifact에 의존하는 사실(예: coverage artifact 없는 changed-line coverage)은
  gap/fail이 아니라 `unknown`으로 보고.
- "behavior change엔 test 필요"는 heuristic claim; derivable한 test 관련 사실은 "같은 diff에서
  source 변경 ∧ test-file 무변경"뿐.
- unverified/stale 변경은 Bundle A fingerprint/verification 모델을 재사용해 evidence gap으로
  보고하고, 출력은 `diffBase`/`includesStaged`/`includesUntracked`를 선언.
- scope finding은 scope가 선언됐을 때만(`--scope` 또는 session intent) 발동; 선언 없이는
  날조하지 않음.
- heuristic claim은 불확실하면 침묵(recall보다 precision)하고 자동 편집/fail 안 함.
- 가드는 병렬 subsystem을 더하지 않음: 세션 evidence 모델 + focused diff 명령에서 파생.
