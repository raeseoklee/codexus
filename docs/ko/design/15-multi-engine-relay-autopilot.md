# Multi-Engine Relay Autopilot

[English](../../design/15-multi-engine-relay-autopilot.md)

상태: 제안된 0.2/0.3 설계 트랙.

이 문서는 [autopilot contract](12-autopilot-contract.md)를 multi-engine review loop로
확장합니다. ai-devkit의 `agent-relay` / `pipe-prop` / `pipe-rv` workflow에서 배운
패턴을 반영하되, Codexus core에 해당 MCP 서버나 dotfiles/hook 체계를 들이지 않습니다.

## 결정

Codexus는 향후 autopilot에 **multi-engine relay mode**를 추가할 수 있습니다:

```text
author engine proposes work → review engine reviews → author responds →
rounds continue until convergence or boundary stop → completion still requires evidence gates
```

이 relay의 가치는 수동 Codex-author / Claude-reviewer workflow를 durable, bounded,
resumable protocol로 바꾸는 데 있습니다. Relay 자체는 완료 권한이 아닙니다. Convergence
agreement는 model-judgment artifact이며, 완료 권한은 기존 verification, scope,
supply-chain, slop, future graph gate에 남습니다.

## Codexus와의 정합성

이 기능은 workflow kernel 안이 아니라 autopilot contract 위에 있어야 합니다:

- 승인된 contract가 여전히 scope, acceptance criteria, verification command, budget,
  stop condition, approval artifact를 정의;
- relay는 독립 reviewer lane과 round protocol만 추가;
- ledger는 submission, review, rebuttal, convergence declaration, stop,
  stage-gate evidence를 기록;
- 최종 상태는 일반 Codexus gate가 green일 때만 accept.

Codexus의 핵심 규칙을 유지합니다: agent prose와 model consensus는 다음 action 선택을 도울 수
있지만 evidence를 대체할 수 없습니다.

## Relay Roles

초기 role:

- `author-engine`: 작업을 제안하거나 수정합니다. 첫 product path에서는 기존 driver를 통한
  Codex일 가능성이 큽니다.
- `review-engine`: 독립 검토를 수행하고 source file을 수정하지 않습니다. 외부 구성에서는
  Claude Code, 다른 Codex driver, human reviewer artifact, MCP-backed external relay일 수
  있습니다.

두 role은 descriptor입니다:

```json
{
  "engine": "codex",
  "driverId": "codex-exec",
  "role": "author-engine",
  "capabilities": {
    "writes": "gated",
    "review": false,
    "verification": "external"
  }
}
```

Descriptor model은 두 번째 engine이 normalized ledger schema로 새어 들어오지 않게 합니다.
Engine-specific communication은 kernel이 아니라 adapter에 둡니다.

## Command Surface

제안 surface:

```bash
cx autopilot relay plan --from docs/PRD.md --review-engine claude-code --json
cx autopilot relay run --policy .codexus/autopilot.json --review-engine claude-code --json
cx autopilot relay status <relay-id> --json
cx autopilot relay resume <relay-id> --json
```

`relay plan`은 여전히 draft contract를 만듭니다. `relay run`은 일반 autopilot처럼 승인된
contract와 start-gate proof가 필요합니다.

첫 구현은 report-only가 될 수 있습니다: author/reviewer 1라운드만 기록하고, convergence가
verification을 우회하지 못한다는 것을 증명합니다.
그 첫 slice에서 `review-engine`은 지원되는 adapter가 이미 존재하지 않는 한 **artifact
import only**를 뜻합니다. Codexus는 외부에서 생성된 review artifact를 기록하고 shape를
검증해야 합니다. Descriptor-backed adapter가 구현되고 gate되기 전에는 Claude Code, 다른
engine, MCP relay를 spawn할 수 있다고 암시하면 안 됩니다.

## Stage Model

Relay stage는 의도적으로 작게 유지합니다:

- `issue`: 문제 정의와 evidence scope;
- `design`: 설계와 non-goal;
- `plan`: 구현 계획과 verification matrix;
- `implementation`: 코드, 테스트, 문서, evidence bundle.

승인된 contract가 동등한 artifact를 이미 제공하면 stage를 skip할 수 있지만, skip은 명시적으로
기록해야 합니다.

각 stage에는 두 review scope가 있습니다:

- `delta-check`: 직전 round finding 반영 여부만 확인. 반복에는 유용하지만 stage convergence
  근거로는 부족합니다.
- `full-gate`: 현재 stage artifact와 관련 source를 fresh-read하는 검토. Stage convergence
  수락 전 필수입니다.

## Artifact Shapes

Relay session artifact:

```json
{
  "schemaVersion": 1,
  "type": "codexus.autopilot.relay.session",
  "stability": "experimental",
  "relayId": "relay-...",
  "contractSubjectHash": "sha256:...",
  "stage": "design",
  "round": 3,
  "status": "in_progress",
  "authorEngine": { "engine": "codex", "driverId": "codex-exec" },
  "reviewEngine": { "engine": "claude-code", "driverId": "external-relay" },
  "submissions": [],
  "reviews": [],
  "stageGateEvidence": [],
  "convergenceAgreement": null,
  "stop": null
}
```

Stage-gate evidence artifact:

```json
{
  "schemaVersion": 1,
  "type": "codexus.autopilot.stage-gate-evidence",
  "stage": "plan",
  "scope": "full-gate",
  "role": "review-engine",
  "freshReadArtifacts": [],
  "verificationMatrix": [],
  "findings": [],
  "residualFindingCount": 0,
  "verificationResults": [],
  "heuristicClaims": [],
  "derivableFacts": []
}
```

Convergence agreement artifact:

```json
{
  "schemaVersion": 1,
  "type": "codexus.autopilot.convergence-agreement",
  "stage": "plan",
  "round": 4,
  "declarations": [
    {
      "role": "author-engine",
      "engine": "codex",
      "artifactHash": "sha256:...",
      "declaredAt": "2026-06-01T00:00:00.000Z"
    },
    {
      "role": "review-engine",
      "engine": "claude-code",
      "artifactHash": "sha256:...",
      "declaredAt": "2026-06-01T00:01:00.000Z"
    }
  ],
  "unresolvedHighFindings": 0,
  "decisionNeeded": false
}
```

ai-devkit prototype와 달리, 단일 `declare_convergence` 호출만으로 Codexus convergence가
성립하지 않습니다. Codexus convergence는 모든 required role의 declaration이 있는 구조적으로
유효한 agreement artifact와 해당 stage의 fresh full-gate evidence를 요구합니다.

Required role declaration은 검토 대상 stage artifact의 같은 `artifactHash`도 참조해야 합니다.
서로 다른 artifact hash에 대한 declaration은 convergence가 아닙니다. 각 role이 다른 version에
동의했다는 뜻이므로 structural evidence gap으로 보고해야 합니다.

## Gate Semantics

Gate 가능한 structural invariant:

- relay artifact schema valid;
- contract subject hash가 승인된 autopilot contract와 일치;
- required role descriptor가 존재하고 요청된 relay와 호환;
- 모든 stage transition이 legal;
- 모든 convergence agreement가 required role declaration 포함;
- 모든 required convergence declaration이 같은 stage `artifactHash` 참조;
- 필요한 stage-gate evidence artifact가 존재하고 fresh;
- 승인된 contract에 연결된 verification command 통과;
- scope, supply-chain, slop, 기타 Codexus gate 통과.

Advisory-only claim:

- "두 engine이 동의했다";
- "reviewer가 문제를 찾지 못했다";
- "author rebuttal이 설득력 있다";
- "설계가 충분하다";
- local derivable check가 뒷받침하지 않는 "구현이 의도와 맞다".

`convergenceAgreement`는 다음 stage 진입을 열 수 있지만, run을 complete로 만들지는 않습니다.
최종 완료는 승인된 verification과 evidence gate가 필요합니다.

## Acceptance Criteria To Verification Matrix

Relay는 implementation 전에 verification matrix를 요구해 `acceptanceCriteria`를 실행 가능한
형태로 내려야 합니다:

```json
{
  "acceptanceCriterion": "AC-1",
  "planStep": "Step 2",
  "verification": "npm test -- parser.test.ts",
  "status": "planned",
  "evidencePath": null
}
```

규칙:

- 승인된 모든 acceptance criterion은 최소 하나의 verification row에 매핑;
- implementation은 `delta-check`만으로 converge 불가;
- implementation convergence는 최신 verification matrix row가 evidence path 또는 승인된
  deferred reason을 가져야 함;
- patch log는 supporting evidence이지 acceptance의 source of truth가 아님.

## Stop Conditions

Relay는 아래 상황에서 failure가 아니라 `decision_needed`로 멈춥니다:

- 같은 material finding이 3라운드 동안 unresolved;
- `maxRounds`, `maxRuntimeMs`, wait budget 초과;
- 어느 engine이 disconnect되거나 required full-gate evidence를 만들 수 없음;
- 승인된 contract에 없는 product/policy decision이 stage에 필요;
- relay adapter가 의도한 engine과 통신 중임을 증명할 수 없음;
- 일반 autopilot scope 또는 verification gate가 승인된 repair budget을 넘어 실패.

Stop artifact는 resume을 가능하게 하는 가장 작은 decision question을 기록합니다.

## Non-Goals

- ai-devkit의 `agent-relay` MCP 서버를 Codexus core에 vendoring하지 않음.
- Telegram, warmup job, dotfiles sync, MCP operation을 Codexus autopilot 일부로 만들지 않음.
- relay mode가 global/project hook을 설치하지 않음.
- model agreement를 verification으로 취급하지 않음.
- 첫 slice에서 review engine이 source file을 수정하게 하지 않음.
- ai-devkit source-of-truth 체계를 Codexus ledger와 합치지 않음.

## First Slice

1. Relay artifact schema와 validation만 추가.
2. 단일 author/reviewer round를 report-only로 기록.
3. 첫 review engine path는 external artifact import only로 취급.
4. `delta-check`와 `full-gate`를 구분하는 stage-gate evidence shape 추가.
5. 같은 stage artifact hash에 대한 양쪽 role declaration을 요구하는 convergence agreement
   validation 추가.
6. valid convergence agreement가 있어도 verification이 실패하면 run을 complete할 수 없음을 증명.
7. 그 다음에만 external relay adapter 검토.

Dogfood target: Codexus docs 작업에서 Codex가 proposal을 작성하고 external reviewer가 review
artifact를 제공하되, 완료는 `repo check`, syntax check, 기타 기존 gate에 계속 묶습니다.
