# Changelog

[한국어](docs/ko/CHANGELOG.md)

All notable changes to Codexus will be documented in this file.

This project follows a practical pre-1.0 changelog format. Breaking changes can
occur before 1.0, but they should be called out clearly.

## 0.1.0 - 2026-05-29

Initial public-preparation release.

### Added

- Local `cx`/`codexus` CLI harness around `codex exec --json`.
- Durable run ledger, state, event JSONL, verification artifacts, and reports.
- Mock and Codex exec drivers.
- Verification gates and bounded repair loops.
- Memory lifecycle and replay-gated skill lifecycle.
- Codex-native `$codexus` skill adapter.
- Optional OMX retrieval/context/export integration.
- Schema artifacts and local schema subset enforcement.
- App-server dry-run/experiment surfaces behind live gates.
- Cron/gateway dry-run audit records behind feature gates.
- GitHub CI workflow and local `npm run ci` parity.

### Known Gaps

- Live app-server driver remains disabled.
- Routine live model-in-the-loop replay remains opt-in and gated.
- Cron/gateway live dispatch remains disabled.
- Automatic prompt injection of retrieved Codexus context is not implemented.
