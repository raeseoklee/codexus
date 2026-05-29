# Security Policy

[한국어](docs/ko/community/SECURITY.md)

## Supported Versions

Codexus is pre-1.0. Security fixes target the `main` branch until release
branches exist.

## Reporting a Vulnerability

If the repository is public, open a private security advisory on GitHub when
available. If advisories are not enabled, contact the maintainer through the
GitHub profile and avoid posting exploit details in public issues.

Please include:

- affected command or module,
- reproduction steps,
- impact,
- whether local files, Codex credentials, shell execution, or generated skills
  are involved,
- relevant logs with secrets removed.

## Security Boundaries

- Codexus wraps the local authenticated Codex CLI. It must not call private
  ChatGPT/Codex backend APIs directly.
- Verification commands execute in the user's local shell and should be treated
  as trusted project automation.
- Live app-server, cron, gateway, and model replay behavior must remain gated
  until the policy and approval contracts are fully implemented.
- Ledger, memory, and skill artifacts may contain task context. Do not share
  `.codex-harness/` artifacts publicly without review.

## Secret Handling

Do not commit credentials, Codex session material, environment files, or raw
ledgers that contain private prompts. The repository `.gitignore` excludes
local Codexus and OMX state directories by default.
