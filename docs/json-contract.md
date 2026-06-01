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
- Run outputs: `schemaVersion`, `stability`, `runId`, `outcome`,
  `statePath`, `reportPath`, `state`.
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
  `stability`, `cwd`, `scope`, `base`, `changeEvidence`, `evidenceGaps`,
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
- Experimental surfaces may be added in `0.1.x` without freezing their JSON
  contract. `0.2.0` is the promotion point for turning experimental evidence
  surfaces into stable contract surfaces, or for making any breaking change to
  already-frozen stable fields.
