# Codex 안에서 Codexus 사용하기

[English](../codex-session-usage.md)

Codexus는 두 가지 방식으로 사용할 수 있습니다:

- 외부 CLI: `cx ...`
- Codex-native adapter: interactive Codex session 안에서 `codexus` skill 호출

Codex-native path는 현재 Codex conversation을 주 작업 loop로 유지합니다.
Codexus는 durable status, verification, replay, memory, schema, skill evidence를
추가하는 보조 runtime입니다.

Codexus는 OMX-like session-native runtime으로 이동합니다. 설치된 skill은 첫
layer이고, `cx setup codex-session`은 marker-bounded AGENTS guidance,
`.codexus/session/` state, optional notify-hook attachment를 추가합니다.
명시적 checkpoint와 verification command는 지금 사용할 수 있습니다. Statusline과
tmux integration은 아직 capability gate 뒤에 있습니다.
[세션 네이티브 감독](design/07-supervised-sessions.md)을 참고하세요.

## Adapter 설치

Published npm package는 global install 시 CLI와 Codex skill adapter를 기본으로
함께 설치합니다:

```bash
npm install -g codexus@next
```

CLI만 설치하려면 명시적으로 opt out합니다:

```bash
CODEXUS_INSTALL_CODEX_SKILL=0 npm install -g codexus@next
```

그 global package에서 Codex skill adapter를 갱신하거나 재설치합니다:

```bash
node "$(npm root -g)/codexus/scripts/install-codex-skill.mjs" --json
```

GitHub Pages installer도 기본적으로 adapter를 설치합니다:

```bash
curl -fsSL https://raeseoklee.github.io/codexus/install.sh | sh
```

Cloned repository에서 adapter만 설치하거나 갱신하려면:

```bash
npm run install:codex-skill
```

설치 위치:

```text
${CODEX_HOME:-~/.codex}/skills/codexus
```

검증:

```bash
cx doctor --json
```

`codexus.skill_install` check를 확인합니다. `pass`면 정상입니다. Stale 또는 missing
install은 warning이며, 명시적으로 재설치할 때까지 자동 변경하지 않습니다.

대상 repository에서 session-native project overlay를 활성화합니다:

```bash
cx setup codex-session --scope project --json
```

이 명령은 `AGENTS.md`의 Codexus marker block만 갱신하고
`.codexus/session/state.json`을 초기화합니다. `--scope user`를 사용하면
overlay를 `${CODEX_HOME:-~/.codex}/AGENTS.md`에 설치합니다.

안전을 위해 setup은 첫 Codexus rewrite 전에 `AGENTS.md.codexus.bak` one-time backup을
쓰고, updated file은 same-directory atomic rename으로 교체합니다. 기존 Codexus marker가
손상됐거나 순서가 어긋난 경우 file을 보존하고 새 marker block을 append합니다.

Codex notify hook을 붙이려면 명시적으로 opt in합니다:

```bash
cx setup codex-session --scope project --enable-notify-hook --json
```

Notify-hook installer는 현재 project가 Codex config에서 이미 trusted일 때만
`${CODEX_HOME:-~/.codex}/config.toml`을 갱신합니다. 기존 top-level
`notify = [...]` command가 있으면 Codexus가 `--previous-notify`로 감싸고
교체하지 않습니다. Statusline integration은 계속 `unavailable`로 보고합니다.

## Thin Walkthrough

실제 Codex session 안에서 Codexus를 dogfooding할 때는 이 흐름을 사용합니다:

```text
codexus session status 확인해줘.
```

Project-local evidence boundary를 남깁니다:

```text
codexus checkpoint "before parser cleanup" 기록해줘.
```

Session surface로 verification을 실행합니다:

```text
codexus verify "npm test" 결과를 현재 작업 증거로 붙여줘.
```

Codexus가 상태를 기록했는지 확인합니다:

```text
codexus session status를 다시 보고 checkpoint, verification, hook 상태만 요약해줘.
```

