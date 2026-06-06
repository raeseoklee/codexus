# JSON Contract

[Korean](ko/json-contract.md)

Status: 0.1.x stable contract, introduced in 0.1.0 and expanded in 0.1.1

Codexus is an automation-facing harness, so JSON output stability is part of the
product contract. `0.1.0` is not 1.0, but it freezes the supported command JSON
contract for the `0.1.x` patch line.

## Stability Markers

JSON payloads may include:

```json
{ "stability": "stable" }
```

Allowed values:

- `stable`: named fields are frozen through `0.1.x`; only additive fields may
  appear.
- `experimental`: output is useful evidence, but the surface is not part of the
  frozen contract.
- `deferred`: the surface intentionally reports that product behavior is not
  implemented or not enabled.

Consumers must ignore unknown additive fields.

As of the `0.1.1` stabilization slice, supported stable JSON command outputs
include a top-level `schemaVersion: 1` and `stability: "stable"` marker.
Experimental and deferred command outputs continue to self-report
`"experimental"` or `"deferred"` instead of appearing stable.

`schemaVersion` is scoped to each command output, not to the Codexus package as
a whole. A breaking change to one command's JSON contract bumps that command's
schema version; additive fields do not require a bump.

## Frozen In 0.1.x

For supported commands, these top-level field names are frozen through `0.1.x`:

- Common supported JSON payloads: `schemaVersion`, `stability`.
- Version output: `schemaVersion`, `stability`, `name`, `version`,
  `packageRoot`, `node`, `update`.
- Run outputs: `schemaVersion`, `stability`, `runId`, `outcome`,
  `statePath`, `reportPath`, `state`.
- Run status/report outputs: `state`, `paths`, `verification`, `experience`,
  `eventTail`.
- Doctor output: `stability`, `ok`, `strict`, `checks`, `warnings`,
  `configFiles`, `driverProbe`, `update`.
- Schema output: `ok`, `schemas`, `appServerFixture`, and for
  `schema engine`, `schemaVersion`, `stability`, `activeEngine`,
  `fullJsonSchemaEngine`, `migrationFixtureBoundary`.
- Supply-chain output: `schemaVersion`, `stability`, `cwd`, `packageRoot`,
  `packageJsonPath`, `lifecycleExecuted`, `projectionMode`,
  `projectionAccuracy`, `policy`, `packageArtifact`, `evidenceGaps`,
  `derivableFacts`, `heuristicClaims`, `blockingUnknowns`,
  `informationalUnknowns`, `supplyChain`, `gate`.
- Session status output: `schemaVersion`, `stability`, `status`, `cwd`,
  `paths`, `evidence`, `changeEvidence`, `riskSummary`, `decisions`, `loop`,
  `subagents`, `verifyDetection`, `overlays`, `notifyHook`, `notifyDispatch`,
  `migration`, `state`, `update`.
- Session HUD output: `schemaVersion`, `stability`, `cwd`, `status`,
  `evidence`, `changeEvidence`, `riskSummary`, `decisions`, `loop`,
  `notifyDispatch`, `capabilities`, `counts`, `lastDecision`,
  `lastCheckpoint`, `lastVerification`.
- Quality evidence output (`slop check`, `session slop`): `schemaVersion`,
  `stability`, `cwd`, `scope`, `base`, `changeEvidence`, `evidenceGaps`,
  `derivableFacts`, `heuristicClaims`, `gate`.
- Repo knowledge output (`repo check --gate`, `repo map`): `schemaVersion`,
  `stability`, `command`, `cwd`, `packageRoot`, `scanMode`,
  `scanAccuracy`, `policy`, `indexes`, `documents`, `evidenceGaps`,
  `derivableFacts`, `heuristicClaims`, `blockingUnknowns`,
  `informationalUnknowns`, `repoKnowledge`, `deferredSelfReports`, `gate`.
  The stable contract covers mechanical repository knowledge invariants only:
  required docs indexes, local index links, English/Korean counterparts,
  declared schema references, and source `*_deferred` self-report
  documentation. Semantic freshness and prose quality remain advisory.
- Release integrity local output (`release check --gate` without `--live`):
  `schemaVersion`, `stability`, `cwd`, `packageRoot`, `packageJsonPath`,
  `version`, `repository`, `live`, `releaseIntegrity`, `evidenceGaps`,
  `derivableFacts`, `heuristicClaims`, `blockingUnknowns`,
  `informationalUnknowns`, `gate`. The stable contract covers local, static
  release wiring evidence only: installer default channel, expected-version
  guard, trusted-publishing workflow shape, pinned publish actions, installer
  asset workflow wiring, and redacted release-evidence docs. Live GitHub/npm
  post-publish sign-off remains opt-in and experimental.
- LSP diagnostics output (`lsp status`, `lsp check --gate`): `schemaVersion`,
  `stability`, `command`, `cwd`, `projectRoot`, `scanMode`, `scanAccuracy`,
  `limits`, `autoApply`, `lsp`, `providers`, `result`, `evidenceGaps`,
  `derivableFacts`, `heuristicClaims`, `blockingUnknowns`,
  `informationalUnknowns`, `gate`. The stable contract covers project detection
  and explicit diagnostics command execution only. `lsp status` does not run
  diagnostics, `lsp check` uses bounded timeout/output-tail fields, and neither
  command starts or controls a protocol server.

Removing or redefining these fields requires `0.2.0`. Adding fields is allowed
in `0.1.x`.

## Not Frozen

- Experimental/deferred command output for app-server live behavior,
  cron/gateway live dispatch, automatic injection, routine live model replay,
  statusline integration, worker launch, `release check --live`, LSP diagnostics
  protocol-server lifecycle or automatic LSP application, architecture checks,
  and contract-promotion readiness checks.
- The membership of advisory arrays such as `heuristicClaims`.
- The nested content of the additive `update` summary, which is an
  informational experimental update-availability report and never a release,
  verification, installation, or completion authority.
- Human-readable prose fields such as `summary`, `reason`, `recommendation`,
  and `hint`, except that they must stay bounded and non-secret.

## Breaking Change Rule

Release cadence is governed separately by [Release policy](release-policy.md):
small commits should normally be bundled into larger thematic stable releases,
but the version number still follows the frozen-contract boundary below.

- Patch release (`0.1.x`): additive JSON fields only for stable surfaces.
- Minor release (`0.2.0`): may remove or redefine frozen fields with changelog
  notice.
- Experimental/deferred surfaces must self-report their stability instead of
  looking supported.
- Experimental surfaces may be added in `0.1.x` without freezing their JSON
  contract. `0.2.0` is the promotion point for turning experimental evidence
  surfaces into stable contract surfaces, or for making any breaking change to
  already-frozen stable fields.
