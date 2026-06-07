# 로드맵과 백로그

[English](../../project-wiki/roadmap-and-backlog.md)

이 페이지는 [남은 작업](../remaining-work.md), [Roadmap Kanban](../roadmap-kanban.html),
design docs 위에 얹은 프로젝트 관리용 projection입니다. 짧게 유지하고 source docs로
돌아가야 합니다.

## Ready Themes

검증과 함께 release-sized goal로 묶기 좋은 항목:

- Project context와 LLM wiki management: generated wiki page를 authority로 만들지
  않으면서 checked-in project context를 최신으로 유지합니다.
- App-instance observation hardening: app health authority를 주장하지 않고
  owned-process evidence, lifecycle boundary, log/probe/metric adapter를 개선합니다.
- Relay와 autopilot gate: stage evidence, agreement structure, verification matrix
  handling, stop-at-boundary behavior를 강화합니다.
- Contract promotion readiness: experimental surface를 stable `0.2.0` contract로 승격하기
  전에 audit합니다.
- Repository knowledge와 compiled wiki: deterministic repository fact, page manifest,
  explicit context approval을 확장하되 injection은 manual로 유지합니다.

## Evidence Needed

승격 전에 더 많은 evidence가 필요한 항목:

- Desktop app-server attachment와 live event observation.
- Plugin always-on behavior. Packaging evidence는 runtime supervision과 다릅니다.
- Detect-only project diagnostics를 넘어서는 LSP protocol-server integration.
- Process liveness, endpoint check, user-observed behavior를 구분하는 app-instance health
  modeling.

## Gated Or Deferred

Contract가 생기기 전까지 명확히 gate 뒤에 있어야 하는 항목:

- live `cx autopilot run`,
- automatic context 또는 prompt injection,
- artifact import를 넘어서는 active relay engine spawning,
- routine live model replay,
- full unattended cron/gateway scheduler ownership,
- honest status와 recorder surface를 넘어서는 tmux/native worker launch authority.

## Review Cadence

Release가 theme을 닫으면 다음 문서도 갱신합니다:

- [구현 상태](../implementation-status.md),
- [남은 작업](../remaining-work.md),
- [Roadmap Kanban](../roadmap-kanban.html),
- 이 페이지,
- 영어 counterpart.
