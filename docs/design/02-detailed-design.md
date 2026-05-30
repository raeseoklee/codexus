# Detailed Design

[Korean](../ko/design/02-detailed-design.md)

## Runtime Package Shape

Initial source layout:

```text
src/
  cli/
    main.ts
    commands/
      doctor.ts
      plan.ts
      run.ts
      status.ts
      resume.ts
      verify.ts
      replay.ts
      memory.ts
      skill.ts
      adapt-omx.ts
  config/
    loader.ts
    schema.ts
  drivers/
    contract.ts
    codex-exec.ts
    codex-app-server.ts
    mock.ts
  ledger/
    paths.ts
    state.ts
    events.ts
    artifacts.ts
  workflow/
    kernel.ts
    phases.ts
    repair.ts
  verification/
    runner.ts
    result.ts
  policy/
    preflight.ts
    redaction.ts
  evolution/
    experience.ts
    memory.ts
    skills.ts
    replay.ts
  adapters/
    omx.ts
```

This layout keeps command parsing thin. The workflow kernel and driver contracts should be testable without invoking the real CLI.

## CLI Contract

The canonical public CLI names are `cx` and the long-form `codexus`.

Claw-derived command rule: every automation-facing command must have a stable
machine-readable contract. Human prose is a projection, not the source of
truth. JSON errors should use typed codes and hints so callers do not parse
stderr or match substrings.

Automation-facing CLI failures use this envelope:

```json
{
  "schemaVersion": 1,
  "type": "error",
  "code": "unknown_command",
  "message": "Unknown command: nonesuch.",
  "hint": "Run `cx --help` to see supported commands.",
  "command": "nonesuch",
  "details": {
    "target": "nonesuch"
  },
  "exitCode": 1
}
```

### `cx doctor`

Purpose: inspect local readiness.

Inputs:

- `--json`
- `--strict`: for JSON automation, return a nonzero process exit code when any check has `status: "fail"`.
- `--cwd <path>`

Checks:

- Node version
- package version
- npm packaging readiness through `dist/cli/main.js` and release smoke tests
- `codex --version`
- `codex login status`
- `codex exec --help`
- `codex app-server --help`
- `codex features list`
- `omx --version`
- `omx doctor` availability
- `git rev-parse --show-toplevel`
- `tmux -V`
- writable harness state root
- selected driver capability probe

JSON shape:

```json
{
  "ok": true,
  "strict": false,
  "checks": [
    {
      "id": "codex.auth",
      "status": "pass",
      "summary": "Logged in using ChatGPT",
      "details": {}
    }
  ],
  "warnings": []
}
```

Default JSON mode is diagnostic-friendly: `ok: false` is encoded in the JSON body, but the process exits 0 if the command itself completed. CI and automation should use `cx doctor --json --strict` when failed checks must fail the process.

### `cx run`

Purpose: supervise a Codex task through execution, verification, and experience capture.

Inputs:

- prompt argument or stdin
- `--cwd <path>`
- `--driver codex-exec|mock|codex-app-server`
- `--verify <command>` repeatable
- `--max-repairs <n>`
- `--max-driver-repairs <n>` for repairable driver task failures
- `--sandbox read-only|workspace-write|danger-full-access`
- `--approval untrusted|on-request|never` where supported by the selected driver
- `--json`

Example:

```bash
cx run --verify "npm test" "fix the failing parser tests"
```

### `cx cancel <run-id>`

Purpose: request cancellation for a live supervised run without corrupting the
ledger.

Behavior:

- each active run writes `owner.json` with pid, hostname, heartbeat, and TTL,
- `cx cancel` writes `cancel-request.json` when the owner is live,
- the owning kernel polls the marker, aborts its local `AbortSignal`, and writes
  the terminal `cancelled` state plus `run.cancel_requested` evidence,
- if the owner is dead or stale, `cx cancel` marks the orphaned running ledger
  terminal with `run.cancel_orphaned` and `run.terminal` events.

### `cx status <run-id>`

Purpose: reconstruct current or terminal run state from disk.

Required behavior:

- no live process required,
- no model call,
- no mutation.

JSON output should include at least run id, phase, terminal outcome, selected
driver/model, verification summary, latest typed events, and paths to evidence
artifacts. If state is missing or corrupt, return a typed error with a recovery
hint.

### `cx verify <run-id>`

Purpose: rerun configured verification for an existing run and append evidence.

### `cx replay <scenario>`

