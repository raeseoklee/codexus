# Release Policy

[English](../release-policy.md)

상태: active project policy

Codexus는 **작은 커밋, 더 큰 릴리즈**를 사용합니다. 구현 커밋은 작고 review 가능해야
하지만, stable version은 보통 하나의 작은 option이나 문구 변경이 아니라 일관된 product
theme 하나를 대표해야 합니다.

이 정책은 [json-contract.md](json-contract.md)의 frozen JSON contract와
[public-release.md](public-release.md)의 operational checklist를 보완합니다. 대체하지
않습니다.

## Cadence

기본 release cadence:

- Stable version을 자르기 전에 짧은 release theme를 정합니다.
- 그 theme 아래 최소 **두 개의 substantive slice**를 묶습니다.
- 긴급하지 않은 작업은 **세 개에서 다섯 개의 관련 slice**를 선호합니다.
- 개별 commit은 작고, 되돌릴 수 있고, 독립적으로 검증 가능하게 유지합니다.
- 사용자가 왜 update해야 하는지 changelog 첫 부분에서 한두 문장으로 이해할 수 있게
  씁니다.

Substantive slice는 user-visible value, executable evidence, release safety, 또는 문서화된
product boundary를 만드는 변경입니다. 단순 typo, 작은 copy edit, 아주 작은 내부 cleanup은
보통 stable version 하나를 정당화하지 않습니다.

## Hotfix Exceptions

기다리는 것이 더 위험한 경우에는 작은 patch release를 허용합니다:

- security 또는 secret-exposure fix;
- 깨진 install, publish, GitHub Release asset;
- CI/release blocker;
- stable command regression;
- 사용자가 unsafe하거나 잘못된 install command를 실행하게 만들 수 있는 문서 오류.

Hotfix release evidence는 왜 일반 bundle cadence를 의도적으로 깨는지 설명해야 합니다.

## Version Boundary

Codexus pre-1.0 versioning은 기능이 커 보이는지보다 stable JSON contract로 판단합니다.

- 현재 stable line의 patch release는 stable JSON field를 additive로만 추가할 수 있습니다.
- Experimental/deferred surface는 자기 stability를 보고하고 frozen stable contract 밖에
  머무는 경우 patch release에서 추가할 수 있습니다.
- Minor release는 experimental evidence surface를 stable contract surface로 승격하거나 이미
  frozen된 stable field를 breaking/redefine할 때 사용합니다.
- Prerelease build는 명시적 npm `next` channel에 남깁니다.
- Stable publish는 `latest`와 `next`를 모두 stable version으로 동기화합니다.
  이후 prerelease publish가 `next`를 다시 앞으로 이동할 수 있지만, `next`는
  `latest`보다 오래된 version을 가리키면 안 됩니다.

따라서 큰 experimental bundle도 frozen stable contract를 바꾸지 않으면 patch release일 수
있습니다. 반대로 작은 breaking contract change는 다음 minor release가 필요합니다.

## Release Evidence

모든 stable release는 release loop를 audit 가능하게 유지해야 합니다:

- Tag publish 전에 영문/한국어 release-evidence 문서가 존재합니다.
- Tag publish 전에 `npm run release:check`가 통과합니다.
- Tag-triggered trusted-publishing workflow가 npm publish를 수행하고 matching GitHub
  Release를 생성 또는 갱신합니다.
- Publish 후 `codexus release check --version <version> --live --gate --json`이 통과합니다.
- Post-publish install smoke가 `codexus@latest`와 release `install.sh`를 검증합니다.
- Live release sign-off는 npm `latest`를 검증하고 npm `next`가 `latest`보다
  오래되지 않았는지 확인합니다.
- Publish 후 release evidence를 bounded, redacted fact로 갱신합니다.

Raw workflow log, run ledger, private local path, token, transcript, model prompt를
커밋하지 않습니다.

## Executable Policy

이 정책은 CLI에서 명시적으로 확인할 수 있어야 합니다:

```bash
codexus release policy --json
codexus release policy --gate --json
```

`npm run release:check`는 `release:policy`를 포함하므로, policy 문서가 없으면 stable
release prep이 실패합니다. 이 gate는 문서 존재와 현재 project policy shape를 확인합니다.
Proposed changelog가 의미상 "충분히 큰지"는 판단하지 않습니다. 그 판단은 release review
결정으로 남기고 changelog와 release evidence에 기록해야 합니다.
