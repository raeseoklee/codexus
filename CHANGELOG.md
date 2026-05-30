# Changelog

[한국어](docs/ko/CHANGELOG.md)

All notable changes to Codexus will be documented in this file.

This project follows a practical pre-1.0 changelog format. Breaking changes can
occur before 1.0, but they should be called out clearly.

## 0.1.0-alpha.2 - 2026-05-30

### Added

- Memory curation now reports advisory conflict candidates and
  curator-derived tri-state quality findings without changing memory entries.
- Session notify dispatch now distinguishes configured hooks from observed
  `turn-ended` dispatch and records CLI/TUI runtime surface evidence.
- Desktop app-server attachment is documented as an evidence-first A/B slice
  with isolated probing, consent, read-only, and non-disruptive socket gates.

### Changed

- Codexus session state now uses an explicit migration boundary for future
  schema changes.
- Memory quality is framed as 29148-inspired curation characteristics, not
  standards compliance.

## 0.1.0-alpha.1 - 2026-05-30

### Changed

- Global npm installs now install the Codex-native skill adapter by default.
- Set `CODEXUS_INSTALL_CODEX_SKILL=0` to keep npm installs CLI-only.
- The package smoke test now verifies the postinstall adapter path.

## 0.1.0-alpha.0 - 2026-05-30

First npm-ready alpha packaging slice.

### Changed

- Public npm bins now point to bundled `dist/cli/main.js` instead of source
  `.ts` files.
- Node engine floor is now `>=22` for the npm-installed CLI.
- The package tarball now ships only runtime assets: `dist`, schemas, the Codex
  skill adapter, the app-server runtime fixture, installer, and top-level
  release metadata.
- `install.sh` delegates to the npm package channel (`codexus@next` by default).

### Added

- `npm run build` with esbuild bundling.
- `npm run package:smoke` release gate for `npm pack`, temporary global install,
  public bin checks, runtime schema asset checks, and mock-run execution.

## 0.1.0 - 2026-05-29

Initial public-preparation release.

### Added

- Local `cx`/`codexus` CLI harness around `codex exec --json`.
- Durable run ledger, state, event JSONL, verification artifacts, and reports.
- Mock and Codex exec drivers.
- Verification gates and bounded repair loops.
- Memory lifecycle and replay-gated skill lifecycle.
- Codex-native `$codexus` skill adapter.
- Optional advanced interop commands kept outside the core runtime path.
- Schema artifacts and local schema subset enforcement.
- App-server dry-run/experiment surfaces behind live gates.
- Cron/gateway dry-run audit records behind feature gates.
- GitHub CI workflow and local `npm run ci` parity.

### Known Gaps

- Live app-server driver remains disabled.
- Routine live model-in-the-loop replay remains opt-in and gated.
- Cron/gateway live dispatch remains disabled.
- Automatic prompt injection of retrieved Codexus context is not implemented.
