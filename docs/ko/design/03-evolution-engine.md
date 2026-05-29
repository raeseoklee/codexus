# 진화 엔진 설계

[English](../../design/03-evolution-engine.md)

## 의도

Codexus의 진화 엔진은 실행 경험을 future leverage로 바꿉니다. 하지만 active behavior를 조용히 바꾸지 않습니다. memory와 skill은 source-linked, redacted, promotion-gated여야 합니다.

## 레퍼런스 정렬

Hermes는 learning loop의 주 reference입니다. 다만 수정된 Claw audit은 evolution의
evidence 기준을 강화합니다. Memory와 skill은 terminal prose가 아니라 typed run
fact, verification record, replay outcome, structured event/report record에서
파생해야 합니다. structured event가 있으면 terminal prose는 supporting
evidence입니다.

Claw의 mock parity harness는 다음 replay 방향도 정의합니다. Skill proposal은
향후 tool success, tool denial, permission prompt branch, multi-tool turn,
plugin/skill path behavior, compaction/large-output behavior, usage metadata를
다루는 scenario로 검증되어야 합니다.

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

Codexus는 storage identity와 Codex-facing identity를 분리합니다. Storage id는
`skill_document-parser-behavior`처럼 stable하고 filesystem-safe하게 유지합니다.
Codex에 보여줄 display identity는 `codexus:<skill-name>` namespace를 사용합니다.
예: `codexus:document-parser-behavior`. 이렇게 하면 Codexus가 생성/승격한 skill이
사용자 작성 Codex skill이나 plugin-provided skill과 명확히 구분됩니다.

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
