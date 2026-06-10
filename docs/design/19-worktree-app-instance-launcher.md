# Worktree App Instance Launcher

[Korean](../ko/design/19-worktree-app-instance-launcher.md)

Date: 2026-06-02
Status: experimental live ownership first slice implemented.

## Decision

Codexus should add a **worktree app instance launcher** only as an experimental,
descriptor-backed runtime surface. The purpose is to let Codex work on multiple
git worktrees or changes while Codexus records which local application process,
port, logs, and health evidence belong to each worktree.

This is the first Codexus surface that would intentionally start and stop a live
user application process. That makes it different from repo checks, graph
projections, relay artifact import, app-server discovery, and session HUD
summaries. The launcher must therefore be designed around lifecycle control,
blast-radius limits, and ownership evidence before `start` or `stop` becomes
available.

The first implementation must be observe-before-act:

```text
descriptor + worktree fact
  -> read-only instance status/log projection
  -> dry-run start plan
  -> explicit start gate
  -> owned process artifact + heartbeat
  -> health/log evidence
  -> explicit owned stop
```

Codexus must never claim it controls an app instance unless it owns the process
artifact and can observe the process/health state.

## Problem

Autopilot and review workflows often need a running app for the exact worktree
being modified:

- a frontend branch needs its own dev server and browser evidence;
- two candidate fixes need separate ports;
- a Codex run needs logs tied to the code version it changed;
- a reviewer needs to know whether a screenshot came from the intended
  worktree, branch, and commit;
- cleanup must not kill an unrelated local server that happens to use the same
  port.

Today Codexus can record verification, repo graph, app-server discovery, and
release evidence, but it does **not** start one user app per worktree. Any claim
that browser, log, or app-health evidence belongs to a specific change remains
incomplete until a descriptor-backed instance artifact exists.

## Non-Goals

- Do not use Codex Desktop app-server discovery as the user app launcher. That
  surface observes Codex runtime attachment, not project application processes.
- Do not start arbitrary shell strings without a descriptor-backed command
  profile.
- Do not kill processes that Codexus did not start.
- Do not claim "healthy" from `pid` existence alone.
- Do not auto-open browsers, inject context, or steer Codex from the first
  launcher slice.
- Do not make this a 0.1.x stable JSON contract. All commands remain
  `stability: "experimental"` until the lifecycle invariants prove stable.

## Command Shape

Proposed experimental commands:

```bash
cx app instance profile list --json
cx app instance start --profile <name> --worktree <path> [--port <n>] [--dry-run] --json
cx app instance status [--instance-id <id>] [--worktree <path>] --json
cx app instance logs --instance-id <id> [--tail <n>] --json
cx app instance stop --instance-id <id> --json
```

The current slice implements `profile list`, `status`, `logs`, `start
--dry-run`, live `start`, and owned `stop`. Stop remains unavailable for
non-owned or invalid artifacts, and the whole surface remains experimental
outside the 0.1.x stable contract.

## Descriptor Contract

The first slice reads descriptors in this order:

1. an explicit `--descriptor <path>`;
2. `codexus.app-instances.json` in the selected command cwd;
3. `package.json#codexus.appInstances`.

The descriptor format is:

```json
{
  "schemaVersion": 1,
  "stability": "experimental",
  "profiles": [
    {
      "name": "web",
      "cwd": ".",
      "command": ["npm", "run", "dev", "--", "--host", "127.0.0.1"],
      "port": { "mode": "allocate", "preferred": 5173 },
      "health": {
        "type": "http",
        "url": "http://127.0.0.1:{port}/",
        "timeoutMs": 2000
      },
      "log": { "stdout": true, "stderr": true }
    }
  ]
}
```

Descriptor rules:

- command profiles are arrays, not ad hoc shell strings;
- `cwd` resolves inside the selected worktree;
- ports are loopback-only by default;
- health checks are explicit and may be unavailable;
- environment variables may be allowlisted, but secrets are never copied into
  artifacts;
- the descriptor is a capability declaration, not proof that the app is running.

## Instance Artifact

Each started instance writes a durable artifact under `.codexus/app-instances/`:

```json
{
  "schemaVersion": 1,
  "stability": "experimental",
  "type": "codexus.app.instance",
  "instanceId": "app_...",
  "worktree": {
    "path": "/repo/worktrees/feature-a",
    "branch": "feature-a",
    "head": "sha..."
  },
  "profile": "web",
  "owner": {
    "ownedByCodexus": true,
    "ownerTokenHash": "sha256:...",
    "pid": 12345,
    "processGroupId": 12345,
    "heartbeatPath": ".codexus/app-instances/app_.../heartbeat.json"
  },
  "network": {
    "host": "127.0.0.1",
    "port": 5173,
    "url": "http://127.0.0.1:5173/"
  },
  "health": {
    "status": "unknown",
    "lastCheckedAt": null,
    "evidencePath": null
  },
  "logs": {
    "stdoutPath": ".codexus/app-instances/app_.../stdout.log",
    "stderrPath": ".codexus/app-instances/app_.../stderr.log"
  },
  "status": "running"
}
```

`status` and `health.status` are separate. A live process can still be unhealthy,
and an unavailable health descriptor must be reported as unavailable rather than
as success.

## Safety Invariants

The live `start` and `stop` slices must enforce these local facts:

- `start` requires an explicit descriptor profile and trusted worktree path;
- `start` writes the instance artifact before reporting control;
- `start` records bounded stdout/stderr paths and never streams unbounded logs
  into prompts;
