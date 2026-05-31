# 아키텍처

[English](../../design/01-architecture.md)

## 목적

Codexus는 OpenAI Codex를 위한 로컬 진화형 runtime harness입니다. Codex를 대체하지 않고, Codex 실행을 감독하며 durable state, verification, recovery, memory, skill promotion을 제공합니다.

Architecture는 core-first를 유지합니다. 같은 Codexus core가 외부 `cx` CLI와
interactive Codex session 안에서 모두 호출 가능해야 합니다. 안정적인 driver는
`codex exec --json`입니다. 제품 방향은 얇은 `$codexus` skill, Codexus guidance
overlay, local session state, optional hook/status/tmux integration을 조합한
Codex-native session runtime입니다. Codex app-server integration은
capability detection과 explicit gate 뒤의 experimental surface로 유지합니다.

## 레퍼런스 거버넌스

하네스 아키텍처는 reference-first입니다. 핵심 하네스 동작을 변경하기 전에
필수 upstream reference를 확인하고, 그 매핑을
[레퍼런스 거버넌스](../references/README.md)에 맞춰 기록해야 합니다.

필수 레퍼런스:

- [ultraworkers/claw-code](https://github.com/ultraworkers/claw-code): parity-first
  CLI와 하네스 동작.
- [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent):
  evolutionary memory, skills, cron, gateways, terminal backends, isolated
  subagents.
- [Gitlawb/openclaude](https://github.com/Gitlawb/openclaude): provider
  profiles, Codex auth reuse, tool loops, permissions, headless service
  boundary, descriptor-first integration architecture.

Codexus가 reference와 의도적으로 다르게 가야 한다면 constraint, rejected
upstream path, Codexus decision, residual risk를 설계 노트에 기록합니다.

## 레퍼런스 기반 아키텍처 압력

수정된 2026-05-29 Claw audit 결과, 다음 요구사항은 선택사항이 아닙니다.

- `cx doctor`, `cx status`, `cx verify`, `cx replay`와 향후 diagnostic
  command는 안정적인 JSON output을 유지해야 합니다. 자동화는 human prose에
  의존하면 안 됩니다.
- run identity, selected driver/model, permission 또는 approval posture, tool
  scope, verification status, terminal outcome은 ledger fact여야 합니다.
- team, cron, daemon, remote execution을 키우기 전에 permission check, denial,
  approval prompt, policy block은 typed event가 되어야 합니다.
- replay는 Claw-style parity fixture 방향으로 확장해야 합니다: tool success,
  tool denial, permission prompt, multi-step turn, plugin/skill path,
  compaction/large-output behavior, usage accounting.
- app-server나 daemon-like experimental surface는 truthful capability/status
  envelope를 노출해야 합니다. command 존재만으로 protocol support를 추론하지
  않습니다.

Codexus는 auth/runtime boundary에서 Claw와 의도적으로 다릅니다. Claw는 Codex
CLI session이나 Codex session import/export를 지원하지 않지만, Codexus는
authenticated local Codex CLI를 감싸는 하네스입니다.

## 시스템 경계

포함:

- 로컬 CLI 오케스트레이션
- Codex run supervision
- durable run ledger
- verification gate
- repair loop
- memory/skill proposal
- proposed skill replay

제외:

- 비공개 ChatGPT/Codex backend 직접 호출
- Codex tool execution 내부 대체
- 사용자/project skill store의 무통제 mutation
- hosted multi-tenant service

## 런타임 표면

Codexus에는 두 product runtime surface와 하나의 deferred advanced surface가 있습니다.

목표 primary UX인 Codex-native session runtime:

```text
Codex TUI session
  -> codexus / $codexus skill
  -> Codexus core
  -> shared ledger / memory / skills / session state
```

이 mode는 실행 중인 Codex session 안에서 Codexus가 자연스럽게 호출되게 해야
합니다. private backend가 아니라 skill, marker-bounded AGENTS overlay, local state,
optional hook/statusline integration, optional tmux worker 같은 installable Codex
surface를 사용합니다. Codex가 지원되는 transcript API를 제공하지 않는 한 Codexus는 TUI
transcript를 투명하게 캡처한다고 주장하면 안 됩니다.

현재 구현된 external CLI runtime:

```text
User -> cx/codexus -> Codexus core -> codex exec --json -> Codex
```

Deferred advanced surface인 external exec-resume session:

```text
cx thread start/continue -> codex exec resume <thread-id>
```

이는 별도 non-interactive Codex thread 위의 multi-turn continuity를 제공할 수 있지만
session-native path가 아니며 primary session story가 되어서는 안 됩니다. `cx session`
namespace는 현재 session state/checkpoint/verification command 전용으로 유지합니다.

## 주요 컴포넌트

- CLI: operator surface이며 `--json`을 제공합니다.
- Workflow kernel: phase transition과 terminal outcome을 관리합니다.
- Drivers: Codex CLI/app-server/mock runtime을 adapter로 감쌉니다.
- Run ledger: 발생한 일을 disk에 append-oriented 방식으로 기록합니다.
- Verification gate: 완료 주장 전에 검증 결과를 평가합니다.
- Evolution engine: experience, memory, skill proposal을 생성합니다.

## 신뢰성 전략

- raw Codex JSONL을 먼저 보존합니다.
- state는 atomic write로 갱신합니다.
- events는 append-only로 유지합니다.
- structured event가 있으면 pane text, raw driver log, final prose는 supporting
  evidence로만 취급합니다.
- process death 이후에도 `cx status`로 재구성 가능해야 합니다.
- replay와 mock driver로 핵심 상태 전이를 테스트합니다.
