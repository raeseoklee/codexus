# 구현 상태

[English](../implementation-status.md)

날짜: 2026-06-01

제품명: Codexus

목표 CLI: `cx`

Public bins: `cx`, `codexus`

현재 stable baseline: `0.1.1`

Npm package는 `cx`와 `codexus`를 canonical bin으로 노출합니다. 기존 `chx`
alias는 공개 npm bin으로 배포하지 않습니다.

## 구현된 MVP spine

- Node 22+ npm-installed CLI entrypoint: `dist/cli/main.js`
- Source development entrypoint: `node src/cli/main.ts`
- `doctor`, `init`, `run`, `cancel`, `plan`, `runs list`, `status`, `events tail`, `report`, `resume`, `verify`, `replay`, `replay parity`
- `locks list/inspect/clear`, `schema check/engine/validate/validate-run`, `app-server status/roundtrip/experiment`
- `slop check`
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
- experience/memory 자동 기록과 conflict/quality finding을 포함한 memory lifecycle/curation command
- replay-gated skill promotion/export/improvement/deprecation과 active skill index
- Codexus 생성 skill의 Codex-facing 표시명 `codexus:<skill-name>`
- approved active skill/memory retrieval, replay approval metadata를 포함한 prompt-safe context formatting, 자동 주입 없는 approved context artifact 기록
- deterministic replay 뒤 explicit budget/policy/live-environment gated model replay
- unrelated tool state를 건드리지 않는 `cx init`
- runs/events/report observability command
- app-server schema fixture/status/dry-run roundtrip/sandbox experiment manifest 기록, optional `codex app-server --help` process-probe evidence, deterministic fake lifecycle supervision, isolated real Stage A evidence, explicit opt-in Stage B read-only socket observation, live execution disabled
- cron/gateway disabled feature gate와 policy/approval contract field를 포함한 dry-run automation plan 및 optional audit record
- config/state/event/memory/skill/session-state/supply-chain-policy/decision
  versioned schema artifact, durable read-path focused enforcement,
  single-record/run-ledger schema artifact subset validation
- `npm run build`는 TypeScript source를 esbuild로 bundle해 npm 설치용
  `dist/cli/main.js`를 만듭니다.
- `npm run package:smoke`는 `npm pack`, 임시 global install,
  `codexus` / `cx` help와 version 출력, runtime schema asset, postinstall Codex
  skill adapter 설치, fake Codex fixture를 통한 `doctor --json --strict`,
  `supply-chain check --gate`, installed-package mock pass/fail/repair/status/
  events/resume/cancel 흐름을 검증합니다.
- `prepublishOnly`는 local CI, package smoke, report-only supply-chain dogfood,
  `cx release check --gate --json`을 묶은 `npm run release:check`를 실행합니다.
  Package smoke에는 설치된 package에 대한 gate-mode supply-chain check가 포함됩니다.
- `cx release check --json`은 source checkout의 experimental release-integrity
  evidence를 보고합니다. Stable installer default, expected-version guard,
  pinned trusted-publishing workflow, GitHub Release `install.sh` asset wiring,
  local release-evidence doc을 확인합니다. `--live`는 npm `latest`, GitHub latest,
  installer asset hash identity를 확인하는 명시적 post-publish sign-off입니다.
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
- `cx setup codex-session --always-on`은 위험한 변경 전 checkpoint와 완료 전
  verification을 Codex에 요청하는 overlay profile을 설치합니다. 진실의 기준은 계속
  `cx session status --json`입니다.
- Codexus AGENTS overlay write는 atomic이며 one-time `.codexus.bak` backup을 만들고,
  기존 marker가 손상된 경우 새 marker block을 append합니다.
- `cx session status`, `cx session checkpoint`, `cx session verify`는
  `.codexus/session/` 아래 첫 Codex-native session surface를 제공합니다.
- `cx session verify --auto`는 보수적인 verification 후보를 감지하되 실행하지 않습니다.
  추천 command 실행에는 기존 policy preflight를 통과하는 명시적 `--execute`가 필요합니다.
- `cx session hud --json`은 statusline integration이 unavailable인 동안 Codex
  chat/status workflow용 compact read-only session summary를 보고합니다.
- `cx session decision record/list/status`는 `.codexus/session/decisions/` 아래에
  schema-valid `codexus.decision` artifact를 기록하고 읽습니다. 이 artifact는
  constraint, rejected alternative, rationale, relative evidence link를 advisory
  control-plane evidence로 보존하지만 완료 권한은 갖지 않습니다.
- `cx session loop --json`, `cx session status --json`, `cx session hud --json`은
  session verification ledger에서 반복 실패 요약을 파생해 보고합니다. Loop boundary는
  decision stop이지 task failure나 completion의 증명이 아닙니다.
