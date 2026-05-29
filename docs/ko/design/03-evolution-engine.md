# 진화 엔진 설계

[English](../../design/03-evolution-engine.md)

## 의도

Codexus의 진화 엔진은 실행 경험을 future leverage로 바꿉니다. 하지만 active behavior를 조용히 바꾸지 않습니다. memory와 skill은 source-linked, redacted, promotion-gated여야 합니다.

## Pipeline

```text
Run ledger
  -> Experience extractor
  -> Redaction
  -> Memory writer
  -> Skill candidate
  -> Replay validation
  -> Review
  -> Versioned promotion
```

## Experience record

`experience.json`은 run마다 생성됩니다. task summary, shape, context, driver result, verification status/commands, decisions, failures, reusable lessons, source artifacts를 포함합니다.

## Memory store

Memory는 raw transcript 저장소가 아닙니다. Raw log는 run ledger에 남기고, memory는 redacted/source-linked lesson만 저장합니다.

기본 경로:

```text
.codex-harness/memory/entries.jsonl
```

검색은 bounded retrieval을 사용하며 raw history를 무제한 prompt에 주입하지 않습니다.

## Skill proposal

Proposed skill은 다음을 포함해야 합니다:

- trigger
- scope
- procedure
- safety constraints
- source evidence
- replay scenarios

경로:

```text
.codex-harness/skills/proposed/<skill-id>/
```

## Replay validation

MVP replay는 deterministic structural gate입니다. skill identity, verification requirement, required procedure text, forbidden action, evidence presence를 확인합니다.

향후 model-in-the-loop replay는 이 deterministic gate 뒤에 추가합니다.

## Promotion과 deprecation

승격 명령:

```bash
cx skill promote <skill-id>
```

승격 결과:

```text
.codex-harness/skills/active/<name>/<version>/
```

잘못된 skill은 deprecated 상태와 deprecation record를 남겨 audit 가능해야 합니다.
