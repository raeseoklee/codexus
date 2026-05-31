# 빠른 시작

[English](../quickstart.md)

이 문서는 Codexus를 로컬에서 실행하는 절차를 설명합니다. 첫 검증 단계는 모델이나
네트워크 접근에 의존하지 않고, 이후 실제 Codex 실행을 다룹니다.

## npm 설치

Codexus는 npm alpha package로 publish되어 있습니다:

```bash
npm install -g codexus@next
codexus doctor --json
```

Global npm 설치는 기본적으로 CLI와 Codex-native skill adapter를 함께 설치합니다.
Adapter는 `${CODEX_HOME:-~/.codex}/skills/codexus`에 기록됩니다. CLI만 설치하려면
다음처럼 실행합니다:

```bash
CODEXUS_INSTALL_CODEX_SKILL=0 npm install -g codexus@next
```

## Install Script

같은 npm package 설치를 review 가능한 `curl | sh` 경로로 실행하려면 installer를
사용합니다:

```bash
curl -fsSL https://raeseoklee.github.io/codexus/install.sh | sh
```

먼저 검토하고 설치하려면:

```bash
curl -fsSLO https://raeseoklee.github.io/codexus/install.sh
less install.sh
sh install.sh
```

Installer environment variable:

- `CODEXUS_NPM_SPEC`: 설치할 npm package spec, 기본값 `codexus@next`
- `CODEXUS_EXPECTED_VERSION`: optional installed package version check
- `CODEXUS_NPM_PREFIX`: npm global prefix, 기본값 `~/.local`
- `CODEXUS_BIN_DIR`: `cx`, `codexus`를 둘 bin directory, 기본값 `~/.local/bin`
- `CODEXUS_INSTALL_CODEX_SKILL=0`: Codex skill adapter 설치 생략

## 1. Clone

```bash
git clone https://github.com/raeseoklee/codexus.git
cd codexus
```

## 2. 로컬 도구 검증

Npm으로 설치된 Codexus CLI는 Node.js 22 이상이 필요합니다. Source test는
repository가 설정한 development Node runtime에서 실행합니다.

```bash
node --version
npm run ci
npm run package:smoke
```

테스트는 deterministic test driver를 사용하므로 Codex 모델 접근이 필요하지
않습니다.

## 3. Doctor 실행

```bash
node src/cli/main.ts doctor --json
```

`doctor`는 Node, Codex CLI, Codex auth, driver capability, git, tmux, Codexus
state, Codexus skill 설치 상태를 보고합니다.

## 4. Deterministic Test Harness Task 실행

```bash
node src/cli/main.ts run --driver mock --json "hello from codexus"
```

명령은 `.codexus/runs/<run-id>/` 아래 run ledger를 기록합니다.

Project에 이전 `.codex-harness/` directory가 있으면 다음 CLI command에서
`.codexus/`로 이관하고 legacy directory를 제거합니다. 충돌 file은
`.codexus/migration-conflicts/` 아래에 보존합니다.

확인:

```bash
node src/cli/main.ts runs list --json
node src/cli/main.ts status <run-id> --json
node src/cli/main.ts events tail <run-id> --json
node src/cli/main.ts schema validate-run <run-id> --json
```

다른 terminal에서 실행 중인 supervised run을 취소할 수 있습니다:

```bash
cx cancel <run-id> --reason "no longer needed" --json
```

## 5. Local Bin 사용

개발 중에는 package를 link할 수 있습니다:

```bash
npm link
cx doctor --json
codexus runs list --json
```

공개 bin 이름은 `cx`와 `codexus`입니다.

## 6. 실제 Codex 실행 사용

먼저 local Codex CLI를 설치하고 인증합니다. 그 다음 실행합니다:

```bash
cx run --driver codex-exec --json "Reply exactly CODEXUS-OK"
```

프로젝트 작업에는 verification을 붙입니다:

```bash
cx run --verify "npm test" "fix the failing parser tests"
```

