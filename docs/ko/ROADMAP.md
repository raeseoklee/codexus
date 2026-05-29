# Roadmap

[English](../../ROADMAP.md)

이 roadmap은 public-facing 방향을 요약합니다. 상세 구현 note는
[남은 작업](remaining-work.md)에 있습니다.

## Now: Local Harness Reliability

- `cx`와 `codexus`를 canonical CLI name으로 유지합니다.
- `codex exec --json`을 stable driver boundary로 보존합니다.
- Ledger, verification, schema check, JSON error contract를 안정적으로 유지합니다.
- `npm run ci`로 local CI parity를 유지합니다.

## Next: Evidence Depth

- Live driver는 기본 disabled 상태로 유지하면서 real app-server start/stop
  experiment를 확장합니다.
- 모든 canonical scenario label에 replay parity coverage를 유지합니다.
- Dependency policy가 바뀔 때만 local schema subset engine을 full external JSON
  Schema engine으로 교체합니다.
- User-visible injection contract가 설계되기 전까지 Codex-native context retrieval은
  explicit/non-injected 상태로 유지합니다.

## Later: Automation and Ecosystem

- Cron/gateway dry-run contract를 policy-reviewed live dispatch로 승격합니다.
- Codex와 OMX 대상 skill export compatibility를 강화합니다.
- CLI surface가 안정화되면 release packaging을 추가합니다.
- Temporary `chx` alias 제거 migration note를 게시합니다.

## Non-Goals

- Codex를 model/runtime engine으로 대체하지 않습니다.
- Private ChatGPT/Codex backend API를 직접 호출하지 않습니다.
- 명시적 policy, approval, audit record 없이 unattended live automation을 켜지
  않습니다.
