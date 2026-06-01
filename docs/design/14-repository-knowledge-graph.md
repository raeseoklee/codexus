# Repository Knowledge Graph

[Korean](../ko/design/14-repository-knowledge-graph.md)

Status: proposed 0.2/0.3 design track.

This document defines the repository knowledge graph track that grows out of the
mechanical repo-knowledge slice in [doc 13](13-harness-engineering-alignment.md).
Doc 13 keeps the alignment rationale. This document owns the graph schema,
provider boundary, freshness model, and gate semantics.

## Decision

Codexus should not copy Understand-Anything into core. Its tree-sitter,
web-tree-sitter, graphology, dashboard, and hook surfaces are valuable in their
own plugin context, but they violate Codexus's zero-runtime-dependency and
no-runtime-package-imports invariants if imported directly.

Codexus should instead add a repository graph adapter layer:

- import external graph artifacts through a JSON-only provider;
- build a native lightweight graph from existing Codexus evidence projections;
- label derivable facts separately from semantic judgments;
- gate only structural invariants that Codexus can observe locally.

The target is not a perfect AST graph. The target is a trustworthy graph artifact
whose confidence, scope, freshness, and judgment boundaries are explicit.

## Command Surface

First slice:

```bash
cx repo graph build --graph-provider codexus-lite --scope "src/**" --json
cx repo graph import --graph-provider understand-anything --source .understand-anything/knowledge-graph.json --scope "src/**" --json
cx repo graph check --graph <graph-id-or-path> --gate --json
```

Later slices may add read-only retrieval commands:

```bash
cx repo graph search --graph <graph-id-or-path> "<query>" --json
cx repo graph explain --graph <graph-id-or-path> <node-or-edge-id> --json
```

Search and explain commands are advisory context surfaces. They must not inject
context into a run unless the context is written as an approved Codexus artifact
with a recorded graph id and freshness result.

## Provider Boundary

A graph provider is a descriptor boundary, not a package import boundary. It
follows the same direction as the long-term driver model: identity and
capabilities are serialized as metadata, while provider-specific execution stays
outside the workflow kernel.

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

Required descriptor fields:

- `id`: stable provider id, for example `codexus-lite` or
  `understand-anything`;
- `external`: whether the graph was produced by an external tool or plugin;
- `runtimeDeps`: whether using the provider requires runtime dependencies beyond
  Codexus core;
- `accuracy`: provider-declared extraction mode, not a correctness guarantee;
- `capabilities`: supported operations and whether semantic claims may appear.

Initial providers:

- `codexus-lite`: internal, zero runtime dependencies, `best_effort_text`.
  It is a graph projection over existing Codexus evidence: architecture import
  scans, repo index/link checks, and later change-evidence facts. It must reuse
  shared glob/import-scan utilities instead of adding a new parser engine.
- `understand-anything`: external JSON import only. Codexus reads and normalizes
  `.understand-anything/knowledge-graph.json`, but does not import UA packages,
  run UA hooks, install pnpm dependencies, follow UA worktree redirects, or embed
  the dashboard.

Do not name this flag `--provider`; that conflicts with model/provider language
elsewhere in the harness. Use `--graph-provider`.

## Graph Artifact

The graph artifact is a Codexus-owned projection, even when it imports an
external graph. A minimal artifact should include:

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

Graph ids are content hashes over a canonical Codexus graph identity payload,
not over the provider's raw input. The identity payload includes the normalized
provider descriptor, scope, scoped source fingerprint, source provenance, nodes,
edges, layers, tour, and graph evidence claims. It excludes `graphId` itself and
volatile check output such as `gate`, `evidenceGaps`, `blockingUnknowns`, and
`informationalUnknowns`. Canonical serialization must be deterministic: sorted
object keys, normalized path separators, and normalized insignificant
whitespace.

External source hashes should be recorded as provenance, but they are not the
graph id. For imported JSON, `source.kind` should identify the external artifact
class, `source.path` should be the sanitized relative source path when known,
and `source.hash` should record the bounded source artifact hash.

## Scoped Freshness

Freshness must be scoped to the files the graph claims to analyze. Comparing a
graph that covers `src/**` against a whole-workspace fingerprint would mark the
graph stale after unrelated documentation changes.

The graph track should introduce a scoped fingerprint model that reuses the
existing workspace fingerprint discipline but narrows equality to the graph
scope:

- record `scope.patterns` and the normalized package root;
- hash tracked file content within scope;
- hash staged and unstaged diffs filtered to paths in scope;
- hash untracked files filtered to paths in scope, preserving the existing
  bounded/partial behavior;
- record `head` as provenance only, not as the freshness equality key.

