# 구현 피드백 리뷰

[English](../../design/04-implementation-feedback.md)

날짜: 2026-05-29

## 결론

핵심 방향은 유지합니다:

- Codex를 execution engine으로 유지
- CLI-first harness
- `codex exec --json`을 MVP driver로 사용
- app-server는 experimental gate 뒤에 둠
- run ledger를 source of truth로 유지
- self-improvement는 명시적이고 promotion-gated로 유지

## 구현 중 확인된 사항

### Claw reference 수정으로 hardening 기준 상승

확인: 올바른 Claw reference는 `ultraworkers/claw-code`이며 source를 읽을 수
있습니다. Active baseline은 `rust/` 아래 Rust CLI, JSON command contract,
typed error behavior, worker state inspection, permission mode, mock parity
fixture, event/report contract guidance입니다.

결정: Codexus architecture는 유지하되 자동화 surface의 상세 설계 기준을
높입니다. Codexus는 typed JSON error, permission/approval ledger event, 더
풍부한 replay parity fixture, app-server/daemon-like experimental surface의
truthful capability/status envelope를 추가해야 합니다.

설계 영향: runtime pivot이 아니라 hardening입니다. `codex exec --json`은 계속
MVP driver입니다. Codexus의 Claw 대비 핵심 divergence는 의도적입니다. Claw는
Codex CLI session import/export를 지원하지 않지만, Codexus는 authenticated
local Codex CLI session을 감쌉니다.

### ChatGPT 계정 subagent model limitation

고정 role model 일부는 ChatGPT-authenticated Codex 계정에서 지원되지 않았습니다. Subagent는 correctness dependency가 아니라 opportunistic acceleration으로 취급해야 합니다.

### `codex exec` flag surface 차이

top-level Codex flag가 `codex exec`에 그대로 적용되지 않습니다. Driver별 flag mapping은 capability-gated여야 합니다.

### stderr warning

성공한 Codex run도 stderr에 warning을 쓸 수 있습니다. exit code 0일 때 stderr는 raw evidence로 보존하되 driver error로 분류하지 않습니다.

### JSONL event shape

final assistant text는 nested `item.completed.item.text` 형태로 올 수 있습니다. Parser는 tolerant해야 하고 raw event를 보존해야 합니다.

## 현재 다음 우선순위

이미 구현됨:

- replay-gated skill promotion
- workflow kernel extraction
- harness-level resume
- explicit verify/replay commands
- policy preflight
- config validation

P0-P2 safe MVP surface는 구현되었습니다: 확장된 JSON error contract, ledger
decision event, driver-failure classification, minimal lock, state migration
read, active skill index/export, bounded adapter retrieval, memory lifecycle
command, replay stub, app-server fixture/status gate, project init,
observability command, packaging/static check, cron/gateway disabled gate.

다음 hardening:

- stale-lock detection/recovery와 lock inspection
- runtime validator를 versioned JSON Schema artifact로 승격
- budget/policy gate 뒤 real model-in-the-loop replay 추가
- live turn roundtrip 전에 app-server schema contract test 추가
- bounded retrieved skill/memory를 prompt-safe하게 formatting하는 Codex-native
  adapter context command 추가

전체 backlog는 [남은 작업](../remaining-work.md)에 유지합니다.
