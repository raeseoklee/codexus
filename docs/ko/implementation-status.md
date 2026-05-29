# 구현 상태

[English](../implementation-status.md)

날짜: 2026-05-29

제품명: Codexus

목표 CLI: `cx`

현재 구현 alias: `chx`

## 구현된 MVP spine

- Node 26 기반 dependency-free CLI entrypoint
- `doctor`, `init`, `run`, `plan`, `runs list`, `status`, `events tail`, `report`, `resume`, `verify`, `replay`
- `adapt omx status/retrieve`
- `memory add/search/list/review/prune`
- `skill propose/index/list/review/promote/export/deprecate`
- `cron status`, `gateway status`
- config merge와 기본 validation
- `.codex-harness/runs/<run-id>/` ledger
- atomic `state.json`, append-only `events.jsonl`
- `--json` 자동화 실패를 위한 typed JSON CLI error envelope
- state corruption typed JSON error
- permission/policy/driver-failure classification ledger event
- memory와 active-skill store의 minimal lock/lease
- workflow kernel
- policy preflight
- mock driver
- `codex exec --json` driver
- verification runner와 bounded repair loop
- experience/memory 자동 기록과 memory lifecycle command
- replay-gated skill promotion/export/deprecation과 active skill index
- Codexus 생성 skill의 Codex-facing 표시명 `codexus:<skill-name>`
- bounded active skill/memory retrieval
- deterministic replay 뒤 opt-in model replay stub
- `.omx/state`를 건드리지 않는 `cx init`
- runs/events/report observability command
- app-server schema fixture/status, live execution disabled
- cron/gateway disabled feature gate
- `npm run typecheck` syntax/static validation
- `.omx/state`를 건드리지 않는 OMX status/plan interop
- `codex/skills/codexus` 아래 Codex-native skill adapter source
- `${CODEX_HOME:-~/.codex}/skills/codexus`로 adapter를 설치하는 `scripts/install-codex-skill.mjs`

## 검증

- `npm test`: 40 tests 통과
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
- init, observability, active skill index/export, adapter retrieval, replay stub, memory lifecycle, packaging, feature gate 테스트

## 남은 gap

[남은 작업](remaining-work.md)에 우선순위 backlog와 설계 재검토를 정리했습니다.
현재 high-level gap:

- repair loop는 verification failure만 처리합니다. Driver failure는 classification만 하고 자동 repair는 아직 하지 않습니다.
- model replay는 policy/budget-gated stub이며 full model-in-the-loop replay는 아직 없습니다.
- app-server driver는 live execution disabled이며 fixture/status probe만 구현했습니다.
- Codex-native adapter retrieval은 있지만 active skill을 현재 Codex prompt에 자동 주입하지는 않습니다.
- cron/gateway automation은 feature gate 뒤에서 disabled입니다.
- lock/lease는 minimal 구현이며 stale-lock recovery는 아직 없습니다.
- config/schema validation은 external JSON Schema가 아니라 runtime validation입니다.
- git-aware checks는 non-git workspace에서 warn하며, 이 repository에서는 git root detection이 pass합니다.
