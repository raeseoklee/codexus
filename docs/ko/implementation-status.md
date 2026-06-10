# 구현 상태

[English](../implementation-status.md)

날짜: 2026-06-07

제품명: Codexus

목표 CLI: `cx`

Public bins: `cx`, `codexus`

현재 stable baseline: `0.2.0`

Npm package는 `cx`와 `codexus`를 canonical bin으로 노출합니다. 기존 `chx`
alias는 공개 npm bin으로 배포하지 않습니다.

## 구현된 MVP spine

- Node 22+ npm-installed CLI entrypoint: `dist/cli/main.js`
- Source development entrypoint: `node src/cli/main.ts`
- `doctor`, `init`, `run`, `cancel`, `plan`, `runs list`, `status`, `events tail`, `report`, `resume`, `verify`, `replay`, `replay parity`
- `locks list/inspect/clear`, `schema check/engine/validate/validate-run`, `lsp status/check`, `release check`, `contract check`, `app-server status/roundtrip/experiment`
- `update check`
- `wiki map/build/check/context/export`
- `app instance profile list/status/logs/start/stop`
- `app instance evidence record/list/probe/logs/metrics/screenshot`
- `slop check`
- `memory add/search/list/review/curate/prune`
- `skill propose/index/list/review/promote/export/improve/deprecate`
- `cron status/recovery/run-now`, `gateway status/recovery/check`
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
- app-server schema fixture/status/dry-run roundtrip/sandbox experiment manifest 기록, optional `codex app-server --help` process-probe evidence, deterministic fake lifecycle supervision, isolated real Stage A evidence, explicit opt-in Stage B read-only socket observation, fake/Codexus-owned stdio proof evidence, live execution disabled. Discovery, Stage A, Stage B, stdio-proof app-server evidence manifest는 experimental schema-validatable artifact로 등록되어 있습니다.
- cron/gateway의 experimental explicit-approval live dispatch, policy/approval
  contract field를 포함한 dry-run automation plan, 그리고 blocked live path용
  schema-validatable boundary audit record. 각 dispatch plan은
  `automation-action-authority-v1`도 기록해 dispatcher가 승인된 linked Codexus
  run만 시작할 수 있고 scheduler/listener state, cleanup, health, completion
  authority는 갖지 않음을 명시합니다. `cx cron recovery`와 `cx gateway recovery`는
  foreground dispatch record를 scan하고 manual-review candidate를 담은
  `automation-recovery` projection을 기록할 수 있습니다. 이 projection은 scheduler
  queue ownership, automatic retry, cleanup, health authority, completion authority를
  주장하지 않습니다.
- config/state/event/memory/skill/session-state/supply-chain-policy/decision/app-instance descriptor/app-instance/automation dispatch/subagent result/subagent launch
  versioned schema artifact, durable read-path focused enforcement,
  single-record/run-ledger schema artifact subset validation
- `npm run build`는 TypeScript source를 esbuild로 bundle해 npm 설치용
  `dist/cli/main.js`를 만듭니다.
- `npm run package:smoke`는 `npm pack`, 임시 global install,
  `codexus` / `cx` help와 version 출력, runtime schema asset, postinstall Codex
  skill adapter 설치, fake Codex fixture를 통한 `doctor --json --strict`,
  `supply-chain check --gate`, installed-package mock pass/fail/repair/status/
  events/resume/cancel 흐름을 검증합니다.
- Installed package automation smoke는 enabled feature gate, explicit approval,
  mock driver 조합으로 `cx cron run-now`와 `cx gateway check`를 실행해 packed
  global install에서도 experimental automation dispatcher가 lock을 획득하고
  연결된 run result를 반환하면서 `automation-action-authority-v1`
  negative-authority contract를 보존함을 검증합니다.
- `prepublishOnly`는 local CI, source-tree `lsp:check` dogfood, package smoke,
  report-only supply-chain dogfood, `cx release check --gate --json`을 묶은
  `npm run release:check`를 실행합니다. Package smoke에는 설치된 package에 대한
  gate-mode supply-chain check, local-mode release check, LSP check가 포함됩니다.
