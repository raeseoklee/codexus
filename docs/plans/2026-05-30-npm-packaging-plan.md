# npm Packaging Plan

[한국어](../ko/plans/2026-05-30-npm-packaging-plan.md)

Date: 2026-05-30

Status: implemented as the npm-installed CLI packaging slice.

## Decision

Codexus publishes as an npm package with a bundled JavaScript CLI entrypoint.
The package ships `dist/cli/main.js` as the executable target for both
`codexus` and `cx`.

## Rationale

Node refuses TypeScript type stripping for `.ts` files under `node_modules`.
The previous package metadata pointed public bins at `src/cli/main.ts`, which
meant an npm-installed package could not run even on Node 26. A bundled
JavaScript entrypoint is therefore a release prerequisite, not an optimization.

## Implementation

- Build with `esbuild --bundle --platform=node --format=esm --target=node22`.
- Keep runtime dependencies at zero; `esbuild` is a development dependency only.
- Set `engines.node` to `>=22`.
- Publish only `codexus` and `cx` as public bins.
- Keep source execution for development through `node src/cli/main.ts`.
- Resolve runtime assets by discovering the Codexus package root instead of
  assuming source-relative paths.
- Ship `fixtures/app-server/schema.fixture.json` because schema and app-server
  dry-run commands read it at runtime.
- Exclude source, tests, docs, replay fixtures, and migration fixtures from the
  npm tarball.
- Run a global-install `postinstall` hook that installs the Codex-native skill
  adapter by default, while local dependency installs remain side-effect free
  unless `CODEXUS_INSTALL_CODEX_SKILL=1` is set.
- Make `install.sh` delegate to `npm install -g codexus@next` by default.

## Release Gate

`npm run package:smoke` is mandatory before publish. It runs:

- `npm pack`
- temporary global install from the packed tarball
- `codexus --help`
- `cx --help`
- `codexus schema check --json`
- postinstall Codex skill adapter installation into a temporary `CODEX_HOME`
- `codexus run --driver mock --json "package smoke"`

The first npm release should use:

```bash
npm publish --tag next
```

Do not publish the first package as `latest`.
