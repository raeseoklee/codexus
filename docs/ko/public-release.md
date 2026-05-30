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
- `.codexus/`, log, generated runtime artifact, local state가 ignore되는지
  확인합니다.
- private run ledger나 generated artifact를 공개하지 않습니다.

## Verification

```bash
npm run ci
npm run package:smoke
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

## npm Alpha Package

npm package가 기본 설치 artifact입니다. Publish 전에 다음을 확인합니다:

- `package.json`이 의도한 prerelease version인지 확인합니다. 예:
  `0.1.0-alpha.0`.
- `npm run package:smoke`가 통과하는지 확인합니다. 이 command는 `npm pack`,
  임시 global prefix install, public bin 확인, runtime schema asset 검증, mock
  run을 실행합니다.
- `next`와 `latest`가 어긋나지 않도록 guarded helper로 publish합니다:

```bash
npm run publish:next
```

이 helper는 `--tag next`로 publish한 뒤 `latest`를 같은 version으로 갱신하고
`latest >= next`를 검증합니다.

## GitHub Pages Installer

Codexus는 repository root의 `install.sh`를 제공합니다. 이 script는 npm package
channel(`codexus@next` 기본값)에 위임한 뒤 `CODEXUS_INSTALL_CODEX_SKILL=0`이
아니면 Codex-native skill adapter를 설치합니다. Direct global npm install도 package
postinstall을 통해 같은 adapter install을 수행합니다. 다음 URL이 동작하도록 GitHub
Pages source를 `main` branch와 `/` root로 활성화합니다:

```bash
curl -fsSL https://raeseoklee.github.io/codexus/install.sh | sh
```

Project Pages root인 `https://raeseoklee.github.io/codexus/`는 `index.html`의
작은 static landing page를 제공합니다.

Personal Free plan에서는 repository가 private인 동안 Pages가 비활성일 수
있습니다. GitHub가 `Your current plan does not support GitHub Pages for this
repository`를 반환하면 repository를 public으로 바꾼 뒤 Pages를 활성화합니다.

API form:

```bash
gh api --method POST repos/raeseoklee/codexus/pages -f 'source[branch]=main' -f 'source[path]=/'
```

Pages가 이미 있으면 update합니다:

```bash
gh api --method PUT repos/raeseoklee/codexus/pages -f 'source[branch]=main' -f 'source[path]=/'
```

Root URL인 `https://raeseoklee.github.io/install.sh`는 `raeseoklee.github.io`
이름의 별도 User Pages repository가 필요합니다.

## Visibility Change

Private repository를 public으로 바꾸는 것은 중요한 repository-level action입니다.
이 checklist를 검토한 뒤에만 실행합니다:

```bash
gh repo edit raeseoklee/codexus --visibility public --accept-visibility-change-consequences
```

Maintainer가 해당 release에 명시적으로 승인하지 않았다면 automation에서 visibility
명령을 실행하지 않습니다.
