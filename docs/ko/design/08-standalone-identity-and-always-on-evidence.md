# 단독 정체성과 Always-On Evidence

[English](../../design/08-standalone-identity-and-always-on-evidence.md)

작성일: 2026-05-30
상태: 제안된 제품 원칙

## 결정

Codexus는 자기 축으로 진화합니다. 근시일 제품 표면은 Codex-native 세션
경험을 유지하되, 정체성은 **evidence-first**입니다. 구체적으로:

- 제품 문구와 근시일 UX 초점은 Codex-native로 유지.
- 코어(kernel, ledger, verification, event/state schema)는 engine-agnostic 유지.
- Codexus는 어떤 sibling harness를 기준으로도 자기를 정의하지 않습니다. prior harness
  work에서 배우되, 다른 harness에 대한 의존이나 adapter가 없습니다; 정체성은 evidence 축입니다.

Codexus가 소유하는 차별점은 검증 가능한 완료, 재현 가능한
실행 증거, 정직한 capability 보고, engine-agnostic driver 경계입니다.

## 왜 단독 정체성인가

Workflow-first harness는 런타임의 넓이(에스컬레이션 흐름, tmux team, worktree, HUD, 넓은 skill
어휘)를 최적화합니다. 그 축에서 더 넓습니다. 1인 알파가 그 넓이를 따라가려 하면
그들의 안방에서 지고 Codexus의 차별점이 희석됩니다.

Codexus는 다른 축에서 또렷합니다:

1. **하드 계약으로서의 verify-gated 완료.** 검증 명령이 통과해야만 `complete`이고, 실패
   출력은 제한된 repair loop로 되먹임됩니다.
2. **정직한 capability 보고.** 모든 표면이 증거에서 `observed`/`configured`/`unavailable`을
   내며, 가정에서 내지 않습니다.
3. **durable evidence ledger와 replay.** run과 세션 상태가 크래시 후 디스크에서 재구성됩니다.
4. **engine-agnostic driver 경계.** driver 추상화가 두 번째 엔진(예: Claude Code)을 kernel
   재작성 없이 열어둡니다 — workflow-first harness는 구조적으로 그렇게 만들어져 있지 않습니다.

단독 진화 = 이 축을 소유하는 것이지 넓이를 복제하는 것이 아닙니다.

## 비목표 (Non-Goals)

- "넓어 보이려고" workflow-first 넓이를 복제하지 않습니다: 큰 mode/skill/role 카탈로그, tmux team
  런타임, worktree 병렬, 워크플로 에스컬레이션 어휘를 근시일 목표로 두지 않습니다. 이들은
  나중에, 그리고 evidence 축에 봉사할 때만 돌아옵니다.
- kernel/ledger/verification/normalized event·state schema에 Codex 특수 가정을 박지 않습니다.
  Codex 특수성은 driver에만 둡니다.
- evidence 행동이 *항상 일어난다*고 약속하지 않습니다. overlay는 비결정적 에이전트에게
  best-effort 행동을 *요청*할 수 있을 뿐 강제할 수 없습니다.
- 매 턴 무거운 검증 자동 실행, 자동 skill 승격, 자동 prompt 주입, 별도 sub-run 실행을 명시적
  게이트 없이 하지 않습니다.

## Always-On Evidence

목표는 사용자가 매 턴 "codexus"라고 말하지 않아도 Codexus가 세션 lifecycle에 붙어 있는
느낌입니다 — **단** 매 턴 무거운 검증을 돌리는 것은 *아닙니다.*

### 정직성 재프레이밍 (가장 중요)

always-on 모델의 엔진은 AGENTS overlay가 Codex 에이전트에게 "변경 전 checkpoint, 완료 전
verify"를 시키는 것입니다. 그건 비결정적 모델에게 거는 *요청*이지 enforcement가 아닙니다.
어떤 턴엔 에이전트가 건너뜁니다.

따라서:

> always-on은 evidence **상태**가 항상 추적·진실 보고되는 것이지, evidence **행동**이 항상
> 일어나는 것이 아닙니다.

overlay는 best-effort 행동을 요청합니다. 진실성은 overlay 준수가 아니라 **session status
모델이 소유**합니다. 제품은 evidence가 없는데 있는 것처럼 절대 암시하지 않고, 현재 작업이
검증됐는지/stale인지/미검증인지 항상 보고합니다. 그 truthful gap 보고 자체가 evidence-first의
가치입니다.

### Ambient evidence 모델 (HUD를 기다리지 말 것)

