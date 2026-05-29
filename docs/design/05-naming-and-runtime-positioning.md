# Naming and Runtime Positioning

[한국어](../ko/design/05-naming-and-runtime-positioning.md)

## Product Name

Canonical product name:

```text
Codexus
```

Positioning line:

```text
Codexus is a local runtime harness for Codex orchestration.
```

Long description:

```text
Codexus wraps Codex with durable supervision, verification, recovery, memory, and replay-gated skills.
```

The name combines the Codex execution engine with a nexus layer: the place where run state, verification evidence, memory, skills, and optional advanced interop connect.

## Category

Codexus is not a replacement model, IDE, or hosted agent product. Its category is:

```text
Codex execution harness
```

More explicitly:

```text
An execution/runtime harness that wraps Codex, records state, verifies outcomes, supervises and recovers runs, and turns reusable experience into auditable memory and skills. Tool/MCP expansion remains gated until its policy and approval contracts are enabled.
```

## CLI Naming

Canonical CLI:

```bash
cx
```

Long-form executable alias:

```bash
codexus
```

Current implementation note:

- `package.json` exposes `cx` and `codexus` as canonical bins.
- `chx` remains only as a temporary compatibility alias.
- Any future `chx` removal should be handled with a documented deprecation window.

## Storage Namespace

Current MVP storage root:

```text
.codex-harness/
```

This path is already implemented and should remain supported for compatibility. A future migration may introduce `.codexus/`, but that should be a deliberate storage migration with backward-compatible reads, not a silent rename.

Examples:

```bash
cx doctor --json
cx run --verify "npm test" "fix the failing parser tests"
cx status <run-id> --json
cx skill review <skill-id> --json
```

## Runtime Shape

Codexus has two intended runtime surfaces.

### External CLI Runtime

This is the implemented MVP.

```text
User
  -> cx / codexus CLI
  -> workflow kernel / policy / verification / memory / skills
  -> driver abstraction
  -> codex exec --json
  -> Codex
```

Strengths:

- CI and automation friendly,
- deterministic run ledger,
- strong verification gate,
- replay and repair flows,
- low coupling to Codex interactive session internals.

### Codex-Native Adapter

This is the next runtime direction, closer to how OMX feels inside Codex.

```text
Codex interactive session
  -> Codexus skill/plugin/command adapter
  -> Codexus core
  -> shared ledger / memory / skills
```

Target behavior:

- users can invoke Codexus from inside a Codex session,
- the adapter calls the same core runtime instead of duplicating logic,
- the same `.codex-harness` state remains the source of truth,
- Codex-native usage complements the external CLI instead of replacing it.

## Relationship to OMX

OMX is session-native: it augments a running Codex session with skills, prompts, modes, tmux workers, HUD, and helper commands.

Codexus currently starts from the opposite edge: an external supervisor CLI that drives `codex exec --json` and records durable evidence around it.

The intended end state is a dual surface:

```text
Codexus Core
  + External CLI: cx run / verify / replay / status
  + Codex-native adapter: invoked inside Codex sessions
```

This lets Codexus keep its durable supervisor strengths while gaining an OMX-like in-session workflow later.

## Relationship to Claw Code

Claw Code is the parity pressure reference for CLI harness behavior, not the
auth/runtime boundary for Codexus.

Codexus should borrow:

- stable machine-readable diagnostic and status contracts,
- typed error envelopes with recovery hints,
- explicit worker/run state inspection,
- permission modes and tool-scope evidence,
- deterministic mock parity fixtures,
- truthful unsupported status for protocol surfaces that are visible but not
  implemented.

Codexus should not copy Claw's auth model. Claw can target Anthropic,
OpenAI-compatible gateways, and local model servers, and it explicitly does not
support OpenAI Codex sessions. Codexus exists specifically to wrap the
authenticated local Codex CLI while adding durable orchestration around it.
