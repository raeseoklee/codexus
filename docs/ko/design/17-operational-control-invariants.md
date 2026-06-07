# Operational Control Invariants (운영 제어 불변식)

[English](../../design/17-operational-control-invariants.md)

작성일: 2026-06-02
상태: experimental first slice implemented; broader task artifact / promotion work remains on the 0.2 / 0.3 track.

## 구현 상태

현재 구현됨:

- `cx autopilot presets list --json`이 이름 있는 autonomy preset과 default preset을 노출합니다.
- Autopilot draft contract는 `autonomyPreset`을 schema-validated contract metadata로 가집니다.
- `cx policy catalog check --json`이 observed/advisory/unavailable control finding을 보고합니다.
- Change evidence가 blast radius, dependency, schema, migration, scope path에 대한 `riskFacts`를 파생합니다.

계속 deferred:

- task artifact와 task-panel projection 승격;
- 기존 start/stop gate를 넘는 active policy enforcement;
- 현재 deferred self-report summary를 넘어서는 더 넓은 runtime control dashboard.

## 결정

Codexus는 장시간 agent work를 위한 **operational control invariant** 레이어를 추가해야
합니다. 이 레이어는 반복적으로 발생하는 운영 문제를 local, auditable artifact와 derivable
check로 바꿉니다:

- 새 사람 입력 없이 run이 어디까지 진행할 수 있는지 정하는 autonomy preset;
- destructive intent, blast radius, unsupported driver capability를 다루는 policy catalog;
- 문서가 선언한 repository shape와 실제 파일을 비교하는 docs-code invariant;
- 반복 실패와 비생산적 repair를 감지하는 ledger-derived loop breaker;
- constraint, rejected alternative, verification link를 남기는 decision record;
- 사람의 상황 파악을 위한 read-only task/HUD projection.

이 레이어는 새 완료 권한이 아닙니다. 기존 Codexus evidence model 위의 control plane입니다:

```text
declared control policy
  -> capability check
  -> bounded execution
  -> local evidence
  -> structural gates + verification gates
  -> advisory summaries
```

완료는 여전히 evidence gate가 결정합니다: verification result, scope check, supply-chain
fact, slop check, graph freshness, schema validity, 그 밖의 derivable local fact가 기준입니다.

## 문제 정의

장시간 supervised run은 하네스가 기본적인 운영 질문에 답하지 못할 때 위험하거나
비효율적이 됩니다:

- 실제로 어느 정도의 autonomy가 허용됐는가?
- 어떤 파일, 명령, repository 영역이 scope 안이었는가?
- 문서가 선언한 docs, skills, schemas, commands, design notes가 실제 repository와
  drift됐는가?
- 어떤 위험 변경이 감지됐고, 그것은 enforced였는가, observed였는가, advisory였는가?
- agent가 왜 한 접근을 선택하고 다른 접근을 버렸는가?
- repair loop가 진전 중인가, 같은 실패를 반복 중인가?
- 사용자가 ephemeral UI state를 신뢰하지 않고도 진행상황을 볼 수 있는가?

Codexus에는 이미 중요한 기반이 있습니다: local ledger, schema artifact, verification event,
workspace fingerprint, evidence-first completion model. operational control invariant 레이어는
이 제어들을 명시적이고 inspectable하며 재사용 가능하게 만드는 역할입니다.

## 핵심 규칙

**Control**, **evidence**, **judgment**를 분리합니다.

- Control은 agent가 멈추기 전 어디까지 계속할 수 있는지 결정합니다.
- Evidence는 무엇을 사실로 받아들일 수 있는지 결정합니다.
- Judgment는 설명, 요약, 우선순위, 추천을 제공합니다.

완료 gate가 될 수 있는 것은 evidence뿐입니다. Control은 boundary에서 run을 멈출 수 있지만,
결과가 올바르다는 증명은 아닙니다. Judgment는 사람이 run을 이해하는 데 도움을 주지만,
derivable artifact로 뒷받침되지 않으면 pass condition이 될 수 없습니다.

## Autonomy Presets

Autopilot은 막연한 "automatic" 모드 하나가 아니라 이름 있는 autonomy preset을 노출해야
합니다. Preset은 contract template이지 trust score가 아닙니다.

후보 preset:

| Preset | Behavior |
| --- | --- |
| `manual` | plan, evidence, status만 생성합니다. 무인 change step은 실행하지 않습니다. |
| `guided` | 승인된 한 stage를 실행하고 다음 decision boundary에서 멈춥니다. |
| `contracted` | 승인된 autopilot contract 안에서 verification 또는 scope boundary까지 실행합니다. |
| `gated-auto` | scope, capability, verification gate가 만족되는 동안 bounded repair loop를 실행합니다. |
| `extended-auto` | 모든 policy field가 enforceable 또는 observable이고 checkpoint가 fresh할 때만 여러 stage를 계속합니다. |

Preset 선택은 승인된 contract로 materialize되어야 합니다. Runtime code가 과거 성공, model
confidence, reviewer agreement에서 더 높은 autonomy를 추론하면 안 됩니다.