Purpose: run a mock or recorded scenario through the kernel to validate behavior without model access.

Replay scenarios should converge toward the Claw mock parity categories:
streaming text, file/tool roundtrips, write denial, multi-tool turns, shell
output, permission prompt approved/denied, plugin or skill path, compaction or
large-output behavior, and usage accounting.

Live model replay is never implicit. It requires structural replay first,
`--with-model-replay`, `--allow-live-model-replay`, a positive
`--model-budget`, and the local `CODEXUS_ENABLE_LIVE_MODEL_REPLAY=1` experiment
gate.

The structural replay path includes fixture-backed pass, failure, and extended
cases. A fixture matrix must cover every canonical parity label before a new
label is accepted: deterministic pass, streaming text, tool success/denial,
permission branch/approved/denied, multi-tool turn, skill path, file/tool
roundtrip, shell output, interruption, compaction, large output, and usage
accounting. This is structural coverage, not proof that live model behavior has
parity.

### `cx memory ...`

Purpose: retrieve, add, list, review, curate, and prune scoped memory entries
and source run references.

Subcommands:

- `search <query>`
- `add --kind <kind> <text>`
- `list`
- `review`
- `curate`
- `prune --before <iso-date>`

### `cx locks ...`

Purpose: inspect and clear Codexus lock metadata without guessing filesystem
state.

Subcommands:

- `cx locks list --json`
- `cx locks inspect <name> --json`
- `cx locks clear <name> --stale-only --json`

### `cx schema check`

Purpose: verify that versioned schema artifacts and the app-server fixture are
present, structurally valid, and compatible with the local zero-dependency JSON
Schema subset engine.

### `cx schema validate` and `cx schema validate-run`

Purpose: validate a single durable JSON record or an existing run ledger with
both focused local validators and the local schema-artifact subset engine.
`validate-run` checks state, event JSONL shape, artifact-schema compatibility,
event/run id consistency, terminal event consistency, and optional
verification/experience artifacts based on the run state and input config.

### `cx adapt omx context`

Purpose: format bounded active `codexus:<skill-name>` skills and memory entries
into a prompt-safe block for the current Codex session. It retrieves context but
does not inject it automatically or create a separate chat loop.

`--approve` writes a durable, non-injected context artifact under
`.codexus/adapters/context/<id>/` with `context.md`, `context.json`, and a
hash. This is an explicit handoff artifact, not automatic prompt mutation.

### `cx app-server roundtrip` and `cx app-server experiment`

Purpose: expose an app-server dry-run roundtrip contract before any live
process control. The experiment command writes or previews a sandbox manifest
with lifecycle, timeout, and cleanup intent. `--live` is rejected unless the
local experiment gate is set, and the stable path remains `codex exec --json`.

`cx app-server experiment --dry-run --record --json` writes the manifest while
still avoiding process startup.
`--probe-process` may add bounded `codex app-server --help` process evidence,
but it is not a supervised app-server lifecycle or JSON-RPC turn execution.
`--supervise-fake` records deterministic fake process lifecycle evidence with
pid, timeout, stop signal, cleanup, and bounded stdout/stderr previews; it does
not start the real app-server.

### `cx cron run-now` and `cx gateway check`

Purpose: return dry-run automation plans with lock and ledger-event intent.
Live dispatch remains disabled until policy and approval events are complete.

`--record` writes a dry-run audit record with policy-check, lock-planning, and
dispatch-skipped events. These records are the compatibility boundary for later
live cron/gateway dispatch. The plan also carries policy and approval contract
fields; even when a feature gate is enabled, live dispatch stays blocked until a
dispatcher capability is implemented and reviewed.

### `cx skill ...`

Subcommands:

- `propose <run-id>`
- `review <skill-id>`
- `promote <skill-id>`
- `export <skill-id> --target codex|omx`
- `improve <skill-id>`
- `deprecate <skill-id>`
- `index`
- `list`

Promotion and improvement must be explicit. Adapter retrieval only returns
active skills whose active index entry is still approved and replay-passed.

Generated skill records separate storage id from Codex-facing display identity.
The stable storage id remains filesystem-safe, while the displayed identity uses
`codexus:<skill-name>` so generated Codexus skills are visually distinct in
Codex-oriented surfaces.

### `cx adapt omx ...`

Purpose: inspect available OMX interop capabilities and retrieve bounded active
skill/memory context without requiring OMX for core use.

## Codex-Native Adapter Contract

