# Roadmap And Backlog

[Korean](../ko/project-wiki/roadmap-and-backlog.md)

This page is a project-management projection over [Remaining work](../remaining-work.md),
[Roadmap Kanban](../roadmap-kanban.html), and design docs. It should stay short
and point back to source docs.

## Ready Themes

These are suitable for release-sized goals when grouped with verification:

- Project context and LLM wiki management: keep checked-in project context
  current without making generated wiki pages authority.
- App-instance observation hardening: improve owned-process evidence,
  lifecycle boundaries, and log/probe/metric adapters without claiming app
  health authority.
- Relay and autopilot gates: strengthen stage evidence, agreement structure,
  verification matrix handling, and stop-at-boundary behavior.
- Contract promotion readiness: keep the stable contract current after the
  `0.2.0` promotion, and audit any future experimental surface before
  promoting it into the next stable contract.
- Repository knowledge and compiled wiki: expand deterministic repository facts,
  page manifests, and explicit context approval while keeping injection manual.

## Recommended Sequence

Work through the roadmap in this order unless a release blocker appears:

1. Keep docs, kanban, project wiki, and stable JSON contracts current.
2. Harden app-instance observation evidence without promoting health or cleanup
   authority.
3. Strengthen relay/autopilot stage gates and stop-at-boundary behavior.
4. Expand deterministic repository knowledge and compiled wiki context while
   keeping injection manual.
5. Re-run contract-promotion readiness before any future stable-surface
   promotion, and keep manual wiki context separate from automatic injection.
6. Investigate evidence-needed tracks only after their non-disruptive observer
   contracts are clear: Desktop app-server, plugin always-on behavior, LSP
   protocol servers, and app-instance health modeling.

## Evidence Needed

These need more evidence before promotion:

- Desktop app-server attachment and live event observation.
- Plugin always-on behavior in Codex, because packaging evidence is not the
  same as runtime supervision.
- LSP protocol-server integration beyond detect-only project diagnostics and
  report-only adapter status.
- App-instance health modeling that distinguishes process liveness, endpoint
  checks, and user-observed behavior.

## Gated Or Deferred

These must stay visibly gated until their contracts exist:

- live `cx autopilot run` beyond `run-gate` readiness reporting,
- automatic context or prompt injection,
- active relay engine spawning beyond artifact import,
- routine live model replay,
- full unattended cron/gateway scheduler ownership beyond current readiness-gap
  reporting,
- tmux or native worker launch authority beyond honest status and recorder
  surfaces.

## Review Cadence

When a release closes a theme, update:

- [Implementation status](../implementation-status.md),
- [Remaining work](../remaining-work.md),
- [Roadmap Kanban](../roadmap-kanban.html),
- this page,
- the Korean counterparts.
