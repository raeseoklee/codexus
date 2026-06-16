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
cx supply-chain check --gate --json
cx release policy --gate --json
cx release check --gate --json
node src/cli/main.ts doctor --json
node src/cli/main.ts schema check --json
```

Remote GitHub Actions는 account/repository runner availability에 의존할 수
있습니다. billing 또는 runner availability가 막힌 동안에는 local `npm run ci`를
canonical verification path로 둡니다.

## Release Cadence Policy

Stable cut을 결정하기 전에 [릴리즈 정책](release-policy.md)을 사용합니다. Codexus는
작고 review 가능한 commit을 유지하되, stable release는 더 큰 theme 단위로 묶습니다.
일반 stable version은 하나의 visible theme 아래 최소 두 개의 substantive slice,
가능하면 세 개에서 다섯 개의 관련 slice를 포함해야 합니다.

Security/secret exposure, 깨진 install 또는 publish asset, CI/release blocker,
stable command regression, 사용자가 unsafe하거나 잘못된 command를 실행하게 만들 수
있는 문서 오류는 더 작은 hotfix로 낼 수 있습니다. Hotfix evidence는 왜 일반 cadence를
의도적으로 우회했는지 설명해야 합니다.

Cadence policy는 실행 가능합니다:

```bash
cx release policy --gate --json
```

`npm run release:check`는 이 gate를 포함합니다. 이 gate는 release policy가 영문/한국어로
문서화되어 있고 현재 policy shape가 CLI에서 보이는지 확인합니다. Proposed changelog가
의미상 "충분히 큰지"를 자동 판단하지는 않습니다.

## GitHub Actions

- CI는 least-privilege read permission을 사용합니다.
- CI는 committed whitespace, static syntax, test를 확인합니다.
- CI는 현재 runtime에서 release lane을 검증하고, 최소 지원 runtime(`Node.js 22`)에서
  package smoke를 실행해 `engines.node >=22` 설치본 약속에 증거를 둡니다.
- trusted-publishing workflow는 `id-token: write`를 가지므로 GitHub Actions를 commit
  SHA로 pin합니다.
- Stable tag release는 별도 job에서 `contents: write`로 matching GitHub Release를
  생성/갱신합니다. npm publish job은 `contents: read`와 `id-token: write`만 유지합니다.
- Public repository visibility는 Actions billing behavior를 바꿀 수 있으므로
  공개 후 첫 run을 확인합니다.

## npm Package Release Channel

npm package가 기본 설치 artifact입니다.

alpha/prerelease build는 guarded `next` helper로 publish합니다:

```bash
npm run publish:next
```

로컬 fallback helper는 `--tag next`로 publish한 뒤 `latest`를 같은 version으로
갱신하고 `latest >= next`를 검증합니다. GitHub Actions trusted publisher 경로는
`--no-dist-tag-sync`를 사용합니다. 이 경로는 `npm publish` 자체가 만든 tag만
검증하고, 별도 `npm dist-tag add` 권한을 요구하지 않습니다.

Stable release의 canonical path는 local npm token이 아니라
`.github/workflows/release.yml`의 GitHub Actions trusted-publishing workflow입니다.
각 stable cut 전에 다음을 확인합니다:

- npm trusted publishing이 repository `raeseoklee/codexus`, workflow filename
  `release.yml`을 가리키도록 설정.
- workflow나 publish 배선이 바뀐 경우 `workflow_dispatch mode=next`로
  `0.1.0-alpha.7` 같은 prerelease rehearsal을 수행해 workflow publish를 증명.
- `npm run package:smoke` 통과. 이 command는 `npm pack`, 임시 global prefix install,
  public bin 확인, runtime schema asset 검증, mock run/resume/cancel/status/event
  flow, supply-chain gate를 실행합니다.
- release evidence checklist가 완료되고 release commit의 `main` CI가 green인 경우에만
  `v<version>` tag를 push.
- tag-triggered workflow가 `v<version>` GitHub Release를 만들고 `install.sh`를
  첨부했는지 확인합니다. GitHub `/releases/latest` route는 npm `latest`와 같은 stable
  version을 가리켜야 합니다.
- tag-triggered workflow가 완료된 뒤 source checkout에서
  `cx release check --version <version> --live --gate --json`을 실행해 npm `latest`,
  GitHub latest, GitHub Release의 `install.sh` asset hash가 checked-in installer와
  일치하는지 확인합니다. 이 live sign-off는 npm `next`가 `latest`보다 오래되지
  않았는지도 검증합니다. `next`가 뒤처져 있으면 release 완료 선언 전에 인증된
  maintainer가 `npm dist-tag add codexus@<version> next`를 실행해야 합니다. Live JSON
  output의 `releaseIntegrity.npm.nextDistTagAction`은 이 maintainer step이 충족됐는지
  또는 아직 필요한지를 보여주는 bounded action summary입니다.

Local stable publish는 fallback/dev path로만 사용합니다:

```bash
npm run publish:stable
```

stable helper는 non-dry-run prerelease version을 거부합니다. Prerelease build는
`npm run publish:next`를 사용합니다.

두 helper 모두 npm registry read-after-write lag를 고려해 dist-tag read를 retry합니다.
로컬 fallback publish는 `latest`와 `next`를 published version으로 강제 정렬할 수
있고, trusted-publishing run은 npm trusted-publisher 권한 표면을 `npm publish`로
좁힌 뒤 `next >= latest` enforcement를 post-publish live sign-off에 맡깁니다.

## GitHub Pages Installer

Codexus는 repository root의 `install.sh`를 제공합니다. 이 script는 npm package
channel(`codexus` 기본값)에 위임한 뒤 `CODEXUS_INSTALL_CODEX_SKILL=0`이
아니면 Codex-native skill adapter를 설치합니다. Direct global npm install도 package
postinstall을 통해 같은 adapter install을 수행합니다. GitHub Pages는 workflow
mode로 활성화해 `.github/workflows/pages.yml`이 pinned action과 Node 24 JavaScript
action opt-in으로 deploy path를 소유하게 합니다:

```bash
curl -fsSL https://raeseoklee.github.io/codexus/install.sh | sh
```

Stable GitHub Release도 같은 `install.sh`를 asset으로 첨부하므로 이 route는 최신 GitHub
Release를 따라갑니다:

```bash
curl -fsSL https://github.com/raeseoklee/codexus/releases/latest/download/install.sh | sh
```

Project Pages root인 `https://raeseoklee.github.io/codexus/`는 `index.html`의
작은 static landing page를 제공합니다.

Personal Free plan에서는 repository가 private인 동안 Pages가 비활성일 수
있습니다. GitHub가 `Your current plan does not support GitHub Pages for this
repository`를 반환하면 repository를 public으로 바꾼 뒤 Pages를 활성화합니다.

Pages를 workflow mode로 생성합니다:

```bash
gh api --method POST repos/raeseoklee/codexus/pages -f build_type=workflow
```

Pages가 이미 있으면 legacy branch deployer에서 workflow mode로 전환합니다:

```bash
gh api --method PUT repos/raeseoklee/codexus/pages -f build_type=workflow
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
