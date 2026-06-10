# 기능 레퍼런스

[English](../features.md)

상태: `0.2.0` 기준 최신

이 문서는 배포된 Codexus surface를 안정성별로 정리한 제품 레퍼런스입니다. 완료
권한은 아닙니다. 자동화 contract의 기준은 [JSON contract](json-contract.md)이고,
상세 구현 경계는 [구현 상태](implementation-status.md)를 기준으로 합니다.

## 명령 이름

`codexus`가 canonical CLI 이름입니다. `cx`는 짧게 쓰기 위한 지원 alias입니다. 공개
문서와 npm 설치 안내에서는 도구 정체성을 위해 `codexus`를 먼저 소개해야 합니다.

```bash
codexus doctor --json
cx doctor --json
```

두 명령은 같은 binary를 실행하며 같은 JSON contract를 출력합니다.

## Stable Core

| Surface | Commands | 증명하는 것 |
| --- | --- | --- |
| Version and doctor | `codexus --version`, `codexus version --json`, `codexus doctor --json` | Local package version, Codex CLI capability check, machine-readable readiness fact. |
| Supervised runs | `codexus run`, `codexus status`, `codexus events tail`, `codexus verify`, `codexus resume`, `codexus cancel` | `.codexus/runs/<run-id>` ledger, verification result, repair attempt, terminal outcome, cancellation state. |
| Session evidence | `codexus setup codex-session`, `codexus session status`, `codexus session checkpoint`, `codexus session verify`, `codexus session hud` | 현재 workspace session state, 명시적 checkpoint artifact, verification artifact, compact HUD summary. |
| Memory and skills | `codexus memory *`, `codexus skill *`, `codexus replay *` | Bounded memory retrieval, curation, skill lifecycle, deterministic replay, 명시적으로 허용한 gated live replay. |
| Schema and locks | `codexus schema *`, `codexus locks *` | Local schema artifact, ledger validation, lock visibility/recovery. |

## Stable Evidence Gates

아래 명령은 문서화된 bounded contract에 한해서만 stable입니다.

| Surface | Command | Stable boundary |
| --- | --- | --- |
| Quality evidence | `codexus slop check --gate --json` | Derivable evidence gap만 gate합니다. Heuristic quality claim은 advisory로 남습니다. |
| Supply chain | `codexus supply-chain check --gate --json` | Package-policy fact, safe static package projection, required/forbidden file, high-confidence secret leak를 gate합니다. |
| Repository knowledge | `codexus repo check --gate --json` | Mechanical docs/index/counterpart/schema-reference invariant를 gate합니다. Semantic freshness는 판단하지 않습니다. |
| Release integrity | `codexus release check --gate --json` | install script, trusted-publishing workflow, release evidence, `--live` 사용 시 npm/GitHub fact를 gate합니다. |
| LSP diagnostics | `codexus lsp check --gate --json` | Project config나 안전하게 감지한 explicit local diagnostic command를 gate합니다. |
| Architecture policy | `codexus architecture check --gate --json` | Declared `forbidden-import` rule만 gate합니다. Broad layering judgment와 type-aware graph claim은 stable contract 밖입니다. |
| Wiki context freshness | `codexus wiki context --fresh-only --gate --json` | 명시적 manual context selection과 local freshness를 gate합니다. Prompt를 자동 주입하거나 source-truth authority를 주장하지 않습니다. |

## Experimental Surfaces

Experimental surface는 배포되어 있지만 stable JSON contract로 freeze되지 않았습니다.

| Surface | Commands | Boundary |
| --- | --- | --- |
| Repository graph | `codexus repo graph build/check/import/search/explain` | Local graph projection, JSON-only external graph import, structural check, read-only search/explain. |
| Compiled wiki | `codexus wiki map/build/check/export`, `codexus wiki context --approve`, `codexus wiki injection-policy`, `codexus wiki injection plan` | Regenerable markdown projection, visible non-injected context approval artifact, 명시적인 manual-only injection policy report, report-only injection planning. |
| App instance launcher | `codexus app instance profile list/status/logs/start/stop/evidence *` | Worktree-local owned process launcher, observation evidence, report-only observability adapter status. Stop은 owner evidence가 있는 Codexus-owned instance만 대상으로 하며 adapter status는 health, control, completion authority를 의미하지 않습니다. |
| App-server experiments | `codexus app-server status/discover/observer/experiment` | Read-only/isolated evidence experiment. Live Desktop attachment는 계속 gated입니다. |
| Autopilot contract | `codexus autopilot plan`, `codexus autopilot contract *`, `codexus autopilot relay *` | Plan, approval, scope-check, relay artifact, stage-gate evidence, relay adapter status. Live `autopilot run`과 active relay driver는 blocked입니다. |
| Cron/gateway automation | `codexus cron *`, `codexus gateway *` | Dry-run, explicit approval, recorded dispatch, recovery projection. Rich unattended ownership은 future work입니다. |
| Update and plugin checks | `codexus update check`, `codexus plugin status` | Advisory availability와 plugin packaging fact. Installation을 자동 변경하지 않습니다. |

## Deferred Surfaces

아래 항목은 의도적으로 동작한다고 주장하지 않습니다.

- prompt 또는 wiki context automatic injection;
- stable session channel로서의 live Desktop app-server attachment;
- active relay engine spawning;
- full `codexus autopilot run` execution;
- automatic app-instance health authority 또는 cleanup;
- LSP protocol-server lifecycle management;
- always-on Codex plugin supervision.

Deferred surface는 `stability: "experimental"` 또는 `stability: "deferred"`를
보고하고, stable feature처럼 조용히 동작하는 대신 명확한 이유를 드러내야 합니다.
