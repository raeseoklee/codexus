# 명칭과 런타임 포지셔닝

[English](../../design/05-naming-and-runtime-positioning.md)

## 제품명

정식 제품명:

```text
Codexus
```

포지셔닝:

```text
Codexus is a local runtime harness for Codex orchestration.
```

한국어 설명:

```text
Codexus는 Codex를 감싸 durable supervision, verification, recovery, memory,
replay-gated skills를 제공하는 로컬 런타임 하네스입니다.
```

## 카테고리

```text
Codex execution harness
```

Codexus는 모델, IDE, hosted agent를 대체하지 않습니다. Codex 실행을 감싸 상태
기록, 검증, supervision, 복구, memory/skill화를 담당하는 runtime layer입니다.
Tool/MCP expansion은 policy와 approval contract가 활성화될 때까지 gated 상태로
둡니다.

## CLI 명칭

정식 CLI:

```bash
cx
```

Long-form alias:

```bash
codexus
```

현재 구현:

- `package.json`은 `cx`와 `codexus`를 canonical public bin으로 노출합니다.
- 기존 `chx` alias는 npm으로 publish되는 public bin surface에 포함하지 않습니다.

## Storage namespace

현재 구현된 storage root:

```text
.codexus/
```

이 경로는 compatibility 때문에 유지합니다. 향후 `.codexus/`를 도입한다면 backward-compatible read가 있는 명시적 migration으로 진행해야 합니다.

## OMX와의 관계

OMX는 Codex session-native harness입니다. Codexus는 현재 외부 supervisor CLI에서 출발합니다.

목표 상태:

```text
Codexus Core
  + Codex-native session runtime: skill / AGENTS overlay / hooks / state / tmux
  + External CLI engine: cx run / verify / replay / status
```

이 구조는 Codexus의 durable supervisor 장점을 유지하면서, OMX처럼 현재 Codex session
안에서 자연스럽게 호출되는 UX를 primary product shape로 만듭니다. 외부 `cx` surface는
automation, bounded sub-run, recovery에 필수인 engine path로 남습니다.

Deferred `codex exec resume` path는 외부 multi-turn thread feature이지,
OMX-like session-native runtime이 아닙니다.

## Claw Code와의 관계

Claw Code는 CLI harness behavior의 parity pressure reference입니다. Codexus의
auth/runtime boundary reference는 아닙니다.

Codexus가 빌려야 할 것:

- 안정적인 machine-readable diagnostic/status contract
- recovery hint가 있는 typed error envelope
- 명시적인 worker/run state inspection
- permission mode와 tool-scope evidence
- deterministic mock parity fixture
- 보이지만 구현되지 않은 protocol surface의 truthful unsupported status

Codexus는 Claw의 auth model을 복사하지 않습니다. Claw는 Anthropic,
OpenAI-compatible gateway, local model server를 target할 수 있고 OpenAI Codex
session은 지원하지 않습니다. Codexus는 authenticated local Codex CLI를 감싸
durable orchestration을 추가하기 위해 존재합니다.
