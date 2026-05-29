# Support

[한국어](docs/ko/community/SUPPORT.md)

Codexus is an early open-source harness. The best support path is a clear
GitHub issue with enough local context to reproduce the problem.

## Where to Ask

- Bugs: use the bug report issue template.
- Feature requests: use the feature request template.
- Security issues: follow [SECURITY.md](SECURITY.md).
- Design questions: start with the documentation under `docs/`.

## Useful Diagnostics

Attach the output of:

```bash
node src/cli/main.ts doctor --json
npm run typecheck
npm test
```

If the problem involves a specific run, include:

```bash
node src/cli/main.ts status <run-id> --json
node src/cli/main.ts events tail <run-id> --json
node src/cli/main.ts schema validate-run <run-id> --json
```

Review the output before sharing it. Codexus ledgers can include prompts,
command output, paths, and project-specific context.