- `cx release check --json`은 source checkout의 stable local-mode release-integrity
  evidence를 보고합니다. Stable installer default, expected-version guard,
  pinned trusted-publishing workflow, stable dist-tag sync wiring, GitHub Release
  `install.sh` asset wiring, local release-evidence doc을 확인합니다. `--live`는
  npm `latest`, npm `next`가 `latest`보다 오래되지 않았는지, GitHub latest,
  installer asset hash identity를 확인하는 명시적 experimental post-publish
  sign-off입니다.
- `cx release policy --json`은 active release cadence policy를 보고합니다. 작은 commit을
  유지하되 더 큰 theme의 stable release로 묶는 cadence, hotfix exception,
  stable-contract version boundary, 영문/한국어 policy 문서 존재를 포함합니다.
  `npm run release:check`는 `release:policy`를 포함하므로 policy 문서가 없으면 tag
  publish 전에 release prep이 막힙니다.
- `cx contract check --json`은 experimental `0.2.0` promotion readiness audit를
  보고합니다. `repo check --gate`, local-mode `release check --gate`,
  `lsp check --gate`, 좁은 `architecture check --gate` forbidden-import subset,
  manual `wiki context --fresh-only --gate`는 stable 승격 surface이며
  `docs/json-contract.md`에 frozen되어 있으므로,
  `cx contract check --target 0.2.0 --gate --json`은 stable-promotion requirement를
  통과할 수 있습니다. App-instance start/stop, live autopilot, active relay adapter,
  Desktop app-server attachment, automatic injection, plugin always-on claim 같은
  action surface는 계속 deferred입니다.
- `cx update check --json`은 bounded TTL cache를 통해 npm `latest` dist-tag에서
  experimental update availability fact를 보고합니다. npm `next` prerelease fact를
  위한 명시적 opt-in 경로는 `cx update check --channel next --json`이며, 별도 cache
  file을 사용합니다. `CODEXUS_NO_UPDATE_CHECK=1`은 registry 접근을 비활성화하고,
  CI/cache-only path는 network lookup을 피합니다. 이 명령은 설치를 변경하지 않고
  completion, verification, release authority가 되지 않습니다.
- `version --json`, `doctor --json`, `session status --json`은 additive
  cache-only experimental `update` summary를 포함합니다. 이 primary command들은
  registry를 조회하지 않고 update lookup이 불가능해도 실패하지 않습니다.
  오래된 cache entry는 `cacheState: "stale"` 및 `versionFresh: false`로 보고되며,
  현재 설치본이 최신이라는 증거로 해석하면 안 됩니다.
- `cx plugin status --json`은 experimental Codex plugin package evidence를
  보고합니다. Packaged manifest validity, bundled skill count, wrapper script
  presence, explicit non-authority field를 포함합니다. Codex가 문서화된 plugin
  install-location contract를 제공하기 전까지
  `codex_plugin_install_location_contract_deferred` 상태로 installed-plugin state는
  deferred이며, plugin packaging 자체가 always-on supervision을 증명하지 않습니다.
- npm tarball은 `dist`, `schemas`, Codex skill adapter,
  experimental Codex plugin package, `fixtures/app-server/schema.fixture.json`,
  `install.sh`, package installer scripts, top-level release metadata만 싣고
  source, tests, docs, replay/migration fixture, source map은 제외합니다.
  Maintainer는 `npm run build:sourcemap`으로 외부 debug source map을 만들 수
  있지만, 이 source map은 `sourcesContent: false`를 사용하며 기본 npm package에
  포함되지 않습니다.
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
- `cx lsp status`와 `cx lsp check`는 experimental project LSP diagnostics evidence를
  제공합니다. 첫 slice는 local project file과 명시적 package script에서 TypeScript
  diagnostics 후보를 자동 탐지하고, `npm run typecheck` 같은 명시적 diagnostics
  command만 실행하며, bounded stdout/stderr tail을 redact합니다. Long-lived LSP
  protocol server를 시작하거나 제어하지 않는다고 자기보고하고, 파일을 수정하지 않으며
  completion authority가 되지 않습니다.
