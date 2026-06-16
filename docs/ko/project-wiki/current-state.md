# 현재 상태

[English](../../project-wiki/current-state.md)

이 문서는 프로젝트 관리용 snapshot입니다. 정확한 coverage는
[구현 상태](../implementation-status.md), [JSON contract](../json-contract.md), 최신
[release evidence](../release-evidence/0.2.4.md)를 기준으로 확인하세요.

## Baseline

- 현재 published baseline: `0.2.4`.
- Stable execution path: 로컬에서 인증된 `codex exec --json`을 Codexus가 감독하는 경로.
- Stable management expectation: stable JSON field는 현재 stable line 동안 frozen 상태를
  유지하고, experimental surface는 promotion 없이 추가될 수 있습니다.
- Package entrypoint: `cx`, `codexus`.

## 구현된 것

Codexus에는 작동하는 harness spine이 있습니다:

- `.codexus/runs/<run-id>/` 아래 durable run ledger,
- verification gate와 bounded repair loop,
- typed JSON error envelope,
- session status, checkpoint, verification, HUD, notify-hook evidence,
- memory lifecycle과 replay-gated skill,
- schema, slop, supply-chain, LSP, repo graph, release, contract check,
- experimental app-instance observation summary와 owned-process control,
- release/update-channel hardening과 cache-only advisory update notice,
- experimental wiki context approval, relay, decision, loop-breaker, autopilot
  contract surface.

현재 프로젝트 방향은 Codex를 대체하는 것이 아닙니다. Codexus는 Codex를 engine으로 두고,
그 주변에 evidence, record, boundary, gate를 추가합니다.

## 아직 Gate 뒤에 있는 것

다음 항목은 stable completion authority가 아닙니다:

- live Desktop app-server turn attachment,
- routine live model-in-the-loop replay,
- retrieved skill이나 wiki context의 automatic prompt injection,
- full autopilot execution,
- plugin always-on supervision,
- app-instance observation을 app health나 completion authority로 해석하는 것,
- relay convergence를 task completion authority로 해석하는 것.

Active backlog는 [남은 작업](../remaining-work.md)과
[Roadmap Kanban](../roadmap-kanban.html)을 기준으로 확인하세요.

## 현재 Management Signal

프로젝트는 "MVP harness 구축" 단계에서 "명확한 evidence contract가 있는 surface만
승격"하는 단계로 이동했습니다. 작업은 작은 commit으로 유지하되, release는 coherent
theme 단위로 묶는 것이 좋습니다.

유용한 현재 theme:

- `0.2.0` contract-promotion readiness,
- project observability와 LLM context management 강화,
- app-instance lifecycle, observation summary, authority-boundary hardening,
- relay/autopilot evidence gate,
- explicit하고 non-injected인 generated wiki/graph context.
