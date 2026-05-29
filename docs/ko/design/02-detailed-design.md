# 상세 설계

[English](../../design/02-detailed-design.md)

## CLI 계약

목표 CLI는 `cx`이며, `codexus`는 long-form alias입니다. 현재 MVP는 `chx`도 compatibility alias로 노출합니다.

주요 명령:

- `cx doctor`
- `cx run`
- `cx plan`
- `cx status`
- `cx resume`
- `cx verify`
- `cx replay`
- `cx memory search`
- `cx skill propose/review/promote/deprecate/list`
- `cx adapt omx status`

자동화에 쓰이는 명령은 `--json`을 지원해야 합니다.

## Config

우선순위:

1. CLI flags
2. project `.codex-harness/config.json`
3. user `~/.codex-harness/config.json`
4. defaults

Config는 driver, Codex command/model/sandbox/approval, verification commands, repair budget, evolution policy, OMX preference를 포함합니다.

## 저장소 레이아웃

```text
.codex-harness/
  config.json
  runs/
  memory/
  skills/
  replay/
  omx/
```

Run layout:

```text
.codex-harness/runs/<run-id>/
  input.json
  state.json
  events.jsonl
  raw/
  artifacts/
  verification.json
  experience.json
  report.md
```

## Driver 계약

Driver는 capability detection, flag mapping, raw output capture, error classification을 소유합니다. Workflow kernel은 driver-specific CLI quirk를 알면 안 됩니다.

`CodexExecDriver`는 `codex exec --json --skip-git-repo-check -C <cwd>`를 사용합니다. `--ask-for-approval`처럼 subcommand가 지원하지 않는 flag는 capability 확인 없이 전달하지 않습니다.

## Verification과 Repair

Verification command는 stdout/stderr artifact와 status를 기록합니다.

Required verification이 `passed`가 아니면 run은 `complete`가 될 수 없습니다.

MVP repair는 driver가 성공했지만 verification이 실패한 경우에만 실행됩니다. Driver failure repair는 향후 error classifier가 강화된 뒤 추가합니다.

## Codex-native adapter

외부 CLI가 MVP입니다. 향후 adapter는 Codex interactive session 안에서 Codexus core를 호출해야 합니다.

요구사항:

- `cx`와 같은 core runtime 사용
- `.codex-harness` ledger/memory/skill store 공유
- workflow kernel 중복 구현 금지
- status, memory search, skill review, supervised run handoff부터 시작
