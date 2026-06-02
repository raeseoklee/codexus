# Changelog

[English](../../CHANGELOG.md)

Codexus의 notable change를 이 파일에 기록합니다.

이 프로젝트는 practical pre-1.0 changelog format을 따릅니다. 1.0 전에는 breaking
change가 있을 수 있지만, 명확히 표시해야 합니다.

## Unreleased

### Added

- Operational control invariant와 compiled repository wiki 설계 문서를 추가했습니다.
  둘 다 제안된 0.2/0.3 track이며, evidence가 완료를 gate하고 control/projection은
  완료 권한이 아니라는 기존 규칙을 유지합니다.
- Experimental `cx app-server discover --json/--record`를 추가했습니다. 이
  read-only Desktop app-server discovery report는 live socket에 연결하거나 remote
  control을 켜지 않고 default control socket 존재 여부, 실행 중인 app-server transport
  mode, Stage B readiness를 기록합니다.
- Experimental `cx release check --json/--gate`를 추가하고
  `npm run release:check`에 연결했습니다. Stable release candidate는 tag publish 전에
  installer default, trusted-publishing wiring, GitHub Release `install.sh` attachment
  wiring, release-evidence doc을 로컬에서 증명합니다. npm/GitHub live reconciliation은
  `--live`로 명시적으로 실행합니다.
- Experimental `cx repo check --gate --json`에 docs-code invariant를 확장했습니다.
  문서가 선언한 `schemas/*.schema.json` reference가 local schema artifact로 resolve되는지
  검증합니다.

### Fixed

- Stable tag publish가 matching GitHub Release를 생성/갱신하고 `install.sh`를
  첨부하도록 수정했습니다. GitHub latest release route가 npm `latest`와 같은 version을
  가리키게 됩니다.
- GitHub Pages deploy를 repository-owned workflow로 전환했습니다. 이 workflow는
  pinned Node 24-compatible action과 명시적인 Node 24 JavaScript action opt-in을
  사용하며, Node.js 20 action deprecation warning을 냈던 legacy GitHub-managed Pages
  deploy path를 대체합니다.

## 0.1.1 - 2026-06-01

### Added

- OpenAI harness-engineering guidance와 Karpathy-style behavior contract를 종합한
  harness-engineering alignment 설계 문서를 추가했습니다. 향후 architecture,
  repository-knowledge, slop, subagent, observability gate 방향을 정리합니다.
- 남은 supported stable command output에 top-level JSON `stability` marker를
  추가하고, installed CLI surface에 대한 package smoke coverage를 보강했습니다.
- Experimental `cx architecture check --json/--gate`를 추가했습니다.
  Schema-validated `codexus.architecture.policy`, best-effort static import
  evidence, Codexus source의 runtime package import 금지 dogfood rule을 포함합니다.
- Experimental `cx repo map/check --json`과 `cx repo check --gate`를 추가했습니다.
  Required docs index, index link resolution, English/Korean counterpart를
  기계적으로 검증하고 semantic freshness는 advisory로 유지합니다.
- `cx slop check` behavior evidence를 확장했습니다. Non-gating surgicality,
  verification-artifact, test-diff, diff-surface fact와 advisory simplicity/
  unresolved-assumption heuristic을 추가하되, 이 heuristic은 `--gate`에 영향을 주지
  않습니다.
- `session subagent record/attach/complete` artifact에 optional subagent behavior
  checklist field를 추가했습니다. Checklist는 `pass|fail|unknown` review assertion을
  지원하지만 verification evidence를 fresh로 만들거나 Codexus가 subagent를 launch했다고
  주장하지 않습니다.

### Fixed

- `install.sh`가 custom bin directory로 설치할 때 실제 `CODEXUS_BIN_DIR` 경로를
  보고하도록 수정했습니다.

## 0.1.0 - 2026-06-01

### Added

- 첫 stable 0.1.x release line입니다. Supported JSON surface는 0.1.x 동안 freeze되고,
  experimental/deferred surface는 계속 자신의 stability를 명시합니다.

### Changed

- Public install path는 prerelease `codexus@next` channel 대신 stable npm
  channel(`codexus`)을 기본으로 사용합니다.
- Stable publish는 GitHub Actions trusted publishing과 npm provenance를 사용합니다.

## 0.1.0-alpha.7 - 2026-06-01

### Fixed

- Trusted-publishing workflow publish가 post-publish `npm dist-tag add` 권한을
  요구하지 않도록 수정했습니다. GitHub Actions는 `npm publish` 자체가 만든 tag만
  검증하고, npm trusted-publisher 권한 표면은 publish-only로 유지합니다.

