# Compiled Repository Wiki

[Korean](../ko/design/18-compiled-repository-wiki.md)

Date: 2026-06-02
Status: deterministic wiki, explicit export, and advisory source-bundle
synthesis implemented; automatic context injection remains deferred.

## Decision

Codexus should add a **compiled repository wiki** track: a regenerable,
evidence-linked markdown projection over repository facts, run ledgers,
verification artifacts, decision records, and repository graph outputs.

Implementation status as of 2026-06-02:

- implemented: `cx wiki map --json`, deterministic `cx wiki build --mode deterministic --json`,
  `cx wiki check --gate --json`, `cx wiki context --topic <name> --budget <n>
  [--fresh-only --gate] --json`,
  explicit `cx wiki export --target <path> --json`, and
  `cx wiki build --mode advisory --json`;
- implemented schemas: `codexus.wiki.manifest`, `codexus.wiki.page`, and
  `codexus.wiki.advisory`;
- still deferred: any automatic context injection into runs. Export is
  implemented only as an explicit projection after a fresh passing wiki check;
  Codexus does not auto-commit exported pages. Advisory synthesis is a local
  source-bundle artifact with `modelInvoked: false`, `sourceTruth: false`,
  `eligibleForAutomaticInjection: false`, and `completionAuthority: false`.

This adapts the LLM-maintained wiki pattern to Codexus without turning Codexus
into a general knowledge-base product. The wiki is not the source of truth. It is
a navigable projection that helps agents and humans understand the project
without rebuilding context from scratch every session.

Separate boundary: the checked-in
[Project LLM Wiki](../project-wiki/README.md) is a project-management artifact
for Codexus maintainers and LLM agents. This design document describes the
Codexus product surface that builds regenerable wiki artifacts. The two should
not be merged: project-management wiki pages can guide maintainers, while
generated wiki pages remain projections and never become completion authority.

The ownership model is:

```text
repository files + docs + Codexus ledgers + graph artifacts + decisions
        -> source manifests and scoped fingerprints
        -> compiled markdown pages
        -> structural wiki check
        -> optional context packs for a run
```

Codexus should make the expensive part cheap: not by asking users to hand-write a
large wiki, and not by importing a full wiki app, but by compiling small,
source-linked pages from artifacts Codexus already knows how to validate.

## Why This Fits Codexus

The underlying pattern is compelling because it changes knowledge work from
repeated retrieval into accumulated synthesis. For software work, Codexus already
has the right substrate:

- repository indexes and docs-code checks;
- architecture import evidence;
- repository graph artifacts;
- change evidence and slop findings;
- supply-chain facts;
- verification records;
- memory entries;
- decision records;
- session tasks and HUD projections.

Those artifacts are more trustworthy than chat history because they have paths,
hashes, timestamps, schemas, and verification links. A compiled wiki can present
them as readable pages while preserving the Codexus rule:

```text
facts can gate; judgment advises; projections are not truth.
```

## The Cost Problem

Maintained wikis usually fail because the maintenance cost is higher than the
value users get from them:

- adding a source requires filing it in multiple places;
- summaries go stale after code changes;
- cross-links drift;
- decisions disappear into chat or commits;
- contradiction and supersession review is tedious;
- the agent still has to rediscover project context when the wiki is incomplete.

Many implementations respond by scaffolding a large knowledge system, adding a
database, adding MCP tools, or generating a substantial wiki tree up front. That
can work, but it moves the cost from "write the wiki" to "operate the wiki
system."

Codexus should take the smaller path:

- compile from existing evidence first;
- generate only high-value pages;
- mark freshness mechanically;
- keep every generated page traceable to source artifacts;
- make semantic summaries optional and advisory.

## Layer Model

Codexus should use three layers, with strict ownership boundaries:

| Layer | Owner | Mutability | Purpose |
| --- | --- | --- | --- |
| Source layer | Repository and Codexus artifacts | Normal project/workflow rules | Raw truth: code, docs, ledgers, verification, decisions, graph artifacts |
| Compiled wiki layer | Codexus generator | Regenerable | Readable markdown pages with source refs, hashes, links, and freshness |
| Context pack layer | Codexus adapter | Per run | Bounded subset of wiki pages injected or attached to a run with freshness evidence |

The compiled wiki may be stored under `.codexus/wiki/` by default. Export to
checked-in docs should be explicit, because generated pages can be noisy and may
change frequently.

## Page Types

The first useful page set is small:

- `overview.md`: project map, important docs, current status, known deferred
  surfaces;
- `commands.md`: CLI surfaces derived from command registry and docs;
- `architecture.md`: architecture facts and import policy findings;
- `verification.md`: verification commands, latest evidence, known gaps;
- `release.md`: package version, changelog, release policy, and JSON contract
  pointers;
- `runtime.md`: implementation status, remaining work, roadmap, and runtime
  authority boundaries;
- `decisions.md`: decision records and rejected alternatives;
- `risks.md`: supply-chain, slop, graph, and policy findings;
- `graph.md`: repository graph summary and freshness state;
- `sessions.md`: recent run/session summaries and task state.

Every page should contain machine-readable frontmatter:

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

The body may contain readable prose, but facts should cite source refs:

```markdown
The stable public bins are `cx` and `codexus`.

Source refs:
- package.json#bin
- docs/README.md
```

## Claim Classes

Compiled wiki pages must preserve the fact/judgment split:

Gateable facts:

- source files and Codexus artifacts exist;
- page schema is valid;
- source refs resolve;
- source hashes match the current scoped fingerprint;
- local links resolve;
- generated page does not include absolute private paths unless explicitly
  allowed;
- context packs cite page ids and page freshness.

