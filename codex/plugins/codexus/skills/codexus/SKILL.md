---
name: codexus
description: Run Codexus from a Codex plugin package. Use for Codexus harness status, update checks, verification evidence, session checkpoints, and package diagnostics while keeping the active Codex chat as the primary surface.
---

# Codexus Plugin Adapter

This plugin-packaged skill is an experimental distribution and discoverability
layer for Codexus. It does not prove always-on supervision, install notify
hooks, or replace the npm-installed `$codexus` skill adapter.

## Quick Start

When running from the Codexus repository or npm package, use the plugin wrapper:

```bash
node codex/plugins/codexus/scripts/cx.mjs plugin status --json
node codex/plugins/codexus/scripts/cx.mjs doctor --json
node codex/plugins/codexus/scripts/cx.mjs update check --json
node codex/plugins/codexus/scripts/cx.mjs session status --json
node codex/plugins/codexus/scripts/cx.mjs wiki context --topic verification --approve --approved-by "$USER" --json
node codex/plugins/codexus/scripts/cx.mjs wiki injection-policy --json
```

If the plugin has been copied outside the Codexus package, set `CODEXUS_HOME`
to the Codexus package root or ensure the global `codexus` binary is available.

## Rules

- Treat plugin installation as packaging evidence only.
- Do not claim always-on behavior unless `cx session status --json` reports an
  observed notify heartbeat.
- Do not move workflow-kernel logic into plugin-local scripts; call the Codexus
  CLI core through the wrapper.
- Use update summaries as advisory information only. Never auto-install or
  mutate Codexus unless the user explicitly asks.
