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

- `0.1.x` patch releases may add stable JSON fields only additively.
- Experimental/deferred surfaces may be added in `0.1.x` if they self-report
  their stability and stay outside the frozen stable contract.
- `0.2.0` is reserved for promoting experimental evidence surfaces into stable
  contract surfaces or for breaking/redefining already frozen stable fields.
- Prerelease builds stay on the explicit npm `next` channel.

Therefore a large experimental bundle can still be `0.1.x` if it does not
change the frozen stable contract. Conversely, a small breaking contract change
requires `0.2.0`.

## Release Evidence

Every stable release must keep the release loop auditable:

- English and Korean release-evidence docs exist before tag publish.
- `npm run release:check` passes before tag publish.
- The tag-triggered trusted-publishing workflow publishes npm and creates or
  refreshes the matching GitHub Release.
- After publish, `cx release check --version <version> --live --gate --json`
  passes.
- Post-publish install smoke verifies `codexus@latest` and release
  `install.sh`.
- Release evidence is updated after publish with bounded, redacted facts.

Do not commit raw workflow logs, run ledgers, local private paths, tokens,
transcripts, or model prompts.

## Executable Policy

The policy is intentionally visible through the CLI:

```bash
cx release policy --json
cx release policy --gate --json
```

`npm run release:check` includes `release:policy`, so stable release prep fails
if the policy docs are missing. This gate checks document presence and the
current project policy shape; it does not judge whether a proposed changelog is
semantically "big enough." That judgment remains a release-review decision and
should be recorded in the changelog and release evidence.
