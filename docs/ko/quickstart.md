# 빠른 시작

[English](../quickstart.md)

이 문서는 Codexus를 로컬에서 실행하는 절차를 설명합니다. 첫 검증 단계는 모델이나
네트워크 접근에 의존하지 않고, 이후 실제 Codex 실행을 다룹니다.

## Install Script

Repository가 public이고 GitHub Pages source가 `main` `/`로 활성화되면 installer
URL은 다음과 같습니다:

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

- `CODEXUS_REF`: 설치할 branch 또는 tag, 기본값 `main`
- `CODEXUS_INSTALL_DIR`: install directory, 기본값 `~/.local/share/codexus`
- `CODEXUS_BIN_DIR`: `cx`, `codexus`, `chx`를 둘 bin directory, 기본값 `~/.local/bin`
- `CODEXUS_INSTALL_CODEX_SKILL=0`: Codex skill adapter 설치 생략

## 1. Clone

```bash
git clone https://github.com/raeseoklee/codexus.git
cd codexus
```

## 2. 로컬 도구 검증

Codexus는 현재 Node.js 26 이상이 필요합니다.

```bash
node --version
npm run ci
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

명령은 `.codex-harness/runs/<run-id>/` 아래 run ledger를 기록합니다.

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

`chx`는 temporary compatibility alias로 남아 있습니다.

## 6. 실제 Codex 실행 사용

먼저 local Codex CLI를 설치하고 인증합니다. 그 다음 실행합니다:

```bash
cx run --driver codex-exec --json "Reply exactly CODEXUS-OK"
```

프로젝트 작업에는 verification을 붙입니다:

```bash
cx run --verify "npm test" "fix the failing parser tests"
```

## 7. Codex-Native Adapter 설치

```bash
npm run install:codex-skill
```

installer는 `codexus` skill을 `${CODEX_HOME:-~/.codex}/skills`에 기록합니다.
interactive Codex session 안에서 Codexus status, replay, memory, schema, context
evidence가 필요할 때 사용합니다.

Codex 안에서는 명시적으로 요청합니다:

```text
codexus로 schema check 실행하고 결과를 요약해줘.
```

```text
$codexus status <run-id> --json 확인해줘.
```

더 많은 예시는 [Codex 안에서 Codexus 사용하기](codex-session-usage.md)를 참고하세요.

## 8. Project Harness 초기화

대상 project 안에서:

```bash
cx init --with-docs --json
```

이 명령은 관련 없는 tool state를 변경하지 않고 `.codex-harness/` directory와
config를 생성합니다.