The external CLI is the implemented engine path. The product direction is now a
Codex-native session runtime that makes Codexus invokable from inside the
current interactive Codex session, similar in feel to OMX.

Adapter requirements:

- call the same Codexus core used by `cx`,
- share `.codexus` ledger, memory, and skill stores,
- avoid duplicating workflow kernel logic inside a skill or plugin wrapper,
- support narrow commands first, such as status, memory retrieval, skill review,
  bounded context retrieval, checkpointing, and session verification,
- treat supervised run handoff as a deliberate nested sub-run, not the normal
  in-session workflow,
- add marker-bounded AGENTS overlays and local session state before any
  transparent prompt injection,
- preserve the external CLI as the automation and CI surface.

Implemented first slice:

- `cx setup codex-session [--scope user|project] [--always-on] [--enable-notify-hook|--disable-notify-hook] [--json]`
- `cx session status [--json]`
- `cx session migrate [--dry-run] [--json]`
- `cx session checkpoint <label> [--json]`
- `cx session verify --verify <cmd> [--json]`

## Config

Config precedence:

1. CLI flags
2. project `.codexus/config.json`
3. user `~/.codexus/config.json`
4. defaults

Initial config:

```json
{
  "driver": "codex-exec",
  "codex": {
    "command": "codex",
    "model": null,
    "sandbox": "workspace-write",
    "approval": "on-request",
    "runTimeoutMs": 1800000
  },
  "verification": {
    "commands": [],
    "timeoutMs": 120000
  },
  "repair": {
    "maxIterations": 1,
    "maxDriverFailureIterations": 0
  },
  "evolution": {
    "enabled": true,
    "autoPromote": false,
    "redactBeforeMemory": true
  },
  "omx": {
    "enabled": "auto",
    "preferSparkshellForVerification": true
  },
  "automation": {
    "cronEnabled": false,
    "gatewayEnabled": false
  }
}
```

Unknown config keys should produce warnings, not crashes, until the schema stabilizes. Driver-specific config entries are interpreted through capability probes rather than blindly appended to every command invocation. If a configured Codex option is dropped because the local `codex exec` capability probe does not advertise the flag, the run ledger records a `config.option_ignored` event.

## Storage Layout

Project-local root:

```text
.codexus/
  config.json
  runs/
  memory/
  skills/
  replay/
  omx/
```

Run layout:

```text
.codexus/runs/<run-id>/
  input.json
  state.json
  events.jsonl
  raw/
    codex-stdout.jsonl
    codex-stderr.log
  artifacts/
    final-message.md
    diff.patch
  verification.json
  experience.json
  report.md
```

Rules:

- `events.jsonl` is append-only.
- `state.json` is atomically rewritten.
- raw driver output is preserved before normalization.
- reports are regenerated from structured records when possible.

## Run Ids

Format:

```text
run_YYYYMMDD_HHMMSS_<6-char-random>
```

The id must be filesystem-safe, sortable, and unique enough for local use.

## State Schema

`state.json`:

```json
{
  "schemaVersion": 1,
  "runId": "run_20260529_171500_ab12cd",
  "status": "running",
  "phase": "execute",
  "outcome": null,
  "createdAt": "2026-05-29T08:15:00.000Z",
  "updatedAt": "2026-05-29T08:16:00.000Z",
  "cwd": "/absolute/path",
  "driver": "codex-exec",
  "promptHash": "sha256:...",
  "repairIteration": 0,
  "verification": {
    "required": true,
    "latestStatus": "pending"
  },
  "artifacts": []
}
```

Allowed `status`:

- `running`
- `terminal`

Allowed `phase`:

- `intake`
- `research`
- `plan`
- `execute`
- `verify`
- `repair`
- `evolve`
- `complete`
- `failed`
- `blocked`
- `cancelled`

Current kernel execution uses `intake`, `execute`, `verify`, `repair`, `evolve`,
and terminal phases. `research` and `plan` are reserved state-schema values for
future first-class phases; today planning is exposed as the separate `cx plan`
command.

Allowed terminal `outcome`:

- `complete`
- `failed`
- `blocked`
- `cancelled`

## Event Schema

`events.jsonl` records:

```json
{
  "schemaVersion": 1,
  "eventId": "evt_...",
  "runId": "run_...",
  "timestamp": "2026-05-29T08:15:00.000Z",
  "phase": "execute",
  "type": "driver.raw",
  "source": "codex-exec",
  "payload": {}
}
```

