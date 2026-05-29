# Changelog

[English](../../CHANGELOG.md)

Codexus의 notable change를 이 파일에 기록합니다.

이 프로젝트는 practical pre-1.0 changelog format을 따릅니다. 1.0 전에는 breaking
change가 있을 수 있지만, 명확히 표시해야 합니다.

## 0.1.0 - 2026-05-29

Initial public-preparation release.

### Added

- `codex exec --json`을 감싸는 local `cx`/`codexus` CLI harness
- Durable run ledger, state, event JSONL, verification artifact, report
- Mock driver와 Codex exec driver
- Verification gate와 bounded repair loop
- Memory lifecycle과 replay-gated skill lifecycle
- Codex-native `$codexus` skill adapter
- Optional OMX retrieval/context/export integration
- Schema artifact와 local schema subset enforcement
- Live gate 뒤의 app-server dry-run/experiment surface
- Feature gate 뒤의 cron/gateway dry-run audit record
- GitHub CI workflow와 local `npm run ci` parity

### Known Gaps

- Live app-server driver는 disabled 상태입니다.
- Routine live model-in-the-loop replay는 opt-in/gated 상태입니다.
- Cron/gateway live dispatch는 disabled 상태입니다.
- Retrieved Codexus context의 automatic prompt injection은 구현되어 있지 않습니다.
