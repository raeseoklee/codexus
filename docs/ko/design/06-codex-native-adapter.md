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

User-facing 호출 예시는 [Codex 안에서 Codexus 사용하기](../codex-session-usage.md)를
참고하세요.

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

`cx doctor --json`은 `codexus.skill_install` check를 포함합니다. 설치된 skill이
없거나 stale인지, 또는 이 repository와 hash가 일치하는지 보고합니다. Stale
install은 warning이며 자동으로 변경하지 않습니다. 재설치는 위 명령으로
명시적으로 수행합니다.

## 우선 지원 명령

Codex 안에서는 낮은 위험의 명령부터 사용합니다:

```bash
node codex/skills/codexus/scripts/cx.mjs doctor --json
node codex/skills/codexus/scripts/cx.mjs status <run-id> --json
node codex/skills/codexus/scripts/cx.mjs events tail <run-id> --json
node codex/skills/codexus/scripts/cx.mjs verify <run-id> --json
node codex/skills/codexus/scripts/cx.mjs memory search "<query>" --json
node codex/skills/codexus/scripts/cx.mjs memory review --json
node codex/skills/codexus/scripts/cx.mjs skill review <skill-id> --json
node codex/skills/codexus/scripts/cx.mjs skill index --json
node codex/skills/codexus/scripts/cx.mjs replay skill <skill-id> --json
node codex/skills/codexus/scripts/cx.mjs adapt omx retrieve --task "<task>" --json
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
- adapter 동작을 바꾸기 전에
  [reference-first 하네스 정책](../references/01-reference-first-harness-policy.md)을
  적용합니다. Claw의 JSON/status/permission contract, OpenClaude의
  terminal/provider/runtime surface, Hermes의 conversation/gateway loop를
  비교하고, Codexus adapter가 thin해야 하는지 또는 의도적으로 커져야 하는지
  기록합니다.
- adapter가 unsupported protocol이나 app-server path에 대한 visible command를
  노출한다면, command 존재로 support를 암시하지 말고 truthful status envelope를
  반환합니다.

## 다음 단계

- `$codexus` 사용법을 설명하는 project-level AGENTS.md snippet 추가.
- 명시적 user-visible approval step과 non-injected context artifact contract를
  유지할 수 있을 때만 adapter injection 추가.
- supervised lifecycle과 JSON-RPC roundtrip contract를 검증한 뒤 app-server turn 연결.
- permission, approval, policy-block event display를 더 풍부하게 개선.
- `.codex-harness`에서 `.codexus`로의 migration은 backward-compatible read와 함께 별도로 진행.
