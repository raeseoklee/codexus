# Supply-Chain Evidence

[Korean](../ko/design/11-supply-chain-evidence.md)

Date: 2026-05-31
Status: first slice implemented and shipped; advisory/network follow-ups deferred

## Decision

Codexus should add a supply-chain evidence surface, built as **local, derivable
evidence about the package/release itself** — and an optional pre-publish gate. It
must not become a CVE/vulnerability scanner.

This is the same evidence-first thesis as the
[quality evidence guard](10-quality-evidence-guard.md), applied to a different
artifact: instead of "is this change a verifiable problem-solution," it asks "is
this package/release grounded in checkable supply-chain facts." It reuses the same
three-bucket / tri-state model and gate mechanism.

## Why It Fits Codexus

- Supply-chain review is inherently **derivable**: dependency count, install
  scripts present, tarball leak, network imports, lockfile integrity, CI pinning
  are objective facts — two honest reviewers cannot disagree.
- It maps cleanly onto the existing `evidenceGaps` / `derivableFacts` /
  `heuristicClaims` model and the `--gate` mechanism (`gateFor`), so it adds no
  parallel subsystem.
- It is **engine-agnostic**: it operates on a generic npm/git artifact and does
  not depend on Codex, which reinforces the engine-agnostic core.
- A pre-publish gate ties directly into the release flow (`npm run publish:next`).

## The Hard Boundary (make-or-break)

> Codexus reports derivable supply-chain **facts** and gates on them. It does not
> become a threat-intelligence product.

Crossing this line breaks the project's identity:

- **No CVE/vulnerability database.** Codexus must not look up whether a dependency
  has a known CVE. That requires a **network call to a vulnerability database**,
  which violates the project's no-network / local-first boundary (the very
  property that made the supply-chain posture strong: zero network at install and
  runtime). `npm audit`, Snyk, Socket, and OSV-scanner already do CVE scanning —
  Codexus links to them, it does not reimplement them.
- **No authoritative "this dependency is malicious."** That is a judgment, so it is
  at most a heuristic claim (advisory), exactly as AI-authorship detection is a
  non-goal of the slop guard.
- **No auto-fix.** It does not remove dependencies, rewrite manifests, or change
  publish settings.
- **The check must not itself execute code.** A supply-chain check that runs a
  package's lifecycle scripts becomes the exact arbitrary-code-execution vector it
  is supposed to guard against (see "No Lifecycle Execution").

## Facts Are Not Violations: Declarative Policy

