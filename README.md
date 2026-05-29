# Codexus

[한국어 문서](docs/ko/README.md)

Codexus is a local runtime harness for Codex orchestration. It wraps the authenticated local Codex CLI with durable execution, verification gates, recovery loops, memory, and replay-gated skills.

## Positioning

Codexus is a Codex execution harness, not a replacement for Codex. The MVP runs as an external supervisor CLI around `codex exec --json`; a future Codex-native adapter should make the same core runtime available from inside interactive Codex sessions.

Target commands:

```bash
cx doctor --json
cx run --verify "npm test" "fix the failing parser tests"
cx status <run-id> --json
cx skill review <skill-id> --json
cx adapt omx context --task "parser regression" --json
cx app-server roundtrip --dry-run --json
```

Current compatibility note: the package also exposes `chx` while the implementation migrates to the canonical `cx`/`codexus` names.

## Docs

- [Documentation index](docs/README.md)
- [Reference governance](docs/references/README.md)
- [Architecture](docs/design/01-architecture.md)
- [Detailed design](docs/design/02-detailed-design.md)
- [Evolution engine](docs/design/03-evolution-engine.md)
- [Naming and runtime positioning](docs/design/05-naming-and-runtime-positioning.md)
- [Codex-native adapter](docs/design/06-codex-native-adapter.md)
- [Implementation status](docs/implementation-status.md)

## Verification

```bash
npm test
node src/cli/main.ts doctor --json
```
