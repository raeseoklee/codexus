# 남은 작업

[English](../remaining-work.md)

날짜: 2026-05-29

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
  context artifact, terminal verification not-reached reason, in-process
  timeout/SIGINT cancellation, source-specific evolution lesson/replay gate,
  usage accounting, config option ignored event, reserved phase/gated tool
  expansion 문서 정리.
- 의도적으로 남김: routine live model-in-the-loop replay, live app-server turn
  execution, retrieved skill 자동 prompt injection, full external JSON Schema
  engine enforcement/migration, real cron/gateway automation dispatch, external
  `cx cancel <run-id>` owner/liveness protocol.

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

### P2: Runtime Expansion

10. app-server schema fixture와 gated roundtrip 추가. 상태: fixture/status gate, dry-run roundtrip contract, recorded sandbox experiment manifest, optional supervised help-process probe evidence 구현, live roundtrip deferred.
    - driver는 기본 disabled로 유지합니다.
    - live turn 실행 전에 truthful status/capability output을 먼저 둡니다.
    - app-server failure가 안정적인 `codex exec --json` path에 영향을 주면 안 됩니다.

11. git-aware project initialization 추가. 상태: `cx init` 구현.
    - 제안 command: `cx init`.
    - config, ignored state directory, optional project docs snippet을 만들되
      unrelated tool state는 mutate하지 않습니다.

12. packaging과 alias migration 마무리. 상태: canonical metadata와 smoke coverage 구현, `chx` compatibility 유지.
    - `cx`, `codexus`를 canonical로 유지합니다.
    - `chx`는 문서화된 제거 window 전까지 compatibility alias로만 취급합니다.
    - bin path와 Codex adapter installer smoke test를 추가합니다.

13. TypeScript/static verification 추가. 상태: local syntax/static check, versioned schema artifact, zero-dependency schema artifact subset validation 구현.
    - Node 26 type-stripped execution 외에 typecheck 또는 동등한 static
      validation을 추가합니다.
    - config와 durable state validation은 focused validator와 schema artifact subset engine으로 계속 커버하고, dependency policy가 허용될 때만 full external engine으로 교체합니다.

14. run observability command 추가. 상태: 구현.
    - 제안 command: `cx runs list`, `cx events tail <run-id>`, `cx report <run-id>`.
    - 출력은 bounded, JSON-first로 유지합니다.

15. cron/gateway automation은 P0 safety 이후에 추가. 상태: disabled feature gate와 dry-run automation plan/audit record 및 policy/approval contract field 구현, real automation deferred.
    - Hermes-style cron/gateway는 lock, schema migration, permission event,
      explicit user policy 뒤에 둬야 합니다.

## 이번 재검토의 방향 변경

- custom chat surface를 먼저 만들지 않습니다. Codex-native adapter와 active
  skill/memory retrieval이 더 적절한 다음 단계입니다. 현재 Codex conversation을
  유지하면서 같은 core runtime을 사용하기 때문입니다.
- `codexus:<skill-name>`은 storage identity가 아니라 display identity로 취급합니다.
  파일시스템 churn을 피하면서 생성 skill의 출처를 명확히 보여줍니다.
- lock/lease와 schema migration을 기존 암시보다 앞당깁니다. active index,
  export, cron, app-server experiment의 선행 조건입니다.
- app-server는 계속 experimental로 둡니다. stable path는 `codex exec --json`입니다.
- 새 major runtime surface를 설계할 때마다 upstream reference snapshot을 갱신합니다.
  세 reference project가 active이고 contract가 바뀔 수 있기 때문입니다.

## 제안하는 다음 slice

다음 구현 slice는 gate를 제거하기보다 gated surface의 evidence를 더 깊게
만드는 방향이 좋습니다:

1. dependency policy가 허용될 때만 local schema-artifact subset engine을 full JSON
   Schema engine으로 교체합니다. Migration fixture는 regression boundary로 유지합니다.
2. external `cx cancel <run-id>`를 owner/liveness와 cancel-marker protocol로
   설계/구현합니다. 이미 구현된 in-process AbortSignal path 위에 얹습니다.
3. replay parity matrix를 contract로 유지합니다. 새 canonical parity label은
   fixture coverage와 CLI replay evidence 없이 추가하지 않습니다.
4. app-server를 driver로 켜기 전에 deterministic fake app-server supervision을
   timeout, cleanup, bounded stdout/stderr evidence가 있는 isolated real
   app-server start/stop experiment로 승격합니다.
5. cron/gateway policy/approval dry-run contract를 policy-reviewed live
   dispatch contract로 승격하고, dry-run/live path의 contract compatibility를
   유지합니다.
6. retrieved `codexus:<skill-name>` context를 자동 삽입하려면 명시적이고
   user-visible한 adapter injection 단계를 추가합니다.
