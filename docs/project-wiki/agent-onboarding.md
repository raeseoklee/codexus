# Agent Onboarding

[Korean](../ko/project-wiki/agent-onboarding.md)

This is the first-read checklist for LLM agents working on Codexus.

## First Ten Minutes

1. Read [AGENTS.md](../../AGENTS.md).
2. Read [Project LLM Wiki](README.md), [Current state](current-state.md), and
   [Operating model](operating-model.md).
3. Check local state:

   ```bash
   git status --short
   node codex/skills/codexus/scripts/cx.mjs session status --json
   ```

4. For implementation work, create a checkpoint:

   ```bash
   node codex/skills/codexus/scripts/cx.mjs session checkpoint "before <task>" --json
   ```

5. Read the source design doc for the surface you are touching.

## Do Not

- Do not treat this wiki, generated wiki pages, task labels, or model agreement
  as completion authority.
- Do not promote experimental surfaces to stable without updating
  [JSON contract](../json-contract.md) and release evidence.
- Do not auto-inject wiki, memory, or skill context into prompts.
- Do not stop or clean up processes that Codexus did not prove it owns.
- Do not use live network or model behavior as a gate unless the command and
  policy explicitly require it.

## Before Final Response

Report:

- what changed,
- what verification passed,
- what remains not tested,
- whether the worktree is clean or intentionally dirty.

For commits, use the repository Lore commit protocol in [AGENTS.md](../../AGENTS.md).
