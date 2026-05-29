# 구현 상태

[English](../implementation-status.md)

날짜: 2026-05-29

제품명: Codexus

목표 CLI: `cx`

Compatibility alias: `chx`

Package는 `cx`와 `codexus`를 canonical bin으로 노출합니다. `chx`는 임시
compatibility alias로 유지합니다.

## 구현된 MVP spine

- Node 26 기반 dependency-free CLI entrypoint
- `doctor`, `init`, `run`, `plan`, `runs list`, `status`, `events tail`, `report`, `resume`, `verify`, `replay`
- `locks list/inspect/clear`, `schema check/validate/validate-run`, `app-server status/roundtrip/experiment`
- `adapt omx status/retrieve/context`
- `memory add/search/list/review/curate/prune`
- `skill propose/index/list/review/promote/export/improve/deprecate`
- `cron status/run-now`, `gateway status/check`
- config merge, normalization, focused schema enforcement
- `.codex-harness/runs/<run-id>/` ledger
- focused read-path validation이 붙은 atomic `state.json`, append-only `events.jsonl`
- `--json` 자동화 실패를 위한 typed JSON CLI error envelope
- state corruption typed JSON error
- permission/policy/driver-failure classification ledger event
- memory와 active-skill store의 minimal lock/lease 및 stale-lock inspection/recovery
- workflow kernel
- policy preflight
- mock driver
- `codex exec --json` driver
- verification runner와 bounded repair loop
- explicit-budget repairable driver-failure repair loop
- experience/memory 자동 기록과 memory lifecycle/curation command
- replay-gated skill promotion/export/improvement/deprecation과 active skill index
- Codexus 생성 skill의 Codex-facing 표시명 `codexus:<skill-name>`
- approved active skill/memory retrieval, replay approval metadata를 포함한 prompt-safe context formatting, 자동 주입 없는 approved context artifact 기록
- deterministic replay 뒤 explicit budget/policy/live-environment gated model replay
- `.omx/state`를 건드리지 않는 `cx init`
- runs/events/report observability command
- app-server schema fixture/status/dry-run roundtrip/sandbox experiment manifest 기록, live execution disabled
- cron/gateway disabled feature gate와 dry-run automation plan 및 optional audit record
- config/state/event/memory/skill versioned schema artifact와 durable read-path focused enforcement
- `npm run typecheck` syntax/static validation
- `.omx/state`를 건드리지 않는 OMX status/plan interop
- `codex/skills/codexus` 아래 Codex-native skill adapter source
- `${CODEX_HOME:-~/.codex}/skills/codexus`로 adapter를 설치하는 `scripts/install-codex-skill.mjs`

## 검증

- `npm test`: 48 tests 통과
- `npm run typecheck` 통과
- `doctor --json`: Codex auth/version/features, OMX, git, tmux, driver capability 확인
- mock driver: success/failure/repair/blocked/cancelled outcome 검증
- real Codex smoke: `CHX-GOAL-OK` final artifact 확인
- OMX adapter smoke: `.omx/state` hash 변경 없음
- static source check: private ChatGPT/Codex backend 직접 호출 없음
- Codex-native adapter wrapper root discovery 테스트
- Codex skill validator로 skill 구조 검증
- unknown command와 argument validation failure의 structured JSON error envelope 테스트
- unexpected argument, corrupt state, disabled app-server driver의 structured JSON error envelope 테스트
- init, observability, active skill index/export/improvement, adapter approved retrieval/context artifact, replay parity pass/failure coverage, gated model replay, stale lock, schema/run-ledger validation, migration fixture, driver-failure repair, app-server dry-run/experiment 기록, memory lifecycle/curation, packaging, feature gate audit-record 테스트

## 남은 gap

[남은 작업](remaining-work.md)에 우선순위 backlog와 설계 재검토를 정리했습니다.
현재 high-level gap:

- driver-failure repair는 repairable task failure에 한해 explicit budget이 있을 때만 실행됩니다.
- model replay는 local experiment gate 뒤에 있으며 routine full model-in-the-loop replay는 기본 실행하지 않습니다.
- app-server driver는 live execution disabled이며 fixture/status/dry-run roundtrip/sandbox experiment manifest 기록만 구현했습니다.
- Codex-native adapter retrieval과 approved context artifact 기록은 있지만 active skill을 현재 Codex prompt에 자동 주입하지는 않습니다.
- cron/gateway live automation은 feature gate 뒤에서 disabled이며 dry-run plan/audit record만 구현했습니다.
- config/schema validation은 focused local enforcement와 schema artifact 수준이며 full draft-2020-12 JSON Schema engine enforcement는 아직 아닙니다.
- git-aware checks는 non-git workspace에서 warn하며, 이 repository에서는 git root detection이 pass합니다.
