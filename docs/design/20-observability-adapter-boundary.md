# Observability Adapter Boundary

[Korean](../ko/design/20-observability-adapter-boundary.md)

Date: 2026-06-10
Status: boundary design; no live Browser/DevTools driver implemented yet.

## Decision

Codexus may add observability adapters only as **evidence producers** that create
bounded capture artifacts for existing Codexus-owned app instances. They must
not become a workflow kernel, browser automation framework, health authority, or
completion authority.

The current implemented baseline already accepts externally produced evidence:

```text
Codexus-owned app instance
  -> HTTP/log/metric/screenshot/browser capture-file evidence
  -> app-instance observation artifact
  -> session evidence-loop summary
```

The next possible step is an optional live Browser/DevTools capture driver that
creates the same capture JSON currently imported by
`cx app instance evidence browser --capture <file>`. The driver may reduce manual
work, but it must not strengthen the authority of the evidence it creates.

## Problem

Codex often needs to inspect a local app while changing code. Codexus can now
bind already captured files to an `instanceId`, but it does not yet create
Browser/DevTools captures itself. A careless implementation would overclaim in
three ways:

- treating a reachable browser page as proof that the app instance is healthy;
- treating an endpoint match as proof that the observed process is the
  Codexus-owned process;
- treating a captured artifact as proof that Codex read or used the artifact.

This design prevents those claims before any live capture driver is added.

## Non-Goals

- Do not embed Browser, Playwright, Chrome DevTools, or stack-specific behavior
  in the workflow kernel.
- Do not auto-open a browser, click, type, navigate, or mutate application state
  from the first adapter slice.
- Do not attach to a user's existing browser profile without explicit opt-in.
- Do not use cookies, local storage, credentials, or screenshots as prompt
  context automatically.
- Do not claim health, control, cleanup, source-truth, prompt-injection, or
  completion authority from an observation artifact.
- Do not claim "Codex saw this evidence" unless the evidence was explicitly
  passed, cited, or attached in the user-visible workflow.

## Adapter Roles

Codexus distinguishes three adapter roles:

1. **Import-only**: a user or host tool provides a capture JSON file. Codexus
   validates, bounds, redacts, hashes, and links it to an `instanceId`.
2. **Host-mediated**: Codex Desktop, a browser plugin, or another host surface
   creates the capture outside Codexus. Codexus records the artifact and the
   host claim, but does not claim it controlled the host.
3. **Driver-mediated**: a Codexus-invoked executable or protocol client creates
   a capture artifact. This is allowed only after explicit adapter capability,
   timeout, redaction, loopback, and storage boundaries are in place.

Only role 1 is fully implemented today. Roles 2 and 3 remain future work.

## Capture Artifact Contract

Every adapter must produce an artifact with these minimum fields before Codexus
can import it:

```json
{
  "schemaVersion": 1,
  "stability": "experimental",
  "type": "codexus.observability.capture",
  "adapter": {
    "id": "browser-capture-file",
    "role": "import-only",
    "driverStartedByCodexus": false
  },
  "target": {
    "instanceId": "app_...",
    "url": "http://127.0.0.1:5173/",
    "loopbackOnly": true
  },
  "capture": {
    "title": "Example",
    "url": "http://127.0.0.1:5173/",
    "textTail": "...",
    "screenshotPath": null,
    "tracePath": null,
    "sha256": "sha256:..."
  },
  "authority": {
    "healthAuthority": false,
    "controlAuthority": false,
    "completionAuthority": false,
    "promptInjectionAuthority": false
  }
}
```

Existing `app instance evidence browser --capture` may continue to accept its
current simpler JSON input. A future driver-created capture can use the richer
contract as the source artifact, then project into the existing app-instance
observation schema.

## Safety Invariants

Live adapters must enforce these facts before they are allowed to create
artifacts:

- target URL must be loopback and match the selected app instance endpoint,
  unless a later explicit remote-host policy exists;
- output is bounded by byte and token estimates before it can be recorded;
- all text fields are redacted through the same redaction path used for logs and
  repair context;
- screenshots, traces, DOM snapshots, and console logs are stored as files and
  referenced by path/hash, not inlined into prompts;
- capture timeouts are finite and conservative;
- adapter execution never reuses user browser credentials by default;
- endpoint match is reported separately from process identity;
- process identity still comes from the app-instance owner artifact, heartbeat,
  and process evidence, not from the browser page;
- failures are recorded as `unavailable` or `failed` observations, not as
  health failures unless a separate health check says so.

## Authority Matrix

| Claim | May Gate? | Source |
| --- | --- | --- |
| Capture file exists and is parseable | yes | file metadata + schema check |
| Capture URL matches instance endpoint | yes | normalized loopback URL comparison |
| Capture text is bounded/redacted | yes | byte limits + redaction pass |
| Page title/text seems relevant | no | advisory only |
| App is healthy | no | separate health evidence only |
| Codex read the capture | no | explicit pass/citation artifact only |
| Task is complete | no | verification gates only |

## First Slice

The first implementation after this design should stay report-only:

1. Add a schema-validatable `observability-adapter` descriptor that lists
   supported roles and authority flags.
2. Add `cx app instance evidence adapters --json` to report available adapters:
   import-only implemented, host-mediated/driver-mediated unavailable.
3. Add tests proving that adapter availability does not imply health, control,
   prompt injection, or completion authority.
4. Keep live Browser/DevTools capture creation deferred until a concrete driver
   can produce the capture artifact without using user credentials or mutating
   application state.

## Relationship To Existing Tracks

- **Worktree app instance launcher** owns process lifecycle and instance
  identity. Observability adapters only attach evidence to that identity.
- **Compiled wiki/context** may summarize observations later, but only as
  explicit source-linked projections.
- **Autopilot** may cite observation artifacts as inputs, but completion still
  depends on verification and approved acceptance evidence.
- **Codex Desktop app-server** is a separate runtime-attachment track and must
  not be used as a project app observability adapter.