Core event types:

- `run.created`
- `phase.changed`
- `policy.warning`
- `policy.blocked`
- `permission.checked`
- `permission.denied`
- `approval.requested`
- `approval.resolved`
- `driver.started`
- `driver.raw`
- `driver.normalized`
- `driver.completed`
- `driver.failed`
- `verification.started`
- `verification.completed`
- `repair.started`
- `repair.completed`
- `evolution.experience_written`
- `skill.proposed`
- `run.terminal`

Raw Codex events should be stored in `raw/codex-stdout.jsonl` and referenced from normalized events instead of being discarded.

Claw's event/report contract reinforces that structured events outrank terminal
text. Codexus events should therefore carry enough provenance for consumers to
tell whether an event is live driver output, normalized harness state, replay
evidence, verification evidence, or a projected report field.

## Driver Contract

TypeScript shape:

```ts
export interface DriverCapabilities {
  supportsJsonl: boolean;
  supportsSandboxFlag: boolean;
  supportsApprovalFlag: boolean;
  supportsModelFlag: boolean;
  supportsOutputLastMessage: boolean;
  stderrMayContainWarningsOnSuccess: boolean;
  finalMessageShapes: string[];
}

export interface DriverProbe {
  available: boolean;
  summary: string;
  capabilities: DriverCapabilities;
  details?: JsonValue;
}

export interface DriverRequest {
  runId: string;
  cwd: string;
  prompt: string;
  config: DriverConfig;
  context?: Record<string, unknown>;
}

export interface DriverEvent {
  type: string;
  source: string;
  payload: unknown;
  raw?: unknown;
}

export interface DriverResult {
  status: "succeeded" | "failed" | "blocked" | "cancelled";
  finalMessage?: string;
  exitCode?: number;
  usage?: Record<string, unknown>;
  error?: string;
}

export interface HarnessDriver {
  name: string;
  probe(): Promise<DriverProbe>;
  run(request: DriverRequest, emit: (event: DriverEvent) => Promise<void>): Promise<DriverResult>;
}
```

`probe()` must be cheap and must not perform a model call. Probe results should be cached per process when used by several commands, but each `doctor` run should report the current observed capabilities.

Capability rules:

- `run()` must only pass flags supported by its own capabilities.
- Unsupported requested options should produce a warning event or be recorded in `doctor`, not silently pretend to apply.
- Raw output capture is mandatory even when parsing fails.
- A successful exit with stderr is not an error when `stderrMayContainWarningsOnSuccess` is true.

## CodexExecDriver

Command shape:

```bash
codex exec --json --skip-git-repo-check -C <cwd> --sandbox <mode> <prompt>
```

Optional flags:

- `--model <model>`
- `--sandbox <mode>`
- `--output-last-message <path>`

Do not pass top-level-only flags to `codex exec` unless the installed `codex exec --help` explicitly supports them. In `codex-cli 0.135.0`, `--ask-for-approval` is not accepted by `codex exec`, so approval policy must remain a future capability-gated feature for this driver.

Observed MVP capabilities for `codex-cli 0.135.0`:

```json
{
  "supportsJsonl": true,
  "supportsSandboxFlag": true,
  "supportsApprovalFlag": false,
  "supportsModelFlag": true,
  "supportsOutputLastMessage": true,
  "stderrMayContainWarningsOnSuccess": true,
  "finalMessageShapes": ["item.completed.item.text"]
}
```

Parsing rules:

- stdout is JSONL when possible,
- malformed JSONL lines become `driver.raw_text` events,
- stderr is preserved,
- stderr on a zero exit is warning/noise, not a driver error,
- nonzero exit is `failed` unless a known approval/blocker pattern maps to `blocked`.

The installed Codex CLI emits the final assistant message as an `item.completed` event with nested `item.text`; parsers must inspect nested payloads rather than assuming a top-level `text` field.

The driver must not parse final success from prose alone. It only reports driver completion. The kernel decides harness completion after verification.

## Verification Runner

Verification command record:

```json
{
  "id": "verify_001",
  "command": "npm test",
  "cwd": "/absolute/path",
  "startedAt": "...",
  "completedAt": "...",
  "exitCode": 0,
  "status": "passed",
  "stdoutPath": "artifacts/verify_001.stdout.log",
  "stderrPath": "artifacts/verify_001.stderr.log",
  "summary": "tests passed"
}
```

Status values:

- `passed`
- `failed`
- `skipped`
- `timed_out`
- `error`

If any required verification is not `passed`, the run cannot become `complete`.

## Repair Loop

Repair input should be bounded:

- user task summary,
- relevant final Codex message,
- failed verification summaries,
- small stderr excerpts,
- changed file list if available,
- explicit instruction to repair and rerun verification.

Repair stops when:

- verification passes,
- max repair iterations reached,
- driver reports blocked/cancelled,
- policy blocks further mutation.

MVP repair scope is intentionally narrower: repair runs only after a driver succeeds and required verification fails. Driver failures are recorded and surfaced without automatic retry until error classification is stronger.

Driver-failure repair requires a future classifier that can distinguish at least:

- configuration/auth failure,
- unsupported flag failure,
- model/rate-limit failure,
- policy/approval failure,
- model-generated task failure.

Only the last category is a candidate for automatic repair.

## Subagent Execution Policy

Subagents are not part of the MVP correctness path. They can help with parallel implementation or review, but the harness must continue to work when subagent launch fails.

Rules:

- Do not hardcode fixed role models for ChatGPT-authenticated accounts.
- Prefer default/inherited subagent model selection.
- Store subagent launch failures as operational evidence if they occur during harness-managed work.
- Never require subagents for run ledger, verification, repair, memory, or skill promotion.

## Status Reconstruction

`cx status` reads:

1. `state.json`
2. latest `events.jsonl` tail
3. `verification.json`
4. `experience.json` if present

It should never require raw Codex logs unless the user asks for verbose detail.

## Error Classification

Initial error classes:

- `codex_not_found`
- `codex_not_authenticated`
- `driver_spawn_failed`
- `driver_json_parse_warning`
- `verification_failed`
- `verification_timeout`
- `policy_blocked`
- `repair_budget_exhausted`
- `state_corrupt`
- `unsupported_feature`
- `unknown_command`
- `unexpected_arguments`
- `permission_denied`
- `approval_required`
- `capability_unavailable`

Errors should include:

- stable code,
- short message,
- suggested next action when obvious,
- source command or file path.

Typed errors should be emitted in JSON by automation-facing commands. Invalid
suffix arguments should fail at parse time instead of falling through to prompt
dispatch.

## OMX Adapter Contract

`cx adapt omx status --json`:

```json
{
  "available": true,
  "version": "0.11.9",
  "features": {
    "explore": true,
    "sparkshell": true,
    "team": true,
    "agents": true
  },
  "warnings": [
    {
      "code": "omx_older_than_research_baseline",
      "message": "Local OMX is older than the researched upstream baseline."
    }
  ]
}
```

The adapter may call read-only commands automatically. Mutating OMX commands require explicit user command or workflow policy.

## App-Server Driver Gate

The app-server driver must remain gated until:

- schema generation works in CI/dev,
- thread start/turn start roundtrip is tested,
- approval/request flows are understood,
- failure modes are recorded,
- driver can be disabled without affecting core runtime.

Default config must keep it off.

Desktop/app-server attachment is a separate evidence track from enabling the
app-server as a run driver. The next slice must follow the A/B contract in
[Desktop app-server attachment evidence plan](../plans/2026-05-30-desktop-app-server-attachment-evidence-plan.md):
isolated temporary-state evidence first, then explicit read-only opt-in against
a real daemon. Stage B must not enable remote control silently, mutate user
Codex config, steer turns, store transcripts, or connect to a real control
socket unless observer/concurrent-client behavior is known to be non-disruptive.

## Testing Strategy

Minimum tests before feature work:

- config precedence unit tests,
- run id generation tests,
- atomic state write tests,
- event append tests,
- mock driver successful run,
- mock driver failed verification,
- repair loop budget exhaustion,
- `doctor --json` shape test,
- `status` reconstruction test.

Reference-parity and contract coverage now in place:

- JSON error envelope tests for unexpected arguments, unsupported capabilities, missing/corrupt state, and disabled drivers,
- permission and approval event tests,
- large-output and malformed-driver-output tests,
- replay fixture matrix tests for every canonical parity label,
- schema validation tests for single records and run ledgers,
- dry-run audit-record tests for adapter context, app-server, cron, and gateway,
- truthful capability/status tests for disabled app-server behavior.

Real smoke tests:

- `cx doctor`
- `cx run --driver codex-exec "Reply exactly OK"`

Real smoke tests should be opt-in in CI because they consume Codex usage.
