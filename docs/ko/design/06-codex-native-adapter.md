# Codex-native adapter

[English](../../design/06-codex-native-adapter.md)

## 의도

Codexus는 사용자가 매번 `cx run "<prompt>"`를 새로 호출하지 않고, 현재 Codex 대화형 세션 안에서 계속 작업할 수 있는 native surface가 필요합니다.

이 adapter는 자체 chat 구현을 만들지 않습니다. 현재 Codex conversation을 주 interaction loop로 유지하고, Codexus는 durable evidence, verification, replay, memory, skill workflow를 제공하는 보조 runtime으로 동작합니다.

## 런타임 형태

구현된 MVP:

```text
Codex session
  -> $codexus skill
  -> codex/skills/codexus/scripts/cx.mjs
  -> Codexus core CLI
  -> .codex-harness ledger / memory / skills
```

Skill은 얇은 adapter입니다. 외부 `cx` CLI와 같은 core runtime을 호출합니다.

## 설치

Repo 안의 source skill:

```text
codex/skills/codexus/
```

로컬 Codex skill store에 설치:

```bash
npm run install:codex-skill -- --json
```

설치 위치:

```text
${CODEX_HOME:-~/.codex}/skills/codexus
```

Installer는 `codexus-root.json`을 함께 써서, 설치된 skill이 이 repo의 Codexus core를 찾을 수 있게 합니다.

## 우선 지원 명령

Codex 안에서는 낮은 위험의 명령부터 사용합니다:

```bash
node codex/skills/codexus/scripts/cx.mjs doctor --json
node codex/skills/codexus/scripts/cx.mjs status <run-id> --json
node codex/skills/codexus/scripts/cx.mjs verify <run-id> --json
node codex/skills/codexus/scripts/cx.mjs memory search "<query>" --json
node codex/skills/codexus/scripts/cx.mjs skill review <skill-id> --json
node codex/skills/codexus/scripts/cx.mjs replay skill <skill-id> --json
```

Supervised handoff:

```bash
node codex/skills/codexus/scripts/cx.mjs run --driver codex-exec --json "<bounded task>"
```

이 명령은 별도 non-interactive Codex process를 시작합니다. 현재 대화형 세션을 대체하기보다, bounded supervised run이 필요할 때만 사용합니다.

## 설계 규칙

- Codex를 interactive loop로 유지합니다.
- Codexus는 evidence/orchestration layer로 유지합니다.
- Adapter는 얇고 deterministic해야 합니다.
- Workflow kernel logic을 skill 안에 중복 구현하지 않습니다.
- Adapter 안에서 skill을 자동 승격하지 않습니다.
- nested Codex run보다 status, verification, replay, memory, review 명령을 우선합니다.

## 다음 단계

- `$codexus` 사용법을 설명하는 project-level AGENTS.md snippet 추가.
- 현재 task에 맞는 promoted skill retrieval 추가.
- app-server driver 계약 테스트 후 app-server turn 연결.
- `.codex-harness`에서 `.codexus`로의 migration은 backward-compatible read와 함께 별도로 진행.
