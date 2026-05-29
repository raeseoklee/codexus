# Codexus 문서

[English](../README.md)

Codexus는 Codex 오케스트레이션을 위한 로컬 런타임 하네스입니다. OpenAI Codex를 모델/실행 엔진으로 유지하면서, 그 바깥에 내구성 있는 실행, 검증 게이트, 복구 루프, 메모리, replay-gated skill을 추가합니다.

## 문서 정책

- 기본 문서는 영어입니다.
- 모든 주요 문서는 같은 경로 구조의 한국어 문서를 함께 둡니다.
- 영어 문서와 한국어 문서는 서로 링크해야 합니다.
- 새 문서를 추가할 때는 `docs/ko/...` 대응 문서도 함께 추가합니다.

## 문서 지도

- [빠른 시작](quickstart.md): local setup, deterministic test run, real Codex run, Codex-native adapter 설치.
- [Codex 안에서 Codexus 사용하기](codex-session-usage.md): interactive Codex session에서 `$codexus` skill을 호출하는 방법, 요청 예시, 사용하지 않아도 되는 경우.
- [엔지니어링 계획](plans/2026-05-29-codex-harness-engineering-plan.md): 연구 기준, 제약, MVP 범위, 위험.
- [레퍼런스 거버넌스](references/README.md): mandatory reference-first 정책과 현재 upstream harness audit.
- [아키텍처](design/01-architecture.md): 시스템 경계, 런타임 계층, 드라이버 전략.
- [상세 설계](design/02-detailed-design.md): CLI, 상태 머신, 저장소 레이아웃, 이벤트 스키마, 검증.
- [진화 엔진](design/03-evolution-engine.md): Hermes에서 영감을 받은 메모리, 스킬 제안, replay 검증, 승격/폐기.
- [구현 피드백](design/04-implementation-feedback.md): MVP 구현 중 확인된 제약과 설계 반영.
- [명칭과 런타임 포지셔닝](design/05-naming-and-runtime-positioning.md): Codexus, `cx`, 외부 CLI 런타임, 향후 Codex-native adapter.
- [Codex-native adapter](design/06-codex-native-adapter.md): `$codexus` skill adapter, 설치, 우선 지원 명령, 설계 규칙.
- [구현 상태](implementation-status.md): 현재 구현된 MVP spine, 검증 증거, 남은 gap.
- [남은 작업](remaining-work.md): 우선순위 backlog, 추가 설계 고려사항, 제안하는 다음 slice.
- [Public release checklist](public-release.md): open-source publication을 위한 metadata, safety, verification, visibility checklist.
- [Roadmap](ROADMAP.md): public-facing project direction.
- [Changelog](CHANGELOG.md): release notes.

## 포지셔닝

Codexus는 Codex 대체물이 아니라 Codex 실행 하네스입니다.

현재 구현은 외부 supervisor CLI와 Codex-native `$codexus` skill adapter를 함께 제공합니다:

```text
User -> cx/codexus -> Codexus core -> codex exec --json -> Codex
```

```text
Codex interactive session -> Codexus adapter -> Codexus core
```

두 표면은 같은 ledger, verification, memory, skill store를 공유합니다.

## 데모

![Codexus inside a Codex session](../assets/codexus-inside-codex.gif)

이 capture는 Codex 안에 설치된 adapter가 호출하는 것과 같은 `codexus` skill
wrapper를 사용합니다. Private Codex UI, account state, prompt, local project data를
녹화하지 않도록 안전한 terminal demo로 구성했습니다.

현재 구현은 P0-P2 surface와 high-risk promotion slice를 포함합니다: `init`, run
observability, memory lifecycle/curation, active skill index/export/improvement,
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
