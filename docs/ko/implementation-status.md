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
- `--json` 자동화 실패를 위한 typed JSON CLI error envelope
- workflow kernel
- policy preflight
- mock driver
- `codex exec --json` driver
- verification runner와 bounded repair loop
- experience/memory 자동 기록
- replay-gated skill promotion/deprecation
- Codexus 생성 skill의 Codex-facing 표시명 `codexus:<skill-name>`
- `.omx/state`를 건드리지 않는 OMX status/plan interop
- `codex/skills/codexus` 아래 Codex-native skill adapter source
- `${CODEX_HOME:-~/.codex}/skills/codexus`로 adapter를 설치하는 `scripts/install-codex-skill.mjs`

## 검증

- `npm test`: 34 tests 통과
- `doctor --json`: Codex auth/version/features, OMX, git, tmux, driver capability 확인
- mock driver: success/failure/repair/blocked/cancelled outcome 검증
- real Codex smoke: `CHX-GOAL-OK` final artifact 확인
- OMX adapter smoke: `.omx/state` hash 변경 없음
- static source check: private ChatGPT/Codex backend 직접 호출 없음
- Codex-native adapter wrapper root discovery 테스트
- Codex skill validator로 skill 구조 검증
- unknown command와 argument validation failure의 structured JSON error envelope 테스트

## 남은 gap

[남은 작업](remaining-work.md)에 우선순위 backlog와 설계 재검토를 정리했습니다.
현재 high-level gap:

- repair loop는 verification failure만 처리하고 driver failure repair는 아직 하지 않습니다.
- `cx memory`는 search만 노출하고 creation은 internal/automatic입니다.
- replay는 deterministic structural gate이며 model-in-the-loop replay는 아직 없습니다.
- active skill index 파일은 아직 없고 active store scan으로 listing합니다.
- Codexus skill display name은 namespace 처리되지만, active skill을 외부 Codex skill store에 별도 generated skill로 export하지는 않습니다.
- app-server driver는 MVP에서 disabled입니다.
- Codex-native adapter는 현재 외부 Codexus core를 호출하며, active skill을 현재 Codex prompt에 자동 주입하지는 않습니다.
- permission, approval, policy decision은 아직 일관된 first-class ledger event로 surface되지 않습니다.
- mutable store에 대한 explicit lock/lease handling과 schema migration reader가 아직 없습니다.
- config validation은 full JSON Schema가 아니라 basic runtime validation입니다.
- git-aware checks는 non-git workspace에서 warn하며, 이 repository에서는 git root detection이 pass합니다.
