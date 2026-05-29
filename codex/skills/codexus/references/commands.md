# Codexus Command Reference

Use this reference when choosing which Codexus command to call from inside a Codex session.

## Readiness

```bash
node codex/skills/codexus/scripts/cx.mjs doctor --json
```

Use for environment readiness, Codex auth, driver capabilities, OMX availability, and state root checks.

## Run State

```bash
node codex/skills/codexus/scripts/cx.mjs status <run-id> --json
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
```

Use for bounded retrieval of source-linked lessons. Do not paste raw ledger history into prompts.

## Skills

```bash
node codex/skills/codexus/scripts/cx.mjs skill propose <run-id> --json
node codex/skills/codexus/scripts/cx.mjs skill review <skill-id> --json
node codex/skills/codexus/scripts/cx.mjs skill promote <skill-id> --json
node codex/skills/codexus/scripts/cx.mjs skill deprecate <skill-id> "<reason>" --json
node codex/skills/codexus/scripts/cx.mjs replay skill <skill-id> --json
```

Promotion should remain explicit. Do not auto-promote a skill just because a proposal exists.

## Supervised Handoff

```bash
node codex/skills/codexus/scripts/cx.mjs run --driver codex-exec --json "<bounded task>"
```

Use sparingly from inside an active Codex session. It starts a separate non-interactive Codex run, so it is best for bounded checks or reproducible sub-runs, not for replacing the current chat.
