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
  Autopilot contract layer도 0.2/0.3 트랙으로 deferred이며 0.1.0에서는 설계 문서만
  있습니다.

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
    compatibility, stable-readiness smoke coverage 구현.
    - `cx`, `codexus`를 canonical public bin으로 유지합니다.
    - 현재 npm baseline은 `0.1.0-alpha.5`입니다. Prerelease는 fallback/dev path인
      `publish:next`를 통해 배포할 수 있습니다. `0.1.0` stable은 successful
      trusted-publishing rehearsal, release evidence, `v0.1.0` tag 뒤에만 갑니다.
    - `npm run package:smoke`는 installed tarball release gate로 유지합니다. Bin path,
      runtime asset, strict doctor, supply-chain gate, mock
      pass/fail/repair/resume/cancel/events, postinstall skill adapter behavior를
      검증합니다.

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
   evidence loop를 마무리합니다. Stage A isolated temporary-state evidence는
   구현됐고, Stage B는 gated read-only command surface와 negative maintainer smoke
   evidence를 갖췄습니다. 남은 evidence는 지원되는 실제 Desktop daemon에서 user-visible
   turn boundary를 관측하는 것과, 그 뒤의 별도 session-event mapping 설계입니다.
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

## 구현 잔여

0.1.0 readiness 정리 이후 남은 구현 트랙입니다:

1. Desktop app-server attachment: 지원되는 실제 Desktop daemon 관측 경로를 증명한 뒤
   session-event mapping을 설계합니다. 아직 live app-server product behavior는 켜지지
   않습니다.
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
