# 하네스 엔지니어링 정렬

[English](../../design/13-harness-engineering-alignment.md)

작성일: 2026-06-01
상태: 설계 방향 승인; 구현 slice는 계속 gate됨

## 결정

Codexus는 스스로를 **OpenAI Codex를 위한 harness engineering layer**로 명시합니다.
이 표현은 제품 방향을 바꾸지 않습니다. Codexus가 이미 가고 있던 방향에 이름을 붙입니다:
Codex를 실행 엔진으로 유지하고, 그 주변에 로컬 환경, 피드백 루프, 증거, 제어, 기록을
더해 Codex가 더 안정적으로 일하게 만드는 것입니다.

이 결정은 두 reference를 함께 봅니다:

- [OpenAI, "Harness engineering: using Codex in an agent-first world"](https://openai.com/ko-KR/index/harness-engineering/):
  시스템 레벨 reference입니다. 엔지니어의 역할을 더 좋은 prompt 작성이 아니라, Codex가
  유용한 일을 할 수 있는 환경, 피드백 루프, 제어 시스템을 설계하는 것으로 봅니다.
- [multica-ai/andrej-karpathy-skills](https://github.com/multica-ai/andrej-karpathy-skills):
  행동 레벨 reference입니다. coding agent가 흔히 저지르는 hidden assumption,
  overcomplication, drive-by edit, vague success criteria 문제를 줄이기 위한 작은 rubric을
  제공합니다.

Codexus는 둘 중 어느 쪽도 큰 prompt block으로 복사하지 않습니다. 원칙을
**agent-readable map, 명시적 증거, derivable gate**로 바꿉니다.

## 종합

OpenAI 글은 운영 환경에 대한 글입니다:

- 앱과 repository를 agent가 읽을 수 있게 만들기;
- repository knowledge를 구조화되고 versioned된 artifact에 저장하기;
- architecture/taste 제약을 prose가 아니라 도구에 인코딩하기;
- log, UI 상태, metric, trace를 bounded local tooling으로 노출하기;
- 장시간 autonomy를 checkpoint, review, verification이 있는 피드백 루프로 만들기.

Karpathy-style guideline repo는 agent 행동에 대한 글입니다:

- 한 해석을 조용히 선택하지 말고 assumption을 드러내기;
- 현재 문제를 해결하는 가장 작은 구현을 선호하기;
- 요청과 직접 연결된 surgical change만 수행하기;
- 모호한 작업을 검증 가능한 goal로 바꾸고 확인이 통과할 때까지 loop 돌기.

둘을 합치면 Codexus의 목표는 다음과 같습니다:

```text
Codex engine
  + agent-readable repository map
  + durable evidence and verification
  + architecture and behavior contracts
  + explicit gates for derivable facts
  + advisory findings for judgment-heavy claims
```

Codexus의 차별점은 계속 정직성입니다. 로컬 artifact에서 도출 가능한 조건은 gate할 수
있습니다. 판단이 필요한 조건은 advisory로 보고하거나, review에 기록하거나, 사람 승인을
요구해야 합니다. 중요하게 들린다는 이유만으로 heuristic을 hard gate로 바꾸면 안 됩니다.

## 이미 구현된 부분

Codexus는 이미 여러 harness-engineering 요소를 갖고 있습니다:

- `.codexus/runs/<id>` 아래 durable run ledger;
- verification-gated completion과 bounded repair loop;
- session-native checkpoint, verification, HUD, notify heartbeat, evidence freshness;
- memory와 replay-gated skill lifecycle;
- derivable evidence gap과 heuristic claim을 분리하는 quality evidence guard
  (`cx slop check`);
- policy-declared fact와 lifecycle-safe static projection을 쓰는 supply-chain evidence gate;
- 작동하지 않는 app-server, cron/gateway, worker, model replay, injection surface를
  proven/configured/unavailable 또는 experimental/deferred로 정직하게 보고하는 상태 모델.

따라서 이 정렬 작업은 rewrite가 아닙니다. 제품 설명과 구현을 맞추고, 이미 증거가 도출
가능한 곳에 가장 작은 새 gate를 추가하는 작업입니다.

## AGENTS.md의 두 용법

OpenAI 글의 `AGENTS.md`는 checked-in repository map입니다. agent에게 깊은 정보가 있는
`docs/` 위치를 알려주는 진입점입니다.

Codexus도 AGENTS overlay를 사용합니다. 하지만 이것은 다른 메커니즘입니다.

역할을 분리합니다:

| 역할 | 저장 위치 | 목적 | 변경 방식 |
| --- | --- | --- | --- |
| Repository map | checked-in docs/index 파일, 필요하면 짧은 checked-in `AGENTS.md` | durable knowledge가 어디 있는지 알려줌 | 문서처럼 유지보수 |
| Codexus session overlay | project/user AGENTS 파일의 marker-bounded `<!-- CODEXUS:RUNTIME:START -->` block | 현재 Codex session을 checkpoint, verification, evidence capture 쪽으로 유도 | `cx setup codex-session`이 설치/갱신 |

Codexus session overlay를 repository knowledge system으로 확장하지 않습니다. Overlay는
로컬 운영 지침이고, repository map은 checked-in knowledge입니다. 둘을 합치면 둘 다
덜 신뢰할 수 있게 됩니다:

- session state가 장황하고 유지보수하기 어려워짐;
- repository documentation이 local runtime 관심사를 떠안음;
- agent가 navigable map 대신 거대한 instruction blob을 보게 됨.

올바른 방향은 repository knowledge는 `docs/`와 index로, session behavior는 marker-bounded
overlay로 유지하는 것입니다.

## 행동 계약

Karpathy-style rule은 큰 always-on prompt가 아니라 Codexus **behavior contract**가 되어야
합니다.

권장 매핑:

| 행동 원칙 | Codexus 형태 | Gate 상태 |
| --- | --- | --- |
| Assumption 드러내기 | plan/session metadata, subagent claim field, review checklist | 명시 승인 없이는 advisory |
| Simplicity first | abstraction risk, speculative surface 같은 slop guard heuristic claim | advisory |
| Surgical changes | touched files, scope, generated churn, unrelated path group 같은 derivable diff fact | declared scope가 있을 때만 gate 가능 |
| Goal-driven execution | 명시적 verification command, session verification, run ledger completion | verification이 선언됐을 때 gate 가능 |

프로젝트의 핵심 규칙은 유지합니다: **fact는 gate할 수 있고, judgment는 advisory입니다.**

## Architecture invariant가 첫 작은 gate

첫 작은 code gate는 architecture check입니다. Import fact는 로컬에서 도출 가능하기
때문입니다. 새 judgment system을 만들지 않고 harness engineering을 enforceable behavior로
바꾸는 가장 작은 경로입니다.

구현된 first-slice surface:

```bash
cx architecture check --json
cx architecture check --gate --json
```

구현된 policy shape:

```json
{
  "schemaVersion": 1,
  "type": "codexus.architecture.policy",
  "rules": [
    {
      "id": "no-runtime-package-imports-in-src",
      "kind": "forbidden-import",
      "from": ["src/**"],
      "forbidden": ["**"],
      "allow": ["node:**", "./**", "../**"]
    }
  ]
}
```

첫 dogfood 규칙은 **source의 runtime package import 금지** invariant입니다. Codexus
source는 Node built-in과 local module은 import할 수 있지만, runtime package coupling을
조용히 늘리면 안 됩니다. 이 규칙은 Codexus의 standalone boundary를 보존하고,
compatibility reference가 runtime dependency로 변하는 것도 막습니다.

Import scan은 **static, text-based best-effort scan이며 full type-aware import graph가
아닙니다**. Output에는 supply-chain의 `projectionAccuracy`와 같은 성격의
`scanAccuracy: "best_effort"`를 포함해야 합니다. Text scan이 확신할 수 없는 dynamic
`import()`, re-export, type-only import, computed module path는 confident gate fact가
아니라 `informationalUnknown` 또는 heuristic claim으로 보고해야 합니다. 좁은
forbidden-import rule은 text scan으로도 충분하지만, broad layering rule에서는 이 한계가
드러납니다.

Architecture check는 기존 evidence shape를 재사용합니다:

- `derivableFacts`: text-derived import edge, matched file, rule id, package manifest;
- `evidenceGaps`: forbidden import, invalid policy, missing required file;
- `heuristicClaims`: 완전히 도출할 수 없는 naming/taste/coupling concern;
- `blockingUnknowns`: malformed policy나 unsupported rule kind;
- `informationalUnknowns`: local checker가 알 수 없는 항목;
- `gate`: evidence gap과 blocking unknown만 exit code를 움직임.

첫 구현 rule kind는 의도적으로 좁습니다:

- `forbidden-import`;

향후 `required-file`, `forbidden-file`, `from` -> `mayImport` 형태의 단순 layer
direction도 같은 facts-vs-heuristics gate model을 사용해야 합니다.

Semantic taste rule을 gate mode에 넣지 않습니다. 명시적 local evidence가 생길 때까지
advisory output에 둡니다.

## Project LSP diagnostics

Project language server는 유용한 local diagnostics를 제공할 수 있지만, Codexus가 이를
조용히 always-on hidden authority로 바꾸면 안 됩니다.

구현된 first-slice surface:

```bash
cx lsp status --json
cx lsp check --gate --json
```

첫 slice는 의도적으로 보수적입니다:

- `status`는 local project file과 package script에서 project LSP/diagnostics 후보를
  자동 탐지합니다;
- `check`는 `npm run typecheck` 같은 명시적 diagnostics command를 실행합니다;
- Codexus는 long-lived LSP protocol server를 시작하거나 제어하지 않습니다;
- JSON output에 들어가기 전 bounded stdout/stderr tail을 redact합니다;
- diagnostics는 사용자가 `--gate`를 요청할 때만 gate가 될 수 있습니다;
- LSP output 자체는 completion authority가 되지 않습니다.

향후 protocol-server adapter는 descriptor-backed이고 정직해야 합니다. Language server를
시작하는 것은 lifecycle action이므로 workspace trust, bounded output,
timeout/cancellation behavior, 그리고 diagnostics가 실제 LSP server에서 왔는지 project
diagnostic command에서 왔는지를 명확히 보고해야 합니다.

## Repository knowledge system

Architecture gate 이후 첫 repo-knowledge slice가 구현되었습니다. Check는 기계적인
항목만 gate합니다.

Derivable이며 gate 가능한 것:

- 필수 docs 존재;
- docs index link resolve;
- 프로젝트 정책상 필요한 경우 design doc의 English/Korean counterpart 존재;
- 참조된 schema/artifact file 존재;
- release evidence link가 committed file 또는 external URL을 가리킴.

Advisory 전용:

- "이 문서가 아직 코드 동작과 맞는가";
- "이 section이 stale한가";
- "이 plan이 충분히 complete한가";
- "이 표현이 제품 positioning을 잘 반영하는가".

이런 advisory finding은 유용하지만, declared review artifact나 maintainer-approved policy
없이 automation을 실패시키면 안 됩니다.

구현된 first-slice surface:

```bash
cx repo map --json
cx repo check --json
cx repo check --gate --json
```

첫 slice는 필수 documentation index, index의 local link resolve, project docs policy의
English/Korean counterpart를 검증하고, semantic freshness는 advisory-only로 기록합니다.
이것이 OpenAI 글의 "거대한 매뉴얼이 아니라 map"이라는 교훈을 Codexus식으로 구현하는
방식입니다.

Repository knowledge graph 확장은 의도적으로 [14번 문서](14-repository-knowledge-graph.md)로
분리합니다. 14번 문서는 graph-provider boundary, codexus-lite projection,
Understand-Anything JSON import, scoped graph freshness, structural graph gate를 정의합니다.

## Observability track

OpenAI 글은 UI, log, metric, trace를 Codex가 읽을 수 있게 만드는 방향을 설명합니다.
Codexus는 이를 engine-agnostic adapter를 통해서만 받아들입니다.

경계:

- Codexus는 dev server, browser journey, log bundle, screenshot, trace, metric query를
  evidence로 생성하거나 기록할 수 있습니다.
- Codexus는 그 evidence가 실제 run에 전달되었거나 context artifact에 첨부되었거나 session
  artifact에서 인용되지 않았다면 "Codex가 읽었다"고 주장하면 안 됩니다.
- Browser/DevTools/dev-server/log system은 stack-specific이므로 workflow kernel이 아니라
  adapter descriptor 뒤에 있어야 합니다.
- 생성된 evidence는 기본적으로 bounded, redacted, disposable이어야 합니다.

이 트랙은 architecture/repo-knowledge gate 이후 0.2 트랙이 적합합니다.

## Autopilot 정렬

Doc 12는 이미 OpenAI 글과 같은 결론에 도달했습니다: 장시간 autonomy에는 계약,
worktree isolation, evidence gate, 앞단 1회 human approval이 필요합니다.

여기서 같은 설계를 반복하지 않습니다. Doc 13은 doc 12의 외부 근거를 명명합니다:

- autonomy는 환경과 피드백 루프가 설계될 때만 유용함;
- acceptance criteria 추출은 heuristic이므로 approval 필요;
- 완료 권한은 agent prose가 아니라 evidence;
- `cx autopilot run`은 scope/capability gate가 증명될 때까지 experimental이어야 함.

## Subagent와 review 정렬

지원되는 Codex bridge가 생기기 전까지 subagent support는 recorder/handoff/contract-only로
유지합니다. Behavior contract는 Codexus가 subagent를 launch했다고 가장하지 않으면서도
recorded claim format을 개선할 수 있습니다.

`session subagent complete`와 file 기반 subagent result artifact에 구현된 optional field:

```json
{
  "behaviorChecklist": {
    "assumptionsSurfaced": "pass|fail|unknown",
    "simplestSufficientChange": "pass|fail|unknown",
    "surgicalScope": "pass|fail|unknown",
    "verificationEvidencePresent": "pass|fail|unknown"
  }
}
```

Codexus가 local artifact에서 fact를 도출할 수 없는 한, 이 값은 curator/subagent assertion입니다.
Review에는 영향을 줄 수 있지만 verification freshness를 갱신하거나 completion authority를
부여하지 않습니다.

## 포지셔닝

Public positioning:

```text
Codexus is a harness engineering layer for OpenAI Codex CLI.
```

이 문장은 실제 기능에 근거해야 합니다:

- durable ledger 기록;
- verification과 repair loop 실행;
- session evidence freshness 추적;
- memory와 replay-gated skill 관리;
- gated/experimental/deferred surface를 정직하게 보고.

피해야 할 주장:

- "autonomous engineer";
- "guaranteed app observer";
- "Desktop app-server 안에서 실행";
- "Codex 대체";
- "모든 나쁜 edit을 사전 방지".

## 구현 slice

1. **문서 정렬**: 이 문서 추가, documentation index link, README/doc 05 positioning 정렬,
   remaining-work 갱신. 이 slice는 문서 전용입니다.
2. **Architecture check first slice**: `codexus.architecture.policy` schema와
   `cx architecture check --json` 구현. 첫 규칙은 Codexus source의 runtime package
   import 금지입니다.
3. **Repo map/check first slice**: mechanical docs/index validation 구현. Semantic
   staleness는 advisory로 유지.
4. **Behavior evidence 확장**: `cx slop check`의 첫 surgicality, simplicity,
   assumption, verification-artifact, diff-surface lane을 구현했고 heuristic은 advisory로
   유지합니다.
5. **Subagent checklist**: recorded/complete claim artifact에 optional behavior checklist
   field를 구현했습니다. 이 값은 review input이며 completion authority가 아닙니다.
6. **Observability adapter**: 위 gate들이 안정된 뒤 dev-server/browser/log evidence descriptor
   추가.

## 비목표

- Karpathy guideline을 큰 always-on prompt로 붙이지 않음.
- Codexus session overlay를 repository knowledge base로 키우지 않음.
- derivable evidence 없이 documentation freshness나 code taste로 gate하지 않음.
- stack-specific browser/log/dev-server behavior를 kernel에 넣지 않음.
- Codexus가 다른 harness runtime에 의존하지 않음.
- 지원되는 Codex bridge 전까지 active native subagent launch를 노출하지 않음.
- report-only scope gate와 capability start gate가 증명되기 전까지 `cx autopilot run`을
  ship하지 않음.
