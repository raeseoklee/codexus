# Codexus Command Reference

Use this reference when choosing which Codexus command to call from inside a Codex session.

## Readiness

```bash
node codex/skills/codexus/scripts/cx.mjs setup codex-session --scope project --json
node codex/skills/codexus/scripts/cx.mjs doctor --json
node codex/skills/codexus/scripts/cx.mjs plugin status --json
```

Use for environment readiness, Codex auth, driver capabilities, and Codexus
state root checks. `plugin status` validates the experimental Codex plugin
package included with Codexus, but it does not prove always-on supervision.

`setup codex-session` installs or refreshes only the Codexus marker block in
`AGENTS.md` and initializes `.codexus/session/state.json`.

## Updates

```bash
node codex/skills/codexus/scripts/cx.mjs update check --json
node codex/skills/codexus/scripts/cx.mjs update check --channel next --json
```

Use stable update checks for normal advisory availability facts. Use the
`next` channel only when the user explicitly asks about prerelease builds. Both
commands are informational: they do not mutate installation and cannot become
completion, verification, or release authority.

## Current Session

```bash
node codex/skills/codexus/scripts/cx.mjs session status --json
node codex/skills/codexus/scripts/cx.mjs session hud --json
node codex/skills/codexus/scripts/cx.mjs session tasks list --json
node codex/skills/codexus/scripts/cx.mjs session tasks add --title "Wire CLI and tests" --kind implementation --json
node codex/skills/codexus/scripts/cx.mjs session tasks update <task-id> --status in_progress --json
node codex/skills/codexus/scripts/cx.mjs session tasks complete <task-id> --evidence .codexus/session/verification/.../verification.json --json
node codex/skills/codexus/scripts/cx.mjs session tasks block <task-id> --reason "scope boundary reached" --json
node codex/skills/codexus/scripts/cx.mjs session checkpoint "before risky refactor" --json
node codex/skills/codexus/scripts/cx.mjs session verify --verify "npm test" --json
```

Use these first when the active Codex conversation needs durable session
evidence. `session verify` writes command output under
`.codexus/session/verification/`. `session tasks` writes the Codexus-owned
projection artifact at `.codexus/session/tasks.json`; task state is useful for
host-panel mirroring and HUD summaries, but it never becomes verification,
health, or completion authority.

## Run State

```bash
node codex/skills/codexus/scripts/cx.mjs runs list --json
node codex/skills/codexus/scripts/cx.mjs cancel <run-id> --reason "<why>" --json
node codex/skills/codexus/scripts/cx.mjs status <run-id> --json
node codex/skills/codexus/scripts/cx.mjs events tail <run-id> --json
node codex/skills/codexus/scripts/cx.mjs report <run-id> --json
```

Use to reconstruct a run from disk or request cancellation of a live supervised
run. `cancel` writes a marker for the live owner to poll; if the owner is dead,
it marks the orphaned ledger terminal itself.

## Verification

```bash
node codex/skills/codexus/scripts/cx.mjs verify <run-id> --json
node codex/skills/codexus/scripts/cx.mjs verify <run-id> --verify "npm test" --json
```

Use when the current conversation needs to rerun or attach verification evidence to an existing ledger.

## Memory

```bash
node codex/skills/codexus/scripts/cx.mjs memory search "<query>" --json
node codex/skills/codexus/scripts/cx.mjs memory list --json
node codex/skills/codexus/scripts/cx.mjs memory review --json
node codex/skills/codexus/scripts/cx.mjs memory curate --json
```

Use for bounded retrieval of source-linked lessons. Do not paste raw ledger history into prompts.

## Skills

```bash
node codex/skills/codexus/scripts/cx.mjs skill propose <run-id> --json
node codex/skills/codexus/scripts/cx.mjs skill review <skill-id> --json
node codex/skills/codexus/scripts/cx.mjs skill promote <skill-id> --json
node codex/skills/codexus/scripts/cx.mjs skill index --json
node codex/skills/codexus/scripts/cx.mjs skill export <skill-id> --target codex --json
node codex/skills/codexus/scripts/cx.mjs skill improve <skill-id> --reason "<why>" --json
node codex/skills/codexus/scripts/cx.mjs skill deprecate <skill-id> "<reason>" --json
node codex/skills/codexus/scripts/cx.mjs replay skill <skill-id> --with-model-replay --json
node codex/skills/codexus/scripts/cx.mjs replay skill <skill-id> --with-model-replay --allow-live-model-replay --model-budget 1 --json
```

Promotion should remain explicit. Do not auto-promote a skill just because a proposal exists.
Live model replay is blocked unless the local experiment gate is explicitly enabled.

## App Instances

```bash
node codex/skills/codexus/scripts/cx.mjs app instance profile list --json
node codex/skills/codexus/scripts/cx.mjs app instance status --json
node codex/skills/codexus/scripts/cx.mjs app instance start --profile web --worktree . --dry-run --json
node codex/skills/codexus/scripts/cx.mjs app instance logs --instance-id <id> --json
node codex/skills/codexus/scripts/cx.mjs app instance evidence probe --instance-id <id> --json
node codex/skills/codexus/scripts/cx.mjs app instance evidence logs --instance-id <id> --json
node codex/skills/codexus/scripts/cx.mjs app instance evidence metrics --instance-id <id> --json
node codex/skills/codexus/scripts/cx.mjs app instance evidence screenshot --instance-id <id> --evidence-path <path> --json
node codex/skills/codexus/scripts/cx.mjs app instance evidence list --instance-id <id> --json
node codex/skills/codexus/scripts/cx.mjs app instance stop --instance-id <id> --json
```

