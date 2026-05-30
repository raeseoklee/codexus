# Reference-First 하네스 정책

[English](../../references/01-reference-first-harness-policy.md)

상태: active

Codexus는 Codex 실행 하네스입니다. 하네스와 관련된 결정은 관련 upstream
harness가 이미 존재할 때 자체 판단을 우선하지 않습니다. 아키텍처, 런타임
동작, 오케스트레이션 정책, 메모리, 스킬, provider/auth 처리, Codex-native
adapter 동작을 바꾸기 전에 아래 필수 레퍼런스를 확인하고 매핑을 기록해야
합니다.

## 필수 레퍼런스

1. [ultraworkers/claw-code](https://github.com/ultraworkers/claw-code)
   - 역할: parity-first CLI와 하네스 동작 레퍼런스.
   - 사용 영역: CLI ergonomics, doctor/status JSON surface, permission mode,
     session state, slash command 기대 동작, tool/MCP/LSP surface,
     subagent/team surface, parity fixture 사고방식.
   - 현재 감사 메모: 2026-05-29 기준 source clone이 성공했고 HEAD
     `4d3dc5b`를 확인했습니다. `README.md`, `USAGE.md`, `PARITY.md`,
     `rust/README.md`, `rust/MOCK_PARITY_HARNESS.md`, contract docs를 active
     source baseline으로 사용합니다.
2. [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent)
   - 역할: 진화형 agent와 self-improvement 레퍼런스.
   - 사용 영역: memory, skill creation/improvement, session search,
     skill lifecycle maintenance, cron scheduling, gateways, terminal
     backends, isolated subagents, toolsets, context-file behavior.
3. [Gitlawb/openclaude](https://github.com/Gitlawb/openclaude)
   - 역할: open coding-agent runtime, provider, session architecture
     레퍼런스.
   - 사용 영역: provider profiles, Codex OAuth와 Codex CLI auth reuse, tool
     loops, slash commands, MCP integration, headless service boundaries,
     bidirectional streaming, permission requests, descriptor-first provider
     metadata, hook chains, fallback agents, multi-provider divergences.

## 의사결정 라우팅

- CLI/session parity: `ultraworkers/claw-code`에서 시작하고,
  provider/session 동작이 중요하면 OpenClaude와 비교합니다.
- Evolution loop: Hermes Agent에서 시작하고, Codexus에서는 local,
  source-linked, promotion-gated artifact로 변환합니다.
- Provider/auth/runtime boundary: OpenClaude의 Codex OAuth,
  `~/.codex/auth.json`, provider profile, descriptor metadata,
  permission-request flow를 먼저 확인합니다.
- Codex-native adapter 동작: Codexus의 thin-skill 제약에서 시작하고,
  OpenClaude terminal-first workflow와 Hermes conversation/gateway loop와
  비교합니다. Codex-native 동작이 충분하지 않은 이유를 명시하지 않는 한
  별도 chat loop를 만들지 않습니다.
- OMX interop: OMX는 Codex-side sibling reference로 사용하되, 위 세 필수
  하네스 레퍼런스를 대체하지 않습니다.

## 필수 절차

의미 있는 하네스 설계/구현 변경마다:

1. 어떤 필수 레퍼런스 경로가 적용되는지 식별합니다.
2. `git clone`, `gh repo view`, web docs, local checkout으로 최신 증거를
   확보합니다.
3. 정확한 source path, URL, commit date, 또는 접근 실패를 기록합니다.
4. Codexus 버전을 제안하기 전에 reference behavior pattern을 먼저
   추출합니다.
5. 해당 pattern을 Codexus 제약에 매핑합니다: authenticated local Codex CLI,
   durable ledger, verification gate, replay-gated skills, local auditability,
   documentation and translations.
6. Codexus가 의도적으로 다르게 가야 한다면 기록합니다:
   - `Constraint`: divergence를 강제하는 제약.
   - `Rejected`: 채택하지 않은 upstream 방식과 이유.
   - `Decision`: Codexus 동작.
   - `Risk`: 재검토가 필요할 수 있는 지점.
7. 영문 문서를 먼저 업데이트하고 필요한 `docs/ko/...` 번역도 함께 업데이트합니다.

## 구현 게이트

다음 surface를 바꾸면서 reference note나 audit update가 없으면 하네스 변경은
완료가 아닙니다.

- CLI command contract
- run/session state
- verification and repair loop
- memory, skill, replay, curator behavior
- provider/auth/session model
- permission or approval behavior
- Codex-native adapter behavior
- subagent/team orchestration
- scheduled or unattended execution

필수 source에 접근할 수 없으면 다른 프로젝트로 조용히 대체하지 않습니다.
실패를 기록하고, 마지막 문서화된 baseline은 provisional guidance로만 사용하며,
접근이 복구되면 재감사 follow-up을 남깁니다.
