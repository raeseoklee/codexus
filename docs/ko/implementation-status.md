# 구현 상태

[English](../implementation-status.md)

날짜: 2026-05-29

제품명: Codexus

목표 CLI: `cx`

현재 구현 alias: `chx`

## 구현된 MVP spine

- Node 26 기반 dependency-free CLI entrypoint
- `doctor`, `run`, `plan`, `status`, `resume`, `verify`, `replay`
- `adapt omx status`
- `memory search`
- `skill propose/list/review/promote/deprecate`
- config merge와 기본 validation
- `.codex-harness/runs/<run-id>/` ledger
- atomic `state.json`, append-only `events.jsonl`
- workflow kernel
- policy preflight
- mock driver
- `codex exec --json` driver
- verification runner와 bounded repair loop
- experience/memory 자동 기록
- replay-gated skill promotion/deprecation
- `.omx/state`를 건드리지 않는 OMX status/plan interop

## 검증

- `npm test`: 30 tests 통과
- `doctor --json`: Codex auth/version/features, OMX, git, tmux, driver capability 확인
- mock driver: success/failure/repair/blocked/cancelled outcome 검증
- real Codex smoke: `CHX-GOAL-OK` final artifact 확인
- OMX adapter smoke: `.omx/state` hash 변경 없음
- static source check: private ChatGPT/Codex backend 직접 호출 없음

## 남은 gap

- repair loop는 verification failure만 처리하고 driver failure repair는 아직 하지 않습니다.
- `cx memory`는 search만 노출하고 creation은 internal/automatic입니다.
- replay는 deterministic structural gate이며 model-in-the-loop replay는 아직 없습니다.
- active skill index 파일은 아직 없고 active store scan으로 listing합니다.
- app-server driver는 MVP에서 disabled입니다.
- config validation은 full JSON Schema가 아니라 basic runtime validation입니다.
- workspace가 아직 git repo가 아니면 git-aware checks는 warn입니다.