- Notify-hook `turn-ended` heartbeat는 read-only `heartbeatEvidence`와 compact
  `heartbeatChangeEvidence` snapshot을 기록할 수 있습니다. Verification을 실행하지 않고
  stale evidence를 fresh로 만들 수 없습니다.
- `cx slop check`와 `cx session slop`은 quality evidence guard를 제공합니다:
  tri-state `changeEvidence`, derivable evidence gap, non-gating derivable fact,
  advisory heuristic claim, 명시적 diff base metadata, optional declared-scope 및
  explicit review-artifact check. `--gate`는 같은 tri-state evidence status를
  automation exit code로 변환하지만 heuristic으로 change를 fail시키지는 않습니다.
- `cx session subagent record/attach/status`는 subagent claim bundle을
  `.codexus/session/subagents/` 아래 기록하고 session state에서 link하며, subagent claim을
  verification freshness와 분리합니다. `cx session subagent launch`는
  `launcher.supported: false`인 deferred launcher contract를 기록합니다.
  `cx session subagent complete`는 현재 Codex session에서 사용한 native subagent의 최종
  claim과 optional `pass|fail|unknown` behavior checklist assertion을 기록하되 Codexus가
  spawn했다고 주장하지 않습니다. Codexus는 여전히 CLI에서 native subagent를 spawn하지
  않습니다.
- `cx session workers status --json`은 worker pane을 시작하지 않고 tmux-backed worker
  launch gate를 보고합니다.
- `cx setup codex-session --enable-notify-hook`은 현재 project가 Codex config에서
  trusted일 때만 Codex notify hook을 설치합니다. 기존 top-level `notify = [...]`
  command는 `--previous-notify` chain으로 보존합니다.
- Notify-hook setup은 `${CODEX_HOME:-~/.codex}/config.toml`을 atomically 쓰고,
  one-time `config.toml.codexus.bak` backup을 만들며,
  `--disable-notify-hook`은 이전 notify command를 복원하거나 Codexus-only notify
  line을 AGENTS overlay refresh 없이 제거합니다.
- `cx session notify --event <name>`은 internal notify-hook write surface이며
  bounded hook event를 `.codexus/session/state.json`에 기록합니다.
- 실제 `turn-ended` dispatch에서 notify event는 derived evidence model의 bounded
  snapshot인 `heartbeatEvidence`를 포함할 수 있습니다. Hook은 verification을 실행하지
  않고 stale evidence를 fresh로 만들 수도 없습니다.
- Session state schema v5는 notify 설치와 dispatch 관측을 분리하고
  workspace-fingerprint evidence 및 read-only subagent claim/launch contract artifact link를
  추가합니다.
  `capabilities.hooks`는 install 직후 `configured`이고 실제 `turn-ended` event가
  관측된 뒤에만 `available`입니다. 수동 smoke event는 dispatch observed로 인정하지
  않습니다.
- `cx session migrate [--dry-run]`은 `.codexus/session/state.json`의 explicit
  migration boundary입니다. Pending migration을 보고하고, `--dry-run`이 아니면
  persist합니다.
- `cx session verify`는 verification policy preflight를 재사용해 위험한 command를
  실행하지 않고 blocked verification attempt로 기록합니다.
- `cx schema engine --json`은 dependency를 추가하지 않고 active local schema subset
  engine과 unavailable full JSON Schema engine을 보고합니다.
- `cx architecture check --json`은 schema-validated architecture policy fact와
  forbidden-import evidence를 보고합니다. Broad layering analysis는 첫 slice에서
  heuristic으로 남으며 `broad_layering_rule_deferred`로 자기보고합니다.
- `cx supply-chain check --json`은 로컬 derivable package evidence를
  `evidenceGaps`, `derivableFacts`, `heuristicClaims`, `blockingUnknowns`,
  `informationalUnknowns`로 보고합니다. `--gate`는 evidence gap과 blocking
  unknown만 exit code에 반영하며, 기본 경로는 static package projection을 사용하고
  package lifecycle script를 실행하지 않습니다. Dependency name similarity / typosquat
  평가는 advisory로 남으며 `typosquat_name_similarity_deferred`로 자기보고합니다.
- `cx replay parity --json`은 committed fixture 기반 canonical replay parity label
  coverage를 보고하고 no-new-label-without-fixture contract를 보존합니다.
- Cron/gateway live path는 `policy-reviewed-live-dispatch-v1` policy contract를 공유하고
  dispatcher가 생길 때까지 blocked로 남습니다.
- Session state read path는 focused structure validation을 수행하고, mutable session
  state update는 Codexus `session` lock으로 보호합니다.
