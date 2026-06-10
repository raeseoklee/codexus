# Compiled Repository Wiki

[English](../../design/18-compiled-repository-wiki.md)

작성일: 2026-06-02
상태: deterministic wiki, explicit export, advisory source-bundle synthesis 구현 완료.
Automatic context injection은 계속 deferred

## 결정

Codexus는 **compiled repository wiki** 트랙을 추가할 수 있습니다. 이는 repository fact,
run ledger, verification artifact, decision record, repository graph output 위에 재생성 가능한
evidence-linked markdown projection을 만드는 방향입니다.

2026-06-02 기준 구현 상태:

- 구현됨: `cx wiki map --json`, deterministic
  `cx wiki build --mode deterministic --json`,
  `cx wiki check --gate --json`,
  `cx wiki context --topic <name> --budget <n> [--fresh-only --gate] --json`,
  명시적 `cx wiki export --target <path> --json`,
  `cx wiki build --mode advisory --json`
- 구현된 deterministic page: `overview.md`, `commands.md`, `verification.md`,
  `release.md`, `runtime.md`, `graph.md`, `sessions.md`, `architecture.md`,
  `decisions.md`, `risks.md`
- 구현된 context handoff policy: `cx wiki context --approve --json`은 fresh
  context와 explicit reference를 요구하는 manual-only handoff policy를 기록합니다.
- 구현된 injection policy report: `cx wiki injection-policy --json`은 manual-only
  boundary를 보고하고 automatic injection을 deferred로 유지하며 future injection path 전에
  필요한 evidence를 나열합니다.
- 구현된 report-only injection planning: `cx wiki injection plan --approval
  <id-or-path> --target <target> --json`은 `applySupported:false`인 non-applied plan
  artifact를 기록합니다.
- 구현된 schema: `codexus.wiki.manifest`, `codexus.wiki.page`,
  `codexus.wiki.advisory`
- 계속 deferred: run으로의 automatic context injection. Export는 fresh passing wiki
  check 뒤에만 실행되는 명시적 projection이며, Codexus는 exported page를 auto-commit하지
  않습니다. Advisory synthesis는 `modelInvoked: false`, `sourceTruth: false`,
  `eligibleForAutomaticInjection: false`, `completionAuthority: false`를 가진 local
  source-bundle artifact입니다.

이 설계는 LLM-maintained wiki 패턴을 Codexus에 맞게 적용하되, Codexus를 일반 지식관리 제품으로
바꾸지 않습니다. Wiki는 source of truth가 아닙니다. 매 session마다 context를 처음부터 다시
구축하지 않도록 agent와 사람이 프로젝트를 이해하는 데 쓰는 navigable projection입니다.

분리된 경계: 체크인된 [Project LLM Wiki](../../project-wiki/README.md)는 Codexus maintainer와
LLM agent를 위한 project-management artifact입니다. 이 design doc은 Codexus 제품 surface가
regenerable wiki artifact를 만드는 방향을 설명합니다. 두 항목은 합치면 안 됩니다. 프로젝트 관리
wiki page는 maintainer를 안내할 수 있지만, generated wiki page는 projection이며 completion
authority가 되지 않습니다.

소유권 모델:

```text
repository files + docs + Codexus ledgers + graph artifacts + decisions
        -> source manifests and scoped fingerprints
        -> compiled markdown pages
        -> structural wiki check
        -> optional context packs for a run
```

Codexus는 비용이 큰 부분을 작게 만들어야 합니다. 사용자에게 큰 wiki를 직접 쓰게 하지 않고,
full wiki app을 가져오지도 않고, Codexus가 이미 검증할 수 있는 artifact에서 source-linked page를
작게 compile합니다.

## 왜 Codexus에 맞나

기저 패턴의 장점은 지식 작업을 반복 retrieval에서 accumulated synthesis로 바꾸는 데 있습니다.
Software work에서는 Codexus가 이미 적절한 substrate를 갖고 있습니다:

- repository index와 docs-code check;
- architecture import evidence;
- repository graph artifact;
- change evidence와 slop finding;
- supply-chain fact;
- verification record;
- memory entry;
- decision record;
- session task와 HUD projection.

이 artifact들은 path, hash, timestamp, schema, verification link를 갖기 때문에 chat history보다
신뢰할 수 있습니다. compiled wiki는 이들을 readable page로 보여주되 Codexus 규칙을 보존합니다:

```text
facts can gate; judgment advises; projections are not truth.
```

## 비용 문제

유지되는 wiki는 보통 유지 비용이 가치보다 커질 때 실패합니다:

- source 하나를 추가할 때 여러 위치에 정리해야 함;
- code 변경 후 summary가 stale해짐;
- cross-link가 drift됨;
- decision이 chat이나 commit 속으로 사라짐;
- contradiction과 supersession review가 번거로움;
- wiki가 불완전하면 agent가 여전히 project context를 다시 찾아야 함.

많은 구현은 큰 knowledge system을 scaffold하거나, database를 추가하거나, MCP tool을 붙이거나,
초기에 상당한 wiki tree를 생성합니다. 동작할 수는 있지만 비용이 "wiki를 쓰는 일"에서 "wiki
system을 운영하는 일"로 이동합니다.

Codexus는 더 작은 경로를 택해야 합니다:

- 기존 evidence에서 먼저 compile함;
- 가치가 높은 page만 생성함;
- freshness를 기계적으로 표시함;
- 모든 generated page를 source artifact로 추적 가능하게 함;
- semantic summary는 optional/advisory로 둠.

## Layer Model

Codexus는 세 layer를 사용하고 소유권 경계를 엄격히 둡니다:

| Layer | Owner | Mutability | Purpose |
| --- | --- | --- | --- |
| Source layer | Repository and Codexus artifacts | Normal project/workflow rules | Raw truth: code, docs, ledgers, verification, decisions, graph artifacts |
| Compiled wiki layer | Codexus generator | Regenerable | Source ref, hash, link, freshness를 가진 readable markdown page |
| Context pack layer | Codexus adapter | Per run | Freshness evidence와 함께 run에 attach/inject할 bounded wiki subset |

Compiled wiki는 기본적으로 `.codexus/wiki/` 아래에 저장할 수 있습니다. Checked-in docs로 export하는
작업은 명시적이어야 합니다. Generated page는 noisy하고 자주 바뀔 수 있기 때문입니다.

## Page Types

첫 유용한 page set은 작아야 합니다:

- `overview.md`: project map, important docs, current status, known deferred surfaces;
- `commands.md`: command registry와 docs에서 유도한 CLI surfaces;
- `architecture.md`: architecture fact와 import policy finding;
- `verification.md`: verification command, latest evidence, known gaps;
- `release.md`: package version, changelog, release policy, JSON contract pointer;
- `runtime.md`: implementation status, remaining work, roadmap, runtime authority boundary;
- `decisions.md`: decision record와 rejected alternative;
- `risks.md`: supply-chain, slop, graph, policy finding;
- `graph.md`: repository graph summary와 freshness state;
- `sessions.md`: recent run/session summary와 task state.

모든 page는 machine-readable frontmatter를 포함해야 합니다:

```yaml
schemaVersion: 1
type: codexus.wiki.page
pageId: wiki.commands
generatedAt: "2026-06-02T00:00:00.000Z"
sourceScope:
  patterns:
    - "src/**"
    - "docs/**"
sourceFingerprint: "sha256:..."
claimClasses:
  derivableFacts: 12
  advisoryClaims: 3
freshness: fresh
```

본문은 readable prose를 포함할 수 있지만, fact는 source ref를 인용해야 합니다:

```markdown
The stable public bins are `cx` and `codexus`.

Source refs:
- package.json#bin
- docs/README.md
```

## Claim Classes

Compiled wiki page는 fact/judgment 분리를 보존해야 합니다.

Gate 가능한 사실:

- source file과 Codexus artifact가 존재함;
- page schema가 유효함;
- source ref가 resolve됨;
- source hash가 현재 scoped fingerprint와 일치함;
- local link가 resolve됨;
- generated page가 허용 없이 absolute private path를 포함하지 않음;
- context pack이 page id와 page freshness를 인용함.

Advisory claim:

- summary가 project를 잘 설명함;
- risk가 중요함;
- decision이 좋은 선택이었음;
- architecture explanation이 최선의 onboarding path임;
- page가 "complete"함.

이 구분은 wiki의 유용성이 거짓 권한이 되는 것을 막습니다.

## Build Modes

Wiki는 두 build mode를 지원해야 합니다.

### Deterministic Projection

이 mode는 local structured fact만 사용합니다:

- package metadata;
- docs index;
- schema registry;
- command registry;
- architecture import scan;
- repo graph check output;
- supply-chain report;
- verification artifact;
- decision record;
- task state.

Model call 없이 concise page를 만들 수 있습니다. 싸고 결정적이며 gate 가능하기 때문에 첫 slice에
맞습니다.

### Advisory Synthesis

이 mode는 engine에게 summary 작성 또는 수정을 요청합니다. Wiki를 훨씬 유용하게 만들 수 있지만
출력은 judgment입니다. 따라서 다음을 지켜야 합니다:

- source ref를 인용함;
- derivable fact와 prose를 분리함;
- driver, model, prompt hash, source bundle hash를 기록함;
- source ref가 없으면 wiki check가 실패하지만, 사람이 prose에 동의하지 않는다는 이유로
  실패하지 않음;
- source truth를 훼손하지 않고 regeneration 또는 deletion 가능.

Advisory synthesis는 새 wiki 전용 LLM client가 아니라 기존 driver boundary를 통해 실행해야 합니다.

## Freshness

각 page에는 scoped freshness가 필요합니다. Command page는 test file 변경 때문에 stale해지면 안
됩니다. Verification page는 verification artifact나 선언된 verify command가 바뀌면 stale해야
합니다.

후보 freshness shape:

```json
{
  "pageId": "wiki.commands",
  "sourceScope": {
    "files": ["package.json", "docs/README.md", "src/cli/main.ts"],
    "artifacts": [".codexus/repo-check/check.json"]
  },
  "sourceFingerprint": {
    "kind": "scoped",
    "hash": "sha256:..."
  },
  "freshness": "fresh"
}
```

Freshness states:

- `fresh`: current scoped fingerprint가 recorded source fingerprint와 일치함;
- `stale`: source file 또는 artifact가 변경됨;
- `partial`: source set이 너무 크거나 일부를 읽을 수 없음;
- `unknown`: Codexus가 freshness를 안전하게 계산할 수 없음.

자동 context injection 후보가 될 수 있는 것은 `fresh`뿐입니다.

## Command Surface

제안 명령:

```bash
cx wiki map --json
cx wiki build --mode deterministic --json
cx wiki build --mode advisory --driver codex-exec --json
cx wiki check --gate --json
cx wiki context --topic verification --budget 1200 --json
cx wiki context --topic verification --budget 1200 --fresh-only --gate --json
cx wiki context --topic verification --approve --approved-by "$USER" --json
cx wiki injection-policy --json
cx wiki injection plan --approval <approval-id-or-path> --target session:current --json
cx wiki export --target docs/codexus-wiki --json
```

`cx wiki context`는 bounded context-pack generator입니다. Page id, freshness, source ref,
token estimate, 선택된 정확한 text를 반환해야 합니다. Run에 context를 조용히 inject하면
안 됩니다. `--approve`는 `approved_not_injected`, `automatic:false`, completion
authority 없음을 가진 visible `codexus.wiki.context-approval` artifact를 써서 Codex
session이 context를 명시적으로 인용할 수 있게 합니다. Approval artifact는 이제
manual-only handoff policy도 포함합니다. Fresh context와 explicit reference가 필요하고,
automatic injection은 false이며 applied/source-truth/completion authority도 모두 false로
남습니다. `--fresh-only --gate`는 manual context-pack freshness guard입니다. 선택된 topic에
fresh page가 없으면 stale context를 반환하지 않고 실패합니다. `cx wiki injection-policy`는
이 handoff의 명시적 policy boundary를 보고합니다. 현재 사용은 manual-only이고 automatic
prompt mutation은 계속 deferred이며, future injection에는 fresh-context gate, explicit
approval, sanitization, audit artifact, reversible disable path, failed freshness가 inject할 수
없다는 증명이 필요합니다.