- `cx session subagent record/attach/status`는 subagent claim bundle을
  `.codexus/session/subagents/` 아래 기록하고 session state에서 link하며, subagent claim을
  verification freshness와 분리합니다. `cx session subagent launch`는
  `launcher.supported: false`인 deferred launcher contract를 기록합니다.
  `cx session subagent probe --record`는 현재 local CLI bridge를 `unavailable`로
  보고하는 bridge-availability evidence를 기록하며 spawn, workspace mutation,
  completion authority를 주장하지 않습니다.
  `cx session subagent complete`는 현재 Codex session에서 사용한 native subagent의 최종
  claim과 optional `pass|fail|unknown` behavior checklist assertion을 기록하되 Codexus가
  spawn했다고 주장하지 않습니다. Result/launch/probe artifact는 `subagent-result`,
  `subagent-launch-contract`, `subagent-bridge-probe`로 schema validation할 수 있습니다.
  Codexus는 여전히 CLI에서 native subagent를 spawn하지 않습니다.
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
- Cron/gateway live path는 `policy-reviewed-live-dispatch-v1` policy contract를
  공유하며, feature gate가 켜지고 explicit approval이 있으면 일반 Codexus run
  ledger를 통해 dispatch됩니다. Blocked live path는 feature gate, approval, lock
  boundary를 `automation.boundary_stop` payload로 남기며
  `cx schema validate --type automation-dispatch --file <path> --json`으로
  검증할 수 있습니다. Dispatch record는 `automation-action-authority-v1`도
  포함해 승인된 linked-run dispatch와 scheduler/listener, health, cleanup,
  completion authority를 분리합니다. Recovery projection은
  `cx schema validate --type automation-recovery --file <path> --json`으로 검증할
  수 있으며 advisory/manual-review only입니다.
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
  `stdio_only`입니다. Stdio-observer design contract는 문서화됐습니다. 기존 Desktop
  stdio pipe는 attach target이 아니며 fake/Codexus-owned stdio proof harness는
  구현됐습니다. Positive Desktop attachment는 explicit socket 또는 future supported
  observer bridge가 증명될 때까지 계속 blocked입니다. `cx app-server observer status
  --json`은 기록된 discovery, Stage B, stdio-proof evidence를 live socket 연결 없이
  하나의 bridge summary로 투영하며, `desktop-app-server`는 기록된 Stage B
  turn-boundary evidence에서만 보고합니다.
- `cx session status --json`와 `cx session hud --json`은 같은 recorded app-server
  observer projection을 `evidenceLoop.appServerObserver` 아래 포함합니다. 이는
  turn-boundary evidence를 session visibility로 매핑하지만 session runtime surface를
  mutate하거나 Desktop에 attach하거나 completion authority를 만들지 않습니다.

## 검증

- `npm test`: 219 tests 통과
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
  deferred self-report aggregation, optional advanced interop readiness 확인
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
- Update availability는 registry-derived availability, `CODEXUS_NO_UPDATE_CHECK=1`,
  cache-only primary command summary, unsupported update subcommand, installed
  package `cx update check` smoke test로 커버됩니다.
- Repository graph foundation 테스트는 `cx repo graph build/check`, repo-graph schema
  validation, scope 밖 변경을 무시하는 scoped freshness, scope 안 변경 stale detection,
  dangling edge failure, volatile gate output을 제외하는 stable graph id를 커버합니다.
- Multi-engine relay recorder 테스트는 artifact import-only 동작, relay
  session/stage-gate/convergence schema validation, 같은 artifact convergence 요구,
  `delta-check` convergence 거부, valid convergence가 verification 실패 시 완료를 만들 수
  없다는 invariant를 커버합니다. Implementation-stage AC-to-verification matrix gate는
  missing matrix, unmapped criteria, missing evidence, approved deferral, missing
  evidence path, passing evidence를 커버합니다.
- Compiled wiki 테스트는 deterministic `map/build/check/context/export`, scoped source
  변경 후 stale-page gate failure, stale page export blocking, unsafe export target
  rejection, advisory build mode의 honest rejection을 커버합니다.
- App instance launcher 테스트는 descriptor schema validation, `profile list`,
  `start --dry-run`, live start, duplicate-start rejection, live owned process의
  active health promotion, bounded log tail, owned stop을 커버합니다.
