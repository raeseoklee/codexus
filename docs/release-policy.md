# Release Policy

[Korean](ko/release-policy.md)

Status: active project policy

Codexus uses **small commits, larger releases**. Implementation commits should
stay focused and reviewable, but stable versions should usually represent one
coherent product theme rather than a single tiny option or wording change.

This policy complements, but does not replace, the frozen JSON contract in
[json-contract.md](json-contract.md) and the operational checklist in
[public-release.md](public-release.md).

## Cadence

Default release cadence:

- Pick a short release theme before cutting a stable version.
- Bundle at least **two substantive slices** under that theme.
- Prefer **three to five related slices** when the work is not urgent.
- Keep individual commits small, reversible, and independently tested.
- Write the changelog so a user can understand why updating matters in one or
  two sentences.

A substantive slice is a change that creates user-visible value, executable
evidence, release safety, or a documented product boundary. Pure typo fixes,
minor copy edits, or tiny internal cleanup do not normally justify a stable
version by themselves.

## Hotfix Exceptions

Small patch releases are still allowed when waiting would be worse:

- security or secret-exposure fixes;
- broken install, publish, or GitHub Release assets;
- CI/release blockers;
- regressions in stable commands;
- documentation mistakes that could cause users to run unsafe or wrong install
  commands.

Hotfix release evidence must explain why the release intentionally breaks the
normal bundle cadence.

## Version Boundary

Codexus pre-1.0 versioning is governed by the stable JSON contract, not by how
large a feature feels.

- Patch releases on the current stable line may add stable JSON fields only
  additively.
- Experimental/deferred surfaces may be added in patch releases if they
  self-report their stability and stay outside the frozen stable contract.
- Minor releases are reserved for promoting experimental evidence surfaces into
  stable contract surfaces or for breaking/redefining already frozen stable
  fields.
- Prerelease builds stay on the explicit npm `next` channel.
- Tag-triggered stable publishes use trusted publishing for `npm publish` only
  and must not require post-publish `npm dist-tag add` permission.
- Live release sign-off verifies `next >= latest`. If npm `next` lags behind
  `latest` after trusted publishing, an authenticated maintainer updates `next`
  before the release is declared complete.

Therefore a large experimental bundle can still be a patch release if it does
not change the frozen stable contract. Conversely, a small breaking contract
change requires the next minor release.

## Release Evidence

Every stable release must keep the release loop auditable:

- English and Korean release-evidence docs exist before tag publish.
- `npm run release:check` passes before tag publish.
- The tag-triggered trusted-publishing workflow publishes npm and creates or
  refreshes the matching GitHub Release.
- After publish, `codexus release check --version <version> --live --gate --json`
  passes.
- Post-publish install smoke verifies `codexus@latest` and release
  `install.sh`.
- Live release sign-off verifies npm `latest` and ensures npm `next` is not
  older than `latest`.
- Release evidence is updated after publish with bounded, redacted facts.

Do not commit raw workflow logs, run ledgers, local private paths, tokens,
transcripts, or model prompts.

## Executable Policy

The policy is intentionally visible through the CLI:

```bash
codexus release policy --json
codexus release policy --gate --json
```

`npm run release:check` includes `release:policy`, so stable release prep fails
if the policy docs are missing. This gate checks document presence and the
current project policy shape; it does not judge whether a proposed changelog is
semantically "big enough." That judgment remains a release-review decision and
should be recorded in the changelog and release evidence.
