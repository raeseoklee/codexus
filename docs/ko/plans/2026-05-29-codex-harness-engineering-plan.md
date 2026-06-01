# Codexus 엔지니어링 계획

[English](../../plans/2026-05-29-codex-harness-engineering-plan.md)

날짜: 2026-05-29

## 목표

Codexus는 OpenAI Codex를 모델/실행 엔진으로 유지하면서 그 바깥에 오케스트레이션, 상태 관리, 검증, 복구, 메모리, 스킬 승격을 제공하는 진화형 실행 하네스입니다. Codexus는 다른 harness runtime에 기대지 않는 독립 runtime layer로 출발합니다.

## 핵심 제약

- 비공개 ChatGPT/Codex backend API를 직접 호출하지 않습니다.
- MVP의 안정적인 모델 접근 경계는 로컬 인증된 `codex` CLI입니다.
- `codex app-server`는 capability detection 뒤에 둔 실험적 driver로 유지합니다.
- 하네스 설계는
  [reference-first 하네스 정책](../references/01-reference-first-harness-policy.md)을
  따릅니다. 필수 레퍼런스는 `ultraworkers/claw-code`,
  `NousResearch/hermes-agent`, `Gitlawb/openclaude`입니다.
- `ultraworkers/claw-code`는 CLI/harness parity의 필수 기준입니다. 수정된
  2026-05-29 audit에서는 source를 clone하고 HEAD `4d3dc5b`를 확인했습니다.
  핵심 pattern은 `rust/` 아래 canonical Rust CLI, `doctor/status/sandbox/version
  --output-format json`, structured `init`/`state` output, permission mode와
  `--allowedTools`, broad slash/direct command surface, deterministic mock parity
  harness, explicit event/report contract, ACP/Zed/JSON-RPC surface의 truthful
  unsupported status입니다.
- Hermes Agent는 memory, skill creation/improvement, session search, cron,
  gateways, terminal backends, isolated subagents의 기준입니다.
- OpenClaude는 provider profiles, Codex OAuth, `~/.codex/auth.json` reuse,
  terminal-first tool loop, MCP/slash commands, permission requests, headless
  gRPC streaming, descriptor-first provider metadata의 기준입니다.
- self-improvement는 명시적이고 검토 가능하며 되돌릴 수 있어야 합니다.
- 모든 mutating workflow는 resumable state, terminal outcome, verification evidence를 남겨야 합니다.

## 제품/CLI 명칭

- 제품명: `Codexus`
- 목표 CLI: `cx`
- long-form alias: `codexus`
- Public npm bin: `cx`, `codexus`

구현 package/bin rename은 public npm surface 기준으로 완료되었습니다. `cx`와
`codexus`가 canonical public bin입니다.

## 제안 시스템

1. CLI와 config
   - `cx doctor`, `cx run`, `cx cancel`, `cx plan`, `cx verify`, `cx resume`, `cx status`, `cx replay`.
   - 프로젝트 config, 사용자 config, CLI flag를 merge합니다.
   - 자동화 가능한 명령은 `--json`을 지원합니다.

2. Driver abstraction
   - `CodexExecDriver`: `codex exec --json`을 실행하고 raw JSONL/stderr를 보존합니다.
   - `CodexAppServerDriver`: app-server JSON-RPC 실험 경로입니다.
   - `MockDriver`: 테스트와 replay를 위한 deterministic driver입니다.

3. Run ledger
   - `.codexus/runs/<run-id>/` 아래에 `input.json`, `state.json`, `events.jsonl`, `artifacts/`, `verification.json`, `experience.json`, `report.md`를 저장합니다.

4. Workflow kernel
   - 실행, 검증, repair, terminal outcome을 관리합니다.
   - 모델의 최종 prose만으로 완료를 신뢰하지 않습니다.

5. Codex-native adapter
   - 향후 Codex 세션 안에서 Codexus를 호출할 수 있게 합니다.
   - 같은 core runtime과 `.codexus` state를 재사용합니다.

6. Evolution engine
   - 완료된 run에서 experience, memory, skill proposal을 생성합니다.
   - skill promotion은 evidence와 replay gate를 통과해야 합니다.

## MVP acceptance

- `cx doctor --json`이 Codex auth/version, git, tmux, feature availability를 보고합니다.
- `cx run`이 Codex 또는 mock driver를 감독하고 ledger를 씁니다.
- required verification이 실패하면 `complete`가 될 수 없습니다.
- verification failure는 bounded repair loop로 복구할 수 있습니다.
- `cx status --json`은 live process 없이 disk에서 상태를 재구성합니다.
- Optional interop status command는 external harness state를 변경하지 않습니다.
- proposed skill은 scope, trigger, safety, evidence, replay 없이는 승격되지 않습니다.