Use app instance commands for experimental worktree-local dev-server ownership
and observation. The HTTP, log, metric, and screenshot-file evidence adapters
record bounded artifacts tied to an `instanceId`; they do not become health,
cleanup, control, or completion authority.

## Runtime Gates

```bash
node codex/skills/codexus/scripts/cx.mjs locks list --json
node codex/skills/codexus/scripts/cx.mjs locks inspect memory --json
node codex/skills/codexus/scripts/cx.mjs schema check --json
node codex/skills/codexus/scripts/cx.mjs schema validate --type state --file .codexus/runs/<run-id>/state.json --json
node codex/skills/codexus/scripts/cx.mjs schema validate-run <run-id> --json
node codex/skills/codexus/scripts/cx.mjs app-server roundtrip --dry-run --json
node codex/skills/codexus/scripts/cx.mjs app-server observer status --json
node codex/skills/codexus/scripts/cx.mjs app-server experiment --dry-run --record --probe-process --supervise-fake --timeout-ms 30000 --json
node codex/skills/codexus/scripts/cx.mjs cron run-now --dry-run --record --task "<task>" --json
node codex/skills/codexus/scripts/cx.mjs cron recovery --record --json
node codex/skills/codexus/scripts/cx.mjs gateway check --dry-run --record --task "<event>" --json
node codex/skills/codexus/scripts/cx.mjs gateway recovery --record --json
```

Use these for inspection, run-ledger validation, recorded app-server observer bridge summaries, process-probe evidence, deterministic fake lifecycle supervision, dry-run audit evidence, and foreground automation recovery projections. Recovery projections inspect dispatch records and may identify manual-review candidates, but they do not own a scheduler queue, retry automatically, clean up, or claim completion authority. Live app-server, cron, and gateway behavior remains gated even when feature gates are enabled.

## Repository Knowledge

```bash
node codex/skills/codexus/scripts/cx.mjs repo check --gate --json
node codex/skills/codexus/scripts/cx.mjs repo map --json
node codex/skills/codexus/scripts/cx.mjs repo graph import --graph-provider understand-anything --source .understand-anything/knowledge-graph.json --scope "src/**" --json
node codex/skills/codexus/scripts/cx.mjs repo graph search --graph <graph-id-or-path> verification --json
node codex/skills/codexus/scripts/cx.mjs repo graph explain --graph <graph-id-or-path> <node-or-edge-id> --json
node codex/skills/codexus/scripts/cx.mjs wiki map --json
node codex/skills/codexus/scripts/cx.mjs wiki build --mode deterministic --json
node codex/skills/codexus/scripts/cx.mjs wiki build --mode advisory --json
node codex/skills/codexus/scripts/cx.mjs wiki check --gate --json
node codex/skills/codexus/scripts/cx.mjs wiki context --topic verification --budget 1200 --fresh-only --gate --json
node codex/skills/codexus/scripts/cx.mjs wiki injection-policy --json
node codex/skills/codexus/scripts/cx.mjs wiki injection plan --approval <approval-id-or-path> --target session:current --json
node codex/skills/codexus/scripts/cx.mjs wiki export --target docs/codexus-wiki --json
```

Use `repo check` for gateable mechanical docs-code invariants. Graph import is
JSON-only: Codexus records sanitized source provenance and source hashes without
executing provider packages. Graph search/explain is read-only advisory context
and must not be treated as automatic prompt injection. Use `wiki` commands for
regenerable projection pages over repository facts and Codexus artifacts. `wiki
build --mode advisory` records a local source-bundle synthesis artifact without
invoking a model and remains ineligible for automatic injection. `wiki context
--fresh-only --gate` fails instead of returning stale pages when a caller needs
fresh manual context. `wiki injection-policy` reports the manual-only context
handoff boundary and keeps automatic prompt injection deferred. `wiki injection
plan` writes a report-only, planned-not-applied artifact from an explicit fresh
approval and target; `wiki injection apply` remains deferred. `wiki export` is
explicit, requires a fresh passing wiki check, and does not auto-commit or become
source truth.

## Release Policy

```bash
node codex/skills/codexus/scripts/cx.mjs release policy --json
node codex/skills/codexus/scripts/cx.mjs release policy --gate --json
node codex/skills/codexus/scripts/cx.mjs release check --gate --json
```

Use `release policy` before cutting a stable version. It reports the project
cadence policy, hotfix exceptions, version-boundary rules, and English/Korean
policy-doc presence. Use `release check` for release-integrity evidence.

## Supervised Handoff

```bash
node codex/skills/codexus/scripts/cx.mjs run --driver codex-exec --json "<bounded task>"
node codex/skills/codexus/scripts/cx.mjs run --driver codex-exec --max-driver-repairs 1 --json "<bounded task>"
```

Use sparingly from inside an active Codex session. It starts a separate non-interactive Codex run, so it is best for bounded checks or reproducible sub-runs, not for replacing the current chat.
