# 아키텍처

[English](../../design/01-architecture.md)

## 목적

Codexus는 OpenAI Codex를 위한 로컬 진화형 runtime harness입니다. Codex를 대체하지 않고, Codex 실행을 감독하며 durable state, verification, recovery, memory, skill promotion을 제공합니다.

MVP는 CLI-first입니다. 안정적인 driver는 `codex exec --json`이며, app-server와 Codex-native adapter는 capability-gated future surface입니다.

## 레퍼런스 거버넌스

하네스 아키텍처는 reference-first입니다. 핵심 하네스 동작을 변경하기 전에
필수 upstream reference를 확인하고, 그 매핑을
[레퍼런스 거버넌스](../references/README.md)에 맞춰 기록해야 합니다.

필수 레퍼런스:

- [raeseoklee/claw-code](https://github.com/raeseoklee/claw-code): parity-first
  CLI와 하네스 동작.
- [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent):
  evolutionary memory, skills, cron, gateways, terminal backends, isolated
  subagents.
- [Gitlawb/openclaude](https://github.com/Gitlawb/openclaude): provider
  profiles, Codex auth reuse, tool loops, permissions, headless service
  boundary, descriptor-first integration architecture.

Codexus가 reference와 의도적으로 다르게 가야 한다면 constraint, rejected
upstream path, Codexus decision, residual risk를 설계 노트에 기록합니다.

## 시스템 경계

포함:

- 로컬 CLI 오케스트레이션
- Codex run supervision
- durable run ledger
- verification gate
- repair loop
- memory/skill proposal
- proposed skill replay
- 선택적 OMX interop

제외:

- 비공개 ChatGPT/Codex backend 직접 호출
- Codex tool execution 내부 대체
- OMX 대체
- 사용자/project skill store의 무통제 mutation
- hosted multi-tenant service

## 런타임 표면

현재 구현된 external CLI runtime:

```text
User -> cx/codexus -> Codexus core -> codex exec --json -> Codex
```

계획된 Codex-native adapter:

```text
Codex interactive session -> Codexus adapter -> Codexus core
```

Codex-native adapter는 OMX처럼 Codex 세션 안에서 호출되는 UX를 목표로 하지만, 핵심 로직은 외부 CLI와 동일한 core runtime을 사용해야 합니다.

## 주요 컴포넌트

- CLI: operator surface이며 `--json`을 제공합니다.
- Workflow kernel: phase transition과 terminal outcome을 관리합니다.
- Drivers: Codex CLI/app-server/mock runtime을 adapter로 감쌉니다.
- Run ledger: 발생한 일을 disk에 append-oriented 방식으로 기록합니다.
- Verification gate: 완료 주장 전에 검증 결과를 평가합니다.
- Evolution engine: experience, memory, skill proposal을 생성합니다.
- OMX adapter: OMX feature/status를 읽고 선택적 plan export를 제공합니다.

## 신뢰성 전략

- raw Codex JSONL을 먼저 보존합니다.
- state는 atomic write로 갱신합니다.
- events는 append-only로 유지합니다.
- process death 이후에도 `cx status`로 재구성 가능해야 합니다.
- replay와 mock driver로 핵심 상태 전이를 테스트합니다.
