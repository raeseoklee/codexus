# Codexus Command Reference

Use this reference when choosing which Codexus command to call from inside a Codex session.

## Readiness

```bash
node codex/skills/codexus/scripts/cx.mjs doctor --json
```

Use for environment readiness, Codex auth, driver capabilities, and Codexus
state root checks.

## Run State

```bash
node codex/skills/codexus/scripts/cx.mjs runs list --json
node codex/skills/codexus/scripts/cx.mjs status <run-id> --json
node codex/skills/codexus/scripts/cx.mjs events tail <run-id> --json
node codex/skills/codexus/scripts/cx.mjs report <run-id> --json
```

Use to reconstruct a run from disk. It does not require a live process or model call.

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

## Runtime Gates

```bash
node codex/skills/codexus/scripts/cx.mjs locks list --json
node codex/skills/codexus/scripts/cx.mjs locks inspect memory --json
node codex/skills/codexus/scripts/cx.mjs schema check --json
node codex/skills/codexus/scripts/cx.mjs schema validate --type state --file .codex-harness/runs/<run-id>/state.json --json
node codex/skills/codexus/scripts/cx.mjs schema validate-run <run-id> --json
node codex/skills/codexus/scripts/cx.mjs app-server roundtrip --dry-run --json
node codex/skills/codexus/scripts/cx.mjs app-server experiment --dry-run --record --probe-process --supervise-fake --timeout-ms 30000 --json
node codex/skills/codexus/scripts/cx.mjs cron run-now --dry-run --record --task "<task>" --json
node codex/skills/codexus/scripts/cx.mjs gateway check --dry-run --record --task "<event>" --json
```

Use these for inspection, run-ledger validation, process-probe evidence, deterministic fake lifecycle supervision, and dry-run audit evidence. Live app-server, cron, and gateway behavior remains gated even when feature gates are enabled.

## Supervised Handoff

```bash
node codex/skills/codexus/scripts/cx.mjs run --driver codex-exec --json "<bounded task>"
node codex/skills/codexus/scripts/cx.mjs run --driver codex-exec --max-driver-repairs 1 --json "<bounded task>"
```

Use sparingly from inside an active Codex session. It starts a separate non-interactive Codex run, so it is best for bounded checks or reproducible sub-runs, not for replacing the current chat.