Advisory claims:

- a summary captures the project well;
- a risk is important;
- a decision was wise;
- an architecture explanation is the best onboarding path;
- a page is "complete."

This keeps wiki usefulness from becoming false authority.

## Build Modes

The wiki should support two build modes.

### Deterministic Projection

This mode uses only local structured facts:

- package metadata;
- docs indexes;
- schema registry;
- command registry;
- architecture import scan;
- repo graph check output;
- supply-chain report;
- verification artifacts;
- decision records;
- task state.

It can generate concise pages without calling a model. This should be the first
slice because it is cheap, deterministic, and gateable.

### Advisory Synthesis

This mode asks an engine to write or revise summaries. It can make the wiki much
more useful, but its output is judgment. It must:

- cite source refs;
- preserve derivable facts separately from prose;
- record the driver, model, prompt hash, and source bundle hash;
- fail the wiki check when source refs are missing, but not because a human
  disagrees with the prose;
- allow regeneration or deletion without corrupting source truth.

Advisory synthesis should run through the existing driver boundary, not through a
new wiki-specific LLM client.

## Freshness

Each page needs scoped freshness. A commands page should not become stale because
a test file changed. A verification page should stale when verification artifacts
or declared verify commands change.

Candidate page freshness shape:

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

- `fresh`: current scoped fingerprint matches the recorded source fingerprint;
- `stale`: source files or artifacts changed;
- `partial`: source set was too large or partially unreadable;
- `unknown`: Codexus cannot compute freshness safely.

Only `fresh` should be eligible for automatic context injection.

## Command Surface

Proposed commands:

```bash
cx wiki map --json
cx wiki build --mode deterministic --json
cx wiki build --mode advisory --driver codex-exec --json
cx wiki check --gate --json
cx wiki context --topic verification --budget 1200 --json
cx wiki context --topic verification --budget 1200 --fresh-only --gate --json
cx wiki context --topic verification --approve --approved-by "$USER" --json
cx wiki export --target docs/codexus-wiki --json
```

`cx wiki context` is a bounded context-pack generator. It should return page ids,
freshness, source refs, token estimate, and the exact text selected. It should
not silently inject context into a run. `--approve` writes a visible
`codexus.wiki.context-approval` artifact with `approved_not_injected`,
`automatic:false`, and no completion authority so a Codex session can cite the
context explicitly. `--fresh-only --gate` is a manual context-pack freshness
guard: it fails when the selected topic has no fresh pages instead of returning
stale context.

Autopilot integration should be explicit:

```bash
cx autopilot run --context-pack .codexus/wiki/context/context_...json
```

## Storage

Default storage:

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
  context/
    context_...json
  exports are written only to explicit user targets outside `.codexus/`
```

The manifest owns page identity and freshness metadata:

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

## Relation To Existing Tracks

- [Doc 03](03-evolution-engine.md): memory remains compact, scoped, and
  source-linked. The wiki can render memory summaries, but it does not replace
  memory entries.
- [Doc 13](13-harness-engineering-alignment.md): repo knowledge stays
  mechanical and gateable. The wiki is a readable projection over that knowledge.
- [Doc 14](14-repository-knowledge-graph.md): graph artifacts become one source
  for wiki pages and context packs.
- [Doc 16](16-codex-task-panel-projection.md): task state can appear in
  `sessions.md`, but UI task status is not completion evidence.
- [Doc 17](17-operational-control-invariants.md): docs-code invariants and
  decision records feed the wiki.

## Non-Goals

- Do not build a general personal knowledge-base app.
- Do not add a vector database to Codexus core.
- Do not require Obsidian, MCP, or a web UI.
- Do not make generated wiki pages the source of truth.
- Do not treat an LLM-written summary as verification evidence.
- Do not auto-commit generated pages.
- Do not inject stale wiki pages into a run.
- Do not import third-party wiki implementations into core.

## First Slice

1. Add design documentation only. Status: this document.
2. Add `codexus.wiki.manifest` and `codexus.wiki.page` schemas.
3. Add `cx wiki map --json` to list candidate source artifacts:
   - docs indexes;
   - package metadata;
   - schema registry;
   - command registry;
   - latest repo/architecture/supply-chain reports when present.
4. Add deterministic `cx wiki build --mode deterministic --json` for
   `overview.md`, `commands.md`, `verification.md`, `release.md`, and
   `runtime.md`.
5. Add `cx wiki check --gate --json` for schema, source refs, local links,
   path sanitization, and scoped freshness.
6. Add `cx wiki context --topic <name> --budget <n> --json` as a read-only
   context-pack generator.
7. Implemented: add `cx wiki context --topic <name> --approve --approved-by
   <name> --json` as a visible non-injected approval artifact for the selected
   bounded context.
8. Implemented: add `cx wiki context --fresh-only --gate --json` so callers can
   require fresh manual context without enabling automatic injection.
9. Implemented: add `cx wiki export --target <path> --json` as an explicit
   export that first requires a fresh passing wiki check, writes no source
   truth, and never auto-commits.
10. Implemented: add `cx wiki build --mode advisory --json` after deterministic
   pages and freshness checks are stable enough to provide a source bundle.
   The advisory artifact records driver/source-bundle evidence and remains
   non-authoritative.

## Success Criteria

The feature is useful only if it reduces context reconstruction work without
creating a new maintenance burden.

Early success criteria:

- a fresh clone can build a small wiki without model calls;
- stale pages are detected mechanically;
- every page points back to source files or Codexus artifacts;
- a context pack can explain why each page was selected;
- `cx repo check --gate` and `cx wiki check --gate` remain separate;
- deleting `.codexus/wiki/` loses no source truth.
