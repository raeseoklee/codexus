# Desktop App-Server Attachment Evidence Plan

[English](../../plans/2026-05-30-desktop-app-server-attachment-evidence-plan.md)

날짜: 2026-05-30

상태: Stage A는 구현됐고, Stage B read-only command는 explicit opt-in 뒤에
구현됐습니다. 첫 maintainer Desktop smoke는 negative result였습니다. 현재 활성
Codex Desktop app-server surface는 stdio 기반이었고, managed daemon control socket은
없었으며, 발견된 IPC socket은 WebSocket handshake 전에 닫혔습니다. Desktop
attachment는 아직 enabled runtime path가 아닙니다.

## 결정

Codexus는 실험적인 app-server surface를 통해 Codex Desktop attachment 가능성을
두 단계로 조사합니다:

1. Stage A: 임시 상태만 사용하는 격리 증거.
2. Stage B: 이미 opt-in된 실제 Desktop/app-server daemon에 대한 read-only 증거.

이 작업은 evidence slice입니다. app-server driver를 활성화하거나, live turn을
조종하거나, 사용자 Codex 설정을 변경하거나, 실제 event 관측 전 Desktop attachment
지원을 주장하면 안 됩니다.

## 맥락

CLI/TUI notify-hook path는 실제 `turn-ended` event로 검증됐습니다.
`notifyDispatch.status`는 `observed`, `capabilities.hooks`는 `available`이 되고,
hook event는 `runtimeSurface: "cli-tui"`를 기록합니다.

Desktop/app-server session은 CLI notify hook을 호출하지 않을 수 있습니다. 따라서
app-server surface는 Codexus session-native attachment의 남은 절반일 가능성이
있습니다:

- CLI/TUI runtime: Codex `notify = [...]` hook.
- Desktop/app-server runtime: 안정적인 event surface가 있다면 app-server event
  subscription.

현재 로컬 Codex는 이를 실험적 surface로 노출합니다:

- `codex app-server daemon ...`
- `codex app-server proxy --sock <SOCKET_PATH>`
- `codex app-server generate-json-schema --out <DIR> [--experimental]`
- `codex remote-control start|stop --json`

이 surface는 명시적으로 experimental이고 live daemon에 닿을 수 있으므로, product
behavior를 추가하기 전에 먼저 증거를 수집해야 합니다.

## Stage A: 격리 증거

Stage A는 사용자 live Desktop daemon을 건드리지 않고 protocol과 lifecycle 형태를
증명합니다.

요구사항:

- 임시 `CODEX_HOME`을 사용합니다.
- 임시 workspace와 임시 socket path를 사용합니다.
- app-server JSON Schema를 임시 directory에 생성하고 committed fixture와 비교한
  bounded drift evidence를 기록합니다.
- app-server/proxy process를 시작한다면 timeout, `SIGTERM -> 짧은 대기 -> SIGKILL`,
  bounded stdout/stderr capture, cleanup assertion으로 supervise합니다.
- Stage A에서는 격리된 direct `codex app-server --listen unix://...` process를
  우선합니다. Managed daemon start는 `CODEX_HOME` 아래 standalone Codex install에
  의존할 수 있으므로 later/live concern으로 둡니다.
- Codex/model turn을 시작하지 않습니다. Stage A는 schema, lifecycle,
  control-socket, observer-safety evidence로 제한합니다.
- 사용자 실제 daemon에 `enable-remote-control`을 호출하지 않습니다.
- 사용자 기본 control socket을 재사용하지 않습니다.
- `~/.codex/config.toml`을 쓰지 않습니다.

출력:

- `.codexus/experiments/app-server/...` 아래 experiment manifest.
- bounded help/schema/process evidence.
- supervised child process가 남지 않았음을 보이는 cleanup result.

Stage A에서 Stage B로 넘어가는 gate:

- Schema generation이 동작합니다.
- Proxy/app-server lifecycle이 격리 상태에서 증명되거나, 격리가 불가능한 정확한 이유를
  기록합니다.
- 가능하면 observer/concurrent-client behavior를 격리 상태에서 증명합니다. Control
  socket이 single-client이거나 disruptive해 보이면 Stage B는 사용자 실제 daemon에
  연결하면 안 됩니다.
- Cleanup assertion이 통과합니다.
- Manifest가 turn/session 관측에 관련 있어 보이는 event method를 명시합니다.

## Stage B: 실제 Daemon Read-Only Evidence

Stage B는 명시적 동의가 있고 read-only mode일 때만 실제 Desktop/app-server daemon에
연결할 수 있습니다.

요구사항:

- 예를 들어 `--live-read-only`와 `CODEXUS_ENABLE_DESKTOP_APP_SERVER_ATTACH=1`처럼
  명시적 command flag와 environment gate를 모두 요구합니다.
- 사용자가 제공한 socket 또는 사용자가 이미 remote-control mode를 켠 daemon에만
  연결합니다. Codexus가 조용히 remote control을 켜면 안 됩니다.
- 실제 daemon에 연결하기 전에 control socket이 observer 또는 concurrent read-only
  client를 지원하는지 확인합니다. Socket이 single-client이거나 Desktop app 연결을
  밀어낼 수 있거나 Stage A evidence만으로 분류할 수 없다면, Codexus는 연결하지 않고
  Stage B를 보류해야 합니다.
- Codexus가 나중에 `enable-remote-control` 실행을 제공한다면 visible command,
  audit record, 명확한 disable/cleanup path가 있어야 합니다.