Notify hook을 활성화했다면 최신 `.codexus/session/state.json`에 최근 `hookEvents`가
포함됩니다. 이 hook은 transcript를 캡처하지 않습니다. bounded turn activity만
기록하고, 기존 notify command가 있으면 그 command로 chain합니다.

## Codex 안에서 호출하는 방법

Interactive Codex session에서 `codexus` 또는 `$codexus`를 언급하고, 원하는 harness
command나 evidence를 설명합니다.

예시:

```text
codexus로 doctor 상태 확인해줘.
```

```text
$codexus runs list --json 결과를 보고 최근 run 상태를 요약해줘.
```

```text
codexus로 schema check를 실행하고 문제가 있으면 원인을 정리해줘.
```

```text
codexus로 run_... 상태와 events tail을 확인해줘.
```

```text
codexus memory search "parser regression" 결과를 현재 작업에 필요한 것만 요약해줘.
```

Codex는 설치된 `codexus` skill을 사용하고, 이 skill은 내부적으로 다음 wrapper를
호출합니다:

```bash
node codex/skills/codexus/scripts/cx.mjs <command>
```

Wrapper는 설치된 skill metadata에서 Codexus repository를 찾습니다. Codex session
안에서 global `cx` binary가 반드시 필요하지 않습니다.

## Codex Session에서 우선 쓰기 좋은 명령

먼저 read-only 또는 evidence-oriented command를 선호합니다:

```bash
session status --json
session checkpoint "before risky refactor" --json
session verify --verify "npm test" --json
doctor --json
runs list --json
cancel <run-id> --reason "<why>" --json
status <run-id> --json
events tail <run-id> --json
verify <run-id> --json
schema check --json
schema validate-run <run-id> --json
memory search "<query>" --json
memory review --json
skill index --json
skill review <skill-id> --json
replay skill <skill-id> --json
```

nested `cx run` sub-run을 시작하기 전에 checkpoint와 session verification
command를 우선 사용합니다.

현재 session state는 cwd-scoped입니다. 같은 project에서 Codex window 두 개가 동시에
작업하면 Codexus는 `session` lock으로 write를 직렬화합니다. 겹치는 checkpoint/verify
command는 `lock_unavailable`을 반환할 수 있으며 active operation이 끝난 뒤 재시도해야
합니다.

Supervised run은 의도적으로 사용할 때만 실행합니다:

```bash
run --driver codex-exec --json "<bounded task>"
```

이 명령은 별도 non-interactive Codex process를 시작합니다. Bounded,
reproducible sub-run에는 유용하지만, 일반 code edit에서 현재 interactive
conversation을 대체하면 안 됩니다.

## Codexus를 쓰지 않아도 되는 경우

다음은 일반 Codex interaction으로 처리합니다:

- 현재 conversation에서 직접 code edit,
- 빠른 설명,
- durable ledger가 필요 없는 one-off local inspection,
- 이미 active session에서 진행 중인 일반 review/refactor.

다음이 필요할 때 Codexus를 사용합니다:

- durable run status,
- verification rerun,
- event history,
- schema validation,
- memory retrieval,
- skill review/promotion evidence,
- replay-gated behavior,
- bounded context evidence,
- bounded supervised handoff.

## Troubleshooting

Codex가 skill을 사용하지 않는 것 같으면:

1. `cx doctor --json`을 실행하고 `codexus.skill_install`을 확인합니다.
2. `npm run install:codex-skill`로 adapter를 재설치합니다.
3. Codex session에서 `use the codexus skill`이라고 명시합니다.
4. 필요하면 Codex에게 wrapper를 직접 실행하게 합니다:

```bash
node codex/skills/codexus/scripts/cx.mjs doctor --json
```

Wrapper가 repository를 찾지 못하면 `CODEXUS_HOME`을 cloned Codexus repository
root로 설정하거나 adapter를 재설치합니다.