- Installed package smoke는 deterministic wiki build, wiki-manifest schema
  validation, `wiki check --gate`, explicit wiki export, bounded wiki context generation,
  non-injected wiki context approval artifact validation,
  `cx policy catalog check --json`, `cx autopilot presets list --json`,
  explicit-preset autopilot draft planning도 포함합니다.
- Autopilot contract는 이제 experimental foundation slice를 갖습니다:
  `cx autopilot plan --from ...`,
  `cx autopilot contract validate <file>`,
  `cx autopilot contract approve <file> --approved-by <name>`,
  `cx autopilot contract scope-check <file> [--gate]`가 구현됐습니다. 계약 body는
  schema 검증되고, approval record는 canonical subject hash를 포함하며, scope
  check는 승인된 계약을 기준으로 change-evidence fact를 재사용합니다. Live
  `cx autopilot run`은 여전히 stable contract 밖에서 deferred입니다.
- Generic worktree app instance launcher는 experimental live ownership 첫 slice를
  갖습니다. `cx app instance profile list/status/logs/start/stop`는
  descriptor-backed profile을 읽고, worktree별 Codexus-owned process를 하나씩 띄우고,
  owned instance artifact와 heartbeat를 쓰며, active HTTP health를 probe하고,
  bounded log를 tail하며, owned process만 중지합니다. 이 surface는 여전히
  stable contract 밖에 있습니다. `cx app instance evidence record/list`는
  browser/dev-server/log/screenshot/metric observation을 하나의 `instanceId`에
  연결해 기록하고, `cx app instance evidence probe`는 running owned instance에 대한
  loopback-only bounded/redacted HTTP dev-server evidence를 기록합니다.
  `cx app instance evidence logs`는 같은 owned instance의 stdout/stderr tail
  evidence를 bounded/redacted snapshot으로 기록합니다. `cx app instance evidence
  metrics`는 같은 `instanceId`의 process, heartbeat, health-evidence, log-file
  metric을 기록합니다. `cx app instance evidence screenshot`은 이미 캡처된 로컬
  screenshot 파일의 metadata, media type, size, mtime, SHA-256을 기록하고 같은
  `instanceId`에 연결합니다. 이 evidence surface들은 control, health authority,
  completion authority를 주장하지 않습니다. `cx session status --json`과
  `cx session hud --json`은 app-instance observation과 wiki context approval을
  `evidenceLoop` 아래에 요약하지만 health, control, source-truth, completion
  authority를 추가하지 않습니다. 실제 Browser/DevTools live capture 연동은 후속
  작업입니다.
- Repository knowledge graph는 experimental 첫 slice를 갖습니다:
  `cx repo graph build/check`는 persisted codexus-lite graph artifact, scoped freshness,
  deterministic graph identity, structural gate를 내보냅니다. External graph import,
  search/explain, context injection은 stable contract 밖에서 deferred입니다.
- Multi-engine relay autopilot은 experimental recorder/checker 첫 slice를 갖습니다:
  `cx autopilot relay record`는 다른 engine을 spawn하지 않고 외부 author/reviewer
  artifact를 import하고, `cx autopilot relay stage-gate`는 `delta-check`/`full-gate`
  evidence와 optional acceptance criteria / verification matrix row를 기록합니다.
  `cx autopilot relay check-agreement`는 같은 artifact convergence를 검증하고
  verification 실패 시 convergence가 완료를 만들 수 없음을 증명합니다.
  Implementation-stage convergence는 이제 passing evidence 또는 명시적으로 승인된
  deferral이 있는 full-gate acceptance-criteria-to-verification matrix를 요구합니다.
  Active relay execution과 external engine adapter는 stable contract 밖에서
  deferred입니다.
- Operational control invariant는 이제 실험적 첫 slice를 가집니다:
  `cx autopilot presets list --json`, autopilot contract의 schema-validated
  `autonomyPreset` metadata, `cx policy catalog check --json`, 그리고 blast
  radius / dependency / schema / migration / scope finding에 대한 더 풍부한
  `riskFacts`가 포함됩니다. 새 완료 권한은 없고 기존 evidence gate 위의
  advisory/control metadata로만 동작합니다. Stable deterministic docs-code
  invariant pass는 `cx repo check --gate --json`이 맡고 있습니다. 이 stable
  contract는 semantic freshness나 prose quality를 gateable로 만들지 않습니다.
  `cx session status --json`, `cx session hud --json`, `doctor --json`은 이제
  deferred self-report와 policy catalog count를 하나의 control-plane summary로
  모으며 `completionAuthority: false`를 유지합니다. observed/advisory/unavailable
  control signal은 dashboard metadata이지 completion evidence가 아닙니다.
