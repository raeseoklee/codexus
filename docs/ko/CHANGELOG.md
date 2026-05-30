# Changelog

[English](../../CHANGELOG.md)

Codexus의 notable change를 이 파일에 기록합니다.

이 프로젝트는 practical pre-1.0 changelog format을 따릅니다. 1.0 전에는 breaking
change가 있을 수 있지만, 명확히 표시해야 합니다.

## 0.1.0-alpha.2 - 2026-05-30

### Added

- Memory curation은 이제 memory entry를 변경하지 않고 advisory conflict
  candidate와 curator-derived tri-state quality finding을 보고합니다.
- Session notify dispatch는 configured hook과 실제 관측된 `turn-ended`
  dispatch를 구분하고 CLI/TUI runtime surface evidence를 기록합니다.
- Desktop app-server attachment는 isolated probing, consent, read-only,
  non-disruptive socket gate가 있는 evidence-first A/B slice로 문서화했습니다.

### Changed

- Codexus session state는 향후 schema change를 위한 explicit migration boundary를
  사용합니다.
- Memory quality는 표준 준수가 아니라 29148-inspired curation characteristic으로
  프레이밍합니다.

## 0.1.0-alpha.1 - 2026-05-30

### Changed

- Global npm install은 이제 Codex-native skill adapter를 기본으로 함께 설치합니다.
- CLI만 설치하려면 `CODEXUS_INSTALL_CODEX_SKILL=0`을 설정합니다.
- Package smoke test는 postinstall adapter path까지 검증합니다.

## 0.1.0-alpha.0 - 2026-05-30

첫 npm-ready alpha packaging slice입니다.

### Changed

- Public npm bin이 source `.ts` file 대신 bundled `dist/cli/main.js`를
  가리킵니다.
- Npm-installed CLI의 Node engine floor를 `>=22`로 낮췄습니다.
- Package tarball은 runtime asset만 싣습니다: `dist`, schema, Codex skill
  adapter, app-server runtime fixture, installer, top-level release metadata.
- `install.sh`는 npm package channel(`codexus@next` 기본값)에 위임합니다.

### Added

- esbuild bundling을 수행하는 `npm run build`
- `npm pack`, temporary global install, public bin check, runtime schema asset
  check, mock-run execution을 검증하는 `npm run package:smoke` release gate

## 0.1.0 - 2026-05-29

Initial public-preparation release.

### Added

- `codex exec --json`을 감싸는 local `cx`/`codexus` CLI harness
- Durable run ledger, state, event JSONL, verification artifact, report
- Mock driver와 Codex exec driver
- Verification gate와 bounded repair loop
- Memory lifecycle과 replay-gated skill lifecycle
- Codex-native `$codexus` skill adapter
- Core runtime path 바깥에 둔 optional advanced interop command
- Schema artifact와 local schema subset enforcement
- Live gate 뒤의 app-server dry-run/experiment surface
- Feature gate 뒤의 cron/gateway dry-run audit record
- GitHub CI workflow와 local `npm run ci` parity

### Known Gaps

- Live app-server driver는 disabled 상태입니다.
- Routine live model-in-the-loop replay는 opt-in/gated 상태입니다.
- Cron/gateway live dispatch는 disabled 상태입니다.
- Retrieved Codexus context의 automatic prompt injection은 구현되어 있지 않습니다.
