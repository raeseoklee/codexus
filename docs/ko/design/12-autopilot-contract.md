# Autopilot Contract (오토파일럿 계약)

[English](../../design/12-autopilot-contract.md)

작성일: 2026-05-31
상태: 제안된 설계 (0.1.0에서 deferred; 0.2 / 0.3 트랙)

## 결정

Codexus는 **autopilot contract 레이어**를 추가합니다: 선언적·schema 검증된 정책으로,
supervised Codex run을 **per-step 사람 승인 없이 장시간 무인 실행**하게 하되, 문서화된
계약이나 확인 가능한 근거를 벗어난 산출물을 Codexus의 accept/promote/merge 흐름에서
차단합니다. 파이프라인:

```
documented contract → policy gate → bounded execution → evidence gate → auto-repair / stop
```

차별점은 "AI를 더 오래 돌린다"가 아닙니다. **"오래 돌리되, 문서화된 계약 안과 체크 가능한
증거 안에 가둔다"** 입니다. autopilot은 *기존 gate들을 오케스트레이션하는 계층*이지 새로운
판단 엔진이 아닙니다.

## 왜 Codexus에 맞나

- 커널이 이미 run ledger를 만들고, `permission.checked` / `policy.blocked` / verification
  이벤트를 남기며, verification 통과 시에만 `complete`에 도달하고, bounded repair loop를
  돕니다. autopilot의 하부 엔진으로 적합합니다.
- 완료 권한이 이미 사람 승인이 아니라 증거입니다. autopilot은 이미 존재하는 gate들
  (`verification`, `slop`, `supply-chain`, 그리고 새 `scope` gate)을 합성할 뿐, 병렬 결정
  시스템을 만들지 않습니다.
- 정직성 모델이 이미 "enforcement는 best-effort overlay가 아니라 증거에서 온다"고
  말합니다([doc 08](08-standalone-identity-and-always-on-evidence.md)). autopilot은 같은
  선을 잇습니다: prevent를 가장하지 않고, detect-and-stop 합니다.

## 하드 경계 (make-or-break)

> autopilot은 장시간 run의 accepted output을 **사람이 승인한 계약 안과 체크 가능한 증거 안**에
> 둔다. 일반적으로 에이전트의 행위를 사전 차단하는 게 아니라, 격리하고 탐지하고 정지하며,
> 계약 밖 산출물을 promote하지 않는다.

두 진실을 분명히 못 박아야 합니다. 이 선을 넘으면 정직한 하네스가 "그냥 AI를 더 오래
돌리는 것"이 됩니다:

- **Enforcement는 detect-then-stop이지 prevent가 아니다.** Codexus는 Codex를 supervise
  하지만 **파일을 쓰는 건 Codex**입니다. Codexus는 scope 밖 쓰기를 *사전 차단할 수 없습니다*
  — 그건 Codex sandbox 몫입니다. Codexus가 할 수 있는 건 step 후 diff를 계약과 대조해
  **위반 시 정지**하는 것뿐입니다. 따라서 worktree 격리는 선택이 아니라 **필수 안전망**입니다:
  격리가 없으면 위반이 탐지되기 전에 이미 작업 트리에 반영됩니다. scope gate는 사전
  방화벽이 아니라 post-step 증거입니다. 문서와 출력이 그렇게 말해야 합니다.
- **acceptance criteria는 heuristic이므로, 계약은 derived가 아니라 사람-승인이다.** PRD /
  `AGENTS.md` / roadmap을 `acceptanceCriteria[]`, `forbiddenChanges[]`,
  `verificationRequired[]`로 바꾸는 건 두 정직한 리뷰어가 다르게 추출할 수 있는 작업 —
  derivable fact가 아닙니다. 그래서 `autopilot plan`은 사람이 **한 번** 승인하는 *제안된*
  계약을 내고, `autopilot run`은 승인된 계약만 강제합니다. 이건 "승인 제거"가 아닙니다.
  **"승인을 앞단 1회 계약 검토로 압축"** 입니다. 계약은 asserted(사람 승인), 그 안의 실행은
  derived-gated.

보조 경계:

- **capability 증명 없이는 무인 보장 없음.** 설치된 Codex가 `--ask-for-approval`을 지원
  안 하면 `codex.approval = never`가 조용히 무시됩니다(현재 `config.option_ignored`로 기록).
  autopilot은 시작 시 driver capability와 policy를 교차검증해야 합니다("Capability × Policy
  시작 게이트" 참조).
- **관측/강제 surface 없이는 policy 약속 없음.** network access, destructive shell command,
  secret/env read 같은 일부 경계는 post-step diff만으로 증명할 수 없습니다. 선택된
  driver/sandbox가 이런 policy field를 강제하거나 관측할 수 없으면 `autopilot run`은 시작에서
  block하거나 해당 계약 field를 unsupported로 거부해야 합니다. best-effort warning으로 조용히
  낮추면 안 됩니다.
- **branch protection 우회 없음.** Protected branch 거부, required PR review, required
  status check 미충족은 repository rule을 우회하라는 지시가 아니라 boundary stop /
  `decision_needed`입니다. 우회가 필요하다면 autonomous execution 밖의 사람 maintainer
  action이어야 합니다.
- **stop은 실패가 아니다.** 계약 한도(max diff, scope edge, timeout) 도달은 "autopilot
  실패"가 아니라 "사람이 필요한 경계 도달"입니다.
- **새 gate subsystem 없음.** 완료는 기존 gate들 + scope gate의 AND; 병렬 스캐너 없음.
- **engine-agnostic.** 계약·scope gate·worktree·gate 합성은 driver 추상화 위에 있습니다.
  capability 확인만 driver-specific이고, 전체 loop는 mock driver로 테스트 가능해야 합니다.

## 계약 (The Contract)

autopilot 계약은 `.codexus/autopilot.json`(또는 config의 `autopilot` 섹션)에 있고
**schema 검증**됩니다(supply-chain policy처럼 schema artifact — malformed 계약은 조용히
gate를 약화시키지 말고 loud하게 실패). 후보 필드:

```json
{
  "schemaVersion": 1,
  "type": "codexus.autopilot.contract",
  "status": "approved",
  "approval": {
    "approvedAt": "2026-05-31T00:00:00.000Z",
    "approvedBy": "maintainer-or-local-operator",
    "sourceDocs": [{ "path": "docs/PRD.md", "sha256": "sha256:..." }],
    "subjectHash": "sha256:<canonical-autopilot-body>",
    "approvalRecordPath": ".codexus/autopilot/approvals/<id>.json"
  },
  "autopilot": {
    "scope": { "allow": ["src/**", "tests/**"], "forbiddenChanges": [".github/**", "package.json", "**/.env*"] },
    "acceptanceCriteria": ["<사람이 승인, autopilot plan 산출>"],
    "verificationRequired": ["npm test", "npm run typecheck"],
    "commandAllowlist": ["npm test", "npm run typecheck", "npm run lint"],
    "networkPolicy": { "mode": "none", "requiresDriverEnforcement": true },
    "maxRuntimeMs": 3600000,
    "maxRepairIterations": 3,
    "maxChangedFiles": 40,
    "maxDiffLines": 2000,
    "approval": "enforced-never-with-isolation",
    "stopOnPolicyViolation": true
  }
}
```

중요한 검증 규칙:

- **빈 `scope.allow`는 거부** — "전부 허용"으로 취급하지 않음(가장 위험한 조용한 오독).
- `forbiddenChanges`가 항상 `scope.allow`를 이김.
- 승인된 계약은 approval artifact, source-document hash, canonical subject hash를 기록합니다.
  subject hash는 `autopilot` body의 **canonical 직렬화**(정렬된 키, 정규화된 공백, `approval`
  블록 제외)로 계산해 안정적이며, `autopilot run`은 승인된 subject hash가 실행할 body와 맞지
  않으면 거부합니다.
- `sourceDocs` hash는 **provenance이지 run-time gate가 아닙니다**: 계약이 어느 문서 버전에서
  distill됐는지 기록할 뿐입니다. 승인된 `subjectHash`가 계약을 고정하므로, 이후 source 문서가
  바뀌어도 *이미 승인된 계약*은 무효가 되지 않고 run을 차단해서도 안 됩니다.
- 미지 키 거부(supply-chain policy validator처럼).

## plan → approve → run 라이프사이클

1. **`cx autopilot plan --from docs/...`** 가 문서를 읽어 *제안된* 계약을 냄
   (`acceptanceCriteria` / `forbiddenChanges` / `verificationRequired`를 heuristic하게
   도출). 검토가 필요한 draft로 명시적으로 라벨됨.
2. **사람 승인(1회).** 메인테이너가 계약을 검토·승인. 이때 source document hash와 canonical
   contract-body hash를 담은 approval artifact를 씁니다. 이 1회 승인이 per-step 승인을 대체.
3. **`cx autopilot run --policy <contract>`** 가 worktree 안에서, 승인된 계약 아래, strict
   gate와 stop condition으로 supervised loop를 돌림.

## Gate 합성 (완료 권한)

`autopilot run`은 아래가 **전부** green일 때만 `complete`이며, 기존 `gateFor` tri-state
메커니즘을 재사용 — 새 판단 아님:

- **verification gate** — `verificationRequired` 명령 통과(커널).
- **slop gate** — `slop check` evidence gap 없음.
- **supply-chain gate** — `supply-chain check` gap/blocking-unknown 없음(새 dependency /
  manifest 변경도 포착).
- **scope gate** — post-step diff가 `scope.allow`와 Codexus-owned artifact bucket(worktree의
  `.codexus/**` ledger/evidence 경로) 안에 머물고 `forbiddenChanges`를 안 건드림.

`heuristicClaims`와 informational unknown은 다른 gate들처럼 완료 exit code를 절대 안 움직임.

## Capability × Policy 시작 게이트

첫 step 전에 `autopilot run`은 driver를 probe하고 **불일치 시 block**합니다(`config.option_
ignored`처럼 조용히 진행하지 않음):

- `approval = never`를 요청했는데 driver가 approval mode 지원과 적용을 증명할 수 없으면
  autopilot은 시작을 거부합니다. worktree는 blast radius를 줄이지만 approval-mode enforcement의
  대체물이 아닙니다.
- sandbox 모드가 실제 적용 안 되면 autopilot은 시작을 거부합니다.
- `networkPolicy`, destructive-command blocking, secret/env access control을 요청했는데
  driver/sandbox가 강제하거나 관측할 수 없으면 autopilot은 시작을 거부하거나 계약을 unsupported로
  거부합니다.
- 커널의 `permission.checked → "delegated_to_driver"`가 autopilot에선
  `enforced_or_blocked`가 됨.

**첫 driver에서 강제 가능한 경계.** scope gate가 post-step diff를 읽으므로, 현재 `codex-exec`가
실제로 강제·관측할 수 있는 경계는: 파일 scope, `forbiddenChanges`, `maxChangedFiles` /
`maxDiffLines`, verify matrix, `maxRuntimeMs` / `maxRepairIterations`입니다. 비-파일 경계
(`networkPolicy`, destructive-command 차단, secret/env 접근)는 sandbox 모드가 관측 가능하게
강제할 때만 인정되고, 아니면 시작 게이트가 그 field를 unsupported로 거부하거나 차단합니다 —
강제하는 척하지 않습니다.

## Worktree 격리

장시간 무인 run은 기본 checkout이 아니라 **전용 git worktree**에서 실행. 이것이
detect-then-stop을 안전하게 만드는 안전망: scope 위반이 격리된 worktree에 떨어지고, 사용자
작업 트리에 닿기 전에 scope gate가 잡습니다. autopilot 산출물을 미완성 로컬 작업과도 분리.

## Stop conditions

autopilot은 아래 중 하나에서 정지(실패가 아니라 경계 보고):

- policy/scope 위반(`scope.allow` 밖 path, `forbiddenChanges` 접촉, 새 dependency, workflow
  변경, 또는 시작 게이트가 강제/관측 가능하다고 증명한 다른 경계);
- `maxRepairIterations` 초과한 반복 verification 실패;
- `maxChangedFiles` / `maxDiffLines` 초과;
- `maxRuntimeMs` timeout;
- dirty/stale 증거(workspace fingerprint가 증거가 더 이상 fresh하지 않다고 판정).

각 정지는 도달한 한도를 기록. 향후 autopilot 전용 resume 경로는 원래 contract hash, stop
reason, 올린 한도, 새 approval record를 이어받아야 합니다. 기존 `cx resume`은 UX 참고가 될 수
있지만, 그 자체만으로는 autopilot continuation semantics에 충분하지 않습니다.

## Evidence bundle

최종 산출물은 **PR-ready evidence bundle**: 승인된 계약, run ledger, 네 gate 결과, diff,
criteria 충족 증거 — 에이전트의 산문을 믿지 않고도 검토하고 PR을 열기에 충분.

## Multi-engine relay extension

향후 Codex-author / reviewer-engine workflow는 [15번 문서](15-multi-engine-relay-autopilot.md)로
분리합니다. 해당 확장은 author/reviewer round, stage full-gate evidence, convergence
agreement를 기록하지만, convergence는 advisory로 유지합니다. 최종 완료는 여전히 이 계약의
verification/evidence gate가 필요합니다.

## Task Panel Projection

향후 native Codex task-panel UX는 [16번 문서](16-codex-task-panel-projection.md)로
분리합니다. Autopilot은 승인된 contract, implementation plan, verification matrix, gate
check에서 보이는 task row를 만들 수 있지만, 그 task row는 workflow state일 뿐입니다. Host
panel에서 체크된 item은 verification, scope, slop, supply-chain, graph evidence를 대체하지
않습니다.

## 표면 (Surface)

```bash
cx autopilot plan --from docs/PRD.md --json     # 제안 계약(draft, 승인 필요)
cx autopilot run --policy .codexus/autopilot.json --json   # worktree + strict gates
```

둘 다 `--json` first이며 ledger/event/gate 형태 재사용. `autopilot run` 출력은 surface가
안정될 때까지 `experimental` stability 마커(readiness plan 참조).

## 비목표

- 에이전트 파일 쓰기를 사전 차단 안 함(격리·탐지; prevention은 Codex sandbox 몫).
- acceptance criteria를 fact로 도출 안 함; 계약은 사람 승인.
- 병렬 gate subsystem 추가 안 함; 기존 gate 합성.
- driver approval/sandbox capability 증명 없이 "무인" 주장 안 함.
- 지원되는 관측/강제 surface 없이 network, command, secret/env policy enforcement를 주장 안 함.
- 계약 한도 정지를 실패로 취급 안 함.
- Codex 특수성을 계약/scope/gate 레이어에 넣지 않음.
- 0.1.0 stable에 포함 안 됨; 0.2 / 0.3 트랙에서 experimental로 ship.

## 첫 슬라이스

1. autopilot 계약 **schema artifact + validation**(빈 scope 거부, 미지 키 거부,
   `forbiddenChanges` 우선순위).
2. **scope gate, report-only**: worktree에서 post-step diff vs 계약을 계산해 위반을 강제
   없이 보고.
3. 기존 네 gate 합성 + stop conditions.
4. **capability × policy 시작 게이트**(`option_ignored`가 아니라 blocking).
5. `cx autopilot plan --from docs/...` → 제안 계약(사람-승인 draft).
6. report-only scope gate가 신뢰되면 `cx autopilot run`(worktree + strict gates); 이어서
   evidence bundle.

작은 Codexus 작업으로 먼저 dogfood.

## 수용 기준

- 계약이 schema 검증됨; 빈 `scope.allow`와 미지 키 거부; `forbiddenChanges`가 `scope.allow`
  를 override.
- 승인된 계약은 source document hash, approval artifact, canonical subject hash를 포함하며,
  tamper된 계약은 실행 전 거부.
- `autopilot plan` 출력은 derived fact가 아니라 사람 승인이 필요한 *draft*로 명시.
- worktree의 scope 위반이 post-step에 탐지되어 구체적 한도를 기록하며 run을 정지; 기본
  checkout은 절대 안 건드림.
- driver가 요청된 approval/sandbox 모드 또는 요청된 network/command/secret policy surface를
  보장 못 하면 `autopilot run`이 시작에서 block(조용한 `option_ignored` 없음, warning-only
  downgrade 없음).
- Protected branch, required review, required check 거부는 boundary record와 함께 멈추며,
  autonomous execution은 branch protection을 우회하지 않음.
- 완료는 네 gate 전부 green 필요; heuristic/informational unknown은 완료 exit code를 절대
  안 움직임.
- 한도-도달 정지는 실패가 아니라 경계(재개 가능)로 보고.
- 전체 loop가 mock driver로 검증됨(engine-agnostic, live Codex 불요).
- 기능이 `stability: experimental`로 자기보고하고 0.1.0 stable contract에서 제외.