- `stop` only targets a Codexus-owned instance artifact with a matching owner
  token and live process identity;
- `stop` uses process-group termination where available and escalates
  `SIGTERM -> timeout -> SIGKILL` only for the owned process group;
- stale or orphaned artifacts are reported as `orphaned` or `unknown`, not
  silently cleaned;
- port conflicts are evidence gaps unless the chosen port is reallocated before
  process start;
- health is tri-state or richer: `passed`, `failed`, `unknown`, `unavailable`;
- browser/dev-server evidence must cite `instanceId`; otherwise it is generic
  observation, not per-worktree app evidence.
- app-instance observation artifacts should snapshot process reason, heartbeat
  freshness, heartbeat age, and lifecycle state so later review can see what
  the observation was bound to without treating it as health authority.

## Relationship To Other Tracks

- **Autopilot contract**: worktree isolation can use app instance artifacts as
  run evidence, but app health is never completion authority by itself.
- **Observability adapters**: browser, log, and dev-server adapters should cite
  an instance artifact instead of guessing which server they observed.
- **Desktop app-server attachment**: app-server discovery observes Codex runtime
  attachment. It does not control user project applications.
- **Control plane**: policy catalogs should report lifecycle policies as
  `enforced`, `observed`, `advisory`, or `unavailable`.

## Implemented Slice

1. Done: add descriptor and instance artifact schemas.
2. Done: add `cx app instance profile list --json`.
3. Done: add `cx app instance status --json` and `logs --json` as read-only
   projections over existing instance artifacts.
4. Done: add `start --dry-run --json` that resolves worktree, branch/head, command
   profile, candidate port, log paths, and health descriptor without spawning.
5. Done: implement live owned-process `start` with port allocation, heartbeat,
   artifact recording, active HTTP health checks, and bounded log capture.
6. Done: implement owned `stop` that targets only Codexus-owned instances and
   leaves non-owned or invalid artifacts unavailable.
7. Done: add tests proving live start, duplicate-start rejection, health
   promotion for a live owned process, bounded logs, and owned stop.
8. Done: add `cx app instance evidence record/list` and
   `app-instance-observation` schema artifacts so browser/dev-server/log/
   screenshot/metric observations can cite one `instanceId` without becoming
   control, health, or completion authority.
9. Done: add explicit stale/orphan lifecycle policy projection. Status output
   reports heartbeat age, stale thresholds, cleanup policy, stop policy, and
   non-authority guarantees. Stale or dead artifacts remain `orphaned`/
   `unknown` and never imply health, control, cleanup authority, or completion.
10. Done: add `cx app instance evidence probe` as the first real adapter capture
    slice. It records loopback-only, bounded, redacted HTTP dev-server evidence
    for a running Codexus-owned instance and links the evidence to an
    `app-instance-observation` artifact without becoming health, control, or
    completion authority.
11. Done: add `cx app instance evidence logs` as the first log adapter capture
    slice. It records bounded, redacted stdout/stderr tail evidence for a
    Codexus-owned instance and links the snapshot to an
    `app-instance-observation` artifact without becoming health, control, or
    completion authority.
12. Done: add `cx app instance evidence metrics` as the first metric adapter
    capture slice. It records process, heartbeat, health-evidence, and log-file
    metrics for one `instanceId` without becoming health, control, cleanup, or
    completion authority.
13. Done: project app-instance observations into `cx session status --json` and
    `cx session hud --json` under `evidenceLoop` so app evidence is visible from
    the Codex-native session surface without becoming health, control, cleanup,
    or completion authority.
14. Done: add `cx app instance evidence screenshot` as a screenshot-file binding
    adapter. It records file metadata, size, mtime, media type, and SHA-256 for
    an already captured local screenshot and links that evidence to one
    `instanceId`; it does not open browsers, capture pixels itself, or become
    health, control, cleanup, or completion authority.
15. Done: strengthen app-instance observation binding. New observation artifacts
    snapshot `processReason`, heartbeat freshness/age, and lifecycle state, and
    session evidence summaries expose the latest observation's process and
    lifecycle state without promoting that observation to health or completion
    authority.
16. Done: add `cx app instance evidence browser` as a Browser/DevTools capture
    binding adapter. It imports an existing JSON capture file, records bounded
    redacted URL/title metadata plus capture-file SHA-256, and distinguishes an
    observed loopback server from an owned worktree instance by reporting
    `matchesInstanceEndpoint` and `ownedWorktreeInstanceEvidence:
    "endpoint_match_only"`. It does not open a browser, drive DevTools, prove
    process identity, or become health, control, cleanup, or completion
    authority.
17. Done: add `cx app instance evidence adapters --json` as the report-only
    observability adapter descriptor/status boundary from
    [doc 20](20-observability-adapter-boundary.md). It reports import-only
    Browser/DevTools capture-file binding as implemented, host-mediated and
    driver-mediated live capture as unavailable, and keeps health, control,
    cleanup, prompt-injection, Codex-read, and completion authority false.

## Next Slice

1. Add optional live Browser/DevTools capture drivers that create the capture
   JSON consumed by `cx app instance evidence browser`, without claiming process
   identity, user-browser profile authority, Codex-read authority, or
   health/control authority.
2. Add worktree-aware launcher reuse for future autopilot surfaces while keeping
   completion authority on verification and policy gates.
