# Harness Engineering Alignment

[Korean](../ko/design/13-harness-engineering-alignment.md)

Date: 2026-06-01
Status: accepted design direction; implementation slices still gated

## Decision

Codexus should explicitly position itself as a **harness engineering layer for
OpenAI Codex**. The phrase does not change the product direction. It names the
direction Codexus has already taken: keep Codex as the execution engine, then
add the local environment, feedback loops, evidence, controls, and records that
make Codex work more reliably.

Two references shape this decision:

- [OpenAI, "Harness engineering: using Codex in an agent-first world"](https://openai.com/ko-KR/index/harness-engineering/):
  the system-level reference. It frames the engineer's work as designing the
  environment, feedback loops, and control systems that let Codex do useful
  work, not merely writing better prompts.
- [multica-ai/andrej-karpathy-skills](https://github.com/multica-ai/andrej-karpathy-skills):
  the behavior-level reference. It packages a small rubric for reducing common
  coding-agent mistakes: hidden assumptions, overcomplication, drive-by edits,
  and vague success criteria.

Codexus should not copy either reference as a large prompt block. It should
convert their principles into **agent-readable maps, explicit evidence, and
derivable gates**.

## Synthesis

OpenAI's article is about the operating environment:

- make the app and repository readable by agents;
- keep repository knowledge in structured, versioned artifacts;
- encode architectural and taste constraints in tools, not only prose;
- expose logs, UI state, metrics, and traces through bounded local tooling;
- turn long-running autonomy into feedback loops with checkpoints, review, and
  verification.

The Karpathy-style guideline repository is about agent behavior:

- surface assumptions instead of silently choosing one interpretation;
- prefer the smallest implementation that solves the current task;
- make surgical changes tied to the request;
- turn vague tasks into verifiable goals and loop until the check passes.

Together they describe the Codexus target:

```text
Codex engine
  + agent-readable repository map
  + durable evidence and verification
  + architecture and behavior contracts
  + explicit gates for derivable facts
  + advisory findings for judgment-heavy claims
```

Codexus's differentiator remains honesty. If a condition is derivable from local
artifacts, Codexus may gate on it. If it requires judgment, Codexus may report it
as advisory, record it for review, or require human approval. It must not turn a
heuristic into a hard gate merely because the wording sounds important.

## Already Covered

Codexus already implements several harness-engineering pieces:

- durable run ledgers under `.codexus/runs/<id>`;
- verification-gated completion and bounded repair loops;
- session-native checkpoint, verification, HUD, notify-heartbeat, and evidence
  freshness;
- memory and replay-gated skill lifecycle;
- quality evidence guard (`cx slop check`) with derivable evidence gaps split
  from heuristic claims;
- supply-chain evidence gate with policy-declared facts and lifecycle-safe
  static projection;
- app-server, cron/gateway, workers, model replay, and injection surfaces that
  self-report as gated, experimental, or deferred instead of pretending to work.

The alignment work is therefore not a rewrite. It is a naming and enforcement
cleanup: make the product story match the implementation, then add the smallest
new gates where the evidence is already derivable.

## AGENTS.md Has Two Different Roles

OpenAI's article describes a checked-in `AGENTS.md` as a compact repository map:
an entry point that points agents to the deeper source of truth in `docs/`.

Codexus also uses AGENTS overlays for local session behavior. That is a
different mechanism.

Keep these roles separate:

| Role | Storage | Purpose | Mutability |
| --- | --- | --- | --- |
| Repository map | checked-in docs/index files, optionally a checked-in concise `AGENTS.md` | Tell agents where the durable knowledge lives | Maintained like documentation |
| Codexus session overlay | marker-bounded `<!-- CODEXUS:RUNTIME:START -->` block in project/user AGENTS files | Steer the current Codex session toward checkpointing, verification, and evidence capture | Installed/updated by `cx setup codex-session` |

Do not expand the Codexus session overlay into the repository knowledge system.
The overlay is local operating guidance. The repository map is checked-in
knowledge. Mixing them would make both less trustworthy:

- session state would become noisy and hard to maintain;
- repository documentation would inherit local runtime concerns;
- agents would see a large instruction blob instead of a navigable map.

The right implementation direction is `docs/` plus indexes for repository
knowledge, and marker-bounded overlays for session behavior.

## Behavior Contract

The Karpathy-style rules should become a Codexus **behavior contract**, not a
large always-on prompt.

Recommended mapping:

| Behavior principle | Codexus form | Gate status |
| --- | --- | --- |
| Surface assumptions | plan/session metadata, subagent claim fields, review checklist | advisory unless explicitly approved |
| Simplicity first | slop guard heuristic claims such as abstraction risk or speculative surface | advisory |
| Surgical changes | derivable diff facts: touched files, scope, generated churn, unrelated path groups | gate only when a declared scope exists |
| Goal-driven execution | explicit verification commands, session verification, run ledger completion | gate when verification is declared |

This preserves the project's core rule: **facts can gate; judgment advises**.

## Architecture Invariants Are The First Small Gate

The next small code gate should be an architecture check, because import and
layering facts are locally derivable. This is the cleanest way to turn harness
engineering into enforceable behavior without inventing a new judgment system.

Proposed surface:

```bash
cx architecture check --json
cx architecture check --gate --json
```

Proposed policy file:

```json
{
  "schemaVersion": 1,
  "type": "codexus.architecture.policy",
  "rules": [
    {
      "id": "no-sibling-harness-imports",
      "kind": "forbidden-import",
      "from": ["src/**", "tests/**"],
      "forbidden": ["@external-harness/*", "external-harness-internals/**"]
    }
  ]
}
```

The first dogfood rule should be the **no sibling-harness import invariant**:
Codexus core must not depend on another harness runtime's internals. This keeps
Codexus standalone and prevents compatibility references from turning into a
runtime dependency.

The import scan is a **static, text-based best-effort scan, not a full
type-aware import graph**. The output must carry `scanAccuracy: "best_effort"`
(mirroring the supply-chain `projectionAccuracy`), and any case the text scan
cannot resolve confidently — dynamic `import()`, re-exports, type-only imports,
or computed module paths — must be reported as an `informationalUnknown` or a
heuristic claim, never as a confident gate fact. Narrow forbidden-import rules
are well within what a text scan can resolve; broad layering rules are where this
limit shows.

The architecture check should reuse the established evidence shape:

- `derivableFacts`: import edges (text-derived), matched files, rule ids, package
  manifests;
- `evidenceGaps`: forbidden imports, invalid policy, missing required files;
- `heuristicClaims`: naming, taste, or coupling concerns that are not fully
  derivable;
- `blockingUnknowns`: malformed policy or unsupported rule kinds;
- `informationalUnknowns`: things the local checker cannot know;
- `gate`: exit code moved only by evidence gaps and blocking unknowns.

Initial rule kinds should stay narrow:

- `forbidden-import`;
- `required-file`;
- `forbidden-file`;
- simple layer direction such as `from` -> `mayImport`.

Do not add semantic "taste" rules to gate mode. They belong in advisory output
until they are backed by explicit, local evidence.

## Repository Knowledge System

Codexus should add a repo-knowledge track after the architecture gate, but its
first checks must stay mechanical:

Derivable and gateable:

- required docs exist;
- docs index links resolve;
- design docs have English/Korean counterparts when the project policy requires
  both;
- referenced schema/artifact files exist;
- release evidence links point to committed files or external URLs.

Advisory only:

- "this doc still matches code behavior";
- "this section is stale";
- "this plan is complete enough";
- "this wording reflects product positioning."

Those advisory findings may be useful, but they should not fail automation
without a declared review artifact or maintainer-approved policy.

Possible future surfaces:

```bash
cx repo map --json
cx repo check --json
cx repo check --gate --json
```

This is the repository equivalent of the OpenAI article's "map, not a giant
manual" lesson.

## Observability Track

OpenAI's article describes making UI, logs, metrics, and traces readable to
Codex. Codexus should adopt that direction only through engine-agnostic
adapters.

Boundaries:

- Codexus may start or record a dev server, browser journey, log bundle,
  screenshot, trace, or metric query as evidence.
- Codexus must not claim "Codex read this evidence" unless the evidence was
  actually passed into a run, attached to a context artifact, or cited in a
  session artifact.
- Browser/DevTools/dev-server/log systems are stack-specific and must live
  behind adapter descriptors, not in the workflow kernel.
- Generated evidence should be bounded, redacted, and disposable by default.

This belongs on the 0.2 track, after architecture and repo-knowledge gates.

## Autopilot Alignment

Doc 12 already reaches the same conclusion as the OpenAI article: long-running
autonomy needs a contract, worktree isolation, evidence gates, and human
approval compressed into an up-front policy review.

Do not duplicate that design here. Doc 13 strengthens doc 12 by naming the
external rationale:

- autonomy is useful only when the environment and feedback loops are designed;
- acceptance criteria extraction is heuristic and therefore requires approval;
- completion authority remains evidence, not agent prose;
- `cx autopilot run` must stay experimental until the scope and capability gates
  are proven.

## Subagent and Review Alignment

Subagent support should continue to be recorder/handoff/contract-only until a
supported Codex bridge exists. The behavior contract can improve the recorded
claim format without pretending Codexus launched the subagent.

Optional future fields for `session subagent complete` artifacts:

```json
{
  "behaviorChecklist": {
    "assumptionsSurfaced": "pass|fail|unknown",
    "simplestSufficientChange": "pass|fail|unknown",
    "surgicalScope": "pass|fail|unknown",
    "verificationEvidencePresent": "pass|fail|unknown"
  }
}
```

These values should be curator/subagent assertions unless Codexus can derive the
fact from local artifacts. They may influence review, but they must not refresh
verification freshness.

## Positioning

Use this public positioning:

```text
Codexus is a harness engineering layer for OpenAI Codex CLI.
```

Ground the statement in concrete behavior:

- it records durable ledgers;
- it runs verification and repair loops;
- it tracks session evidence freshness;
- it manages memory and replay-gated skills;
- it reports gated/experimental/deferred surfaces honestly.

Avoid ungrounded claims:

- not "autonomous engineer";
- not "guaranteed app observer";
- not "runs inside Desktop app-server";
- not "replaces Codex";
- not "prevents all bad edits."

## Implementation Slices

1. **Documentation alignment**: add this doc, link it from the documentation
   index, align README/doc 05 positioning, and update remaining-work. This
   slice is documentation only.
2. **Architecture check design and implementation**: add
   `codexus.architecture.policy` schema and `cx architecture check --json`.
   First rule: no sibling-harness import invariant.
3. **Repo map/check**: add mechanical docs/index validation; keep semantic
   staleness advisory.
4. **Behavior evidence expansion**: extend `cx slop check` with surgical-change
   and abstraction-risk facts/heuristics.
5. **Subagent checklist**: add optional behavior checklist fields to recorded
   claim artifacts.
6. **Observability adapters**: add dev-server/browser/log evidence descriptors
   only after the above gates are stable.

## Non-Goals

- Do not paste the Karpathy guideline as a large always-on prompt.
- Do not grow Codexus session overlays into a repository knowledge base.
- Do not gate on documentation freshness or code taste without derivable
  evidence.
- Do not add stack-specific browser/log/dev-server behavior to the kernel.
- Do not make Codexus depend on another harness runtime.
- Do not expose active native subagent launch until a supported Codex bridge
  exists.
- Do not ship `cx autopilot run` before the report-only scope gate and
  capability start gate are proven.
