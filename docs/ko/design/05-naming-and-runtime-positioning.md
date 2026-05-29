# 명칭과 런타임 포지셔닝

[English](../../design/05-naming-and-runtime-positioning.md)

## 제품명

정식 제품명:

```text
Codexus
```

포지셔닝:

```text
Codexus is a local runtime harness for Codex orchestration.
```

한국어 설명:

```text
Codexus는 Codex를 감싸 durable execution, tool routing, verification, recovery, memory, replay-gated skills를 제공하는 로컬 런타임 하네스입니다.
```

## 카테고리

```text
Codex execution harness
```

Codexus는 모델, IDE, hosted agent를 대체하지 않습니다. Codex 실행을 감싸 자동 실행, 도구 연결, 상태 기록, 검증, 복구, memory/skill화를 담당하는 runtime layer입니다.

## CLI 명칭

정식 CLI:

```bash
cx
```

Long-form alias:

```bash
codexus
```

현재 MVP:

- `package.json`은 아직 `chx`도 노출합니다.
- 문서상 목표 CLI는 `cx`입니다.
- `chx`는 migration 기간의 compatibility alias입니다.

## Storage namespace

현재 구현된 storage root:

```text
.codex-harness/
```

이 경로는 compatibility 때문에 유지합니다. 향후 `.codexus/`를 도입한다면 backward-compatible read가 있는 명시적 migration으로 진행해야 합니다.

## OMX와의 관계

OMX는 Codex session-native harness입니다. Codexus는 현재 외부 supervisor CLI에서 출발합니다.

목표 상태:

```text
Codexus Core
  + External CLI: cx run / verify / replay / status
  + Codex-native adapter: Codex session 안에서 호출
```

이 구조는 Codexus의 durable supervisor 장점을 유지하면서, 나중에 OMX처럼 session 안에서 자연스럽게 호출되는 UX를 제공합니다.
