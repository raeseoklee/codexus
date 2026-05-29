# 빠른 시작

[English](../quickstart.md)

이 문서는 첫 검증 단계에서 모델이나 네트워크 접근에 의존하지 않고 Codexus를
로컬에서 실행하는 절차를 설명합니다.

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

테스트는 mock driver를 사용하므로 Codex 모델 접근이 필요하지 않습니다.

## 3. Doctor 실행

```bash
node src/cli/main.ts doctor --json
```

`doctor`는 Node, Codex CLI, Codex auth, driver capability, optional OMX, git,
tmux, Codexus skill 설치 상태를 보고합니다.

## 4. Mock Harness Task 실행

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

## 8. Project Harness 초기화

대상 project 안에서:

```bash
cx init --with-docs --json
```

이 명령은 `.omx` state를 변경하지 않고 `.codex-harness/` directory와 config를
생성합니다.
