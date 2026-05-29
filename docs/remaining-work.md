# Remaining Work

[한국어](ko/remaining-work.md)

Date: 2026-05-29

This document is the current backlog after the MVP spine and the high-risk
promotion slice. It lists what remains, why it matters, and what design
constraints should guide the next implementation passes.

## Reference Recheck

The remaining work was reviewed against the required harness references:

- [UltraWorkers Claw Code](https://github.com/ultraworkers/claw-code): public
  Rust CLI harness with `rust/` as the canonical implementation, doctor/status
  workflows, parity references, and explicit unsupported-protocol status.
- [NousResearch Hermes Agent](https://github.com/nousresearch/hermes-agent):
  learning-loop reference with memory, skill creation/improvement, past-session
  search, cron, gateway, toolset, and skill directories.
- [Gitlawb OpenClaude](https://github.com/Gitlawb/openclaude): provider/session
  reference for one terminal workflow across model providers, Codex OAuth,
  existing Codex CLI auth, tools, agents, tasks, MCP, slash commands, streaming,
  and tool calling.

Codexus should continue to diverge intentionally on the auth/runtime boundary:
it wraps the authenticated local Codex CLI and should not depend on private
ChatGPT/Codex backend APIs.

## Priority Backlog

Status after the P0-P2 implementation pass and high-risk promotion slice:

- Implemented safe MVP surfaces: expanded JSON error contract tests, state
  corruption errors, permission/policy/driver-classification ledger events,
  minimal locks, state migration reader, active skill index, explicit Codex/OMX
  export, bounded adapter retrieval, deterministic replay and model replay
  gate, memory lifecycle
  commands, app-server fixture/status gate, `cx init`, packaging/typecheck
  smoke, run observability commands, and cron/gateway disabled gates.
- Promoted hardening surfaces: stale-lock metadata inspection/recovery,
  versioned schema artifacts, budget/policy-gated model replay runner,
  Codex-native bounded context formatter plus non-injected approved context
  artifacts, app-server dry-run roundtrip contract and recorded sandbox
  experiment manifests with a live gate, explicit-budget repairable
  driver-failure retry, cron/gateway dry-run automation plans and audit
  records with policy/approval contract fields, run-ledger validation, installed
  Codexus skill diagnostics, app-server process-probe evidence, and replay
  pass/failure/extended fixtures.
- Still intentionally deferred: routine live model-in-the-loop replay, live
  app-server turn execution, automatic prompt injection of retrieved skills,
  full external JSON Schema engine enforcement/migrations, and real cron/gateway
  automation dispatch.

### P0: Contract and Safety Hardening

1. Complete CLI JSON output contract coverage. Status: safe MVP implemented.
   - Already covered: unknown command and argument validation failure.
   - Remaining: unexpected arguments, unsupported capabilities, missing/corrupt
     state, disabled drivers, and command-specific failure envelopes.
   - Design rule: automation callers must never parse stderr or prose.

2. Make permission, approval, and policy decisions first-class ledger events. Status: initial ledger events implemented.
   - Add typed events such as `permission.checked`, `permission.denied`,
     `approval.requested`, `approval.resolved`, and `policy.blocked`.
   - Gate unattended, app-server, cron, or external export behavior behind this
     event model.

3. Add driver-failure classification before driver-failure repair. Status: classification and explicit-budget task-failure repair implemented.
   - Distinguish auth/config/unsupported-flag/sandbox/policy/model/network
     failures from task failures.
   - Retry only task-repairable failures; surface capability and auth failures
     as terminal typed errors.

4. Add state schema migrations and lock/lease protection. Status: migration reader, minimal lock, stale-lock recovery, schema artifacts, focused record validation, and run-ledger validation implemented.
   - Active skill index, export, cron, and future app-server runs introduce
     concurrent writes.
   - Before those features, add a minimal lock/lease around mutable stores and a
     migration reader for versioned state records.

### P1: Evolution and Codex-Native Skill Surface

5. Add active skill index files. Status: implemented.
   - Keep scan-based listing as fallback.
   - Write an index entry on promotion/deprecation with skill id, display name,
     version, source runs, replay status, and export state.

6. Add explicit skill export commands. Status: implemented for explicit Codex/OMX bundle export.
   - Proposed command shape: `cx skill export <skill-id> --target codex|omx`.
   - Keep storage ids filesystem-safe.
   - Use `displayName` for the Codex-facing `codexus:<skill-name>` identity.
   - Run Codex skill validation before writing to external skill stores because
     external skill-name constraints may differ from Codexus storage rules.

7. Add active skill retrieval to the Codex-native adapter. Status: bounded retrieval and approved context artifact writing implemented through the shared core.
   - The adapter should retrieve a bounded set of relevant active skills and
     memory entries for the current task.
   - It should still avoid building a separate chat loop; the current Codex
     conversation remains the primary interaction surface.

8. Add model-in-the-loop replay behind deterministic replay. Status: structural pass/failure/extended fixtures and budget/policy-gated runner implemented; routine live replay remains opt-in and env-gated.
   - The current structural replay gate remains first.
   - Model replay should be opt-in or budget-gated because it consumes Codex
     usage.
   - Add Claw-style parity scenarios: tool success, denial, permission prompt,
     multi-tool turns, plugin/skill paths, large output, interruption, and usage
     accounting.

9. Expand memory lifecycle commands. Status: implemented.
   - Add explicit `cx memory add/list/prune/review` surfaces.
   - Add summaries and indexes while preserving source links, redaction, and
     bounded retrieval.

### P2: Runtime Expansion

10. Add app-server schema fixtures and gated roundtrip. Status: fixture/status gate, dry-run roundtrip contract, recorded sandbox experiment manifests, and optional supervised help-process probe evidence implemented; live roundtrip deferred.
    - Keep the driver disabled by default.
    - Add truthful status/capability output before any live turn execution.
    - Do not let app-server failure affect the stable `codex exec --json` path.

11. Add git-aware project initialization. Status: `cx init` implemented.
    - Proposed command shape: `cx init`.
    - Create config, ignored state directories, and optional project docs
      snippets without mutating unrelated `.omx/state`.

12. Finish packaging and alias migration. Status: canonical metadata and smoke coverage implemented; `chx` compatibility retained.
    - Keep `cx` and `codexus` as canonical.
    - Treat `chx` as compatibility only until a documented removal window.
    - Add install smoke tests for the bin paths and Codex adapter installer.

13. Add TypeScript/static verification. Status: local syntax/static check and versioned schema artifacts implemented.
    - Add a typecheck path or equivalent static validation beyond Node 26
      type-stripped execution.
    - Add JSON schema validation for config and durable state.

14. Add run observability commands. Status: implemented.
    - Proposed command shapes: `cx runs list`, `cx events tail <run-id>`,
      `cx report <run-id>`.
    - Keep outputs bounded and JSON-first.

15. Add cron/gateway automation only after P0 safety work. Status: disabled feature gates plus dry-run automation plans, audit records, and policy/approval contract fields implemented; real automation deferred.
    - Hermes-style cron and gateway behavior should depend on locks, schema
      migration, permission events, and explicit user policy.

## Direction Changes From This Review

- Do not build a custom chat surface first. The Codex-native adapter plus
  active skill/memory retrieval is the better next step because it preserves the
  current Codex conversation and uses the same core runtime.
- Treat `codexus:<skill-name>` as display identity, not storage identity. This
  avoids filesystem churn and keeps generated skills visually distinct.
- Add lock/lease and schema migration earlier than originally implied. They are
  prerequisites for active indexes, export, cron, and app-server experiments.
- Keep app-server experimental. The stable path remains `codex exec --json`.
- Refresh the upstream reference snapshot whenever a new major runtime surface
  is designed, because the three reference projects are active and their
  contracts may drift.

## Suggested Next Slice

The next implementation slice should turn gated surfaces into deeper evidence,
not remove the gates:

1. Replace the focused local schema checks with a full JSON Schema engine only
   if dependency policy allows it; keep migration fixtures as the regression
   boundary.
2. Preserve the replay parity matrix as a contract: no new canonical parity
   label should be added without fixture coverage and CLI replay evidence.
3. Promote deterministic fake app-server supervision into an isolated real
   app-server start/stop experiment with timeout, cleanup, and bounded
   stdout/stderr evidence before enabling it as a driver.
4. Promote cron/gateway policy/approval dry-run contracts into a
   policy-reviewed live dispatch contract, then keep dry-run and live paths
   contract-compatible.
5. Add an explicit, user-visible adapter injection step if retrieved
   `codexus:<skill-name>` context is ever inserted automatically.