`cx session status --json`이 지금 당장의 작고 always-on한 evidence 데이터 모델입니다. HUD와
statusline은 같은 데이터의 나중 projection입니다. status는 항상 이걸 요약해야 합니다:

```text
verification:        passed | failed | missing | stale
evidenceFresh:       true | false
dirtySinceLastVerify: true | false
recommendedVerify:   <추론된 명령, 또는 null>
lastCheckpoint:      <label / id / path>
lastVerification:    <status / path>
```

### Workspace fingerprint, not agent assertion

`dirtySinceLastVerify`와 `evidenceFresh`는 모델 자기보고가 아니라 저장된
`workspaceFingerprint`에서 결정적으로 도출해야 합니다. dirty 표시를 잊은 모델이 evidence
상태를 거짓말하게 만들면 안 됩니다. notify-dispatch 교훈 그대로: *derived가 self-asserted를
이깁니다.*

verification 시점에 Codexus는 verification artifact 옆에 작은 `workspaceFingerprint`를
기록해야 합니다:

- git `HEAD` 또는 명시적 `not_git` marker,
- staged diff hash,
- unstaged diff hash,
- 관련 untracked file list/hash,
- fingerprint를 계산한 verification timestamp와 cwd/project root.

`cx session status`는 현재 fingerprint를 다시 계산해 마지막 verified fingerprint와 비교합니다.
timestamp와 filesystem mtime은 non-git 또는 부분 관측 workspace에서만 쓰는 degraded fallback입니다.
Codexus가 신뢰 가능한 fingerprint를 계산할 수 없으면 `evidenceFresh: true`라고 주장하지 말고
verification을 `stale`로 보고하거나 불확실성을 설명해야 합니다.

### Hook = 결정적 heartbeat

Codex notify hook은 작업 의미를 이해하지 못하므로 always-on 지능을 구동하지 않습니다. 신뢰
가능한 역할은 heartbeat입니다: `turn-ended` 시 도출 evidence 상태를 *재계산*해, 에이전트
협조 여부와 무관하게 status를 최신으로 유지. overlay + session commands + status 모델이
중심이고, hook은 도출 상태를 최신으로 유지만 합니다.

hook이 unavailable이거나 실제 dispatch가 아직 관측되지 않아도 always-on이 사라지는 것은
아닙니다. `cx session status`가 호출될 때 evidence 모델을 on-demand로 재계산해야 합니다.
hook은 관측된 heartbeat이지 source of truth가 아닙니다.

### verify 자동 감지: 감지·추천은 항상, 실행은 opt-in

매번 `--verify "npm test"`를 요구하는 건 evidence-first UX로는 약합니다.

- `cx session verify --auto --json`은 프로젝트 신호에서 보수적인 추천을 추론해 반환합니다.
  이 명령 자체는 검증 명령을 실행하지 않습니다.
  - `package.json` scripts: `test`, `typecheck`, `lint`, `ci`
  - `Cargo.toml` -> `cargo test`; `go.mod` -> `go test ./...`;
    `pyproject.toml` / `pytest.ini` -> `pytest`
- 강한 후보가 하나면 기본 추천값. 여럿이면 `recommended`/`candidates`/`reason`을 JSON으로 반환.
- 실행은 `cx session verify --auto --execute --json` 같은 명시적 실행 opt-in 또는
  `cx session verify --verify "<cmd>" --json`처럼 명시적 명령이 있을 때만 합니다.
- dangerous command는 기존 policy preflight로 차단.
- **감지·추천은 항상(P0). 실행은 opt-in·bounded**(세션 opt-in, timeout, 가능하면 매 턴이
  아니라 작업 경계). 보수적 기본값은 실행이 아니라 `stale`/`missing` + 추천 명령 *표시*.

### 단계적 자동화 정책

- 자동 허용: `status`, `checkpoint`, memory lookup, evidence summary.
- 조건부 자동 허용: allowlist된 bounded `verify` 명령.
- 자동 금지: 별도 `cx run` sub-run, destructive command, live cron/gateway, 자동 skill 승격,
  자동 prompt 주입.

## Evidence-Bearing-Only 수용 게이트

양성 design rule이자 command 수용 기준. 새 세션-UX 표면은 evidence-bearing일 때만 허용.

허용 (각각 evidence를 낳거나 surface):

- `checkpoint`: durable artifact를 남김.
- `verify`: completion evidence를 남김.
- `memory search`: source-linked evidence를 surface.
- `replay`: skill 승격 evidence를 검증.
- `status` / HUD: evidence를 legible하게.

