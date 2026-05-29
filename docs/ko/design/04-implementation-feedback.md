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

다음 hardening:

- model-in-the-loop replay
- active skill index와 외부 Codex/OMX skill export
- app-server schema fixture와 gated roundtrip
- git-aware project initialization
- large-output/interruption parity fixture
