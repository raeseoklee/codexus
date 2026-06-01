# Repository Knowledge Graph

[English](../../design/14-repository-knowledge-graph.md)

상태: experimental 첫 slice 구현됨. 외부 import, search/explain, context injection은
계속 deferred입니다.

이 문서는 [13번 문서](13-harness-engineering-alignment.md)의 기계적
repo-knowledge slice에서 이어지는 repository knowledge graph 트랙을 정의합니다. 13번
문서는 alignment 근거를 유지하고, 이 문서는 graph schema, provider boundary,
freshness model, gate semantics를 담당합니다.

## 결정

Codexus는 Understand-Anything을 core로 복제하지 않습니다. Understand-Anything의
tree-sitter, web-tree-sitter, graphology, dashboard, hook surface는 그 플러그인
맥락에서는 가치가 있지만, Codexus core에 직접 들이면 zero-runtime-dependency와
no-runtime-package-imports invariant를 깨뜨립니다.

대신 Codexus는 repository graph adapter layer를 추가합니다:

- 외부 graph artifact는 JSON-only provider로 import;
- native lightweight graph는 기존 Codexus evidence projection에서 build;
- derivable fact와 semantic judgment를 출력에서 분리;
- Codexus가 로컬에서 관측 가능한 structural invariant만 gate.

목표는 완벽한 AST graph가 아닙니다. 목표는 confidence, scope, freshness, judgment
boundary가 명시된 신뢰 가능한 graph artifact입니다.

## Command Surface

구현된 첫 slice:

```bash
cx repo graph build --graph-provider codexus-lite --scope "src/**" --json
cx repo graph check --graph <graph-id-or-path> --gate --json
```

Deferred import/retrieval slice:

```bash
cx repo graph import --graph-provider understand-anything --source .understand-anything/knowledge-graph.json --scope "src/**" --json
cx repo graph search --graph <graph-id-or-path> "<query>" --json
cx repo graph explain --graph <graph-id-or-path> <node-or-edge-id> --json
```

Search/explain은 advisory context surface입니다. Context가 승인된 Codexus artifact로
기록되고 graph id와 freshness result가 함께 남기 전까지 run에 자동 주입하면 안 됩니다.

## Provider Boundary

Graph provider는 package import boundary가 아니라 descriptor boundary입니다. 장기
driver model과 같은 방향입니다. Identity와 capability는 metadata로 직렬화하고,
provider-specific 실행은 workflow kernel 밖에 둡니다.

Descriptor shape:

```json
{
  "id": "codexus-lite",
  "type": "codexus.repo.graph.provider",
  "external": false,
  "runtimeDeps": false,
  "accuracy": "best_effort_text",
  "capabilities": {
    "build": true,
    "import": false,
    "check": true,
    "semanticClaims": false
  }
}
```

필수 descriptor field:

- `id`: 안정적인 provider id. 예: `codexus-lite`, `understand-anything`;
- `external`: graph가 외부 tool/plugin에서 생성되었는지;
- `runtimeDeps`: provider 사용에 Codexus core 밖 runtime dependency가 필요한지;
- `accuracy`: provider가 선언한 extraction mode. Correctness guarantee가 아님;
- `capabilities`: 지원 operation과 semantic claim 존재 가능성.

초기 provider:

- `codexus-lite`: internal, zero runtime dependencies, `best_effort_text`.
  Architecture import scan, repo index/link check, 이후 change-evidence fact를 graph로
  투영합니다. 새 parser engine을 추가하지 말고 shared glob/import-scan utility를
  재사용해야 합니다.
- `understand-anything`: external JSON import only. Codexus는
  `.understand-anything/knowledge-graph.json`을 읽고 normalize하지만, UA package를
  import하지 않고, UA hook을 실행하지 않고, pnpm dependency를 설치하지 않고, UA worktree
  redirect를 따르지 않고, dashboard를 포함하지 않습니다.

이 flag 이름은 `--provider`가 아니라 `--graph-provider`여야 합니다. Harness의
model/provider 용어와 충돌하기 때문입니다.

## Graph Artifact

외부 graph를 import하더라도 graph artifact는 Codexus-owned projection입니다. 최소
artifact는 다음을 포함해야 합니다:

```json
{
  "schemaVersion": 1,
  "stability": "experimental",
  "type": "codexus.repo.graph",
  "graphId": "sha256:...",
  "provider": {
    "id": "codexus-lite",
    "external": false,
    "runtimeDeps": false,
    "accuracy": "best_effort_text"
  },
  "scope": {
    "patterns": ["src/**"],
    "root": "."
  },
  "sourceWorkspaceFingerprint": {
    "kind": "scoped",
    "scopeHash": "sha256:..."
  },
  "source": {
    "kind": "codexus-lite",
    "path": null,
    "hash": null,
    "sanitized": true
  },
  "nodes": [],
  "edges": [],
  "layers": [],
  "tour": [],
  "evidenceGaps": [],
  "derivableFacts": [],
  "heuristicClaims": [],
  "blockingUnknowns": [],
  "informationalUnknowns": [],
  "gate": {
    "enabled": false,
    "status": "not_requested",
    "exitCode": 0,
    "reason": "pass --gate to make structural graph invariants affect exit code"
  }
}
```

Graph id는 provider raw input이 아니라 canonical Codexus graph identity payload의 content
hash입니다. Identity payload에는 normalized provider descriptor, scope, scoped source
fingerprint, source provenance, nodes, edges, layers, tour, graph evidence claim이
포함됩니다. `graphId` 자체와 `gate`, `evidenceGaps`, `blockingUnknowns`,
`informationalUnknowns` 같은 volatile check output은 제외합니다. Canonical
serialization은 deterministic해야 합니다: object key 정렬, path separator 정규화,
insignificant whitespace 정규화가 필요합니다.

외부 source hash는 provenance로 기록해야 하지만 graph id 자체는 아닙니다. Imported JSON의
경우 `source.kind`는 external artifact class를 식별하고, `source.path`는 알 수 있을 때
sanitized relative source path를 기록하며, `source.hash`는 bounded source artifact hash를
기록해야 합니다.

## Scoped Freshness

Freshness는 graph가 분석한다고 주장하는 file scope에 맞춰져야 합니다. `src/**`만
포괄하는 graph를 whole-workspace fingerprint와 비교하면 무관한 docs 변경 뒤에도 stale로
잘못 표시됩니다.

Graph track은 기존 workspace fingerprint의 원칙을 재사용하되 equality를 graph scope로
좁힌 scoped fingerprint model을 도입해야 합니다:

- `scope.patterns`와 normalized package root 기록;
- scope 안 tracked file content hash;
- scope path로 filter한 staged/unstaged diff hash;
- scope path로 filter한 untracked file hash. 기존 bounded/partial behavior 유지;
- `head`는 provenance로만 기록하고 freshness equality key로 쓰지 않음.

이는 기존 full `WorkspaceFingerprint`와 의도적으로 분리됩니다. 기존 fingerprint는 `head`,
staged diff, unstaged diff, untracked content를 workspace-wide equality model로 다룹니다.
Scoped graph에는 docs-only commit이 `src/**` graph를 stale하게 만들지 않도록 별도 scoped
equality model이 필요합니다.

첫 구현은 보수적인 glob 기반 모델이어야 합니다. 선언된 scope 안의 file은 emitted node나
edge가 그 file에 실제 의존하지 않더라도 graph를 stale하게 만들 수 있습니다. 이 false-stale
방향은 rebuild를 요구할 뿐이므로 허용됩니다. 반대로 false-fresh는 stale graph context를
current라고 주장하므로 피해야 합니다. File-level incremental freshness는 첫 structural gate
contract를 바꾸지 않고 이후 추가할 수 있습니다.

Scoped fingerprint가 degraded 또는 partial이면 graph freshness check는 `unknown` 또는
`blocked`를 반환해야 합니다. 강한 freshness를 주장하면 안 됩니다.

## Gate Semantics

Gate 가능한 structural invariant:

- graph schema valid;
- graph provider descriptor valid;
- imported path가 relative, normalized, sanitized;
- graph scope가 선언되어 있고 checker가 이해 가능;
- scoped source freshness가 현재 scoped fingerprint와 일치;
- 모든 edge endpoint가 존재하는 node id를 참조;
- claimed node kind에 필요한 field 존재;
- imported external artifact의 source hash와 provenance 기록.

Advisory-only semantic claim:

- architectural layer assignment;
- domain model summary;
- file/symbol summary;
- tour/onboarding path;
- LLM 또는 non-derivable external claim에서 온 "function A가 function B를 호출한다"는 edge
  의미;
- "이 component가 중요하다" 같은 ranking/priority claim.