- Codexus session task는 이제 experimental projection artifact를 가집니다.
  `cx session tasks list/add/update/complete/block --json`은
  `codexus.session.tasks` schema를 가진 `.codexus/session/tasks.json`을 씁니다.
  `cx session status --json`과 `cx session hud --json`은 compact task summary를
  포함하지만, task status, checked-off item, evidence link는 projection metadata일
  뿐입니다. 실패한 verification을 completion evidence로 바꾸지 않으며 항상
  `completionAuthority: false`를 유지합니다.
- Compiled repository wiki는 이제 experimental deterministic 첫 slice를 가집니다:
  `cx wiki map`, `cx wiki build --mode deterministic`, `cx wiki check --gate`,
  `cx wiki context --topic <name> --budget <n>`, 명시적
  `cx wiki export --target <path>`가 동작합니다. `cx wiki context --fresh-only --gate`는
  fresh manual context가 필요할 때 사용하며, 선택된 topic에 fresh page가 없으면 stale
  page를 반환하지 않고 실패합니다. `cx wiki context --topic <name> --approve
  --approved-by <name>`은 `approved_not_injected`, `automatic:false`, completion
  authority 없음이 명시된 visible `codexus.wiki.context-approval` artifact를 기록합니다.
  `cx wiki build --mode advisory`는
  driver/model evidence(`modelInvoked: false`)와 non-authority marker를 가진
  schema-valid local source-bundle synthesis artifact를 기록합니다. `.codexus/wiki/`
  아래에 source ref, local link, manifest/page/advisory schema, scoped freshness를 가진
  재생성 가능한 markdown page를 만듭니다. Deterministic page set은 이제 overview,
  commands, verification에 더해 release/contract와 runtime-boundary projection을
  포함합니다. Export는 fresh passing wiki check를 요구하고 auto-commit 또는 source
  truth가 되지 않습니다. Automatic context injection은 계속 deferred입니다.
- `cx repo check --gate --json`가 현재 문서 일치를 강제하는 deferred self-report는
  다음 네 가지입니다:
  - `acceptance_criteria_extraction_deferred`
  - `autopilot_run_deferred`
  - `broad_layering_rule_deferred`
  - `typosquat_name_similarity_deferred`
- unknown command와 argument validation failure의 structured JSON error envelope 테스트
- unexpected argument, corrupt state, disabled app-server driver의 structured JSON error envelope 테스트
- init, observability, active skill index/export/improvement, adapter approved retrieval/context artifact, full replay parity fixture-matrix coverage, gated model replay, stale lock, schema/run-ledger validation, migration fixture, driver-failure repair, app-server dry-run/experiment process-probe, fake-supervision 기록, schema-validatable Stage A isolated real evidence, schema-validatable Stage B read-only evidence, conflict/quality finding을 포함한 memory lifecycle/curation, packaging, installed-skill tree diagnosis, feature gate policy/audit-record 테스트

## 남은 gap

[남은 작업](remaining-work.md)에 우선순위 backlog와 설계 재검토를 정리했습니다.
현재 high-level gap:

- driver-failure repair는 repairable task failure에 한해 explicit budget이 있을 때만 실행됩니다.
- model replay는 local experiment gate 뒤에 있으며 routine full model-in-the-loop replay는 기본 실행하지 않습니다.
- app-server driver는 live execution disabled이며 fixture/status/dry-run roundtrip/sandbox experiment manifest 기록, help-process probe evidence, deterministic fake lifecycle supervision, schema-validatable Stage A isolated real evidence, schema-validatable Stage B read-only evidence, stdio proof, recorded observer bridge status를 explicit gate 뒤에 구현했습니다.
- 첫 Stage B maintainer Desktop smoke는 negative였습니다. 사용할 수 있는 app-server
  WebSocket socket을 찾지 못했고, 발견된 IPC socket은 handshake 전에 닫혔습니다.
  Fake/Codexus-owned stdio proof harness는 구현됐지만, 지원되는 socket 또는 future
  supported observer bridge가 증명될 때까지 Desktop attachment는 unavailable/unobserved로
  유지합니다. 문서화된 stdio-observer contract는 기존 Desktop stdio pipe에 attach하는
  것을 금지합니다.
