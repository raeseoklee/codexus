# Roadmap

[한국어](docs/ko/ROADMAP.md)

This roadmap summarizes public-facing direction. Detailed implementation notes
live in [Remaining work](docs/remaining-work.md).

## Now: Local Harness Reliability

- Keep `cx` and `codexus` as canonical CLI names.
- Preserve `codex exec --json` as the stable driver boundary.
- Keep ledgers, verification, schema checks, and JSON error contracts reliable.
- Maintain local CI parity through `npm run ci`.

## Next: Evidence Depth

- Expand real app-server start/stop experiments while keeping the live driver
  disabled by default.
- Preserve replay parity coverage for every canonical scenario label.
- Replace the local schema subset engine with a full external JSON Schema engine
  only if dependency policy changes.
- Keep Codex-native context retrieval explicit and non-injected unless a
  user-visible injection contract is designed.

## Later: Automation and Ecosystem

- Promote cron/gateway dry-run contracts into policy-reviewed live dispatch.
- Strengthen Codex skill export compatibility and keep third-party harness
  interop optional.
- Add release packaging once the CLI surface stabilizes.
- Publish migration notes for removing the temporary `chx` alias.

## Non-Goals

- Replacing Codex as the model/runtime engine.
- Calling private ChatGPT/Codex backend APIs directly.
- Enabling unattended live automation without explicit policy, approval, and
  audit records.
