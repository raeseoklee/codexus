# Codexus 기여 가이드

[English](../../../CONTRIBUTING.md)

Codexus 개선에 기여해 주셔서 감사합니다. 이 프로젝트는 아직 early Codex execution
harness이므로, 안정적인 local CLI path를 보존하고 experimental surface는 계속
gate 뒤에 두는 방향을 유지해야 합니다.

## 기본 원칙

- Codex를 execution engine으로 유지합니다. Private ChatGPT/Codex backend API
  호출을 추가하지 않습니다.
- app-server, cron, gateway, model-replay 실험을 하더라도 안정적인
  `codex exec --json` path를 보존합니다.
- local, auditable file과 deterministic test를 선호합니다.
- 영문 문서를 기본으로 작성하고 user-facing 문서에는 필요한 한국어 번역을 추가합니다.
- runtime dependency는 design need가 명확하고 문서화된 경우에만 추가합니다.

## Development Setup

```bash
git clone https://github.com/raeseoklee/codexus.git
cd codexus
npm run ci
```

유용한 명령:

```bash
npm run typecheck
npm test
node src/cli/main.ts doctor --json
node src/cli/main.ts run --driver mock --json "hello"
```

## Pull Request Checklist

- 변경 범위가 명확하고 문서화되어 있습니다.
- `npm run ci`가 local에서 통과합니다.
- 새 동작에는 focused test가 있습니다.
- user-facing 문서를 바꾸면 영문 문서를 먼저 갱신하고 필요한 한국어 번역도 함께 갱신합니다.
- CLI JSON output은 machine-parseable 상태를 유지합니다.
- experimental live behavior는 feature-gated이며 dry-run path를 가집니다.

## Commit Message

왜 변경했는지를 첫 줄에 적고, 필요한 경우 trailer로 의사결정 맥락을 남깁니다.

```text
Make schema artifacts enforceable without new dependencies

Schema artifacts were previously checked mostly for presence and metadata.

Constraint: No new dependencies without explicit request
Rejected: Add Ajv/full JSON Schema engine | violates current dependency policy
Confidence: high
Scope-risk: moderate
Tested: npm run ci
```

## Issue Reporting

Bug/feature request template을 사용해 주세요. Command output, Node version,
Codex CLI version, mock driver 재현 여부를 포함하면 좋습니다.
