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
Codexus wraps Codex with durable execution, tool routing, verification, recovery, memory, and replay-gated skills.
```

The name combines the Codex execution engine with a nexus layer: the place where tools, run state, verification evidence, memory, skills, and optional OMX interop connect.

## Category

Codexus is not a replacement model, IDE, or hosted agent product. Its category is:

```text
Codex execution harness
```

More explicitly:

```text
An execution/runtime harness that wraps Codex, drives automatic execution, connects tools, records state, verifies outcomes, recovers from failures, and turns reusable experience into auditable memory and skills.
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

- The MVP implementation still exposes `chx` in `package.json`.
- Documentation should treat `cx` as the target CLI name.
- `chx` should be kept as a temporary compatibility alias during migration, then deprecated after `cx` is stable.

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
