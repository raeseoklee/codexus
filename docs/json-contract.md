# JSON Contract

[Korean](ko/json-contract.md)

Status: 0.1.0 readiness contract

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

Before `0.1.0`, the minimum self-describing set is `doctor`, `session status`,
`app-server status`, `cron status`, `gateway status`, `schema engine`, and
`supply-chain check`. Other stable surfaces may gain the same marker as
additive `0.1.x` changes.

## Frozen In 0.1.x

For supported commands, these top-level field names are frozen through `0.1.x`:

- Common schema-bearing payloads: `schemaVersion`, `stability` when present.
- Run outputs: `runId`, `outcome`, `statePath`, `reportPath`, `state`.
- Run status/report outputs: `state`, `paths`, `verification`, `experience`,
  `eventTail`.
- Doctor output: `stability`, `ok`, `strict`, `checks`, `warnings`,
  `configFiles`, `driverProbe`.
- Schema output: `ok`, `schemas`, `appServerFixture`, and for
  `schema engine`, `schemaVersion`, `stability`, `activeEngine`,
  `fullJsonSchemaEngine`, `migrationFixtureBoundary`.
- Supply-chain output: `schemaVersion`, `stability`, `cwd`, `packageRoot`,
  `packageJsonPath`, `lifecycleExecuted`, `projectionMode`,
  `projectionAccuracy`, `policy`, `packageArtifact`, `evidenceGaps`,
  `derivableFacts`, `heuristicClaims`, `blockingUnknowns`,
  `informationalUnknowns`, `supplyChain`, `gate`.
- Session status output: `schemaVersion`, `stability`, `status`, `cwd`,
  `paths`, `evidence`, `changeEvidence`, `subagents`, `verifyDetection`,
  `overlays`, `notifyHook`, `notifyDispatch`, `migration`, `state`.
- Quality evidence output (`slop check`, `session slop`): `schemaVersion`,
  `cwd`, `scope`, `base`, `changeEvidence`, `evidenceGaps`,
  `derivableFacts`, `heuristicClaims`, `gate`.

Removing or redefining these fields requires `0.2.0`. Adding fields is allowed
in `0.1.x`.

## Not Frozen

- Experimental/deferred command output for app-server live behavior,
  cron/gateway live dispatch, automatic injection, routine live model replay,
  statusline integration, and worker launch.
- The membership of advisory arrays such as `heuristicClaims`.
- Human-readable prose fields such as `summary`, `reason`, `recommendation`,
  and `hint`, except that they must stay bounded and non-secret.

## Breaking Change Rule

- Patch release (`0.1.x`): additive JSON fields only for stable surfaces.
- Minor release (`0.2.0`): may remove or redefine frozen fields with changelog
  notice.
- Experimental/deferred surfaces must self-report their stability instead of
  looking supported.
