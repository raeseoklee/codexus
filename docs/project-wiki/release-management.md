# Release Management

[Korean](../ko/project-wiki/release-management.md)

Use this page to orient release work. The canonical policy remains
[Release policy](../release-policy.md), [JSON contract](../json-contract.md),
[Public release checklist](../public-release.md), and release evidence files.

## Version Policy

- The current stable line keeps stable JSON contract fields frozen.
- Additive stable fields are allowed in patch releases.
- Experimental surfaces may be added in patch releases without freezing their
  JSON contract.
- Minor releases are the promotion point for turning experimental evidence
  surfaces into stable contract surfaces, or for making breaking
  stable-contract changes.

Release scope should be thematic. Small commits are good, but versions should
bundle enough related work to be understandable.

## Pre-Release Checklist

Before a stable tag:

1. Confirm `package.json`, package lock, changelog, docs, and release evidence
   refer to the intended version.
2. Run the source and package gates.
3. Run `cx release check --gate --json`; it must prove installer default
   channel, expected-version guard, non-destructive help handling, workflow
   wiring, and release-evidence docs before tag publish.
4. Confirm docs, README links, release policy, and release evidence have been
   refreshed before the release commit.
5. Push the release commit and confirm GitHub CI is green.
6. Push the version tag to trigger trusted publishing.

Useful commands:

```bash
npm run ci
npm run package:smoke
node codex/skills/codexus/scripts/cx.mjs release policy --gate --json
node codex/skills/codexus/scripts/cx.mjs release check --gate --json
```

## Post-Publish Evidence

After publish, record evidence under `docs/release-evidence/<version>.md` and
the Korean counterpart:

- npm version and dist-tags,
- npm `latest` matching the release version; `next` is prerelease-only and is
  recorded as informational when present,
- GitHub Release and `install.sh` asset,
- trusted-publishing provenance,
- installed `cx --version`,
- installer smoke with `CODEXUS_EXPECTED_VERSION`,
- release `install.sh --help` smoke proving the help path has no install side
  effects,
- any known not-tested items.

Do not commit raw logs that may contain local paths, tokens, or unrelated
environment details. Use redacted summaries.

## Authority

Release notes and wiki pages are not release gates. The release gate is the
combination of package metadata, workflows, tests, release checks, and
post-publish evidence.
