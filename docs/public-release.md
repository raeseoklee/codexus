# Public Release Checklist

[한국어](ko/public-release.md)

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
node src/cli/main.ts doctor --json
node src/cli/main.ts schema check --json
```

Remote GitHub Actions may depend on account or repository runner availability.
Local `npm run ci` is the canonical verification path while billing or runner
availability is blocked.

## GitHub Actions

- CI uses least-privilege read permissions.
- CI checks committed whitespace, static syntax, and tests.
- Public repository visibility may change Actions billing behavior; verify the
  first run after publication.

## npm Alpha Package

The npm package is the primary install artifact. Before publishing:

- Confirm `package.json` is on the intended prerelease version, for example
  `0.1.0-alpha.0`.
- Confirm `npm run package:smoke` passes. This runs `npm pack`, installs the
  tarball into a temporary global prefix, checks the public bins, validates
  runtime schema assets, and executes a mock run.
- Publish the first release with a prerelease tag:

```bash
npm publish --tag next
```

Do not publish the first public package with the `latest` tag.

## GitHub Pages Installer

Codexus ships `install.sh` from the repository root. The script delegates to
the npm package channel (`codexus@next` by default), then installs the
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