## Reversible Approved-Injection 계약

상태: 설계 전용. 현재 Codexus 명령은 wiki context로 prompt, session, run을 변경하지 않습니다.

미래의 injection path는 `cx wiki context`, `cx wiki context --approve`,
`cx wiki injection-policy`의 side effect가 아니라 별도의 action surface여야 합니다. 최소 계약은
다음과 같습니다:

- explicit target: caller가 run, session, future adapter target을 명시합니다.
- explicit approval: caller가 fresh `codexus.wiki.context-approval` artifact를 참조하고
  approver를 기록합니다.
- sanitization: target mutation 전에 context pack을 scan/redact합니다.
- audit first: Codexus는 mutation 시도 전에 injection audit artifact를 기록합니다.
- reversible disable: 추가 injection attempt를 막는 문서화된 command 또는 policy switch가
  있어야 합니다.
- freshness proof: stale 또는 failed freshness check는 injection artifact를 만들 수 없습니다.
- authority promotion 금지: injected context는 source truth, verification evidence,
  health evidence, completion authority가 되지 않습니다.

첫 future surface는 다음과 같은 two-step plan/apply 형태가 될 가능성이 높습니다:

```bash
cx wiki injection plan --approval <approval-id-or-path> --target <target> --json
cx wiki injection apply --plan <plan-path> --approved-by <name> --json
```

`plan`은 report-only이면서 gateable이어야 합니다. `apply`는 prompt mutation이 reversible,
auditable, bounded임을 반복 dogfooding으로 증명하기 전까지 experimental이어야 합니다.

`plan`은 구현됐습니다. Approval reference, target, fresh selected page, manual-only handoff
policy를 검증한 뒤 `planned_not_applied`, `applySupported:false`,
`promptMutation:false`, `completionAuthority:false`를 가진 schema validation 가능한
`codexus.wiki.injection-plan`을 기록합니다. `apply`는 계속 deferred입니다.

Autopilot integration은 명시적이어야 합니다:

```bash
cx autopilot run --context-pack .codexus/wiki/context/context_...json
```

## Storage

기본 storage:

```text
.codexus/wiki/
  manifest.json
  pages/
    overview.md
    commands.md
    architecture.md
    verification.md
    decisions.md
    risks.md
    graph.md
    sessions.md
  checks/
    check.json
  contexts/
    context_...json
  export는 `.codexus/` 바깥의 명시적 user target에만 기록
```

Manifest가 page identity와 freshness metadata를 소유합니다:

```json
{
  "schemaVersion": 1,
  "type": "codexus.wiki.manifest",
  "generatedAt": "2026-06-02T00:00:00.000Z",
  "pages": [
    {
      "pageId": "wiki.overview",
      "path": ".codexus/wiki/pages/overview.md",
      "freshness": "fresh",
      "sourceFingerprint": "sha256:..."
    }
  ]
}
```

## 기존 트랙과의 관계

- [3번 문서](03-evolution-engine.md): memory는 compact, scoped, source-linked 상태를 유지합니다.
  Wiki는 memory summary를 render할 수 있지만 memory entry를 대체하지 않습니다.
- [13번 문서](13-harness-engineering-alignment.md): repo knowledge는 mechanical/gateable 상태를
  유지합니다. Wiki는 그 knowledge 위의 readable projection입니다.
- [14번 문서](14-repository-knowledge-graph.md): graph artifact는 wiki page와 context pack의 source
  중 하나가 됩니다.
