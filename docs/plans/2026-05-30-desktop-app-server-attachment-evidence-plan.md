# Desktop App-Server Attachment Evidence Plan

[Korean](../ko/plans/2026-05-30-desktop-app-server-attachment-evidence-plan.md)

Date: 2026-05-30

Status: Stage A is implemented, the Stage B read-only command is implemented
behind explicit opt-in, and the stdio-observer design contract is documented. A
first maintainer Desktop smoke produced a negative result: the active Codex
Desktop app-server surface was stdio-based, the managed daemon control socket
was absent, and a discovered IPC socket closed before WebSocket handshake.
Desktop attachment is still not an enabled runtime path.

## Decision

Codexus should investigate Codex Desktop attachment through the experimental
app-server surface in two stages:

1. Stage A: isolated evidence in temporary state only.
2. Stage B: read-only evidence against a real, already opt-in Desktop/app-server
   daemon.

This is an evidence slice. It must not enable the app-server driver, steer live
turns, mutate user Codex configuration, or claim Desktop attachment support
until a real event is observed and mapped into Codexus session state.

## Context

The CLI/TUI notify-hook path is now proven with a real `turn-ended` event:
`notifyDispatch.status` becomes `observed`, `capabilities.hooks` becomes
`available`, and the hook event records `runtimeSurface: "cli-tui"`.

Desktop/app-server sessions may not invoke the CLI notify hook. That makes the
app-server surface the likely remaining half of Codexus session-native
attachment:

- CLI/TUI runtime: Codex `notify = [...]` hook.
- Desktop/app-server runtime: app-server event subscription, if the supported
  event surface exists and is stable enough.

Local Codex exposes this as an experimental surface:

- `codex app-server daemon ...`
- `codex app-server proxy --sock <SOCKET_PATH>`
- `codex app-server generate-json-schema --out <DIR> [--experimental]`
- `codex remote-control start|stop --json`

Because the surface is explicitly experimental and can reach a live daemon, the
first implementation must collect evidence before adding product behavior.

## Stage A: Isolated Evidence

Stage A proves the protocol and lifecycle shape without touching the user's live
Desktop daemon.

Requirements:

- Use a temporary `CODEX_HOME`.
- Use a temporary workspace and temporary socket path.
- Generate app-server JSON Schema into a temporary directory and record bounded
  drift evidence against the committed fixture.
- If an app-server/proxy process is started, supervise it with timeout,
  `SIGTERM -> short wait -> SIGKILL`, bounded stdout/stderr capture, and cleanup
  assertions.
- Prefer an isolated direct `codex app-server --listen unix://...` process for
  Stage A. Managed daemon start remains a later/live concern because it can
  depend on a standalone Codex install under `CODEX_HOME`.
- Do not initiate Codex/model turns. Stage A is limited to schema, lifecycle,
  control-socket, and observer-safety evidence.
- Do not call `enable-remote-control` on the user's real daemon.
- Do not reuse the user's default control socket.
- Do not write to `~/.codex/config.toml`.

Output:

- An experiment manifest under `.codexus/experiments/app-server/...`.
- Bounded help/schema/process evidence.
- A cleanup result proving no supervised child process remains.

Promotion gate from Stage A to Stage B:

- Schema generation works.
- Proxy/app-server lifecycle is either proven in isolation or the exact reason it
  cannot be isolated is recorded.
- Observer/concurrent-client behavior is proven in isolation when possible. If
  the control socket appears single-client or disruptive, Stage B must not
  connect to the user's real daemon.
- Cleanup assertions pass.
- The manifest states which event methods look relevant for turn/session
  observation.

## Stage B: Real Daemon Read-Only Evidence

Stage B may connect to a real Desktop/app-server daemon only with explicit
consent and only in read-only mode.

Requirements:

- Require an explicit command flag and environment gate, for example
  `--live-read-only` plus `CODEXUS_ENABLE_DESKTOP_APP_SERVER_ATTACH=1`.