- Subscribe/read only만 허용합니다. Turn 시작, turn steer, command 실행,
  filesystem write tool 호출, approval 변경, Desktop state 변경을 하지 않습니다.
- Model turn을 시작하지 않습니다. Stage B는 사용자가 직접 실행한 Desktop turn만
  관측합니다.
- 모든 event read는 timeout과 byte limit으로 제한합니다.
- 저장하는 event payload는 artifact 기록 전에 redact합니다.
- CLI notify dispatch 부재로 추론하지 않고, 관측된 app-server evidence에서만
  runtime surface를 `desktop-app-server`로 기록합니다.

출력:

- read-only evidence manifest.
- Socket path가 어떻게 제공됐는지, observer/concurrent-client behavior가 알려져 있는지
  포함한 socket 선택 및 non-disruption evidence.
- Desktop turn activity mapping에 필요한 event method name과 bounded payload shape.
- app-server event가 CLI `turn-ended`와 의미적으로 다르면 새 event type을 포함한
  Codexus session event mapping 제안.

Stage B에서 구현으로 넘어가는 gate:

- 사용자에게 보이는 turn boundary에 해당하는 실제 Desktop/app-server event를
  관측합니다.
- Transcript를 저장하지 않고 event를 표현할 수 있습니다.
- 기존 truthful capability model을 보존합니다: 관측 전에는 `configured`, 관측 뒤에만
  `available`.
- Negative result도 정상 결과입니다. 안정적인 read-only event를 찾지 못하면 Codexus는
  Desktop attachment를 unavailable/unobserved로 계속 보고해야 합니다.

현재 evidence:

- Stage B `--live-read-only`를 maintainer Desktop 환경에서 발견된 local IPC socket에
  대해 실행했습니다.
- 이 명령은 explicit opt-in contract를 지켰고, remote control을 켜지 않았으며,
  Codex config를 쓰지 않았고, turn을 시작하지 않았고, transcript data를 저장하지
  않았습니다.
- Socket은 WebSocket handshake 전에 닫혔으므로 read-only request는 전송되지 않았고
  event method도 관측되지 않았습니다.
- 결과: `connection.status: "unavailable"`,
  `eventObservation.runtimeSurface: "unknown"`,
  `promotionRecommendation: "block_stage_b"`.
- 이제 `cx app-server discover --record --json`는 live socket에 연결하거나 remote
  control을 켜지 않고 현재 Desktop runtime shape를 기록합니다. 현재 maintainer Desktop
  환경에서는 실행 중인 Codex app-server process를 관측했지만 모두 `stdio` 또는
  default-stdio transport였고, default managed control socket
  `~/.codex/app-server-control/app-server-control.sock`은 존재하지 않았습니다.
- Discovery 결과: `stageBReadiness.status: "stdio_only"`,
  `candidateSocket: null`,
  `promotionRecommendation: "design_stdio_observer"`.
- 다음 positive Stage B 시도에는 사용자 제공 app-server WebSocket/Unix socket, 이미
  opt-in된 managed daemon socket, 또는 별도 stdio-observer 설계가 필요합니다. 그 경우에도
  remote control을 조용히 켜면 안 됩니다.

## 비목표

- `codex-app-server`를 run driver로 활성화.
- 안정적인 `codex exec --json` path 대체.
- Desktop transcript 수집.
- 경쟁 chat loop 생성.
- Evidence collection 중 app-server model turn 시작.
- Remote control 자동 활성화 또는 사용자 Codex config 변경.
- app-server 부재를 CLI/TUI attachment path 실패로 취급.

## 다음 CLI 형태

첫 구현은 안정 user-facing promise를 추가하지 말고 기존 experimental command surface를
확장해야 합니다:

```bash
cx app-server experiment --dry-run --record --probe-process --json
cx app-server experiment --dry-run --record --probe-process --supervise-fake --json
cx app-server discover --record --json
cx app-server experiment --isolated-real --record --json
cx app-server experiment --live-read-only --record --sock <path> --json
```

`--isolated-real`은 `CODEXUS_ENABLE_APP_SERVER_ISOLATED=1` 뒤에서 구현됐습니다.
`--live-read-only`는 `CODEXUS_ENABLE_DESKTOP_APP_SERVER_ATTACH=1`과 명시적
`--sock <path>` 뒤에서 구현됐습니다. 이 경로는 read-only app-server request
(`initialize`, `thread/list`, `remoteControl/status/read`)만 보내고 transcript 값이
아닌 notification method shape만 기록합니다. 오류는 structured하고 truthful해야
합니다.
`discover`는 read-only discovery입니다. Process transport mode, default control socket
존재 여부, Stage B readiness를 기록하지만 live socket에 연결하거나 daemon을 시작하거나
remote control을 켜지 않습니다.

## 검증

- Gate enforcement와 unsupported structured error unit test.
- Stage A field, cleanup status, redaction, bounded output에 대한 manifest test.
- Stdio-only와 explicit-socket classification에 대한 discovery test.
- 로컬 app-server surface가 허용하면 격리 observer/concurrent-client probe evidence.
- Live Desktop daemon 없이 event mapping을 증명하는 fake/proxy fixture.
- 사용자가 명시적으로 opt-in했을 때만 Stage B manual smoke.
- 관련 slice publish 전 `npm run ci`와 `npm run package:smoke`.