`heuristicClaims`와 informational unknown은 gate exit code를 절대 움직이면 안 됩니다.
`cx repo graph check --gate`를 fail/block할 수 있는 것은 structural `evidenceGaps`와
`blockingUnknowns`뿐입니다.

## Edge Fact Boundary

Edge는 신뢰 가능한 graph와 단순히 풍부한 graph의 차이를 가장 잘 보여줍니다. Edge 존재
자체는 provider judgment일 수 있지만, edge endpoint의 존재는 local structural fact입니다.

예:

- advisory judgment: external provider가 `function:a`가 `function:b`를 호출한다고 말함;
- derivable structural fact: `function:a`와 `function:b` node id가 imported graph에 존재;
- gateable evidence gap: edge가 `function:b`를 가리키지만 그런 node가 없음.

Dangling edge는 structural invalid이므로 gate를 fail해야 합니다. Non-derivable edge의
semantic meaning에 동의하지 않는 문제는 별도 local analyzer가 증명하지 않는 한 advisory에
남겨야 합니다.

## Native Lite Projection

`codexus-lite`는 새 parsing engine이 아닙니다. Codexus가 이미 derivable하게 얻는 fact를
graph로 투영합니다:

- architecture import scan edge를 file/import graph edge로 변환;
- repo check index link를 documentation graph edge로 변환;
- counterpart check를 doc relationship edge로 변환;
- change-evidence와 slop evidence는 이후 affected node/edge annotation으로 확장 가능.

초기 `codexus-lite` projection은 scoped file node와 static import-specifier edge를
`best_effort_text` accuracy로 내보냅니다. 이후 slice에서 architecture checker 안의 private
import-scan helper를 shared internal module로 추출할 수 있습니다. 이 projection을 풍부하게
만들기 위해 tree-sitter, graphology, dashboard dependency를 추가하면 안 됩니다.

Scoped equality model은 graph-specific으로 유지하지만, SHA-256 hashing, path normalization,
bounded file read, git diff filtering 같은 low-level primitive는 shared internal utility에
둬야 합니다. 그래야 graph freshness와 workspace fingerprinting이 서로 다른 hash behavior로
갈라지지 않습니다.

## Understand-Anything Import Rules

Codexus가 가져올 수 있는 아이디어:

- structural graph artifact shape;
- diff impact model;
- graph neighborhood 기반 context retrieval;
- onboarding/tour output을 advisory context로 활용;
- freshness metadata와 incremental-update concept.

Codexus core로 가져오면 안 되는 surface:

- tree-sitter 또는 web-tree-sitter runtime dependency;
- graphology/dashboard runtime dependency;
- automatic no-confirmation hook;
- worktree redirect behavior;
- pnpm install/build side effect;
- LLM summary를 verification/completion evidence로 사용하는 방식.

`understand-anything` import에서 Codexus는 JSON을 읽고, path를 sanitize하고, Codexus graph
schema로 normalize하고, graph id를 계산한 뒤, 다른 graph provider와 같은 structural check를
실행해야 합니다.

## Storage

생성/import된 graph는 Codexus-owned state 아래 저장합니다. 예:

```text
.codexus/repo-graphs/<graph-id>/graph.json
.codexus/repo-graphs/<graph-id>/source.json
.codexus/repo-graphs/<graph-id>/check.json
```

Source artifact는 기본적으로 redacted/bounded여야 합니다. 외부 tool에서 온 absolute local
path는 persistence 전에 sanitize해야 합니다.

## Implementation Order

1. Graph identity payload용 shared canonical serialization과 hash primitive 추가. 상태:
   구현됨.
2. Codexus-owned graph artifact의 graph schema와 JSON validation 추가. 상태: 구현됨.
3. Graph scope용 scoped workspace fingerprinting 추가. 상태: 구현됨.
4. Structural invariant용 `cx repo graph check --gate` 추가. 상태: 구현됨.
5. 기존 architecture/repo evidence를 projection하는 `codexus-lite` 추가. 상태: 초기
   file/import projection 구현됨.
6. `cx repo graph import --graph-provider understand-anything`을 JSON-only로 추가. 상태:
   deferred.
7. Graph artifact와 freshness가 안정된 뒤 read-only search/explain command 추가.

Graph freshness, path sanitization, gate behavior가 안정되고 기록되기 전에는 automatic context
injection이나 autopilot graph 사용을 노출하지 않습니다.
