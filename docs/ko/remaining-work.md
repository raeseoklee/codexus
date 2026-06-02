# 남은 작업

[English](../remaining-work.md)

날짜: 2026-05-31

이 문서는 MVP spine과 high-risk promotion slice 이후의 현재 backlog입니다. 남은
항목, 필요한 이유, 다음 구현에서 지켜야 할 설계 제약을 정리합니다.

## 레퍼런스 재검토

남은 작업은 필수 harness reference 기준으로 다시 검토했습니다:

- [UltraWorkers Claw Code](https://github.com/ultraworkers/claw-code):
  `rust/`가 canonical implementation인 public Rust CLI harness입니다.
  doctor/status workflow, parity reference, unsupported protocol status를
  기준으로 삼습니다.
- [NousResearch Hermes Agent](https://github.com/nousresearch/hermes-agent):
  memory, skill creation/improvement, past-session search, cron, gateway,
  toolset, skill directory를 가진 learning-loop reference입니다.
- [Gitlawb OpenClaude](https://github.com/Gitlawb/openclaude): model provider,
  Codex OAuth, 기존 Codex CLI auth, tools, agents, tasks, MCP, slash command,
  streaming/tool calling을 한 terminal workflow로 묶는 provider/session
  reference입니다.

Codexus는 auth/runtime boundary에서 계속 의도적으로 다르게 갑니다. Codexus는
authenticated local Codex CLI를 감싸며, private ChatGPT/Codex backend API에
의존하지 않습니다.

## 우선순위 backlog

P0-P2 구현 pass와 high-risk promotion slice 이후 상태:

- Safe MVP surface 구현됨: 확장된 JSON error contract test, state corruption
  error, permission/policy/driver-classification ledger event, minimal lock,
  state migration reader, active skill index, 명시적 Codex export와 optional
  third-party bundle export, bounded adapter retrieval, deterministic replay와
  model replay gate, memory lifecycle command, app-server
  fixture/status gate, `cx init`, packaging/typecheck smoke, run observability,
  cron/gateway disabled gate.
- 승격된 hardening surface: stale-lock metadata inspection/recovery, versioned
  schema artifact, budget/policy-gated model replay runner, Codex-native
  bounded context formatter와 자동 주입 없는 approved context artifact,
  live gate가 있는 app-server dry-run roundtrip contract와 recorded sandbox
  experiment manifest, 명시적 budget이 필요한 repairable driver-failure retry,
  cron/gateway dry-run automation plan/audit record와 policy/approval contract
  field, run-ledger validation, installed Codexus skill diagnostic,
  app-server process-probe evidence, replay pass/failure/extended fixture.
- Accepted harness review 기반 remediation hardening 구현됨: bounded repair
  context artifact, 확장된 repair-context redaction, terminal verification
  not-reached reason, in-process timeout/SIGINT cancellation, external
  owner/liveness 기반 `cx cancel <run-id>`, source-specific evolution
  lesson/replay gate, usage accounting, config option ignored event, reserved
  phase/gated tool expansion 문서 정리.
- 이 review 이후 session-native follow-up 구현: 얇은 Codex-session walkthrough,
  first-class `session-state` schema artifact validation, 기존 notify chain을
  보존하고 Codex project trust 없이는 설치를 거부하는 explicit notify-hook attachment.
  후속 hardening pass에서 atomic config write, one-time config backup, notify-hook
  detach, validator/schema drift test도 추가했습니다. 이후 session-native hardening
  pass에서 `.codexus/session/state.json`용 explicit `cx session migrate` boundary도
  추가했고, configured hook과 실제 `turn-ended` dispatch 관측을 구분하는 v2 notify
  dispatch semantics를 반영했습니다.
- Desktop app-server attachment evidence는 Stage A isolated real evidence와
  explicit opt-in 및 사용자 제공 socket이 필요한 Stage B read-only command
  surface까지 진행했습니다. 이 경로는 transcript 값이 아니라 method shape만
  기록하며 아직 product behavior를 활성화하지 않습니다.
- Session-native evidence surface도 추가로 진행했습니다. `cx session verify --auto`는
  실행 없이 verification 후보를 감지하고, quality evidence guard는 `cx slop check` /
  `cx session slop`으로 사용할 수 있으며, subagent claim bundle은 completion evidence로
  승격하지 않은 채 `.codexus/session/subagents/` 아래 기록할 수 있습니다.
- 10개 evidence-contract pass는 gate를 제거하지 않는 방식으로 구현됐습니다:
  schema engine status는 local subset engine과 unavailable full engine을 보고하고,
  replay parity는 audit 가능하며, adapter injection은 자동 주입 없이 visible approval
  artifact를 쓰고, HUD는 read-only JSON summary로 제공됩니다. tmux/native-subagent launch
  surface는 truthful gate이고, automation live contract는 dispatcher가 생길 때까지 계속
  blocked입니다.
- 의도적으로 남김: routine live model-in-the-loop replay, live app-server turn
  execution, retrieved skill 자동 prompt injection, full external JSON Schema
  engine enforcement/migration, real cron/gateway automation dispatch,
  statusline/HUD integration, tmux-backed worker, cancellation wait/remote-host UX 보강.
  Repository knowledge graph는 이제 codexus-lite graph artifact, scoped freshness,
  structural gate를 위한 experimental 첫 slice(`cx repo graph build/check`)가 있습니다.
  Autopilot, graph import/search/explain/context injection, multi-engine relay autopilot은
  계속 0.2/0.3 track으로 deferred입니다.

### P0: Contract and Safety Hardening

1. CLI JSON output contract coverage 완료. 상태: safe MVP 구현.
   - 이미 구현됨: unknown command, argument validation failure.
   - 남음: unexpected arguments, unsupported capabilities, missing/corrupt
     state, disabled drivers, command-specific failure envelope.
   - 설계 규칙: automation caller가 stderr나 prose를 parse하면 안 됩니다.

2. permission, approval, policy decision을 first-class ledger event로 승격. 상태: initial ledger event 구현.
   - `permission.checked`, `permission.denied`, `approval.requested`,
     `approval.resolved`, `policy.blocked` 같은 typed event를 추가합니다.
   - unattended, app-server, cron, external export는 이 event model 뒤에 둡니다.

3. driver-failure repair 전에 driver-failure classification 추가. 상태: classification과 explicit-budget task-failure repair 구현.
   - auth/config/unsupported-flag/sandbox/policy/model/network failure와 task
     failure를 구분합니다.
   - task-repairable failure만 retry하고, capability/auth failure는 terminal
     typed error로 surface합니다.

4. state schema migration과 lock/lease protection 추가. 상태: migration reader, minimal lock, stale-lock recovery, schema artifact, focused record validation, run-ledger validation 구현.
   - active skill index, export, cron, app-server run은 concurrent write를
     만듭니다.
   - 해당 기능 전 mutable store에 대한 minimal lock/lease와 versioned state
     migration reader를 추가합니다.

### P1: Evolution and Codex-Native Skill Surface

5. active skill index 파일 추가. 상태: 구현.
   - scan-based listing은 fallback으로 유지합니다.
   - promotion/deprecation 시 skill id, display name, version, source runs,
     replay status, export state를 index에 기록합니다.

6. 명시적 skill export command 추가. 상태: 명시적 Codex export와 optional external harness bundle export 구현.
   - 제안 command: `cx skill export <skill-id> --target <target>`.
   - storage id는 filesystem-safe하게 유지합니다.
   - Codex-facing identity는 `displayName`의 `codexus:<skill-name>`을 사용합니다.
   - 외부 skill-name 제약이 Codexus storage rule과 다를 수 있으므로 외부 store
     write 전에 Codex skill validation을 실행합니다.

7. Codex-native adapter에 active skill retrieval 추가. 상태: shared core를 통한 bounded retrieval과 approved context artifact 기록 구현.
   - 현재 task에 맞는 active skill과 memory entry를 bounded retrieval합니다.
   - 별도 chat loop를 만들지 않고 현재 Codex conversation을 주 surface로
     유지합니다.

8. deterministic replay 뒤에 model-in-the-loop replay 추가. 상태: structural pass/failure/extended fixture와 budget/policy-gated runner 구현, routine live replay는 opt-in/env-gated 유지.
   - 현재 structural replay gate를 첫 번째 방어선으로 유지합니다.
   - model replay는 Codex usage를 소비하므로 opt-in 또는 budget-gated로 둡니다.
   - Claw-style parity scenario: tool success, denial, permission prompt,
     multi-tool turns, plugin/skill paths, large output, interruption, usage
     accounting.

9. memory lifecycle command 확장. 상태: 구현.
   - `cx memory add/list/prune/review` surface를 추가합니다.
   - source link, redaction, bounded retrieval을 유지하면서 summary/index를
     추가합니다.
   - Memory quality slice 구현: 표준 준수 주장을 하지 않고 advisory
     conflict/contradiction detection과 curator-derived tri-state quality finding을
     추가했습니다.

### P2: Runtime Expansion

10. app-server schema fixture와 gated roundtrip 추가. 상태: fixture/status gate, dry-run roundtrip contract, recorded sandbox experiment manifest, optional supervised help-process probe evidence 구현, live roundtrip deferred.
    - driver는 기본 disabled로 유지합니다.
    - live turn 실행 전에 truthful status/capability output을 먼저 둡니다.
    - app-server failure가 안정적인 `codex exec --json` path에 영향을 주면 안 됩니다.

11. git-aware project initialization 추가. 상태: `cx init` 구현.
    - 제안 command: `cx init`.
    - config, ignored state directory, optional project docs snippet을 만들되
      unrelated tool state는 mutate하지 않습니다.

12. packaging과 alias migration 마무리. 상태: npm-installed CLI packaging, guarded
    alpha publish, trusted-publishing release workflow, Node 22 package smoke
    compatibility, stable-readiness smoke coverage, local release integrity gate 구현.
    - `cx`, `codexus`를 canonical public bin으로 유지합니다.
    - 현재 npm baseline은 `0.1.1`입니다. Prerelease는 fallback/dev path인
      `publish:next`를 통해 배포할 수 있고, stable release는 trusted GitHub Actions
      tag run에서 배포합니다.
    - `npm run package:smoke`는 installed tarball release gate로 유지합니다. Bin path,
      runtime asset, strict doctor, supply-chain gate, mock
      pass/fail/repair/resume/cancel/events, postinstall skill adapter behavior를
      검증합니다.
    - `cx release check --gate --json`은 `npm run release:check` 안에 유지합니다.
      Stable release candidate는 tag publish 전에 installer default, expected-version
      guard, trusted-publishing workflow, GitHub Release asset wiring, release
      evidence doc을 증명해야 합니다. `--live`는 npm/GitHub를 상대로 하는 명시적
      post-publish sign-off에만 사용합니다.

13. TypeScript/static verification 추가. 상태: local syntax/static check,
    esbuild release bundle, versioned schema artifact, zero-dependency schema
    artifact subset validation 구현.
    - source check와 package smoke를 분리합니다. Source test는 local development
      runtime에서 실행하고, npm user는 bundled JavaScript를 실행합니다.
    - config와 durable state validation은 focused validator와 schema artifact subset engine으로 계속 커버하고, dependency policy가 허용될 때만 full external engine으로 교체합니다.

14. run observability command 추가. 상태: 구현.
    - 제안 command: `cx runs list`, `cx events tail <run-id>`, `cx report <run-id>`.
    - 출력은 bounded, JSON-first로 유지합니다.

15. cron/gateway automation은 P0 safety 이후에 추가. 상태: disabled feature gate와 dry-run automation plan/audit record 및 policy/approval contract field 구현, real automation deferred.
    - Hermes-style cron/gateway는 lock, schema migration, permission event,
      explicit user policy 뒤에 둬야 합니다.

## 이번 재검토의 방향 변경

- custom chat surface를 먼저 만들지 않습니다. 다음 제품 방향은
  Codex-native session runtime입니다: skill adapter, marker-bounded AGENTS
  overlay, local session state, 명시적 checkpoint/verification, optional
  hook/status, optional tmux worker를 같은 core runtime 위에 둡니다.
- `codex exec resume` session은 primary session-native story가 아니라 deferred
  external multi-turn feature로 취급합니다.
- `cx session`은 Codex-native state/checkpoint/verification surface 전용으로
  유지합니다. external exec-resume을 다시 추가한다면 `cx thread start/continue` 같은
  별도 namespace를 선호합니다.
- `codexus:<skill-name>`은 storage identity가 아니라 display identity로 취급합니다.
  파일시스템 churn을 피하면서 생성 skill의 출처를 명확히 보여줍니다.
- lock/lease와 schema migration을 기존 암시보다 앞당깁니다. active index,
  export, cron, app-server experiment의 선행 조건입니다.
- app-server는 계속 experimental로 둡니다. stable path는 `codex exec --json`입니다.
- 새 major runtime surface를 설계할 때마다 upstream reference snapshot을 갱신합니다.
  세 reference project가 active이고 contract가 바뀔 수 있기 때문입니다.

## 제안하는 다음 slice

이전 10개 항목은 code-level gate와 evidence surface로 덮였습니다. 다음 구현 slice는
supporting runtime이 있을 때만 gate를 더 깊은 evidence로 바꾸는 방향이 좋습니다:

1. dependency policy가 허용될 때만 local schema-artifact subset engine을 full JSON
   Schema engine으로 교체합니다. `cx schema engine --json`은 현재 full-engine unavailable
   상태를 보고합니다. Migration fixture는 regression boundary로 유지합니다.
2. replay parity matrix를 contract로 유지합니다. 새 canonical parity label은
   fixture coverage와 CLI replay evidence 없이 추가하지 않습니다. `cx replay parity --json`이
   canonical label coverage를 보고합니다.
3. app-server product behavior를 활성화하기 전에 Desktop app-server attachment
   evidence loop를 마무리합니다. Stage A isolated temporary-state evidence는 구현됐고,
   Stage B는 gated read-only socket command surface를 갖고 있으며,
   `cx app-server discover --json/--record`가 실제 Desktop discovery evidence를
   기록합니다. 현재 maintainer evidence는 managed control socket이 없는 `stdio_only`이므로
   다음 slice는 explicit user-provided socket 시도 또는 별도 stdio-observer 설계입니다.
   app-server driver 활성화는 별도 gate로 계속 분리합니다.
4. Cron/gateway dry-run/live path는 `policy-reviewed-live-dispatch-v1` contract를
   공유합니다. Permission, approval, lock, dispatch, completion event가 실제로 준비되기
   전에는 dispatcher를 구현하지 않습니다.
5. Adapter injection은 명시적 approval이 필요하고 visible approval
   artifact를 기록합니다. 여전히 prompt context를 자동 주입하지 않습니다.
6. `cx session hud --json`이 지원되는 fallback입니다. Statusline integration은 Codex가
   안정적인 supported configuration surface를 노출할 때까지 계속 보류합니다.
7. `cx session workers status --json`은 tmux worker launch gate를 보고합니다. 명시적
   session state protocol이 안정되기 전에는 launch를 추가하지 않습니다.
8. Versioned `.codexus/session/state.json` schema는 explicit `cx session migrate`
   migration boundary를 통해서만 확장합니다.
9. Quality evidence guard는 explicit review artifact link와 `--gate` automation mode를
   받습니다. 추가 확장은 coverage, lint/typecheck output 같은 derivable artifact에서만
   해야 하며 heuristic finding은 계속 advisory입니다.
10. Subagent support는 recorder/handoff/contract-only로 유지합니다. 지원되는 Codex
   bridge가 생기기 전까지 active native spawn launcher를 노출하지 않습니다. Subagent
   claim은 verification freshness와 계속 분리해야 합니다.
11. Autopilot은 0.2/0.3 design track으로 유지합니다. `cx autopilot run`을 노출하기 전
   schema artifact와 report-only scope gate부터 시작해야 하며, human-approved,
   worktree-isolated, `stability: experimental`이어야 합니다.
12. Repository knowledge graph는 canonical graph identity hashing, graph schema
   validation, scoped freshness, structural graph gate를 포함한 experimental 첫 slice가
   있습니다. External import, search/explain, context injection은 freshness, sanitization,
   gate behavior가 안정될 때까지 deferred로 유지합니다.
13. Multi-engine relay autopilot은 experimental recorder/checker 첫 slice를 갖습니다:
   external author/reviewer artifact import, stage-gate evidence, 같은 artifact convergence
   validation, verification 실패 시 convergence가 run을 complete하지 못한다는 증명입니다.
   Active relay execution과 external engine adapter는 descriptor-backed adapter와 일반
   evidence gate가 증명될 때까지 deferred로 유지합니다.
14. Harness-engineering alignment는 더 넓은 autonomy 전에 작은 0.2 track을 추가합니다:
    첫 derivable import invariant는 이제 `cx architecture check`가 다루고, 기계적인
    repository-knowledge validation은 `cx repo map/check`가 다룹니다. `cx slop check`는
    첫 behavior evidence 확장을 포함하며 heuristic lane은 계속 advisory로 유지합니다.
    자세한 내용은 [doc 13](design/13-harness-engineering-alignment.md)을 봅니다.

## 구현 잔여

0.1.1 harness-engineering first pass 이후 남은 구현 트랙입니다:

Harness-engineering alignment에서 추가된 evidence-first track:

- Architecture check follow-up: first-slice `cx architecture check --json`은 이제
  schema-validated `codexus.architecture.policy`, `scanAccuracy: "best_effort"`,
  dogfood `forbidden-import` rule, repo-graph provider와 공유하는 static import scanner를
  갖습니다. 향후 required file이나 단순 layer edge 같은 rule kind도 같은 derivable-fact
  gate model을 유지해야 합니다.
- Repository knowledge follow-up: first-slice `cx repo map/check`는 required index,
  index link, English/Korean counterpart를 기계적으로 검증합니다. 문서가 참조하는
  `schemas/*.schema.json` link는 이제 기계적으로 검사하며, 향후 다른 artifact link check를
  추가할 수 있습니다. Semantic staleness는 advisory로 유지합니다.
- Repository knowledge graph follow-up: [14번 문서](design/14-repository-knowledge-graph.md)는
  이제 `cx repo graph build/check`, canonical graph identity hashing, graph schema
  validation, scoped freshness, persisted Codexus graph artifact, structural graph gate를
  포함한 experimental 첫 slice를 갖습니다. 다음 작업은 JSON-only external import,
  read-only search/explain, context artifact approval입니다. Freshness, sanitization,
  gate behavior가 안정되기 전에는 graph context injection을 노출하지 않습니다.
- Behavior evidence follow-up: `cx slop check`는 첫 surgicality, simplicity,
  assumption, verification-artifact, diff-surface evidence를 기록합니다. Fact-vs-heuristic
  경계는 유지했고, subagent behavior checklist counterpart는 구현됐습니다. 남은 작업은
  선택적 lint/typecheck/coverage artifact입니다.
- Multi-engine relay follow-up: [15번 문서](design/15-multi-engine-relay-autopilot.md)는
  이제 `cx autopilot relay record/stage-gate/check-agreement` recorder/checker 첫 slice를
  갖습니다. 다음 작업은 AC-to-verification matrix import/enforcement이고, 그 다음이
  adapter evidence입니다: 지원되는 external engine descriptor, read-only handoff contract,
  그리고 convergence가 verification을 대체하지 않는 active relay execution입니다.
- Observability adapter: architecture와 repo-knowledge gate가 안정된 뒤
  dev-server/browser/log evidence descriptor를 추가합니다. Stack-specific behavior는
  workflow kernel 밖에 둡니다.
- Worktree app instance launcher: Codexus가 변경/worktree별 앱 instance를 실행할 수
  있다고 주장하기 전에 descriptor-backed process launcher를 추가합니다. Launcher는
  Codexus-owned artifact에 worktree, branch/head, command profile, pid/owner
  heartbeat, port/URL, health check, log, status를 기록해야 합니다. Experimental로
  유지하고 owned process만 stop해야 하며, browser/dev-server adapter가 참조할
  instance evidence를 제공합니다.
- Operational control invariant: [17번 문서](design/17-operational-control-invariants.md)는
  autonomy preset, policy catalog, docs-code invariant, decision record, loop breaker,
  HUD projection을 기존 evidence 위의 control layer로 정의합니다. 첫 deterministic
  docs-code invariant pass는 `cx repo check`에 구현됐습니다. 첫 session control-plane
  pass도 구현됐습니다. `cx session decision record/list/status`는 advisory decision
  artifact를 쓰고, `cx session loop --json`은 반복 verification failure를 요약하며,
  session status/HUD는 decision, risk, loop summary를 포함합니다. 다음 작업은 autonomy
  preset metadata, policy catalog reporting, 더 풍부한 risk fact, task artifact입니다.
  Active autonomy나 새 완료 권한을 추가하지 않습니다.
- Compiled repository wiki: [18번 문서](design/18-compiled-repository-wiki.md)는
  repository fact와 Codexus artifact 위의 재생성 가능한 markdown projection을 정의합니다.
  첫 작업은 schema, `cx wiki map`, deterministic build/check, read-only context pack입니다.
  Stale/advisory page를 run에 자동 주입하지 않습니다.

1. Desktop app-server attachment: 현재 discovery evidence는 `stdio_only`입니다.
   Session-event mapping을 시도하기 전에 non-disruptive stdio observer를 설계하거나
   explicit user-provided app-server socket을 확보합니다. 아직 live app-server product
   behavior는 켜지지 않습니다.
2. Cron/gateway dispatcher: permission, approval, lock, dispatch, completion event가
   실제로 준비된 뒤에만 구현합니다.
3. Full JSON Schema engine: dependency policy가 허용될 때만 local subset engine을
   교체합니다. 현재 schema artifact는 regression fixture로 유지합니다.
4. Statusline integration: Codex가 안정적인 supported configuration surface를 제공할 때까지
   기다립니다. 그 전까지는 `cx session hud --json`이 fallback입니다.
5. tmux-backed worker launch: session state protocol과 launch contract가 안정될 때까지
   `session workers status`를 gate report로 유지합니다.
6. Native subagent active launcher: 지원되는 Codex bridge가 생기고 claim과
   verification freshness 분리가 유지될 때까지 record/attach/complete와
   launcher-contract support로 둡니다.
7. Automatic adapter injection: 명시적이고 되돌릴 수 있는 injection path를 설계하기 전까지
   visible approval artifact만 기록하고 auto-injection은 하지 않습니다.
8. Routine live model replay: opt-in, budget-gated로 유지하고 기본 stable path 밖에 둡니다.
9. Autopilot contract layer: `cx autopilot run` 전에 schema artifact와 report-only scope
   gate부터 시작하는 0.2/0.3 experimental track으로 진행합니다.
10. Multi-engine relay autopilot: report-only artifact recorder/checker는 구현됐습니다.
    Active adapter 전에 AC-to-verification matrix enforcement를 추가합니다. 지원되는
    adapter가 생기기 전 review engine은 artifact import-only로 두고, convergence가
    verification을 대체하지 않게 합니다.
11. Operational control invariant: decision artifact와 ledger-derived loop summary는
    advisory session evidence로 구현됐습니다. 다음은 autonomy preset metadata, policy
    catalog reporting, 더 풍부한 risk fact, task artifact입니다. Enforceable policy
    field가 생기기 전까지 autonomy preset은 contract metadata로 둡니다.
12. Compiled repository wiki: advisory synthesis나 context injection 전에 deterministic
    `cx wiki map/build/check`부터 구현합니다.
13. Worktree app instance launcher: per-worktree app control이나 app-health evidence를
    주장하기 전에 `cx app instance start/status/stop/logs`를 experimental,
    descriptor-backed evidence surface로 추가합니다.
