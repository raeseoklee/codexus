# Codexus 문서

[English](../README.md)

Codexus는 Codex 오케스트레이션을 위한 로컬 런타임 하네스입니다. OpenAI Codex를 모델/실행 엔진으로 유지하면서, 그 바깥에 내구성 있는 실행, 검증 게이트, 복구 루프, 메모리, replay-gated skill을 추가합니다.

## 문서 정책

- 기본 문서는 영어입니다.
- 모든 주요 문서는 같은 경로 구조의 한국어 문서를 함께 둡니다.
- 영어 문서와 한국어 문서는 서로 링크해야 합니다.
- 새 문서를 추가할 때는 `docs/ko/...` 대응 문서도 함께 추가합니다.

## 문서 지도

- [엔지니어링 계획](plans/2026-05-29-codex-harness-engineering-plan.md): 연구 기준, 제약, MVP 범위, 위험.
- [레퍼런스 거버넌스](references/README.md): mandatory reference-first 정책과 현재 upstream harness audit.
- [아키텍처](design/01-architecture.md): 시스템 경계, 런타임 계층, 드라이버 전략.
- [상세 설계](design/02-detailed-design.md): CLI, 상태 머신, 저장소 레이아웃, 이벤트 스키마, 검증.
- [진화 엔진](design/03-evolution-engine.md): Hermes에서 영감을 받은 메모리, 스킬 제안, replay 검증, 승격/폐기.
- [구현 피드백](design/04-implementation-feedback.md): MVP 구현 중 확인된 제약과 설계 반영.
- [명칭과 런타임 포지셔닝](design/05-naming-and-runtime-positioning.md): Codexus, `cx`, 외부 CLI 런타임, 향후 Codex-native adapter.
- [Codex-native adapter](design/06-codex-native-adapter.md): `$codexus` skill adapter, 설치, 우선 지원 명령, 설계 규칙.
- [구현 상태](implementation-status.md): 현재 구현된 MVP spine, 검증 증거, 남은 gap.

## 포지셔닝

Codexus는 Codex 대체물이 아니라 Codex 실행 하네스입니다.

현재 구현된 MVP는 외부 supervisor CLI로 동작합니다:

```text
User -> cx/codexus -> Codexus core -> codex exec --json -> Codex
```

다음 방향은 Codex 세션 안에서 호출되는 Codex-native adapter입니다:

```text
Codex interactive session -> Codexus adapter -> Codexus core
```

두 표면은 같은 ledger, verification, memory, skill store를 공유해야 합니다.
