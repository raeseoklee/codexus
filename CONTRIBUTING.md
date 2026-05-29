# Contributing to Codexus

[한국어](docs/ko/community/CONTRIBUTING.md)

Thanks for helping improve Codexus. This project is an early Codex execution
harness, so contributions should keep the stable local CLI path reliable while
experimental surfaces remain gated.

## Ground Rules

- Keep Codex as the execution engine. Do not add private ChatGPT/Codex backend
  API calls.
- Preserve the stable `codex exec --json` path when experimenting with
  app-server, cron, gateway, or model-replay behavior.
- Prefer local, auditable files and deterministic tests.
- Keep English docs primary and add Korean counterparts for user-facing docs.
- Do not add runtime dependencies unless the design need is clear and documented.

## Development Setup

```bash
git clone https://github.com/raeseoklee/codexus.git
cd codexus
npm run ci
```

Useful commands:

```bash
npm run typecheck
npm test
node src/cli/main.ts doctor --json
node src/cli/main.ts run --driver mock --json "hello"
```

## Pull Request Checklist

- The change is scoped and documented.
- `npm run ci` passes locally.
- New behavior has focused tests.
- User-facing docs are updated in English and Korean when applicable.
- CLI JSON output remains machine-parseable.
- Experimental live behavior is feature-gated and has a dry-run path.

## Commit Messages

Use decision-oriented commit messages. The first line should explain why the
change exists. Add trailers when they capture useful context:

```text
Make schema artifacts enforceable without new dependencies

Schema artifacts were previously checked mostly for presence and metadata.

Constraint: No new dependencies without explicit request
Rejected: Add Ajv/full JSON Schema engine | violates current dependency policy
Confidence: high
Scope-risk: moderate
Tested: npm run ci
```

## Reporting Issues

Use the GitHub issue templates for bugs and feature requests. Include command
output, Node version, Codex CLI version, and whether the issue reproduces with
the mock driver.
