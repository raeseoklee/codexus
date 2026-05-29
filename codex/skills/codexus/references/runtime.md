# Runtime Positioning

Codexus has two surfaces:

```text
External CLI:
User -> cx/codexus -> Codexus core -> codex exec --json -> Codex

Codex-native adapter:
Codex session -> $codexus skill -> Codexus core
```

This skill implements the Codex-native adapter surface. It should call the same Codexus core as the external CLI and use the same `.codex-harness` ledger, memory, and skill stores.

## Reference-First Rule

Before changing harness runtime behavior, consult
`docs/references/01-reference-first-harness-policy.md`.

Mandatory references are:

- `raeseoklee/claw-code` for CLI and harness parity behavior.
- `NousResearch/hermes-agent` for evolutionary memory, skills, cron, gateways,
  and subagents.
- `Gitlawb/openclaude` for provider/auth/session runtime, permissions,
  headless streaming, and descriptor-first integration behavior.

## Important Limits

- This skill does not create a separate chat UI.
- `run --driver codex-exec` launches a separate non-interactive Codex process.
- The current Codex conversation remains the primary interactive context.
- The adapter should prefer status, verify, replay, memory, and skill commands before starting a supervised run.
- The app-server driver remains experimental and disabled unless the core explicitly enables it later.