Gate 가능한 사실:

- 선택된 preset이 알려진 값임;
- 승인된 contract가 선택된 preset을 기록함;
- driver capability가 필요한 모든 policy field를 만족함;
- stop condition, repair budget, scope limit이 존재함;
- hard boundary에 도달했을 때 run이 멈췄음.

Advisory claim:

- 더 높은 preset이 안전해 보임;
- 작업이 장시간 autonomy에 충분히 단순함;
- model 또는 reviewer가 confident함;
- 과거 run history가 미래 신뢰성을 암시함.

## Policy Catalogs

Risk detection은 투명한 status를 가진 policy catalog로 표현해야 합니다:

```json
{
  "ruleId": "command.destructive.remove-recursive",
  "category": "destructive-command",
  "severity": "high",
  "signal": {
    "kind": "command-pattern",
    "pattern": "recursive removal"
  },
  "capabilityRequirement": "driver.command.preflight",
  "defaultAction": "block-or-boundary-stop"
}
```

모든 finding은 자신이 어떤 상태였는지 밝혀야 합니다:

- `enforced`: 선택된 driver 또는 sandbox가 action을 차단함;
- `observed`: Codexus가 action 또는 diff를 발생 후 감지함;
- `advisory`: Codexus가 risk를 추론했지만 증명하거나 강제할 수 없음;
- `unavailable`: policy가 현재 runtime에 없는 capability를 요구함.

이 구분은 warning이 gate로 오해되는 것을 막습니다.

유용한 catalog:

- destructive command intent;
- protected branch와 force-push attempt;
- secret 또는 environment variable access;
- dependency와 lockfile changes;
- schema, migration, data-destructive changes;
- mass deletion, mass creation, large diff size;
- cross-worktree, symlink, path traversal, out-of-scope path.

Catalog는 autopilot start gate와 post-step boundary stop을 모두 안내할 수 있습니다. 지원되지
않는 capability field는 조용히 낮추지 말고 명시적으로 보고해야 합니다.

## Docs-Code Invariants

Codexus는 project documentation을 declared interface로 보고 measured repository와 비교해야
합니다. 이는 `cx repo check`의 자연스러운 확장입니다.

Gate 가능한 docs-code invariant 예시:

- documentation index에 나열된 모든 design document가 존재함;
- translation link가 있는 design document가 실제 파일을 가리킴;
- docs 또는 CLI help가 참조한 schema가 존재하고 validate됨;
- docs에 광고된 command name이 CLI registry에 존재함;
- release check 중 public package version, changelog, release evidence가 일치함;
- skill에 필수 metadata가 있고 참조한 helper script가 존재함;
- generated index가 scoped workspace fingerprint 기준으로 fresh함.

Review 없이는 gate할 수 없는 예시:

- design document가 설득력 있음;
- README가 제품을 잘 설명함;
- command docs가 모든 사용자에게 충분히 완전함;
- skill prompt 품질이 높음.

Docs-code check는 hard-coded count보다 measured fact를 우선해야 합니다. Count는 release
contract의 일부로 선언되고 known inventory에 scoped될 때만 유용합니다.

## Decision Records

장시간 run에는 명시적 decision artifact가 필요합니다. Decision record는 왜 어떤 경로를
선택했고 어떤 대안을 버렸는지 보존해야 합니다:

```json
{
  "schemaVersion": 1,
  "stability": "experimental",
  "type": "codexus.decision",
  "decisionId": "decision_...",
  "kind": "boundary",
  "createdAt": "2026-06-02T00:00:00.000Z",
  "cwd": "/path/to/workspace",
  "summary": "Use post-step scope gates with worktree isolation",
  "rationale": "Codexus cannot pre-block writes made by the engine.",
  "constraints": [
    "Codexus cannot pre-block writes made by the engine"
  ],
  "rejectedAlternatives": [
    "Treat scope extraction as a derivable fact"
  ],
  "evidenceLinks": [
    ".codexus/runs/run_.../verification/verification.json"
  ],
  "authority": "advisory",
  "completionAuthority": false
}
```

Gate 가능한 사실:

- decision artifact schema가 유효함;
- 연결된 evidence path가 relative이고 sanitize됨;
- rejected alternative가 있으면 non-empty string임.

Advisory claim:

- rationale이 올바름;
- 선택한 경로가 최적임;
- reversibility label이 정확함.

Decision record는 commit trailer를 보완합니다. Commit은 repository history를 보존하고, run
decision은 작업이 수행된 순간의 agent reasoning을 보존합니다.

## Loop Breakers

Loop detection은 process memory에만 있으면 안 되고 ledger에서 재구성돼야 합니다. Codexus는
evidence가 반복적 비진전을 보일 때 run을 멈출 수 있습니다.

후보 loop signal:

- 같은 verification command가 같은 normalized error로 반복 실패함;
- 같은 파일이 여러 repair attempt에서 edit/revert됨;
- repair attempt가 승인된 budget을 초과함;
- agent가 같은 scope boundary 밖 파일을 반복 변경함;
- 새 evidence 없이 active task가 계속 `in_progress`임;
- graph, supply-chain, slop gate가 repair 후에도 같은 finding으로 실패함.

Loop breaker는 boundary stop이지 실패 증명이 아닙니다. 출력은 이렇게 말해야 합니다:

```text
Stopped: repeated verification failure boundary reached.
Reason: npm test failed 3 times with the same normalized error.
Next action: human review or contract update required.
```

## Task And HUD Projection

Operational state는 UI state를 authoritative하게 만들지 않고도 보여야 합니다.

Task와 HUD projection은 durable Codexus artifact에서 읽어야 합니다:

- session task artifact의 task state;
- ledger의 run status;
- verification artifact의 active verification;
- change evidence의 policy finding;
- ledger-derived counter의 loop status;
- decision artifact의 decision summary.

Projection은 native host task panel, CLI HUD, JSON output 어디에나 표시될 수 있습니다.
Source of truth는 Codexus state입니다. 체크된 UI item은 verification evidence가 아닙니다.

Task panel projection model은 [16번 문서](16-codex-task-panel-projection.md)를 봅니다.

## Command Surface

가능한 향후 명령:

```bash
cx repo check --include docs-code --json
cx autopilot presets list --json
cx autopilot contract validate .codexus/autopilot.json --json
cx policy catalog check --json
cx session decision record --summary <text> --json
cx session decision list --json
cx session decision status <decision-id> --json
cx session loop --json
cx session hud --json
```

이 명령들은 additive해야 합니다. `cx repo check --gate`는 check가 scoped, deterministic,
semantic judgment free가 된 뒤에만 stable docs-code invariant를 포함할 수 있습니다.

## Clean Implementation Boundary

구현은 Codexus-native여야 합니다:

- 외부 source code, prompt, table, threshold, identifier, command name, user-facing prose를
  복사하지 않음;
- 먼저 Codexus contract를 작성하고, 그 contract에 맞춰 구현함;
- glob, fingerprint, schema, ledger event, CLI JSON output은 기존 Codexus utility를 사용함;
- 모든 finding을 derivable fact, enforceable policy, observed fact, advisory claim,
  unavailable capability 중 하나로 분류함;
- 외부 구현 artifact를 의도적으로 재사용하는 경우 merge 전에 license와 notice 의무를 명시적으로
  처리함.

원하는 결과는 다른 시스템의 port가 아닙니다. 기존 evidence-first 정체성을 보존하는 Codexus
control model입니다.

## 비목표

- work를 승인할 수 있는 숨은 trust score를 추가하지 않음.
- model confidence, reviewer convergence, task completion을 gate로 취급하지 않음.
- Codexus core에 host-specific pre-write firewall을 구현하지 않음.
- policy warning을 enforced block처럼 보이게 하지 않음.
- task visibility를 위해 native UI를 요구하지 않음.
- docs-code check가 network call에 의존하지 않음.
- third-party implementation detail을 Codexus로 복사하지 않음.

## 첫 슬라이스

1. 구현된 첫 pass: `cx repo check`에 작은 docs-code invariant pass 추가:
   - documentation index link가 존재함;
   - English/Korean design translation link가 resolve됨;
   - 선언된 경우 schema reference가 실제 schema file을 가리킴;
   - source의 `*_deferred` self-report claim이 양쪽 implementation-status 문서에
     mirrored됨;
   - JSON output이 deferred self-report를 집계해 의도적으로 미구현된 surface가 개별 command
     artifact 안에 숨어 있지 않게 함.
2. Change evidence에 `riskFacts` 추가:
   - changed file count;
   - diff size;
   - dependency/config/schema/migration file touch;
   - out-of-scope path touch.
3. Autopilot contract schema에 autonomy preset name을 contract metadata로 추가하되 completion
   gate는 바꾸지 않음.
4. 구현됨: `codexus.decision` artifact schema와
   `cx session decision record/list/status` 명령 추가. 이 artifact는 advisory이며 항상
   `completionAuthority: false`를 가집니다.
5. 구현됨: 반복 verification failure를 위한 ledger-derived checker
   `cx session loop --json` 추가. Loop result는 boundary signal이지 completion evidence가
   아닙니다.
6. 구현됨: `cx session status --json`, `cx session hud --json`,
   `doctor --json`에 deferred self-report와 policy catalog의
   observed/advisory/unavailable count를 모으는 control-plane dashboard를 추가.
   이 summary는 advisory/control metadata이며 `completionAuthority: false`를
   가집니다.
7. 구현됨: `cx session status --json`과 `cx session hud --json`에 decision, risk,
   loop, task summary 추가. Session task artifact는 `.codexus/session/tasks.json`에
   있으며 `codexus.session.tasks` schema를 가지고, `completionAuthority: false`인
   projection metadata로만 남습니다. Native host-panel mirroring과 autopilot task
   reconciliation은 별도 future slice로 남습니다.