거부:

- 멋진 mode 이름만 가치인 표면.
- ledger에 영향 없는 role/skill 증가.
- Codex가 이미 하는 일을 다른 이름으로 감싸는 것.

## Engine-Agnostic 불변식

- `driver` enum(`codex-exec`/`mock`/`codex-app-server`)을 점차 `engine` + `driverId` +
  `capabilities` descriptor로 대체해, 두 번째 엔진이 schema migration을 강제하지 않게.
- normalized event·state schema에 Codex 특수 가정이 없는지 감사. Codex 이벤트 모양
  (`thread.started`, `item.completed`, `turn.completed`)은 driver 내부이고, harness 이벤트는
  engine-neutral이어야.
- 제품 문구는 Codex-native로 남아도 되지만, kernel이 "Codex라서 가능했다"를 가정하면 안 됨.

## Command 표면 (첫 슬라이스)

```bash
cx setup codex-session --scope project --always-on --json
cx session status --json        # 도출된 dirty/fresh를 담은 ambient evidence 모델
cx session verify --auto --json # 감지+추천만; 실행 없음
cx session verify --auto --execute --json # 명시적 bounded 실행 opt-in
```

always-on overlay 규칙의 취지: 사용자가 Codexus를 언급하지 않아도 코드 변경 작업은
best-effort checkpoint·verification evidence를 남긴다 — 단 무엇이 검증/stale/미검증인지의
*진실*은 overlay 준수가 아니라 session status 모델이 보장한다.

Overlay는 행동을 요청할 뿐, 행동을 증명하지 않습니다. Notify hook의 역할도 좁습니다:
`turn-ended` heartbeat가 bounded derived evidence snapshot을 기록하지만, hook은 verification을
실행하지 않고 `cx session status --json`가 계속 authoritative source입니다.

## 구현 슬라이스

1. `cx session status`를 ambient evidence 모델로 강화. `dirtySinceLastVerify`/`evidenceFresh`를
   저장된 `workspaceFingerprint`와 현재 fingerprint의 비교에서 도출. git hash를 우선하고,
   timestamp/mtime은 강한 freshness를 주장할 수 없는 degraded fallback으로만 사용.
2. 완료: `cx session verify --auto` 자동 감지 추가(감지+추천 항상; 실행 opt-in·bounded;
   실행은 `--execute` 같은 명시적 실행 opt-in에서만; danger는 policy preflight).
3. 완료: `--always-on` overlay 프로필 추가, notify hook을 `turn-ended` 시 도출 evidence 상태를
   기록하는 heartbeat로.
4. evidence-bearing-only 규칙을 설계 문서와 command 수용 기준에 추가.
5. Codex-bound 가정을 driver/kernel/event schema에서 분리 시작(descriptor 기반 driver 정체성),
   제품 초점은 바꾸지 않고.

## 수용 기준

- `cx session status --json`이 verification 신선도, 결정적으로 도출된 dirty 플래그, 추천 verify
   명령, 마지막 checkpoint·verification을 보고 — 디스크에서 재구성 가능.
- `cx session verify --auto --json`이 프로젝트 신호에서 검증 명령을 추론하고, 추천 evidence를
   반환하며, 실행하지 않음.
- `cx session verify --auto --execute --json`은 policy preflight 뒤 명시적·bounded opt-in에서만
   실행.
- dirty/stale 플래그가 에이전트가 상태를 한 번도 갱신하지 않아도 정확함 — workspace
  fingerprint에서 도출되므로. degraded fallback은 거짓 freshness 대신 불확실성 또는 stale을
  보고.
- evidence-bearing이 아니면 새 세션-UX 표면을 출시하지 않음.
- 두 번째 엔진을 출시하기 전에 driver identity migration plan이 명시되어 있음: 새로운
  Codex-specific 가정이 kernel·ledger·verification·normalized event/state schema에 들어가지 않고,
  Codex 밖으로 넓히기 전 `engine`/`driverId`/`capabilities` descriptor field가 도입됨.

## Sibling Harness와의 관계

Codexus는 독립적 evidence-first 정체성을 가집니다. 다른 harness(workflow-first 또는
session-native)를 배울 prior art로 대하되, 그중 무엇에도 의존하지 않고 cross-harness adapter도
싣지 않습니다. 여기서 독립은 적대가 아니라 정체성입니다: Codexus는 evidence 축을 소유함으로써
정의되지, 비교로 정의되지 않습니다.
