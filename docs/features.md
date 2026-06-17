# Feature Reference

[Korean](ko/features.md)

Status: current as of `main` after `0.2.4`

This reference lists the shipped Codexus surfaces by stability. It is a product
reference, not a completion authority. The authoritative automation contract is
[JSON contract](json-contract.md); the detailed implementation boundary is
[Implementation status](implementation-status.md).

## Command Names

`codexus` is the canonical CLI name. `cx` is a supported short alias for users
who prefer a compact command, but public documentation and npm installation
guidance should introduce the tool as `codexus` first.

```bash
codexus doctor --json
cx doctor --json
```

Both commands execute the same binary and produce the same JSON contract.

## Stable Core

| Surface | Commands | What it proves |
| --- | --- | --- |
| Version and doctor | `codexus --version`, `codexus version --json`, `codexus doctor --json` | Local package version, Codex CLI capability checks, machine-readable readiness facts, and cache-only advisory update notices. |
| Supervised runs | `codexus run`, `codexus status`, `codexus events tail`, `codexus verify`, `codexus resume`, `codexus cancel` | A durable `.codexus/runs/<run-id>` ledger, verification result, repair attempts, terminal outcome, and cancellation state. |
| Session evidence | `codexus setup codex-session`, `codexus session status`, `codexus session checkpoint`, `codexus session verify`, `codexus session hud` | Current-workspace session state, explicit checkpoint artifacts, verification artifacts, and compact HUD summaries. |
| Memory and skills | `codexus memory *`, `codexus skill *`, `codexus replay *` | Bounded memory retrieval, curation, skill lifecycle, deterministic replay, and gated live replay when explicitly enabled. |
| Schema and locks | `codexus schema *`, `codexus locks *` | Local schema artifacts, ledger validation, and lock visibility/recovery. |

## Stable Evidence Gates

These commands are stable only for their documented bounded contracts.

| Surface | Command | Stable boundary |
| --- | --- | --- |
| Quality evidence | `codexus slop check --gate --json` | Gates only derivable evidence gaps. Heuristic quality claims stay advisory. |
| Supply chain | `codexus supply-chain check --gate --json` | Gates package-policy facts, safe static package projection, required files, forbidden files, and high-confidence secret leaks. |
| Repository knowledge | `codexus repo check --gate --json` | Gates mechanical documentation/index/counterpart/schema-reference invariants. It does not judge semantic freshness. |
| Release integrity | `codexus release check --gate --json` | Gates install script, trusted-publishing workflow, release evidence, and live npm/GitHub facts when `--live` is used. Live output includes a structured npm `next` dist-tag action so stale-channel correction is explicit. |
| LSP diagnostics | `codexus lsp check --gate --json` | Gates explicit local diagnostic commands declared by project configuration or detected safely. |
| Architecture policy | `codexus architecture check --gate --json` | Gates declared `forbidden-import` rules only. Broad layering judgment and type-aware graph claims remain outside this stable contract. |
| Wiki context freshness | `codexus wiki context --fresh-only --gate --json` | Gates explicit manual context selection and local freshness. It does not inject prompts or claim source-truth authority. |

## Experimental Surfaces

Experimental surfaces are shipped but not frozen as stable JSON contracts.

| Surface | Commands | Boundary |
| --- | --- | --- |
| Repository graph | `codexus repo graph build/check/import/search/explain` | Local graph projection, JSON-only external graph import, structural checks, and read-only search/explain. |
| Compiled wiki | `codexus wiki map/build/check/export`, `codexus wiki context --approve`, `codexus wiki context approvals`, `codexus wiki injection-policy`, `codexus wiki injection plan` | Regenerable markdown projection, visible non-injected context approval artifacts, explicit approval listing, manual-only injection policy reporting, and report-only injection planning. |
| Evidence operations | `codexus evidence status` | Read-only project evidence dashboard over app-instance observations, deterministic wiki check status, and LSP detection status. It is a projection, not a new completion gate. |
| App instance launcher | `codexus app instance profile list/doctor/status/observe/logs/start/stop/evidence *` | Worktree-local owned process launcher, descriptor preflight, split-signal observation, observation evidence, evidence collection, evidence summary, and report-only observability adapter status. Stop only targets Codexus-owned instances with owner evidence; adapter status and evidence summaries do not imply health, control, cleanup, or completion authority. |
| App-server experiments | `codexus app-server status/discover/observer/experiment` | Read-only and isolated evidence experiments. Live Desktop attachment remains gated. |
| Autopilot contract | `codexus autopilot plan`, `codexus autopilot contract *`, `codexus autopilot run-gate`, `codexus autopilot relay *` | Plan, approval, scope-check, pre-run readiness reporting, relay artifact, stage-gate evidence, and relay adapter status. Live `autopilot run` and active relay drivers remain blocked. |
| Cron/gateway automation | `codexus cron *`, `codexus gateway *` | Dry-run, explicit approval, recorded dispatch, recovery projections, and scheduler-readiness gap reporting. Rich unattended ownership is future work. |
| Project LSP | `codexus lsp status/check/adapters` | Detect-only project diagnostics, explicit diagnostics gate, and adapter status. Long-lived protocol-server lifecycle and automatic project LSP application remain deferred. |
| Update and plugin checks | `codexus update check`, `codexus plugin status` | Advisory availability and plugin packaging facts. Update notices are cache-only on primary commands and never mutate installation automatically. |

## Deferred Surfaces

The following are intentionally not claimed as working features:

- automatic prompt or wiki context injection;
- live Desktop app-server attachment as a stable session channel;
- active relay engine spawning;
- full `codexus autopilot run` execution;
- automatic app-instance health authority or cleanup;
- LSP protocol-server lifecycle management;
- always-on Codex plugin supervision.

Deferred surfaces must report `stability: "experimental"` or
`stability: "deferred"` and should expose a clear reason instead of silently
behaving like stable features.