- `schemas/session-state.schema.json`은 v5 session-state shape용 first-class schema
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
- Root `install.sh`는 GitHub Pages `curl | sh` 설치에서 npm(`codexus` 기본값)에
  위임하고, canonical bin link와 `CODEXUS_INSTALL_CODEX_SKILL=0`이 아닐 때 Codex
  skill adapter 설치를 수행합니다.
- GitHub Pages deploy는 `.github/workflows/pages.yml`의 repository-owned workflow가
  담당합니다. 이 workflow는 pinned Node 24-compatible action과 명시적인 Node 24
  JavaScript action opt-in을 사용하며 legacy GitHub-managed Pages deploy path를
  대체합니다.
- User-facing Codex-session usage 문서는 `$codexus` skill 호출법, 우선 사용할 명령, 일반 Codex interaction을 유지해야 하는 경우를 설명합니다.
- Session-native supervision 설계는 Codex-native in-Codex usage를 제품 방향으로
  정리했고, `codex exec resume`은 별도 external multi-turn feature로 deferred했습니다.
- Desktop app-server discovery는 experimental read-only evidence command로
  구현됐습니다. `cx app-server discover --json/--record`는 live socket에 연결하거나
  remote control을 켜지 않고 default control socket 존재 여부, 실행 중인 app-server
  transport mode, Stage B readiness를 보고합니다. 현재 maintainer evidence는
  `stdio_only`이므로 positive Desktop attachment는 explicit socket 또는 stdio-observer
  설계 전까지 계속 blocked입니다.

## 검증

- `npm test`: 176 tests 통과
- `npm run typecheck` 통과
- CI workflow: `.github/workflows/ci.yml`
- Local CI parity: `npm run ci`
- Package smoke: `npm run package:smoke`
- Node 22 installed-package smoke: packed tarball을 임시 global install한 뒤
  Node 22.22.3으로 `codexus --help`, `codexus schema check --json`, mock run 실행
- Installed package release smoke: `codexus` / `cx` help와 version, postinstall
  Codex skill adapter 설치, fake Codex fixture를 통한 `doctor --json --strict`,
  `supply-chain check --gate`, mock pass/fail/repair, status/events/resume,
  terminal cancel behavior
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
- Session HUD, quality evidence guard의 explicit review-artifact link, schema
  engine status, replay parity status, adapter injection approval artifact,
  session worker gate, subagent spawn rejection, deferred launcher-contract,
  hosted completion handoff CLI 테스트
- Slop guard gate mode의 pass, fail, unknown/blocked outcome 테스트
- Supply-chain evidence의 report-only/gate mode, policy validation, lifecycle
  미실행, package artifact secret leak, Codexus package dogfood 테스트
- Always-on notify heartbeat quality snapshot은 session-native test와 session-state
  schema validation으로 커버됩니다.
- CLI version reporting은 source CLI test와 installed package smoke test로
  커버됩니다.
- Repository graph foundation 테스트는 `cx repo graph build/check`, repo-graph schema
  validation, scope 밖 변경을 무시하는 scoped freshness, scope 안 변경 stale detection,
  dangling edge failure, volatile gate output을 제외하는 stable graph id를 커버합니다.
- Multi-engine relay recorder 테스트는 artifact import-only 동작, relay
  session/stage-gate/convergence schema validation, 같은 artifact convergence 요구,
  `delta-check` convergence 거부, valid convergence가 verification 실패 시 완료를 만들 수
  없다는 invariant를 커버합니다.
- Autopilot contract는 0.2/0.3 experimental surface로만 문서화되어 있습니다.
  아직 구현되지 않았고 0.1.x stable contract에는 포함되지 않습니다.
- Repository knowledge graph는 experimental 첫 slice를 갖습니다:
  `cx repo graph build/check`는 persisted codexus-lite graph artifact, scoped freshness,
  deterministic graph identity, structural gate를 내보냅니다. External graph import,
  search/explain, context injection은 0.1.x stable contract 밖에서 deferred입니다.
- Multi-engine relay autopilot은 experimental recorder/checker 첫 slice를 갖습니다:
  `cx autopilot relay record`는 다른 engine을 spawn하지 않고 외부 author/reviewer
  artifact를 import하고, `cx autopilot relay stage-gate`는 `delta-check`/`full-gate`
  evidence를 기록하며, `cx autopilot relay check-agreement`는 같은 artifact convergence를
  검증하고 verification 실패 시 convergence가 완료를 만들 수 없음을 증명합니다.
  Acceptance-criteria-to-verification matrix enforcement는 명시적으로 deferred이며
  stage-gate artifact의 `verification_matrix_enforcement_deferred` advisory claim으로
  보고됩니다. Active relay execution과 external engine adapter는 0.1.x stable contract
  밖에서 deferred입니다.
