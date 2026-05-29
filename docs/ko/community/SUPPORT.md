# Support

[English](../../../SUPPORT.md)

Codexus는 early open-source harness입니다. 가장 좋은 support path는 재현 가능한
local context를 포함한 GitHub issue입니다.

## 문의 위치

- Bug: bug report issue template 사용
- Feature request: feature request template 사용
- Security issue: [SECURITY.md](../../../SECURITY.md) 참고
- Design question: `docs/` 아래 문서 먼저 확인

## 유용한 진단 정보

다음 output을 첨부하면 좋습니다:

```bash
node src/cli/main.ts doctor --json
npm run typecheck
npm test
```

특정 run과 관련된 문제라면:

```bash
node src/cli/main.ts status <run-id> --json
node src/cli/main.ts events tail <run-id> --json
node src/cli/main.ts schema validate-run <run-id> --json
```

공유 전에 output을 검토하세요. Codexus ledger에는 prompt, command output, path,
project-specific context가 포함될 수 있습니다.