## 7. Codex CLI 채팅 안에서 Codexus 사용

`CODEXUS_INSTALL_CODEX_SKILL=0`을 지정하지 않았다면 global npm 설치가 adapter를
자동으로 설치합니다.

Published npm package에서 갱신하거나 재설치:

```bash
node "$(npm root -g)/codexus/scripts/install-codex-skill.mjs" --json
```

Cloned repository에서 설치:

```bash
npm run install:codex-skill
```

installer는 `codexus` skill을 `${CODEX_HOME:-~/.codex}/skills`에 기록합니다.
Codex CLI/TUI 채팅 안에서 Codexus status, checkpoint, verification, replay,
memory, schema, context evidence가 필요할 때 사용합니다.

대상 project 안에서 session-native overlay를 설치합니다:

```bash
cx setup codex-session --scope project --always-on --enable-notify-hook --json
```

그 다음 해당 project에서 Codex를 열고 채팅창에 이렇게 요청합니다:

```text
codexus skill을 사용해서 현재 session status를 보여줘.
```

always-on overlay는 guidance이지 proof가 아닙니다. Notify hook은 CLI/TUI dispatch가
발화할 때 bounded `turn-ended` heartbeat와 derived evidence snapshot을 기록하지만,
현재 상태의 기준은 항상 `cx session status --json`의 on-demand 재계산입니다.

```text
Codexus로 "before risky refactor" checkpoint를 만들어줘.
```

```text
Codexus로 "npm test" session verification을 실행하고 evidence를 요약해줘.
```

내부적으로 skill은 local wrapper를 호출합니다:

```bash
node codex/skills/codexus/scripts/cx.mjs <command>
```

nested supervised run보다 먼저 명시적 session evidence를 남기는 쪽을 선호합니다:

```bash
cx session status --json
cx session checkpoint "before risky refactor" --json
cx session verify --verify "npm test" --json
```

별도 non-interactive Codex sub-run이 필요할 때만 명시적으로 요청합니다:

```text
Codexus로 "<bounded task>" supervised run을 시작하고 run id를 알려줘.
```

일반 edit는 현재 Codex chat에서 계속 진행하고, Codexus는 evidence와 state 용도로
사용합니다.

더 많은 예시는 [Codex 안에서 Codexus 사용하기](codex-session-usage.md)를 참고하세요.

## 8. Project Harness 초기화

대상 project 안에서:

```bash
cx init --with-docs --json
```

이 명령은 관련 없는 tool state를 변경하지 않고 `.codexus/` directory와
config를 생성합니다.

## Troubleshooting

- **Node version:** npm-installed Codexus는 Node.js 22 이상이 필요합니다.
  `cx`가 JSON을 출력하기 전에 실패하면 `node --version`을 먼저 확인하세요.
- **`codex` CLI 없음:** 실제 `codex-exec` run에는 local `codex` command가
  필요합니다. `cx doctor --json`은 이를 Codex check failure로 보고합니다. Mock
  driver test는 `codex` 없이도 동작합니다.
- **Codex auth:** 실제 run에는 인증된 local Codex CLI session이 필요합니다.
  `doctor`가 auth failure를 보고하면 `codex login status`를 직접 확인하세요.
- **Notify hook 미관측:** `cx setup codex-session --enable-notify-hook`은
  configuration을 설치하지만, `cx session status --json`은 실제 CLI/TUI
  `turn-ended` event가 한 번 관측된 뒤에만 dispatch observed로 보고합니다.
  Desktop/app-server session은 CLI notify hook을 호출하지 않을 수 있습니다.
- **npm install path:** global npm install은 `cx`를 현재 shell `PATH` 밖에 둘 수
  있습니다. 특정 bin directory가 필요하면 `npm prefix -g`를 확인하거나
  `install.sh`에서 `CODEXUS_NPM_PREFIX` / `CODEXUS_BIN_DIR`를 지정하세요.
