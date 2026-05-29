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
- Confirm `.codex-harness/`, `.omx/`, logs, and local state are ignored.
- Do not publish private run ledgers or generated artifacts.

## Verification

```bash
npm run ci
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

## Visibility Change

Changing a private repository to public is a significant repository-level
action. Do it only after reviewing this checklist:

```bash
gh repo edit raeseoklee/codexus --visibility public --accept-visibility-change-consequences
```

Do not run the visibility command from automation unless the maintainer has
explicitly approved it for that release.