## 0.1.0-alpha.6 - 2026-06-01

### Removed

- 기존 external-harness adapter surface, 관련 config block, planning flag, non-Codex
  skill export target을 제거했습니다. Codexus는 다른 harness runtime에 의존하지
  않습니다. 남아있는 legacy config key는 unknown-key 에러가 아니라
  removed/deprecated(notice와 함께 무시)로 처리됩니다.

### Added

- `cx session subagent launch --role <role> --task <task> --json`가
  `launcher.supported: false`, verification-only completion policy, 나중의 claim
  recording handoff command를 포함한 deferred native-subagent launcher contract를
  기록합니다.
- `cx session subagent complete --task-id <id> --claim <text> --json`가 현재
  Codex session에서 사용한 native subagent의 최종 claim을 기록합니다. Codexus가 spawn했다고
  주장하거나 verification evidence를 fresh로 바꾸지는 않습니다.

### Changed

- Subagent state가 launcher-contract artifact를 link하되 verification evidence로
  취급하지 않도록 session state schema를 v5로 올렸습니다.

## 0.1.0-alpha.5 - 2026-05-31

### Added

- 0.1.0 준비 문서에 stable, experimental, deferred surface를 구분하는 README
  support matrix를 추가했습니다.
- Autopilot contract 설계를 0.2/0.3 deferred track으로 추가했습니다. Worktree 격리,
  사람이 승인한 scope, detect-then-stop 경계를 명시합니다.

### Changed

- 구현 상태와 남은 작업 문서는 현재 installed-package release smoke,
  `0.1.0-alpha.4` npm baseline, stable release gate를 반영하도록 갱신했습니다.
  더 이상 초기 alpha.0 packaging plan처럼 읽히지 않습니다.
- 한국어 README 첫 문장은 "with evidence"의 직역투를 피하고, Codexus가 Codex CLI
  작업을 테스트로 확인하고 결과를 기록한다는 표현으로 바꿨습니다.

## 0.1.0-alpha.4 - 2026-05-31

### Added

- `cx --version`과 `cx version --json`을 통한 CLI version reporting을
  추가했습니다. Source CLI test와 installed package smoke test로 커버합니다.
- Supply-chain evidence policy와 `cx supply-chain check`를 추가했습니다.
  Report-only JSON output, `--gate` exit code, lifecycle-safe static package
  projection, policy validation, package-smoke의 단일 출처 file assertion,
  `codexus.supplyChain` schema artifact를 포함합니다.

### Fixed

- Supply-chain secret leak gate는 이제 고신뢰 token/key 패턴만 사용합니다.
  일반적인 `token = value` assignment 같은 broad redaction heuristic은
  false-positive publish blocker를 피하기 위해 gate에 사용하지 않습니다.

## 0.1.0-alpha.3 - 2026-05-31

### Added

- Always-on Codex session evidence는 verification을 실행하지 않고
  workspace fingerprint에서 파생한 dirty/stale 상태를 보고합니다.
- `cx session status`와 `cx session hud`는 ambient evidence freshness와 compact
  change-evidence summary를 노출합니다.
- `cx session verify --auto`는 가능한 verification command를 실행 없이 추천할 수
  있고, `--execute`는 명시 실행과 policy gate를 유지합니다.
- Notify-hook heartbeat는 stale verification을 fresh로 바꾸지 않고 derived
  `heartbeatEvidence`와 compact `heartbeatChangeEvidence` snapshot을 기록할 수
  있습니다.
- Quality evidence guard command에 `cx slop check`와 `cx session slop`이
  추가됐고, `--gate` exit code는 derivable evidence로만 결정됩니다.
- Session subagent support는 recorder-only입니다. `record`, `attach`, `status`는
  worker를 실행하거나 evidence freshness를 바꾸지 않고 unverified claim을
  저장합니다.
- Schema-engine status, replay parity, worker launch, cron/gateway live dispatch,
  external context injection approval의 현재 한계를 honest-gated surface로 보고합니다.

### Known Gaps

- Desktop app-server attachment는 테스트된 환경에서 Stage B가 negative
  live-dispatch evidence를 기록한 뒤에도 gated 상태입니다.
- Slop heuristic은 advisory/partial입니다. Gate status는 여전히 explicit evidence
  gap에서만 파생됩니다.
- Live app-server dispatch, cron/gateway live dispatch, full JSON Schema engine
  enforcement, tmux worker launch, automatic context injection은 deferred 상태입니다.

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