- Codex-native adapter retrieval과 approved context artifact 기록은 있지만 active skill을 현재 Codex prompt에 자동 주입하지는 않습니다.
- Codex가 stable per-conversation id를 Codexus에 노출하지 않기 때문에 session state는
  현재 cwd-scoped singleton입니다.
- Notify-hook integration은 explicit setup과 Codex project trust check 뒤에
  구현됐습니다. `cx session hud --json`은 statusline fallback으로 사용할 수 있습니다.
  Statusline integration과 tmux-backed worker launch는 설계됐지만 아직 구현되지
  않았습니다.
- cron/gateway는 이제 experimental explicit-approval live dispatcher와
  schema-validatable blocked-dispatch boundary record 및
  `automation-action-authority-v1` negative-authority record, foreground recovery
  projection을 가집니다. 다음 작업은 richer unattended scheduler semantics, retry policy,
  asynchronous ownership
  증거입니다.
- config/schema validation은 focused local enforcement와 local schema artifact subset enforcement 수준이며 full draft-2020-12 JSON Schema engine enforcement는 아직 아닙니다.
- Autopilot active execution은 계속 0.2/0.3 트랙에서 deferred입니다. Experimental
  foundation은 이제 `cx autopilot plan`과 contract
  validate/approve/scope-check까지 포함하지만, `cx autopilot run`과 worktree에
  붙는 장시간 실행은 의도적으로 아직 구현하지 않았습니다. `cx repo graph
  build/check`와 `cx autopilot relay record/stage-gate/check-agreement`는
  experimental foundation으로 존재합니다. `cx repo graph import`는 provider package를
  실행하지 않고 bounded JSON-only external graph를 import하며,
  `cx repo graph search/explain`은 `eligibleForAutomaticInjection: false`인 read-only
  advisory retrieval을 제공합니다. Graph context injection과 active multi-engine relay
  adapter는 stable surface 밖에서 deferred입니다.
- Worktree app instance launcher는 이제 experimental live ownership slice를
  갖습니다. start/stop, process ownership token, heartbeat, liveness, port
  allocation, active health probe는 Codexus-owned instance에 대해 구현됐습니다.
  Instance-linked observation evidence descriptor는
  `cx app instance evidence record/list`로 구현됐고, 첫 real adapter로
  `cx app instance evidence probe`가 loopback HTTP dev-server evidence를 기록합니다.
  `cx app instance evidence logs`와 `cx app instance evidence metrics`도 bounded log 및
  metric evidence를 기록합니다. `cx app instance evidence screenshot`은 이미 캡처된
  로컬 screenshot 파일을 bounded file metadata와 SHA-256으로 같은 `instanceId`에
  연결합니다. 명시적 stale/orphan lifecycle policy projection도 구현됐습니다.
  `cx session status --json`과 `cx session hud --json`은 이 observation과 wiki context
  approval을 `evidenceLoop`에 요약하되 권한을 승격하지 않습니다. 실제 Browser/DevTools
  live capture와 worktree-aware launcher reuse가 후속 작업입니다.
- Operational control invariant는 deterministic docs-code check와 실험적
  control-plane 첫 slice까지 구현됐습니다. Decision artifact, 반복
  verification loop summary, HUD/status projection, autonomy preset metadata,
  policy catalog reporting, richer risk fact가 포함됩니다. Task artifact,
  broader policy promotion, unified control aggregation은 아직 구현되지
  않았습니다.
- Compiled repository wiki는 이제 experimental deterministic 첫 slice를
  가집니다. Source-linked page generation, structural freshness gate, bounded
  context-pack generation, explicit export가 존재하며 advisory synthesis와 automatic
  injection path는 future work입니다.
- git-aware checks는 non-git workspace에서 warn하며, 이 repository에서는 git root detection이 pass합니다.
