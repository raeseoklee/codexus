# Codexus 문서

[English](../README.md)

Codexus는 Codex 오케스트레이션을 위한 로컬 런타임 하네스입니다. OpenAI Codex를 모델/실행 엔진으로 유지하면서, 그 바깥에 내구성 있는 실행, 검증 게이트, 복구 루프, 메모리, replay-gated skill을 추가합니다.

## 문서 정책

- 영문 문서를 기본으로 작성합니다.
- 한국어 번역 문서는 `docs/ko/` 아래에 둡니다.
- 영문 문서에서 한국어 번역을 링크할 때는 `Korean`으로 표기합니다.
- 새 user-facing 문서를 추가할 때는 필요한 한국어 번역도 함께 추가합니다.

## 문서 지도

- [빠른 시작](quickstart.md): local setup, deterministic test run, real Codex run, Codex-native adapter 설치.
- [Codex 안에서 Codexus 사용하기](codex-session-usage.md): interactive Codex session에서 `$codexus` skill을 호출하는 방법, 요청 예시, 사용하지 않아도 되는 경우.
- [엔지니어링 계획](plans/2026-05-29-codex-harness-engineering-plan.md): 연구 기준, 제약, MVP 범위, 위험.
- [하네스 개선 계획](plans/2026-05-29-harness-remediation-plan.md): repair, supervision,
  evolution depth에 대한 accepted review finding과 구현된 remediation slice.
- [npm packaging plan](plans/2026-05-30-npm-packaging-plan.md): bundled npm CLI entrypoint, package contents, installer strategy, release gate.
- [Desktop app-server attachment evidence plan](plans/2026-05-30-desktop-app-server-attachment-evidence-plan.md): Codex app-server를 통한 Desktop attachment A/B evidence slice와 consent/read-only gate.
- [레퍼런스 거버넌스](references/README.md): mandatory reference-first 정책과 현재 upstream harness audit.
- [아키텍처](design/01-architecture.md): 시스템 경계, 런타임 계층, 드라이버 전략.
- [상세 설계](design/02-detailed-design.md): CLI, 상태 머신, 저장소 레이아웃, 이벤트 스키마, 검증.
- [진화 엔진](design/03-evolution-engine.md): Hermes에서 영감을 받은 메모리, 스킬 제안, replay 검증, 승격/폐기.
- [구현 피드백](design/04-implementation-feedback.md): MVP 구현 중 확인된 제약과 설계 반영.
- [명칭과 런타임 포지셔닝](design/05-naming-and-runtime-positioning.md): Codexus, `cx`, 외부 CLI 런타임, Codex-native session 방향.
- [Codex-native adapter](design/06-codex-native-adapter.md): `$codexus` skill adapter, 설치, 우선 지원 명령, 설계 규칙.
- [세션 네이티브 감독](design/07-supervised-sessions.md): 현재 Codex session 안에서 skill, AGENTS overlay, hooks/status state, optional tmux worker를 조합하는 OMX-like 방향.
- [구현 상태](implementation-status.md): 현재 구현된 MVP spine, 검증 증거, 남은 gap.
- [남은 작업](remaining-work.md): 우선순위 backlog, 추가 설계 고려사항, 제안하는 다음 slice.
- [Public release checklist](public-release.md): open-source publication을 위한 metadata, safety, verification, visibility checklist.
- [Roadmap](ROADMAP.md): public-facing project direction.
- [Changelog](CHANGELOG.md): release notes.

## 포지셔닝

Codexus는 Codex 대체물이 아니라 Codex 실행 하네스입니다.

현재 구현은 외부 supervisor CLI와 Codex-native `$codexus` skill adapter를 함께
제공하며, 제품 방향은 Codex TUI 안에서 동작하는 session-native runtime입니다:

```text
User -> cx/codexus -> Codexus core -> codex exec --json -> Codex
```

```text
Codex interactive session -> Codexus adapter -> Codexus core
```

두 표면은 같은 ledger, verification, memory, skill store를 공유합니다.

현재 구현은 P0-P2 surface와 high-risk promotion slice를 포함합니다: `init`, run,
external cancel, observability, memory lifecycle/curation, active skill index/export/improvement,
approved adapter retrieval/context formatting/artifact, lock inspection/stale
recovery, focused read-path enforcement, schema artifact subset validation,
run-ledger validation이 붙은 schema artifact, full replay parity fixture-matrix
coverage, gated model replay, app-server dry-run roundtrip/recorded experiment
manifest/process-probe/fake-supervision evidence,
explicit-budget driver-failure repair, cron/gateway dry-run audit record와
policy/approval contract, installed skill tree diagnosis, local syntax/static
validation.

일부 설계 문서는 sibling harness와의 비교나 optional advanced interop을 다룹니다.
이것은 normal Codexus 사용 경로의 필수 조건이 아니라 compatibility surface입니다.
