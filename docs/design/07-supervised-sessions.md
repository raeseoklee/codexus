# Session-Native Supervision

[Korean](../ko/design/07-supervised-sessions.md)

Date: 2026-05-30
Status: proposed direction change

## Decision

Codexus should move toward an OMX-informed, Codex-session-native runtime as the
primary user experience. OMX is prior art for session-native integration; it is
not Codexus' identity.

The previous external thread proposal used
`codex exec resume <thread-id>` to create a separate multi-turn non-interactive
Codex thread. That is useful as an external supervised-run feature, but it is
not the session-native shape the product needs. It does not attach to the
current Codex TUI conversation; it starts and resumes a separate `codex exec`
thread.

The new direction is:

```text
Codex TUI session
  + Codexus skill adapter
  + Codexus AGENTS overlay
  + Codexus hooks / status state
  + Codexus CLI core
  + optional tmux/team runtime
```

`cx` remains the backend engine and automation surface. The normal user flow
should happen inside the current Codex session through explicit Codexus skill
commands and session guidance.

## Why This Is Feasible

OMX shows the viable integration pattern. It does not need to replace Codex or
own a second chat UI. It augments Codex through local, installable surfaces:

- skills under `${CODEX_HOME:-~/.codex}/skills`,
- marker-bounded `AGENTS.md` guidance overlays,
- Codex TUI/statusline configuration where supported,
- local state files for mode, turn, HUD, and worker state,
- hooks and notification paths where the installed Codex supports them,
- tmux panes for durable workers and team execution,
- a CLI that Codex can call from inside the session.

Codexus can use the same class of surfaces. The implementation must stay
capability-gated and truthful: when a hook, statusline, or tmux feature is not
available, Codexus reports that fact instead of implying invisible attachment.

## Product Shape

Codexus has three runtime layers, ordered by product importance.

### 1. Codex-Native Session Runtime

This is the target primary UX.

```text
User in Codex TUI
  -> mentions codexus / $codexus
  -> installed Codexus skill runs a bounded command
  -> Codexus records session state, evidence, memory, and verification output
  -> current Codex conversation remains the interaction owner
```

This layer should feel like a harness attached to the current Codex session. It
must not create a competing readline/chat loop.

Expected commands inside Codex:

```text
codexus doctor 상태 확인해줘.
codexus checkpoint "parser fix before refactor" 기록해줘.
codexus verify "npm test" 결과를 현재 작업 증거로 붙여줘.
codexus memory search "parser regression" 필요한 것만 요약해줘.
codexus mode ralph-like persistence 켜고 상태 보여줘.
codexus status 현재 세션과 최근 verification 상태 보여줘.
```

Initial implementation may route these through existing CLI commands; later
slices can add friendlier aliases such as `checkpoint`, `session status`, and
`mode`.

### 2. External Supervised Runs

This is the implemented, stable engine path.

```text
cx run --verify "npm test" "<bounded task>"
```

It starts a separate `codex exec --json` process and gives that process the full
Codexus treatment: ledger, verification, repair, memory, replay, and
cancellation. It is excellent for bounded sub-runs, automation, and reproducible
evidence. It should not be described as attaching to the current Codex TUI
conversation.

### 3. External Exec-Resume Sessions

The previous `codex exec resume <thread-id>` idea is deferred as an optional
advanced feature. If implemented, it should be documented as:

```text
cx thread start/continue
  -> one external non-interactive Codex exec thread
  -> multiple supervised turns over that external thread
```

It is not the primary session-native path. Keep the `cx session` namespace
reserved for the current Codex-session-native state, checkpoint, and
verification surface.

## Session-Native Components

### Skill Adapter

The npm package already installs the `codexus` Codex skill by default for global
installs. The skill should remain thin: it calls the same Codexus CLI/core as
external users and summarizes JSON evidence back into the current Codex
conversation.

### AGENTS Overlay

Codexus should provide a marker-bounded overlay that can be installed at user or
project scope:

```markdown
<!-- CODEXUS:RUNTIME:START -->
... Codexus session-native operating contract ...
<!-- CODEXUS:RUNTIME:END -->
```

The overlay should teach Codex how to use Codexus during the current session:

- prefer current-session work for ordinary edits,
- call Codexus for durable evidence, verification, memory, replay, and mode
  state,