- [16번 문서](16-codex-task-panel-projection.md): task state는 `sessions.md`에 나타날 수 있지만
  UI task status는 completion evidence가 아닙니다.
- [17번 문서](17-operational-control-invariants.md): docs-code invariant와 decision record가 wiki에
  공급됩니다.

## 비목표

- 일반 personal knowledge-base app을 만들지 않음.
- Codexus core에 vector database를 추가하지 않음.
- Obsidian, MCP, web UI를 요구하지 않음.
- Generated wiki page를 source of truth로 만들지 않음.
- LLM-written summary를 verification evidence로 취급하지 않음.
- Generated page를 자동 commit하지 않음.
- Stale wiki page를 run에 inject하지 않음.
- Third-party wiki implementation을 core로 가져오지 않음.

## 첫 슬라이스

1. 설계 문서 추가. 상태: 이 문서.
2. `codexus.wiki.manifest`와 `codexus.wiki.page` schema 추가.
3. `cx wiki map --json`으로 candidate source artifact 나열:
   - docs index;
   - package metadata;
   - schema registry;
   - command registry;
   - 존재하는 경우 latest repo/architecture/supply-chain report.
4. `overview.md`, `commands.md`, `verification.md`, `release.md`, `runtime.md`용
   deterministic `cx wiki build --mode deterministic --json` 추가.
5. `cx wiki check --gate --json`으로 schema, source ref, local link, path sanitization,
   scoped freshness 검사.
6. `cx wiki context --topic <name> --budget <n> --json`을 read-only context-pack generator로
   추가.
7. 구현됨: `cx wiki context --topic <name> --approve --approved-by <name> --json`을
   선택된 bounded context에 대한 visible non-injected approval artifact로 추가.
8. 구현됨: `cx wiki context --fresh-only --gate --json`을 추가해 automatic injection 없이
   fresh manual context를 요구할 수 있게 합니다.
8a. 구현됨: `codexus.wiki.context-approval` artifact에 manual-only handoff policy를 추가.
   이 policy는 stale selected page를 거부하고 explicit reference를 요구하며 automatic
   injection을 false로 유지합니다.
8b. 구현됨: `cx wiki injection-policy --json`을 report-only policy surface로 추가.
   Manual-only boundary를 보이게 만들고 automatic injection은 deferred로 유지하며 prompt를
   변경하지 않습니다.
8c. 구현됨: `cx wiki injection plan --approval <id-or-path> --target <target> --json`을
   report-only plan artifact로 추가. Plan을 apply하지 않으며 `cx wiki injection apply`는
   deferred로 유지합니다. Plan artifact는 `wiki-injection-plan`으로 schema validation할 수
   있습니다.
9. 구현됨: `cx wiki export --target <path> --json`을 fresh passing wiki check를 먼저
   요구하고, source truth를 쓰지 않으며, auto-commit하지 않는 명시적 export로 추가.
10. 구현됨: deterministic page와 freshness check가 source bundle을 제공할 만큼 안정된 뒤
   `cx wiki build --mode advisory --json`을 추가. Advisory artifact는 driver/source-bundle
   evidence를 기록하지만 권위가 없습니다.
11. 구현됨: deterministic build에 `graph.md`와 `sessions.md`를 추가. 이 page들은 최신
    repository graph artifact와 local session state를 요약하지만, 계속 재생성 가능한
    projection일 뿐 graph injection approval, task completion evidence, source truth가
    아닙니다.

## 성공 기준

이 기능은 context reconstruction 작업을 줄이면서 새 유지보수 부담을 만들지 않을 때만 유용합니다.

초기 성공 기준:

- fresh clone에서 model call 없이 작은 wiki를 build할 수 있음;
- stale page가 기계적으로 탐지됨;
- 모든 page가 source file 또는 Codexus artifact로 되돌아감;
- context pack이 각 page를 왜 선택했는지 설명할 수 있음;
- `cx repo check --gate`와 `cx wiki check --gate`가 분리되어 있음;
- `.codexus/wiki/`를 삭제해도 source truth가 손실되지 않음.
