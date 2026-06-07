# Tooling

[Korean](../ko/project-wiki/tooling.md)

This page records optional tools that support project-management context. These
tools are not Codexus runtime dependencies, do not become evidence gates by
themselves, and must not be treated as completion authority.

## llms.txt

The repository now has a root-level [llms.txt](../../llms.txt). It is a curated
map for LLM agents and documentation readers. It points to the project wiki,
implementation status, JSON contract, release policy, remaining work, and the
latest release evidence.

Use it as a first-read navigation file. If it disagrees with source artifacts,
update `llms.txt`.

## Repomix

[Repomix](https://repomix.com/guide/) is an optional repository-packing tool
that can generate an AI-friendly context file. Its public documentation reports
MIT licensing, and its guide documents `npx repomix@latest`, git-aware ignores,
security checks, token counting, and configurable output formats.

Codexus keeps this as an optional dev-time tool only:

- no `package.json` dependency,
- no runtime import,
- no npm package inclusion,
- no completion authority,
- no automatic prompt injection.

The checked-in [repomix.config.json](../../repomix.config.json) is scoped to
project-management context. It includes the project wiki, key design docs,
release policy, JSON contract, implementation status, remaining work, and latest
release evidence. It intentionally excludes source, tests, fixtures, `dist`, and
Codexus state by default.

To generate a local context pack:

```bash
npx repomix@latest --config repomix.config.json
```

The configured output path is under `.codexus/context/`, which is ignored by
git. Review the generated pack before giving it to any model.

## License Rule

Adding a config file for an optional tool is not the same as adding a project
dependency. If Codexus later imports, vendors, bundles, or depends on any tool,
re-check the license and supply-chain facts before merging.
