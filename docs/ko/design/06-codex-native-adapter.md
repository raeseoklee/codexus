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
  -> .codexus ledger / memory / skills
```

Skill은 얇은 adapter입니다. 외부 `cx` CLI와 같은 core runtime을 호출합니다.

User-facing 호출 예시는 [Codex 안에서 Codexus 사용하기](../codex-session-usage.md)를
참고하세요.

Adapter는 더 큰 [세션 네이티브 감독](07-supervised-sessions.md) 방향의 첫 설치
구성요소입니다. 목표는 별도 chat surface나 외부 `codex exec resume` thread가 아니라,
현재 Codex TUI session이 skill, marker-bounded AGENTS guidance, local state, optional
hook/status, optional tmux worker를 통해 명시적으로 호출할 수 있는 Codex-native
session-native harness입니다.

## 설치

Repo 안의 source skill:

```text
codex/skills/codexus/
```

로컬 Codex skill store에 설치:

```bash
npm run install:codex-skill -- --json
```

Global npm install은 `CODEXUS_INSTALL_CODEX_SKILL=0`이 아닐 때 같은 adapter
installer를 자동으로 실행합니다.

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
node codex/skills/codexus/scripts/cx.mjs cancel <run-id> --reason "<why>" --json
node codex/skills/codexus/scripts/cx.mjs status <run-id> --json
node codex/skills/codexus/scripts/cx.mjs events tail <run-id> --json
node codex/skills/codexus/scripts/cx.mjs verify <run-id> --json
node codex/skills/codexus/scripts/cx.mjs memory search "<query>" --json
node codex/skills/codexus/scripts/cx.mjs memory review --json
node codex/skills/codexus/scripts/cx.mjs skill review <skill-id> --json
node codex/skills/codexus/scripts/cx.mjs skill index --json
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
- adapter 동작을 바꾸기 전에
  [reference-first 하네스 정책](../references/01-reference-first-harness-policy.md)을
  적용합니다. Claw의 JSON/status/permission contract, OpenClaude의
  terminal/provider/runtime surface, Hermes의 conversation/gateway loop를
  비교하고, Codexus adapter가 thin해야 하는지 또는 의도적으로 커져야 하는지
  기록합니다.
- adapter가 unsupported protocol이나 app-server path에 대한 visible command를
  노출한다면, command 존재로 support를 암시하지 말고 truthful status envelope를
  반환합니다.

## 구현된 Session-Native Slice

- Marker-bounded project/user AGENTS overlay가 session-native Codexus 사용법을
  문서화합니다.
- `cx setup codex-session`, `cx session status`, `cx session hud`,
  `cx session migrate`, `cx session checkpoint`, `cx session verify`,
  `cx session notify`, `cx session workers status`가 첫 session-native command
  surface를 제공합니다.
- Notify-hook setup은 trust-gated, chain-preserving, atomic, reversible이며,
  configured hook과 실제 `turn-ended` dispatch 관측을 구분합니다.
- Adapter context는 approval artifact 기반으로 남아 있고, automatic prompt
  injection은 의도적으로 지원하지 않습니다.
- `.codexus`가 canonical runtime root입니다. Legacy `.codex-harness` directory는
  CLI가 발견하면 `.codexus`로 이관한 뒤 제거합니다.

## 남은 단계

- supervised lifecycle, non-disruptive attachment, JSON-RPC event contract가
  검증된 뒤에만 app-server 기반 turn을 추가합니다.
- permission, approval, policy-block event display를 더 풍부하게 개선합니다.
- unsupported protocol path는 command 존재만으로 support를 암시하지 말고
  truthful status envelope로 유지합니다.