A derivable fact ("a `postinstall` script exists", "there is a runtime
dependency", "shipped code imports `node:net`") is **not** automatically a
violation. Whether a fact gates depends on a declared policy. This is the
supply-chain analog of the slop guard's declared scope: a fact becomes a gateable
`evidenceGap` only when it violates a declared bound; without a declared bound the
fact is reported as a `derivableFact` and does not gate (a violation is never
fabricated from a fact alone).

Codexus itself shows why this is required: its own package has a `postinstall`
(skill installer), its `esbuild` devDependency has install scripts, and Stage B
ships a `node:net` import. A naive "install script present → fail" would fail
Codexus's own check.

Policy lives in `package.json` under `codexus.supplyChain`, or in
`.codexus/supply-chain-policy.json`. The block below is not just illustrative — it
is the **Codexus repo policy candidate**, the expected value for the first
implementation checking Codexus itself:

```json
{
  "codexus": {
    "supplyChain": {
      "runtimeDependenciesMax": 0,
      "allowedLifecycleScripts": ["postinstall", "prepack", "prepublishOnly"],
      "allowedDevDependencyInstallScripts": ["esbuild"],
      "allowRuntimeNetworkImports": ["node:net"],
      "forbiddenPackageFiles": [
        ".env", ".env.*", ".codexus/**", ".codex-harness/**",
        "node_modules/**", "src/**", "tests/**", "docs/**",
        "fixtures/replay/**", "fixtures/migrations/**"
      ],
      "requiredPackageFiles": [
        "dist/cli/main.js", "package.json", "README.md", "LICENSE",
        "CHANGELOG.md", "schemas/config.schema.json",
        "schemas/session-state.schema.json",
        "schemas/supply-chain-policy.schema.json",
        "fixtures/app-server/schema.fixture.json",
        "codex/skills/codexus/SKILL.md", "scripts/postinstall.mjs",
        "scripts/install-codex-skill.mjs", "scripts/codexus-notify-hook.mjs",
        "scripts/publish-next.mjs", "install.sh"
      ],
      "binTargetsMustBeBuiltArtifacts": true,
      "lockfileIntegrityRequired": true
    }
  }
}
```

This block is the **Codexus repo policy candidate**, not a general default: a
non-Codexus package with no declared policy stays `report-only` (facts reported,
nothing gates except the unconditional secret-leak invariant). The
forbidden/required file lists **formalize and extend** the assertions
`scripts/package-smoke.mjs` already enforces. Three integration constraints follow:

- **Single source of truth.** These file lists formalize and extend what
  `package-smoke.mjs` hardcodes today (the policy is a superset — it also requires
  `package.json`/`README.md`/`LICENSE`/`CHANGELOG.md` and forbids more paths); the
  policy should become the one source both `package-smoke` and `cx supply-chain
  check` read, so they cannot drift.
- **Validate the policy.** `codexus.supplyChain` is structured config; give it a
  schema artifact and validation (like `config.schema.json`) so a malformed policy
  fails loudly rather than silently mis-gating.
- **Zero-dependency glob matching.** The file globs must be matched with a
  hand-rolled / Node-built-in matcher — pulling a glob dependency would betray the
  zero-runtime-dependency property this feature checks.

The gate result must record which policy bound or built-in invariant produced each
gap (e.g. "`postinstall` not in `allowedLifecycleScripts`") so the gate is auditable.
A small set of built-in invariants may gate without a policy — the ones that are
unconditional safety facts (for example: a secret pattern leaked into the
package artifact). Everything else gates only against a declared policy.

## Three Buckets + Two Kinds of Unknown

The derivable test is unchanged: could two honest reviewers disagree, or could it
be wrong because a tool/artifact is missing? If yes, it is not derivable.

| Tier | Examples (all local, no network) | Authority |
| --- | --- | --- |
| Derivable fact / evidence | install scripts present; runtime dependency count; package-artifact (pack file list) secret-pattern leak; network imports in shipped code; lockfile present with integrity hashes; CI actions SHA-pinned vs mutable tag; `bin` points to a built artifact vs raw source | fact — gates only via policy or a built-in safety invariant |
| Heuristic claim | a dependency name looks like a typosquat; a code pattern looks like exfiltration; an install script looks unusually broad | guess — advisory, never auto-fail |

Unknowns split into two kinds — and only one of them gates:

- **`blockingUnknowns`** — a fact that *should* be derivable locally but could not
  be, so safety cannot be asserted: `package-lock.json` unreadable, the
  package-file list could not be produced or inspected. These gate (we expected to
  know and failed to).
- **`informationalUnknowns`** — a fact that is inherently not locally knowable:
  npm 2FA, maintainer account state, publish provenance absence, whether a
  dependency has a known CVE (needs a network DB, out of scope). These are
  reported only and **never gate** — otherwise every publish would block forever
  because 2FA cannot be derived from the repo.

"Has a known CVE" is an `informationalUnknown` with a pointer to `npm audit`/OSV —
never a fabricated gap and never a silent pass.

## Pre-Publish Gate

Parallel to `cx slop check --gate` (pre-completion), this is a pre-publish gate:

```bash
cx supply-chain check --json          # report-only, exit 0
cx supply-chain check --gate --json   # exit code from gateable findings only
```

The gate exit code is driven by **`evidenceGaps + blockingUnknowns` only**:

- `fail` (exit 1): a policy violation (a fact that breaks a declared bound) or a
  built-in safety invariant (e.g. a secret pattern in the package artifact).
- `blocked` (exit 1): a `blockingUnknown` — a fact that should have been derivable
  locally but could not be, so safety cannot be asserted.
- `pass` (exit 0): no gaps and no blocking unknowns.

`informationalUnknowns`, `heuristicClaims`, and non-gating `derivableFacts` are
reported and counted but **never** move the gate exit code — guaranteed by passing
only the gateable status into the gate function, as in the change-evidence gate.

It fits the release flow: run it before `npm run publish:next`, and optionally as
a `release:check` step.

## No Lifecycle Execution (default)

A supply-chain check must not execute the target package's lifecycle scripts by
default — `npm pack` (even `--dry-run`) runs `prepack`/`prepare`, so naively
packing an arbitrary package would execute its code. Defaults:

- **Default: no lifecycle execution.** Derive the would-be-shipped file list
  statically from `files[]` + `.npmignore` resolution, or run `npm pack` with
  `--ignore-scripts`. This yields the file-list and secret-leak evidence without
  running package code.
- **Full tarball pack (with lifecycle): only for your own package inside the
  release gate**, where `prepack -> npm run build` is trusted, via an explicit
  opt-in (e.g. `--execute-lifecycle`).
- The output records `lifecycleExecuted` (false by default) and a
  `projectionMode`: `"static"` (best-effort `files[]` + `.npmignore` projection —
  **not** claimed to be byte-identical to npm packing), `"npm-pack-ignore-scripts"`,
  or `"npm-pack-lifecycle"` (release gate only). Static projection is best-effort
  and must say so rather than imply it equals npm's packing semantics.
- Current implementation supports only `projectionMode: "static"` and derives a
  best-effort file list from `files[]`, public `bin` targets, and common
  npm-included metadata files. It does not yet resolve `.npmignore` or
  `.gitignore`. The `npm-pack-ignore-scripts` and `npm-pack-lifecycle` modes are
  deferred until their trust and execution boundaries are explicitly implemented.

## Surface (minimize subsystem)

Reuse the change-evidence output shape (`evidenceGaps` / `derivableFacts` /
`heuristicClaims` + a tri-state summary, plus the two unknown lists) and the
`gateFor` mechanism. Do not build a parallel scanner subsystem.

```bash
cx supply-chain check --json
cx supply-chain check --gate --json
```

`cx doctor` may surface a compact supply-chain summary; `cx supply-chain check`
produces the full evidence report.

## Non-Goals

- Not a CVE / vulnerability scanner; no network or database lookup of any kind.
- Does not execute target package lifecycle scripts by default.
- Does not assert that a dependency or maintainer is malicious or untrustworthy.
- Does not auto-fix, auto-remove dependencies, or change publish settings.
- Does not emit a risk grade; the summary is a tri-state status driven only by
  gateable findings.
- Does not fabricate a violation from a bare fact without a declared policy or a
  built-in safety invariant.
- Does not block on `informationalUnknowns` (2FA, provenance, CVE).
- Does not replace `npm audit`/Snyk/Socket/OSV; it links to them for CVE coverage.

## First Slice

`cx supply-chain check --json` that reports, from the local package/repo only and
**without executing package lifecycle scripts**:

- install scripts present in this package and (when statically resolvable) in
  direct dependencies (derivable fact),
- runtime dependency count versus the declared `runtimeDependenciesMax`
  (derivable; gates only when the policy is declared),
- a static file-list / secret-pattern leak scan (derivable; `.env`, `.codexus`,
  `tests`, `src`, high-confidence key/token patterns) — built-in safety invariant
  for secret leaks. Redaction-only assignment heuristics such as `token = value`
  are intentionally not gateable by default because they are too noisy for a
  release blocker,
- network imports in shipped code (derivable **fact**; gates only against
  `allowRuntimeNetworkImports` policy),
- lockfile presence and integrity hashes (derivable),

plus `--gate` (exit code from `evidenceGaps + blockingUnknowns`),
`informationalUnknowns` for everything needing a network DB (CVE) or external
config (2FA/provenance), and `lifecycleExecuted: false`. The heuristic lane
(typosquat/exfiltration) and `npm audit`/OSV/Snyk/Socket links are deferred to
recommendations only.

## Acceptance Criteria

- Findings are split into `evidenceGaps`, `derivableFacts`, `heuristicClaims`,
  `blockingUnknowns`, and `informationalUnknowns`, each evidence-linked.
- The gate exit code is driven only by `evidenceGaps + blockingUnknowns`;
  `informationalUnknowns`, heuristics, and non-gating facts never move it.
- No check performs any network or vulnerability-database lookup; CVE status is an
  `informationalUnknown` pointing to `npm audit`/OSV.
- The check does not execute target package lifecycle scripts by default, and the
  output reports `lifecycleExecuted`.
- A bare derivable fact does not gate without a declared policy bound or a built-in
  safety invariant; each gap records the policy/invariant that produced it.
- A secret-pattern leak in the package artifact gates as a built-in safety invariant
  even without a policy.
- The feature adds no parallel subsystem and has no Codex-specific dependency.