- Operational control invariant는 제안된 0.2/0.3 track으로 문서화되어 있습니다:
  autonomy preset, policy catalog, docs-code invariant, decision record, loop breaker,
  HUD projection을 다룹니다. 새 완료 권한은 아직 없으며, 첫 deterministic docs-code
  invariant pass는 `cx repo check --gate --json`에 구현됐습니다: required index,
  index link, English/Korean counterpart, 선언된 `schemas/*.schema.json` reference, source
  `*_deferred` self-report claim이 양쪽 implementation-status 문서에 mirrored됐는지를
  기계적으로 확인합니다. Repo check output은 deferred self-report claim도 집계해 의도적으로
  미구현된 surface가 계속 보이도록 합니다.
- Compiled repository wiki는 제안된 0.2/0.3 track으로 문서화되어 있습니다:
  repository fact, Codexus ledger, graph artifact, decision, verification evidence 위에
  재생성 가능한 markdown page를 만듭니다. 아직 `cx wiki` 명령은 없으며, 첫 구현은
  scoped freshness를 갖춘 deterministic map/build/check/context surface여야 하고 자동
  context injection은 하지 않아야 합니다.
- unknown command와 argument validation failure의 structured JSON error envelope 테스트
- unexpected argument, corrupt state, disabled app-server driver의 structured JSON error envelope 테스트
- init, observability, active skill index/export/improvement, adapter approved retrieval/context artifact, full replay parity fixture-matrix coverage, gated model replay, stale lock, schema/run-ledger validation, migration fixture, driver-failure repair, app-server dry-run/experiment process-probe, fake-supervision 기록, Stage A isolated real evidence, Stage B read-only evidence, conflict/quality finding을 포함한 memory lifecycle/curation, packaging, installed-skill tree diagnosis, feature gate policy/audit-record 테스트

## 남은 gap

[남은 작업](remaining-work.md)에 우선순위 backlog와 설계 재검토를 정리했습니다.
현재 high-level gap:

- driver-failure repair는 repairable task failure에 한해 explicit budget이 있을 때만 실행됩니다.
- model replay는 local experiment gate 뒤에 있으며 routine full model-in-the-loop replay는 기본 실행하지 않습니다.
- app-server driver는 live execution disabled이며 fixture/status/dry-run roundtrip/sandbox experiment manifest 기록, help-process probe evidence, deterministic fake lifecycle supervision, Stage A isolated real evidence, Stage B read-only evidence를 explicit gate 뒤에 구현했습니다.
- 첫 Stage B maintainer Desktop smoke는 negative였습니다. 사용할 수 있는 app-server
  WebSocket socket을 찾지 못했고, 발견된 IPC socket은 handshake 전에 닫혔습니다.
  지원되는 socket 또는 별도 stdio-observer 설계가 증명될 때까지 Desktop attachment는
  unavailable/unobserved로 유지합니다.
- Codex-native adapter retrieval과 approved context artifact 기록은 있지만 active skill을 현재 Codex prompt에 자동 주입하지는 않습니다.
- Codex가 stable per-conversation id를 Codexus에 노출하지 않기 때문에 session state는
  현재 cwd-scoped singleton입니다.
- Notify-hook integration은 explicit setup과 Codex project trust check 뒤에
  구현됐습니다. `cx session hud --json`은 statusline fallback으로 사용할 수 있습니다.
  Statusline integration과 tmux-backed worker launch는 설계됐지만 아직 구현되지
  않았습니다.
- cron/gateway live automation은 feature gate 뒤에서 disabled이며 dry-run plan/audit record와 policy/approval contract field만 구현했습니다.
- config/schema validation은 focused local enforcement와 local schema artifact subset enforcement 수준이며 full draft-2020-12 JSON Schema engine enforcement는 아직 아닙니다.
- Autopilot active execution은 0.2/0.3 트랙의 설계 문서만 있습니다.
  `cx repo graph build/check`와 `cx autopilot relay record/stage-gate/check-agreement`는
  experimental foundation으로 존재하지만, graph import/search/explain/context injection,
  relay AC-to-verification matrix enforcement, active multi-engine relay adapter는 0.1.x
  stable surface 밖에서 deferred입니다.
- Operational control invariant는 deterministic docs-code check와 첫 advisory session
  control-plane pass까지 구현됐습니다. Decision artifact, 반복 verification loop summary,
  HUD/status projection은 구현됐습니다. Autonomy preset, policy catalog, task artifact,
  더 풍부한 risk fact, `cx wiki` 명령은 아직 구현되지 않았습니다.
- git-aware checks는 non-git workspace에서 warn하며, 이 repository에서는 git root detection이 pass합니다.