- Connect only to a user-provided socket or a daemon whose remote-control mode
  was already enabled by the user. Codexus must not silently enable remote
  control.
- Before connecting to a real daemon, establish that the control socket supports
  observer or concurrent read-only clients. If the socket is single-client, might
  displace the Desktop app, or cannot be classified from Stage A evidence,
  Codexus must defer Stage B rather than connecting.
- If Codexus ever offers to run `enable-remote-control`, it must be a visible
  command with an audit record and a clear disable/cleanup path.
- Subscribe/read only. Do not start turns, steer turns, execute commands, call
  filesystem write tools, alter approvals, or mutate Desktop state.
- Do not initiate model turns. Stage B observes user-driven Desktop turns only.
- Bound all event reads by timeout and byte limits.
- Redact captured event payloads before storing artifacts.
- Record the runtime surface as `desktop-app-server` only from observed
  app-server evidence, never from the absence of CLI notify dispatch.

Output:

- A read-only evidence manifest.
- Socket selection and non-disruption evidence, including how the socket path was
  provided and whether observer/concurrent-client behavior is known.
- The event method names and bounded payload shapes needed to map Desktop turn
  activity.
- A proposed mapping into Codexus session `hookEvents` or a new event type if
  app-server events are not semantically equivalent to CLI `turn-ended`.

Promotion gate from Stage B to implementation:

- A real Desktop/app-server event corresponding to a user-visible turn boundary
  is observed.
- The event can be represented without storing a transcript.
- The mapping preserves the current truthful capability model:
  `configured` before observation, `available` only after observation.
- A negative result remains a supported outcome: Codexus should keep reporting
  Desktop attachment as unavailable/unobserved if no stable read-only event is
  found.

Current evidence:

- Stage B `--live-read-only` has been exercised against a discovered local IPC
  socket in a maintainer Desktop environment.
- The command preserved the explicit opt-in contract and did not enable remote
  control, write Codex config, start a turn, or store transcript data.
- The socket closed before WebSocket handshake, so no read-only requests were
  sent and no event methods were observed.
- Result: `connection.status: "unavailable"`,
  `eventObservation.runtimeSurface: "unknown"`, and
  `promotionRecommendation: "block_stage_b"`.
- `cx app-server discover --record --json` now captures the current Desktop
  runtime shape without connecting to a live socket or enabling remote control.
  In the current maintainer Desktop environment it observed running Codex
  app-server processes, but all exposed `stdio` or default-stdio transports; the
  default managed control socket
  `~/.codex/app-server-control/app-server-control.sock` did not exist.
- Discovery result: `stageBReadiness.status: "stdio_only"`,
  `candidateSocket: null`, and
  `promotionRecommendation: "design_stdio_observer"`.
- The next positive Stage B attempt needs a user-provided app-server WebSocket
  or Unix socket, an already opt-in managed daemon socket, or a separate
  stdio-observer design. It must still avoid enabling remote control silently.

## Stdio Observer Design Contract

The current maintainer Desktop evidence shows a stdio-based app-server surface,
not a reusable observer socket. Stdio transport changes the safety model:
attaching to an already-running Desktop process's stdio pipes is not a
read-only subscription. It can steal, block, or corrupt the process communication
channel even if Codexus never sends a model-turn request.

Therefore a stdio observer is allowed only under one of these conditions:

1. Codexus owns the observed app-server process from launch, with an owner token,
   bounded lifetime, and cleanup evidence.
2. A fake or fixture app-server process is used to prove parser and mapping
   behavior without touching a real Desktop process.
3. A future Codex-supported observer bridge explicitly exposes a non-disruptive
   read-only event stream.

Existing Desktop stdio pipes are not an attach target. Discovery may report them
as facts, but it must keep `stageBReadiness.status: "stdio_only"` and
`promotionRecommendation: "design_stdio_observer"` until a non-disruptive
observer path is proven.

