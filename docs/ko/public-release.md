# Public Release Checklist

[English](../public-release.md)

GitHub repository를 private에서 public으로 변경하기 전에 이 checklist를 사용합니다.

## Repository Metadata

- Repository description이 설정되어 있습니다.
- Discoverability를 위한 topic이 설정되어 있습니다.
- README, docs index, roadmap, changelog, support, security, contributing 파일이
  존재합니다.
- License가 존재하고 의도적으로 선택되었습니다.

## Safety Review

- `git status --short`를 실행해 uncommitted secret이 없는지 확인합니다.
- `rg -n "OPENAI_API_KEY|CODEX|token|secret|password|BEGIN .*PRIVATE KEY" .`를
  실행하고 match를 검토합니다.
- `.codex-harness/`, `.omx/`, log, local state가 ignore되는지 확인합니다.
- private run ledger나 generated artifact를 공개하지 않습니다.

## Verification

```bash
npm run ci
node src/cli/main.ts doctor --json
node src/cli/main.ts schema check --json
```

Remote GitHub Actions는 account/repository runner availability에 의존할 수
있습니다. billing 또는 runner availability가 막힌 동안에는 local `npm run ci`를
canonical verification path로 둡니다.

## GitHub Actions

- CI는 least-privilege read permission을 사용합니다.
- CI는 committed whitespace, static syntax, test를 확인합니다.
- Public repository visibility는 Actions billing behavior를 바꿀 수 있으므로
  공개 후 첫 run을 확인합니다.

## Visibility Change

Private repository를 public으로 바꾸는 것은 중요한 repository-level action입니다.
이 checklist를 검토한 뒤에만 실행합니다:

```bash
gh repo edit raeseoklee/codexus --visibility public --accept-visibility-change-consequences
```

Maintainer가 해당 release에 명시적으로 승인하지 않았다면 automation에서 visibility
명령을 실행하지 않습니다.
