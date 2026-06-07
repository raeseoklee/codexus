# 릴리스 관리

[English](../../project-wiki/release-management.md)

릴리스 작업의 빠른 orientation 문서입니다. Canonical policy는
[Release policy](../release-policy.md), [JSON contract](../json-contract.md),
[Public release checklist](../public-release.md), release evidence file입니다.

## Version Policy

- `0.1.x`는 stable JSON contract field를 frozen 상태로 유지합니다.
- Additive stable field는 `0.1.x`에서 허용됩니다.
- Experimental surface는 JSON contract를 freeze하지 않고 `0.1.x`에 추가될 수 있습니다.
- `0.2.0`은 experimental evidence surface를 stable contract surface로 승격하거나 stable
  contract breaking change를 만들 때 사용하는 promotion point입니다.

Release scope는 thematic해야 합니다. Commit은 작게 유지하되, version은 이해 가능한
관련 작업 묶음이어야 합니다.

## Pre-Release Checklist

Stable tag 전:

1. `package.json`, package lock, changelog, docs, release evidence가 의도한 version을
   가리키는지 확인합니다.
2. Source gate와 package gate를 실행합니다.
3. `cx release check --gate --json`을 실행합니다.
4. Release commit을 push하고 GitHub CI green을 확인합니다.
5. Version tag를 push해 trusted publishing을 trigger합니다.

자주 쓰는 명령:

```bash
npm run ci
npm run package:smoke
node codex/skills/codexus/scripts/cx.mjs release policy --gate --json
node codex/skills/codexus/scripts/cx.mjs release check --gate --json
```

## Post-Publish Evidence

Publish 후 `docs/release-evidence/<version>.md`와 한국어 counterpart에 evidence를
기록합니다:

- npm version과 dist-tags,
- GitHub Release와 `install.sh` asset,
- trusted-publishing provenance,
- installed `cx --version`,
- `CODEXUS_EXPECTED_VERSION`을 사용한 installer smoke,
- known not-tested items.

Token, local path, unrelated environment detail이 들어갈 수 있는 raw log는 commit하지
마세요. Redacted summary를 사용합니다.

## 권위

Release note와 wiki page는 release gate가 아닙니다. Release gate는 package metadata,
workflow, test, release check, post-publish evidence의 조합입니다.
