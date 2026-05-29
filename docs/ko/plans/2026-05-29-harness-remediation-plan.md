# 하네스 개선 계획

[English](../../plans/2026-05-29-harness-remediation-plan.md)

날짜: 2026-05-29
상태: accepted. 이번 remediation pass에서 R1, R2a, R3, R4, R5, R6, R7, R8을
구현했습니다. R2b external `cx cancel`은 후속 작업으로 남깁니다.

## 결론

초기 구조와 안전 원칙은 좋았습니다. Zero-dependency runtime, JSON-first contract,
append-only ledger, atomic writes, capability-gated flag mapping, lock/lease,
truthful feature gate는 유지할 가치가 있습니다.

원래 검토에서 부족하다고 본 핵심은 세 가지였습니다:

1. Self-repair가 실제 실패 출력을 보지 못했습니다.
2. Durable supervision에 timeout과 cancel path가 없었습니다.
3. Evolution이 구조적으로는 맞지만 내용이 빈 skill/memory를 만들고, replay gate가
   사실상 tautological했습니다.

이번 pass는 stable `codex exec --json` 경계를 유지하면서 이 문제들을 우선순위대로
닫았습니다. 단, 외부 프로세스가 다른 프로세스의 run을 취소하는 `cx cancel <run-id>`
프로토콜은 owner/liveness/cancel-marker 설계가 필요하므로 R2b로 남겼습니다.

## 구현된 항목

### R1 — 실패 출력 기반 repair

상태: 구현.

- Verification repair는 실패한 verification command의 stdout/stderr tail을 읽어
  bounded context로 repair prompt에 넣습니다.
- Driver-failure repair는 raw driver stdout/stderr tail을 읽어 별도 bounded context로
  repair prompt에 넣습니다.
- Repair에 전달한 context는 `repair-context-*.md` 또는
  `driver-repair-context-*.md` artifact로 ledger에 남습니다.
- Secret-like token은 기존 redaction hook을 거쳐 저장/주입됩니다.

### R2a — in-process timeout, SIGINT, terminal ledger

상태: 구현.

- `codex.runTimeoutMs` config를 추가했습니다. 기본값은 30분이고 `null`이면
  timeout을 끕니다.
- Kernel에서 driver까지 `AbortSignal`을 전달합니다.
- CLI `SIGINT`는 active run을 abort하고, terminal ledger를 쓴 뒤 non-zero로
  종료합니다.
- `codex-exec` timeout은 `driver.timeout` event를 남기고 `cancelled` terminal
  outcome으로 수렴합니다.

### R2b — external `cx cancel <run-id>`

상태: deferred.

이 작업은 다른 process가 소유한 run을 취소하는 protocol입니다. Live owner는
cancel-marker를 polling하고 직접 terminal state를 써야 하며, canceller는 owner
liveness를 확인하고 request만 기록해야 합니다. R2a의 abort plumbing이 전제입니다.

### R3 — 실질적인 evolution content와 non-tautological replay

상태: 구현.

- Experience lesson은 verification command, repair history, driver-failure
  classification에서 실제 내용을 추출합니다.
- Generated skill procedure에는 source run lesson과 실제 verification command가
  들어갑니다.
- Default replay spec은 source-specific verification requirement를 검사합니다.
  따라서 boilerplate skill은 replay에서 실패할 수 있습니다.
- Promotion은 여전히 explicit review/promotion을 요구합니다.

### R4 — terminal run의 pending verification 제거

상태: 구현.

Option A를 적용했습니다. Driver failure나 policy block 때문에 verification에 도달하지
못한 경우 `latestStatus: "skipped"`와 `reason: "not_reached_*"`를 함께 기록합니다.
Schema migration 없이 additive field로 해결했습니다.

### R5 — usage/cost accounting

상태: 구현.

Codex JSONL event에서 usage/token field를 tolerant하게 파싱합니다. Usage가 있으면
terminal state와 driver result에 기록하고, 없으면 `{ "available": false }`로 명시합니다.

### R6 — async driver event phase 고정

상태: 구현.

Driver event는 mutable `state.phase`가 아니라 driver attempt를 시작할 때의 explicit
phase로 stamp합니다. Execute attempt는 `execute`, repair attempt는 `repair`로 남습니다.

### R7 — config option ignored event

상태: 구현.

Local `codex exec` capability probe가 지원하지 않는 config option은 조용히 drop하지
않고 `config.option_ignored` event로 기록합니다.

### R8 — 문서 정직성 정리

상태: 구현.

`research`와 `plan`은 state schema에는 남아 있지만 현재 kernel이 실행하는 phase가
아니므로 reserved phase로 표시했습니다. Tool/MCP expansion은 gated 상태로 설명하고,
현재 가치는 Codex 주변의 supervision, verification, recovery, evolution으로
표현했습니다.

## 권장 후속 순서

1. R2b external `cx cancel <run-id>` owner/liveness protocol 설계 및 구현.
2. Usage event shape fixture를 실제 Codex CLI 변화에 맞춰 계속 보강.
3. Evolution replay fixture를 새 canonical scenario가 추가될 때마다 확장.
4. Tool/MCP/app-server live path는 policy/approval contract가 더 단단해질 때까지
   gated 상태를 유지.

## 하지 말아야 할 것

- App-server/cron/gateway live path를 성급히 켜지 않습니다.
- `evolution.autoPromote`를 켜지 않습니다.
- Semantic-search dependency나 별도 chat surface를 추가하지 않습니다.
- Daemon을 도입하지 않습니다. CLI-core boundary는 현재 장점입니다.
