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

- `package.json` exposes `cx` and `codexus` as canonical public bins.
- The historical `chx` alias is not part of the npm-published public bin surface.

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

### Codex-Native Session Runtime

This is the primary product direction, closer to how OMX feels inside Codex.

```text
Codex interactive session
  -> Codexus skill + AGENTS overlay + optional hooks/status
  -> Codexus core
  -> shared ledger / memory / skills / session state
```

Target behavior:

- users can invoke Codexus from inside a Codex session,
- Codexus guidance can steer the current session toward checkpointing,
  verification, memory lookup, and evidence capture,
- the adapter calls the same core runtime instead of duplicating logic,
- the same `.codex-harness` state remains the source of truth,
- Codex-native usage becomes the normal interactive UX while the external CLI
  remains the engine and automation path.

## Relationship to OMX

OMX is session-native: it augments a running Codex session with skills, prompts, modes, tmux workers, HUD, and helper commands.

Codexus started from the opposite edge: an external supervisor CLI that drives
`codex exec --json` and records durable evidence around it. The direction now
changes from "CLI first, in-session later" to "shared core with in-session UX as
the primary product shape."

The intended end state is a dual surface:

```text
Codexus Core
  + Codex-native session runtime: skill / AGENTS overlay / hooks / state / tmux
  + External CLI engine: cx run / verify / replay / status
```

The external `cx` surface remains essential for automation, bounded sub-runs,
and recovery. It should not be the only story users see.

The deferred `codex exec resume` path is an external multi-turn thread feature,
not the OMX-like session-native runtime.

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
