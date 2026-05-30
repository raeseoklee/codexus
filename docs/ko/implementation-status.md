# 구현 상태

[English](../implementation-status.md)

날짜: 2026-05-29

제품명: Codexus

목표 CLI: `cx`

Public bins: `cx`, `codexus`

Npm package는 `cx`와 `codexus`를 canonical bin으로 노출합니다. 기존 `chx`
alias는 공개 npm bin으로 배포하지 않습니다.

## 구현된 MVP spine

- Node 22+ npm-installed CLI entrypoint: `dist/cli/main.js`
- Source development entrypoint: `node src/cli/main.ts`
- `doctor`, `init`, `run`, `cancel`, `plan`, `runs list`, `status`, `events tail`, `report`, `resume`, `verify`, `replay`
- `locks list/inspect/clear`, `schema check/validate/validate-run`, `app-server status/roundtrip/experiment`
- `memory add/search/list/review/curate/prune`
- `skill propose/index/list/review/promote/export/improve/deprecate`
- `cron status/run-now`, `gateway status/check`
- config merge, normalization, focused schema enforcement
- `.codexus/runs/<run-id>/` ledger
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
- `npm run build`는 TypeScript source를 esbuild로 bundle해 npm 설치용
  `dist/cli/main.js`를 만듭니다.
- `npm run package:smoke`는 `npm pack`, 임시 global install,
  `codexus --help`, `cx --help`, runtime schema asset, postinstall Codex skill
  adapter 설치, mock run을 검증합니다.
- `prepublishOnly`는 local CI와 package smoke를 묶은 `npm run release:check`를
  실행합니다.
- npm tarball은 `dist`, `schemas`, Codex skill adapter,
  `fixtures/app-server/schema.fixture.json`, `install.sh`, package installer
  scripts, top-level release metadata만 싣고 source, tests, docs,
  replay/migration fixture는 제외합니다.
- `npm run typecheck` syntax/static validation
- normal Codexus runtime path 바깥에 둔 optional advanced interop capability probe/export
- `codex/skills/codexus` 아래 Codex-native skill adapter source
- Global npm install은 `scripts/postinstall.mjs`를 통해
  `CODEXUS_INSTALL_CODEX_SKILL=0`이 아닐 때
  `${CODEX_HOME:-~/.codex}/skills/codexus`에 adapter를 설치합니다.
- `scripts/install-codex-skill.mjs`는 명시적 adapter refresh 또는 cloned repository
  install에 계속 사용합니다.
- `doctor --json`의 installed Codexus skill tree match 진단과 installer source/installed tree hash metadata
- `doctor --json --strict`는 JSON 진단 body를 유지하면서 fail-level check가 있을 때 nonzero exit code를 반환합니다.
- `.codexus`가 canonical project runtime root입니다. CLI가 legacy `.codex-harness`를
  발견하면 `.codexus`로 이관한 뒤 legacy directory를 제거합니다. 충돌 file은
  `.codexus/migration-conflicts/` 아래에 보존합니다.
- `cx setup codex-session`은 project 또는 user `AGENTS.md`에 marker-bounded Codexus
  runtime overlay를 설치/갱신하며 marker 밖 내용은 변경하지 않습니다.
- Codexus AGENTS overlay write는 atomic이며 one-time `.codexus.bak` backup을 만들고,
  기존 marker가 손상된 경우 새 marker block을 append합니다.
- `cx session status`, `cx session checkpoint`, `cx session verify`는
  `.codexus/session/` 아래 첫 Codex-native session surface를 제공합니다.
- `cx setup codex-session --enable-notify-hook`은 현재 project가 Codex config에서
  trusted일 때만 Codex notify hook을 설치합니다. 기존 top-level `notify = [...]`
  command는 `--previous-notify` chain으로 보존합니다.
- Notify-hook setup은 `${CODEX_HOME:-~/.codex}/config.toml`을 atomically 쓰고,
  one-time `config.toml.codexus.bak` backup을 만들며,
  `--disable-notify-hook`은 이전 notify command를 복원하거나 Codexus-only notify
  line을 AGENTS overlay refresh 없이 제거합니다.
- `cx session notify --event <name>`은 internal notify-hook write surface이며
  bounded hook event를 `.codexus/session/state.json`에 기록합니다.
- Session state schema v2는 notify 설치와 dispatch 관측을 분리합니다.
  `capabilities.hooks`는 install 직후 `configured`이고 실제 `turn-ended` event가
  관측된 뒤에만 `available`입니다. 수동 smoke event는 dispatch observed로 인정하지
  않습니다.
- `cx session migrate [--dry-run]`은 `.codexus/session/state.json`의 explicit
  migration boundary입니다. Pending migration을 보고하고, `--dry-run`이 아니면
  persist합니다.
- `cx session verify`는 verification policy preflight를 재사용해 위험한 command를
  실행하지 않고 blocked verification attempt로 기록합니다.
- Session state read path는 focused structure validation을 수행하고, mutable session
  state update는 Codexus `session` lock으로 보호합니다.
