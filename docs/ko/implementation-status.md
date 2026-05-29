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
- unrelated tool state를 건드리지 않는 `cx init`
- runs/events/report observability command
- app-server schema fixture/status/dry-run roundtrip/sandbox experiment manifest 기록, optional `codex app-server --help` process-probe evidence, deterministic fake lifecycle supervision, live execution disabled
- cron/gateway disabled feature gate와 policy/approval contract field를 포함한 dry-run automation plan 및 optional audit record
- config/state/event/memory/skill versioned schema artifact, durable read-path focused enforcement, single-record/run-ledger schema artifact subset validation
- `npm run typecheck` syntax/static validation
- normal Codexus runtime path 바깥에 둔 optional advanced interop capability probe/export
- `codex/skills/codexus` 아래 Codex-native skill adapter source
- `${CODEX_HOME:-~/.codex}/skills/codexus`로 adapter를 설치하는 `scripts/install-codex-skill.mjs`
- `doctor --json`의 installed Codexus skill tree match 진단과 installer source/installed tree hash metadata
- `doctor --json --strict`는 JSON 진단 body를 유지하면서 fail-level check가 있을 때 nonzero exit code를 반환합니다.
- Verification repair는 실패한 verification stdout/stderr tail을 bounded context
  artifact로 기록하고 repair prompt에 주입합니다.
- Driver-failure repair는 raw driver log tail을 bounded context artifact로 기록하고
  repair prompt에 주입합니다.
- Driver event phase는 mutable state가 아니라 explicit attempt phase로 기록됩니다.
- Verification에 도달하지 못한 terminal run은 `pending`이 아니라 `skipped`와
  `not_reached_*` reason을 기록합니다.
- `codex-exec`는 `codex.runTimeoutMs`, AbortSignal cancellation, CLI SIGINT,
  `driver.timeout` evidence, terminal `cancelled` ledger를 지원합니다.
- Experience와 generated skill은 verification command, repair history,
  driver-failure classification에서 source-specific lesson/replay requirement를
  생성합니다.
- Codex JSONL usage가 있으면 terminal state에 기록하고, 없으면
  `{ "available": false }`로 명시합니다.
- 지원되지 않는 Codex exec config option은 `config.option_ignored` ledger event로
  기록합니다.
- GitHub Actions CI는 main push와 pull request에서 committed whitespace check, static syntax validation, unit test를 실행합니다.
- Local CI parity는 `npm run ci`로 실행할 수 있습니다. Remote Actions 실행은 repository/account runner availability에 의존합니다.
- Public repository readiness file이 추가되었습니다: MIT license, contributing guide, security policy, support guide, code of conduct, roadmap, changelog, issue template, PR template.
- Root `install.sh`는 GitHub Pages `curl | sh` 설치, local-source test install, canonical bin link, optional Codex skill adapter 설치를 지원합니다.
- User-facing Codex-session usage 문서는 `$codexus` skill 호출법, 우선 사용할 명령, 일반 Codex interaction을 유지해야 하는 경우를 설명합니다.

## 검증

- `npm test`: 63 tests 통과
- `npm run typecheck` 통과
- CI workflow: `.github/workflows/ci.yml`
- Local CI parity: `npm run ci`
- `doctor --json`: Codex auth/version/features, git, tmux, driver capability,
  optional advanced interop readiness 확인
- `doctor --json --strict`: missing command 진단이 `ok:false`와 exit 1을 반환함을 확인
- mock driver: success/failure/repair/blocked/cancelled outcome 검증
- repair context artifact, verification not-reached reason, AbortSignal
  cancellation, fake Codex exec timeout, usage accounting, source-specific replay
  failure 검증
- real Codex smoke: `CHX-GOAL-OK` final artifact 확인
- Advanced interop smoke: external harness state에 대한 read-only behavior 확인
- static source check: private ChatGPT/Codex backend 직접 호출 없음
- Codex-native adapter wrapper root discovery 테스트
- Codex skill validator로 skill 구조 검증
- unknown command와 argument validation failure의 structured JSON error envelope 테스트
- unexpected argument, corrupt state, disabled app-server driver의 structured JSON error envelope 테스트
- init, observability, active skill index/export/improvement, adapter approved retrieval/context artifact, full replay parity fixture-matrix coverage, gated model replay, stale lock, schema/run-ledger validation, migration fixture, driver-failure repair, app-server dry-run/experiment process-probe 및 fake-supervision 기록, memory lifecycle/curation, packaging, installed-skill tree diagnosis, feature gate policy/audit-record 테스트

## 남은 gap

[남은 작업](remaining-work.md)에 우선순위 backlog와 설계 재검토를 정리했습니다.
현재 high-level gap:

- driver-failure repair는 repairable task failure에 한해 explicit budget이 있을 때만 실행됩니다.
- external `cx cancel <run-id>`는 아직 구현하지 않았습니다. 현재 cancel은
  in-process timeout/SIGINT/AbortSignal 경로입니다.
- model replay는 local experiment gate 뒤에 있으며 routine full model-in-the-loop replay는 기본 실행하지 않습니다.
- app-server driver는 live execution disabled이며 fixture/status/dry-run roundtrip/sandbox experiment manifest 기록, help-process probe evidence, deterministic fake lifecycle supervision만 구현했습니다.
- Codex-native adapter retrieval과 approved context artifact 기록은 있지만 active skill을 현재 Codex prompt에 자동 주입하지는 않습니다.
- cron/gateway live automation은 feature gate 뒤에서 disabled이며 dry-run plan/audit record와 policy/approval contract field만 구현했습니다.
- config/schema validation은 focused local enforcement와 local schema artifact subset enforcement 수준이며 full draft-2020-12 JSON Schema engine enforcement는 아직 아닙니다.
- git-aware checks는 non-git workspace에서 warn하며, 이 repository에서는 git root detection이 pass합니다.
