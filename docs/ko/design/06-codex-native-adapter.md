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

## Update notification

Codexus는 사용자가 이미 Codexus를 쓰고 있을 때 update availability를 자동으로
surface해야 합니다. 하지만 일반 command를 noisy network probe로 바꾸면 안 됩니다.

계획된 첫 slice:

- 명시적 command로 `cx update check --json` 추가;
- npm `latest` dist-tag 조회는 bounded TTL cache를 통해서만 수행;
- `version --json`, `doctor --json`, `session status --json` 같은 high-signal
  command에 additive `update` summary 추가;
- 사용자가 Codex session 안에서 `$codexus`를 호출하면 skill이 그 update field를
  현재 Codex chat에 요약;
- registry에 접근하지 못해도 primary command를 실패시키지 않음.

필수 gate:

- `CODEXUS_NO_UPDATE_CHECK=1`은 registry check를 비활성화합니다;
- CI/non-interactive release verification에서는 update check를 기본 disabled 또는
  cache-only로 둡니다;
- update notification은 informational only이며 completion, verification, release
  gate에 영향을 주지 않습니다;
- prerelease/`next` check는 명시적 opt-in일 때만 수행합니다;
- 자동 설치는 이 slice의 범위 밖입니다.

## Skill과 plugin packaging

현재 Codexus는 Codex skill adapter로 설치됩니다. 첫 제품 요구가 현재 Codex 대화 안에서
명시적으로 호출하는 얇은 command surface이기 때문에, 이 경로는 계속 primary path로
유지합니다.

나중에 Codex plugin package도 유용할 수 있습니다. 다만 plugin 설치 자체를 always-on
동작의 증거로 취급하면 안 됩니다. 로컬 Codex plugin 형태 기준으로 plugin은 skill,
script, asset, MCP/app descriptor, marketplace metadata를 묶을 수 있습니다. 이는 배포와
발견성을 개선하지만 기존 always-on evidence source를 대체하지 않습니다:

- AGENTS overlay guidance;
- trust-gated notify-hook heartbeat;
- local `.codexus/session` state;
- 명시적 `cx` command와 JSON evidence.

권장 방향:

1. npm-installed `$codexus` skill을 stable adapter로 유지합니다.
2. Plugin-packaging experiment는 update-notification slice 이후에 추가합니다. 그래야
   plugin 사용자도 stale package/adapter status를 볼 수 있습니다.
3. Installed plugin 상태를 `cx doctor --json`이 진단할 수 있을 때까지 plugin packaging은
   `stability: experimental`로 둡니다.
4. Workflow-kernel logic을 plugin-local script로 옮기지 않습니다.
5. Notify hook 또는 다른 관측 heartbeat가 실제로 dispatch되지 않았다면 plugin 설치가
   always-on supervision을 만든다고 주장하지 않습니다.

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