- avoid nested `cx run` unless a bounded supervised sub-run is explicitly useful,
- keep all Codexus claims grounded in command output or local artifacts,
- treat unsupported runtime hooks as unavailable, not silently active.

The installer must preserve non-Codexus content and update only its own marker
region.

### Session State

Codexus should add a session-native state area under the existing storage root:

```text
.codexus/session/
  state.json
  checkpoints/
  verification/
  context/
```

The state should track:

- session id or best available Codex session identifier when visible,
- cwd and project root,
- last Codexus command,
- active mode flags,
- checkpoint ids,
- verification evidence,
- linked run ids from external supervised sub-runs,
- hook/status capability status.

This state is not a hidden transcript. Codexus should not claim to capture the
full current TUI conversation unless Codex exposes a supported transcript API.
Instead, the current Codex agent explicitly writes checkpoints and evidence when
the user or overlay asks for them.

Until Codex exposes a stable per-conversation identifier, this state is a
cwd-scoped singleton, not a per-Codex-thread store. Concurrent writes are
protected by the Codexus `session` lock; another overlapping writer should
retry after the active session operation completes.

### Hooks and HUD

Codexus should support hook/status integration as an optional capability, not a
hard dependency.

Target behavior:

- `codexus session status --json` reads the session state.
- `codexus session migrate --json` is the explicit migration boundary for
  `.codexus/session/state.json`; new session-state schema changes must add a
  migration here before changing writers.
- `cx setup codex-session --enable-notify-hook --json` can install a Codex
  notify hook only after the current project is already trusted by Codex.
- The notify hook records bounded turn activity in `.codexus/session/state.json`
  and chains to any previous top-level `notify = [...]` command through
  `--previous-notify`.
- On `turn-ended`, the notify hook may record derived `heartbeatEvidence` and
  compact `heartbeatChangeEvidence` snapshots. These snapshots are read-only:
  they never execute verification and never make stale evidence fresh.
- Notify capability is split into config installation and observed dispatch:
  `capabilities.hooks` is `configured` after install, and becomes `available`
  only after a real `turn-ended` event is observed. Manual smoke events must not
  mark dispatch observed.
- Runtime surface detection is unknown-biased. Codexus records bounded runtime
  context when the hook fires, but it must not infer Desktop/app-server or
  CLI/TUI support from missing dispatch alone.
- Config rewrites must be atomic, must create a one-time
  `config.toml.codexus.bak` backup, and must support `--disable-notify-hook`
  to restore the previous notify command or remove Codexus when no previous
  command existed without refreshing the AGENTS overlay.
- `codexus hud --json` may later report compact mode, verification, and
  checkpoint state.
- If Codex TUI statusline configuration can include Codexus state, a later setup
  slice can enable it with explicit user-visible configuration.
- Desktop/app-server attachment is the second runtime half of session-native
  attachment, not a replacement for CLI/TUI notify. Investigate it only through
  the A/B evidence plan: isolated app-server evidence first, then explicit
  read-only opt-in against a real daemon. Codexus must not enable remote control,
  mutate user Codex config, steer turns, or report `desktop-app-server`
  availability before observing a real read-only event.

If a hook or statusline path is unavailable, `doctor` and `session status` must
say so clearly.

### Tmux and Workers

OMX's durable team behavior comes from tmux-backed workers. Codexus can adopt a
similar optional runtime later:

```text
Codex leader pane
  -> codexus team start
  -> tmux worker panes
  -> shared .codexus/session/team state
```

This should complement Codex native subagents, not replace them.

For Codex native subagents inside the current session, see
[Subagent evidence supervision](09-subagent-evidence-supervision.md). The same
rule applies there: subagents may produce claims, but verification remains the
completion gate.

## Explicit Non-Goals

- Do not build a separate chat/readline UI.
- Do not claim transparent attachment to the current TUI transcript without a
  supported Codex API.
- Do not make `codex exec resume` the primary session-native story.
- Do not auto-inject retrieved memory or skills into prompts without a
  user-visible approval step.
- Do not silently modify user/project `AGENTS.md` outside Codexus markers.
- Do not require tmux for basic Codex-native usage.

## Command Surface Direction

Implemented first-slice CLI surface:

```bash
cx setup codex-session [--scope user|project] [--always-on] [--enable-notify-hook|--disable-notify-hook] [--json]
cx session status [--json]
cx session hud [--json]
cx session migrate [--dry-run] [--json]
cx session checkpoint <label> [--json]
cx session verify --verify <cmd> [--json]
cx session notify [--event <name>] [--json]
cx session workers status [--json]
```

Planned later CLI surface:

```bash
cx session mode list [--json]
cx session mode enable <mode> [--json]
cx session mode disable <mode> [--json]
```

Inside Codex, the user-facing language should stay natural:

```text
codexus로 checkpoint 남기고 npm test 검증 붙여줘.
codexus session status 확인해줘.
codexus memory search로 이 버그와 관련된 lesson 찾아줘.
```

## Relationship to Existing Commands

- `cx run`: remains the external supervised sub-run engine.
- `cx resume`: remains shallow compatibility for one previous run.
- future `cx thread start/continue`: if built, it belongs to the external
  exec-resume layer, not the Codex-native layer. Do not reuse `cx session` for
  that external thread feature.
- `$codexus`: becomes the preferred in-Codex entrypoint for session-native use.

## Acceptance Criteria

- npm/global install provides a working `codexus` skill adapter.
- `cx setup codex-session --scope project --json` installs or updates only a
  marker-bounded Codexus AGENTS overlay.
- `cx setup codex-session --scope project --always-on --json` installs the
  stronger always-on overlay profile. It requests checkpoints and verification
  in the current Codex session but does not prove that they happened.
- Always-on heartbeat snapshots include a compact quality-evidence/gate summary
  so Codex can surface stale or blocked change evidence after a turn without
  running a verification command.
- `cx doctor --json` reports skill install, overlay install, hook availability,
  statusline availability, tmux availability, and session-state health.
- From inside Codex, asking for Codexus status causes the skill to call local
  Codexus core and summarize grounded JSON output.
- `cx session migrate --json` reports and persists explicit session-state
  migrations; `--dry-run` reports the same migration without rewriting state.
- `cx session checkpoint <label> --json` writes a local checkpoint artifact that
  can be referenced later in the same project.
- `cx session verify --verify <cmd> --json` runs verification, records the
  artifact under `.codexus/session/`, and reports a typed result.
- `cx session hud --json` reports a compact read-only status summary without
  claiming statusline integration.
- Optional notify-hook attachment preserves existing notify chains and refuses
  install when Codex project trust is not configured.
- `notifyDispatch.status` reports `observed` only from real `turn-ended`
  events, and `capabilities.hooks` distinguishes `configured` from `available`.
- Codexus notify adapter events record `runtimeSurface: "cli-tui"` while direct
  or ambiguous `cx session notify` calls remain unknown unless explicitly
  tagged.
- Notify-hook detach restores the previous notify command or removes the
  Codexus-only notify line without installing or refreshing an overlay.
- Unsupported statusline/tmux launch features return truthful unavailable or
  gated statuses.
- External `cx run` continues to work unchanged.

## Implementation Slices

1. Completed: replace the previous exec-resume priority in docs with this
   session-native direction.
2. Completed: add setup/doctor checks for skill, marker overlay, unavailable
   hook/statusline capability, and session state root.
3. Completed: add session state files and read-only `cx session status`.
4. Completed: add `checkpoint` and `session verify` commands.
5. Completed: update the Codexus skill instructions so Codex prefers
   session-native commands before nested `cx run`.
6. Completed: add session-state schema artifact validation and optional
   notify-hook attachment behind Codex project trust checks.
7. Completed: harden Codex config rewrites with atomic writes, one-time backup,
   and notify-hook detach.
8. Completed: add an explicit session-state migration boundary and `cx session
   migrate` command.
9. Completed: promote session state to v2 with truthful notify dispatch
   capability semantics.
10. Completed: run the Desktop app-server attachment evidence slice using the A/B
   contract in
   [Desktop app-server attachment evidence plan](../plans/2026-05-30-desktop-app-server-attachment-evidence-plan.md).
11. Completed: add `cx session hud --json` as a compact read-only session
   summary. Statusline integration remains blocked until Codex exposes a stable
   supported configuration surface.
12. Completed: add `cx session workers status --json` as a truthful tmux worker
   launch gate without starting worker panes.
13. Later: revisit external `codex exec resume` as a separate advanced feature only
   after the Codex-native path is useful.