- `schemas/session-state.schema.json`은 v2 session-state shape용 first-class schema
  artifact이며,
  `cx schema validate --type session-state --file <path> --json`은 같은 local
  schema-artifact subset engine으로 session state를 검증합니다.
- `doctor --json`은 Codexus session state, project/user overlay 상태,
  notify-hook 설치 상태, notify dispatch 관측 상태, statusline integration의
  unavailable 상태를 정직하게 보고합니다.
- Verification repair는 실패한 verification stdout/stderr tail을 bounded context
  artifact로 기록하고 repair prompt에 주입합니다.
- Driver-failure repair는 raw driver log tail을 bounded context artifact로 기록하고
  repair prompt에 주입합니다.
- Repair context redaction은 API token, AWS key, JWT, key/value secret
  assignment, `.env` dump, private-key block의 대표 패턴을 막습니다.
- Driver event phase는 mutable state가 아니라 explicit attempt phase로 기록됩니다.
- Verification에 도달하지 못한 terminal run은 `pending`이 아니라 `skipped`와
  `not_reached_*` reason을 기록합니다.
- `codex-exec`는 `codex.runTimeoutMs`, AbortSignal cancellation, CLI SIGINT,
  `driver.timeout` evidence, terminal `cancelled` ledger를 지원합니다.
- `cx cancel <run-id>`는 live owner에 cancel marker를 쓰고, dead-owner running
  ledger는 explicit event와 함께 orphan-cancelled로 닫습니다.
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
- Root `install.sh`는 GitHub Pages `curl | sh` 설치에서 npm(`codexus@next` 기본값)에
  위임하고, canonical bin link와 `CODEXUS_INSTALL_CODEX_SKILL=0`이 아닐 때 Codex
  skill adapter 설치를 수행합니다.
- User-facing Codex-session usage 문서는 `$codexus` skill 호출법, 우선 사용할 명령, 일반 Codex interaction을 유지해야 하는 경우를 설명합니다.
- Session-native supervision 설계는 OMX-like in-Codex usage를 제품 방향으로
  정리했고, `codex exec resume`은 별도 external multi-turn feature로 deferred했습니다.

## 검증

- `npm test`: 87 tests 통과
- `npm run typecheck` 통과
- CI workflow: `.github/workflows/ci.yml`
- Local CI parity: `npm run ci`
- Package smoke: `npm run package:smoke`
- Node 22 installed-package smoke: packed tarball을 임시 global install한 뒤
  Node 22.22.3으로 `codexus --help`, `codexus schema check --json`, mock run 실행
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
- Session-native setup, damaged-marker recovery, session-state shape/schema
  validation, session lock handling, legacy root migration, status/checkpoint/verify,
  policy-blocked session verification, notify-hook trust refusal,
  notify-chain preservation, notify-hook disable, config backup,
  focused/schema validator drift case, explicit session-state migration,
  manual-smoke dispatch false-positive protection CLI 테스트
- unknown command와 argument validation failure의 structured JSON error envelope 테스트
- unexpected argument, corrupt state, disabled app-server driver의 structured JSON error envelope 테스트
- init, observability, active skill index/export/improvement, adapter approved retrieval/context artifact, full replay parity fixture-matrix coverage, gated model replay, stale lock, schema/run-ledger validation, migration fixture, driver-failure repair, app-server dry-run/experiment process-probe 및 fake-supervision 기록, memory lifecycle/curation, packaging, installed-skill tree diagnosis, feature gate policy/audit-record 테스트

## 남은 gap

[남은 작업](remaining-work.md)에 우선순위 backlog와 설계 재검토를 정리했습니다.
현재 high-level gap:

- driver-failure repair는 repairable task failure에 한해 explicit budget이 있을 때만 실행됩니다.
- model replay는 local experiment gate 뒤에 있으며 routine full model-in-the-loop replay는 기본 실행하지 않습니다.
- app-server driver는 live execution disabled이며 fixture/status/dry-run roundtrip/sandbox experiment manifest 기록, help-process probe evidence, deterministic fake lifecycle supervision만 구현했습니다.
- Codex-native adapter retrieval과 approved context artifact 기록은 있지만 active skill을 현재 Codex prompt에 자동 주입하지는 않습니다.
- Codex가 stable per-conversation id를 Codexus에 노출하지 않기 때문에 session state는
  현재 cwd-scoped singleton입니다.
- Notify-hook integration은 explicit setup과 Codex project trust check 뒤에
  구현됐습니다. Statusline integration과 tmux-backed Codexus worker는 설계됐지만
  아직 구현되지 않았습니다.
- cron/gateway live automation은 feature gate 뒤에서 disabled이며 dry-run plan/audit record와 policy/approval contract field만 구현했습니다.
- config/schema validation은 focused local enforcement와 local schema artifact subset enforcement 수준이며 full draft-2020-12 JSON Schema engine enforcement는 아직 아닙니다.
- git-aware checks는 non-git workspace에서 warn하며, 이 repository에서는 git root detection이 pass합니다.