This is intentionally separate from the existing full `WorkspaceFingerprint`.
The existing fingerprint treats `head`, staged diff, unstaged diff, and untracked
content as one workspace-wide equality model. A scoped graph needs a scoped
equality model so a docs-only commit does not stale a `src/**` graph.

The first implementation should be conservative and glob-based. A file inside
the declared scope may stale the graph even when no emitted node or edge depends
on that file. That false-stale direction is acceptable because it asks the user
to rebuild; a false-fresh result would incorrectly claim that stale graph context
is current. File-level incremental freshness can be added later without changing
the first structural gate contract.

If the scoped fingerprint is degraded or partial, the graph freshness check must
return `unknown` or `blocked`; it must not claim strong freshness.

## Gate Semantics

Gateable structural invariants:

- graph schema is valid;
- graph provider descriptor is valid;
- imported paths are relative, normalized, and sanitized;
- graph scope is declared and understood;
- scoped source freshness matches the current scoped fingerprint;
- every edge endpoint references an existing node id;
- required node fields for a claimed node kind are present;
- imported external artifacts have recorded source hashes and provenance.

Advisory-only semantic claims:

- architectural layer assignment;
- domain model summaries;
- file or symbol summaries;
- tours and onboarding paths;
- "this edge means function A calls function B" when the edge came from an LLM
  or non-derivable external claim;
- "this component is important" or similar ranking/priority claims.

`heuristicClaims` and informational unknowns must never move the gate exit code.
Only structural `evidenceGaps` and `blockingUnknowns` may fail or block
`cx repo graph check --gate`.

## Edge Fact Boundary

Edges show the key difference between a trustworthy graph and a merely rich
graph. The existence of an edge may be a provider judgment, but the existence of
the edge's endpoints is a local structural fact.

Example:

- advisory judgment: an external provider says `function:a` calls `function:b`;
- derivable structural fact: `function:a` and `function:b` node ids both exist in
  the imported graph;
- gateable evidence gap: the edge points at `function:b`, but no such node exists.

Dangling edges are structurally invalid and should fail the gate. Disagreeing
with the semantic meaning of a non-derivable edge should remain advisory unless a
separate local analyzer can prove the claim.

## Native Lite Projection

`codexus-lite` is not a new parsing engine. It is a graph projection over facts
Codexus already derives:

- architecture import scan edges become file/import graph edges;
- repo check index links become documentation graph edges;
- counterpart checks become doc relationship edges;
- change-evidence and slop evidence may later annotate affected nodes or edges.

Implementation should first extract the private import-scan helpers from the
architecture checker into a shared internal module. Do not add tree-sitter,
graphology, or dashboard dependencies to make this projection richer.

The scoped equality model remains graph-specific, but low-level primitives such
as SHA-256 hashing, path normalization, bounded file reads, and git diff
filtering should live in shared internal utilities so graph freshness and
workspace fingerprinting do not fork incompatible hashing behavior.

## Understand-Anything Import Rules

Codexus may import these ideas:

- structural graph artifact shape;
- diff impact model;
- context retrieval over graph neighborhoods;
- onboarding/tour output as advisory context;
- freshness metadata and incremental-update concepts.

Codexus must not import these surfaces into core:

- tree-sitter or web-tree-sitter runtime dependencies;
- graphology/dashboard runtime dependencies;
- automatic no-confirmation hooks;
- worktree redirect behavior;
- pnpm install/build side effects;
- LLM summaries as verification or completion evidence.

For `understand-anything` imports, Codexus should read JSON, sanitize paths,
normalize to Codexus graph schema, compute a graph id, and then run the same
structural checks as any other graph provider.

## Storage

Generated or imported graphs should be stored under Codexus-owned state, for
example:

```text
.codexus/repo-graphs/<graph-id>/graph.json
.codexus/repo-graphs/<graph-id>/source.json
.codexus/repo-graphs/<graph-id>/check.json
```

Source artifacts should be redacted and bounded by default. Absolute local paths
from external tools must be sanitized before persistence.

## Implementation Order

1. Add shared canonical serialization and hash primitives for graph identity
   payloads.
2. Add the graph schema and JSON validation for Codexus-owned graph artifacts.
3. Add scoped workspace fingerprinting for graph scopes.
4. Add `cx repo graph import --graph-provider understand-anything` as JSON-only.
5. Add `cx repo graph check --gate` for structural invariants.
6. Add `codexus-lite` by projecting existing architecture/repo evidence.
7. Add read-only search/explain commands after graph artifacts and freshness are
   stable.

Do not expose automatic context injection or autopilot use of graphs until graph
freshness, path sanitization, and gate behavior are stable and recorded.