Stdio observer non-goals:

- Do not connect to, wrap, or replace an existing Desktop process's stdio file
  descriptors.
- Do not spawn a Desktop model turn to create observation traffic.
- Do not store transcript values.
- Do not use liveness of a stdio app-server process as Desktop attachment
  support.
- Do not translate stdio discovery into `runtimeSurface: "desktop-app-server"`
  without an observed turn-boundary event.

The implemented stdio slice is a proof harness, not product attachment:

- `cx app-server experiment --stdio-proof --record --json` starts only a fake
  Codexus-owned stdio process that emits bounded JSON-RPC notification method
  shapes and optional turn-boundary-like events.
- It records an experimental `app-server-stdio-proof` manifest with
  owner/process identity, byte/time limits, observed method names, and
  transcript-exclusion proof.
- The manifest is validated through the local schema-artifact subset engine.
- Keep promotion blocked unless a real non-disruptive observer or explicit
  socket path produces a turn-boundary event without transcript data.

## Non-Goals

- Enabling `codex-app-server` as a run driver.
- Replacing the stable `codex exec --json` path.
- Capturing Desktop transcripts.
- Creating a competing chat loop.
- Initiating app-server model turns during evidence collection.
- Automatically enabling remote control or modifying user Codex config.
- Treating app-server absence as a failure of the CLI/TUI attachment path.

## Next CLI Shape

The first implementation should extend the existing experimental command
surface instead of adding stable user-facing promises:

```bash
cx app-server experiment --dry-run --record --probe-process --json
cx app-server experiment --dry-run --record --probe-process --supervise-fake --json
cx app-server discover --record --json
cx app-server experiment --isolated-real --record --json
cx app-server experiment --live-read-only --record --sock <path> --json
cx app-server experiment --stdio-proof --record --json
cx app-server observer status --json
```

`--isolated-real` is implemented behind `CODEXUS_ENABLE_APP_SERVER_ISOLATED=1`.
`--live-read-only` is implemented behind
`CODEXUS_ENABLE_DESKTOP_APP_SERVER_ATTACH=1` plus explicit `--sock <path>`.
That path sends only read-only app-server requests (`initialize`,
`thread/list`, `remoteControl/status/read`) and records notification method
shapes rather than transcript values. Errors must be structured and truthful.
`discover` is read-only discovery: it records process transport modes, default
control-socket availability, and Stage B readiness, but does not connect to a
live socket, start a daemon, or enable remote control.

`--stdio-proof` is implemented as an experimental fake/Codexus-owned process
proof harness. It reports `stability: "experimental"`, records
`app-server-stdio-proof` schema-validatable artifacts, and must not be treated
as live Desktop attachment support. Existing Desktop stdio pipes remain
non-targets.

`cx app-server observer status --json` is implemented as a recorded-evidence
projection. It reads discovery, Stage B, and stdio-proof artifacts under
`.codexus/experiments/app-server/` and does not connect to live sockets, start
Desktop turns, or store transcript values. It reports `desktop-app-server` only
from recorded Stage B turn-boundary evidence; fake/Codexus-owned stdio proof is
kept as design evidence, not live attachment authority.

## Verification

- Unit tests for gate enforcement and unsupported structured errors.
- Manifest tests for Stage A fields, cleanup status, redaction, and bounded
  output.
- Discovery tests for stdio-only and explicit-socket classifications.
- Isolated observer/concurrent-client probe evidence when the local app-server
  surface makes it possible.
- Stdio-observer proof-harness tests using a fake or Codexus-owned process,
  including transcript-exclusion and no-existing-stdio-attach assertions.
- A fake/proxy fixture that proves event mapping without a live Desktop daemon.
- A manual Stage B smoke only when the user explicitly opts in.
- `npm run ci` and `npm run package:smoke` before publishing any related slice.
