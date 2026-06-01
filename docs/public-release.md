# Public Release Checklist

[Korean](ko/public-release.md)

Use this checklist before changing the GitHub repository from private to
public.

## Repository Metadata

- Repository description is set.
- Topics are set for discoverability.
- README, docs index, roadmap, changelog, support, security, and contributing
  files are present.
- License is present and intentionally selected.

## Safety Review

- Run `git status --short` and confirm there are no uncommitted secrets.
- Run `rg -n "OPENAI_API_KEY|CODEX|token|secret|password|BEGIN .*PRIVATE KEY" .`
  and inspect any matches.
- Confirm `.codexus/`, logs, generated runtime artifacts, and local state
  are ignored.
- Do not publish private run ledgers or generated artifacts.

## Verification

```bash
npm run ci
npm run package:smoke
cx supply-chain check --gate --json
node src/cli/main.ts doctor --json
node src/cli/main.ts schema check --json
```

Remote GitHub Actions may depend on account or repository runner availability.
Local `npm run ci` is the canonical verification path while billing or runner
availability is blocked.

## GitHub Actions

- CI uses least-privilege read permissions.
- CI checks committed whitespace, static syntax, and tests.
- CI verifies the release lane on the current runtime and runs package smoke on
  the minimum supported runtime (`Node.js 22`) so the `engines.node >=22`
  installed-artifact promise has evidence.
- The trusted-publishing workflow pins GitHub Actions by commit SHA because it
  owns `id-token: write`.
- Public repository visibility may change Actions billing behavior; verify the
  first run after publication.

## npm Package Release Channels

The npm package is the primary install artifact.

For alpha/prerelease builds, publish through the guarded `next` helper:

```bash
npm run publish:next
```

The local fallback helper publishes with `--tag next`, then updates `latest` to
the same version and verifies `latest >= next`. The GitHub Actions trusted
publisher path uses `--no-dist-tag-sync`: it verifies the tag created by
`npm publish` itself and does not require extra `npm dist-tag add` permission.

For `0.1.0` stable, the canonical path is the GitHub Actions trusted-publishing
workflow at `.github/workflows/release.yml`, not a local npm token. Before the
stable cut:

- Configure npm trusted publishing for repository `raeseoklee/codexus` and
  workflow filename `release.yml`.
- Prove the workflow with a prerelease rehearsal, for example
  `0.1.0-alpha.7` using `workflow_dispatch` with `mode=next`.
- Confirm `npm run package:smoke` passes. This runs `npm pack`, installs the
  tarball into a temporary global prefix, checks the public bins, validates
  runtime schema assets, executes mock run/resume/cancel/status/event flows,
  and verifies the supply-chain gate.
- Push `v0.1.0` only after the manual release evidence checklist is complete.

Local stable publish remains a fallback/dev path only:

```bash
npm run publish:stable
```

The stable helper refuses non-dry-run prerelease versions; use
`npm run publish:next` for `0.1.0-alpha.*`.

Both helpers retry dist-tag reads to avoid failing on npm registry
read-after-write lag. Local fallback publishes can force `latest` and `next` to
the published version; trusted-publishing runs keep the npm trusted-publisher
permission surface to `npm publish` and only verify the tag that publish
created.

## GitHub Pages Installer

Codexus ships `install.sh` from the repository root. The script delegates to
the npm package channel (`codexus` by default), then installs the
Codex-native skill adapter unless `CODEXUS_INSTALL_CODEX_SKILL=0` is set.
Direct global npm installs perform the same adapter install through package
postinstall. Enable GitHub Pages from the `main` branch and `/` root so this
URL works:

```bash
curl -fsSL https://raeseoklee.github.io/codexus/install.sh | sh
```

The project Pages root, `https://raeseoklee.github.io/codexus/`, serves a small
static landing page from `index.html`.

On a personal Free plan, Pages may be unavailable while the repository remains
private. If GitHub returns `Your current plan does not support GitHub Pages for
this repository`, make the repository public first, then enable Pages.

API form:

```bash
gh api --method POST repos/raeseoklee/codexus/pages -f 'source[branch]=main' -f 'source[path]=/'
```

If Pages already exists, update it:

```bash
gh api --method PUT repos/raeseoklee/codexus/pages -f 'source[branch]=main' -f 'source[path]=/'
```

The root URL `https://raeseoklee.github.io/install.sh` requires a separate User
Pages repository named `raeseoklee.github.io`.

## Visibility Change

Changing a private repository to public is a significant repository-level
action. Do it only after reviewing this checklist:

```bash
gh repo edit raeseoklee/codexus --visibility public --accept-visibility-change-consequences
```

Do not run the visibility command from automation unless the maintainer has
explicitly approved it for that release.
