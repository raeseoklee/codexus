# 운영 모델

[English](../../project-wiki/operating-model.md)

Codexus 개발은 Codexus 자체와 같은 규칙을 사용합니다. Fact는 gate할 수 있고,
judgment는 advisory이며, projection은 truth가 아닙니다.

주요 source docs:

- [Operational control invariants](../design/17-operational-control-invariants.md)
- [Harness engineering alignment](../design/13-harness-engineering-alignment.md)
- [Subagent evidence supervision](../design/09-subagent-evidence-supervision.md)
- [Quality evidence guard](../design/10-quality-evidence-guard.md)

## 핵심 규칙

- Model consensus, UI state, task label, generated summary만으로 completion을 주장하지 않습니다.
- Completion gate는 test, schema check, release check, repo check, supply-chain check,
  명시적으로 승인된 verification처럼 도출 가능한 evidence에만 둡니다.
- Experimental surface는 JSON output과 docs에서 명확히 experimental로 표시합니다.
- Generated artifact는 schema와 source link가 evidence로 만들기 전까지 projection으로 취급합니다.
- 미래 agent가 같은 dead end를 반복하지 않도록 rejected alternative를 기록합니다.

## Dogfood Workflow

Evidence가 생기는 경우 Codexus를 project-management harness로 사용합니다:

```bash
node codex/skills/codexus/scripts/cx.mjs session checkpoint "before <task>" --json
node codex/skills/codexus/scripts/cx.mjs session status --json
node codex/skills/codexus/scripts/cx.mjs session verify --verify "npm run ci" --json
```

좁은 작업에는 좁은 gate를 사용합니다:

```bash
node codex/skills/codexus/scripts/cx.mjs repo check --gate --json
node codex/skills/codexus/scripts/cx.mjs lsp check --gate --json
node codex/skills/codexus/scripts/cx.mjs release policy --gate --json
node codex/skills/codexus/scripts/cx.mjs release check --gate --json
```

## 완료 기준

작업을 닫기 전에 확인할 것:

- 변경 파일이 요청 scope와 맞습니다.
- User-facing docs가 바뀌면 영어 문서와 한국어 번역이 함께 갱신됩니다.
- 관련 evidence command가 통과합니다.
- Known gap은 숨기지 않고 보고합니다.
- Worktree 상태가 의도적입니다.

릴리스 작업에는 [릴리스 관리](release-management.md)도 적용합니다.

## Project Management LLM Wiki 사용

이 wiki는 LLM agent가 어디를 먼저 볼지 결정하게 도와야 합니다. 병렬 backlog, 두 번째
changelog, private memory store가 되면 안 됩니다. Actionable claim을 적어야 한다면 그
claim을 증명하는 source artifact를 링크하세요.
