# Worktree App Instance Launcher

[English](../../design/19-worktree-app-instance-launcher.md)

날짜: 2026-06-02
상태: experimental live ownership 첫 slice 구현됨.

## 결정

Codexus는 **worktree app instance launcher**를 experimental,
descriptor-backed runtime surface로만 추가해야 합니다. 목적은 Codex가 여러 git
worktree나 변경을 다룰 때, 각 worktree에 연결된 local application process, port, log,
health evidence를 Codexus가 기록할 수 있게 하는 것입니다.

이 surface는 Codexus가 의도적으로 live user application process를 start/stop하는 첫
surface입니다. Repo check, graph projection, relay artifact import, app-server
discovery, session HUD summary와 성격이 다릅니다. 따라서 `start`나 `stop`을 노출하기
전에 lifecycle control, blast-radius limit, ownership evidence를 설계해야 합니다.

첫 구현은 observe-before-act여야 합니다:

```text
descriptor + worktree fact
  -> read-only instance status/log projection
  -> dry-run start plan
  -> explicit start gate
  -> owned process artifact + heartbeat
  -> health/log evidence
  -> explicit owned stop
```

Codexus는 process artifact를 소유하고 process/health 상태를 관측할 수 있을 때만 app
instance를 제어한다고 말할 수 있습니다.

## 문제

Autopilot과 review workflow는 종종 수정 중인 worktree에 해당하는 running app을
필요로 합니다:

- frontend branch가 별도 dev server와 browser evidence를 필요로 함;
- 두 candidate fix가 서로 다른 port를 필요로 함;
- Codex run이 자신이 바꾼 code version에 연결된 log를 필요로 함;
- reviewer가 screenshot이 의도한 worktree, branch, commit에서 나온 것인지 알아야 함;
- cleanup이 같은 port를 쓰는 unrelated local server를 죽이면 안 됨.

현재 Codexus는 verification, repo graph, app-server discovery, release evidence를 기록할
수 있지만, user app을 worktree별로 하나씩 start하지는 않습니다. Descriptor-backed
instance artifact가 생기기 전까지 browser, log, app-health evidence가 특정 change에
속한다고 주장하는 것은 불완전합니다.

## Non-Goals

- Codex Desktop app-server discovery를 user app launcher로 사용하지 않습니다. 그 surface는
  Codex runtime attachment를 관측하는 것이지 project application process를 제어하지
  않습니다.
- Descriptor-backed command profile 없이 arbitrary shell string을 실행하지 않습니다.
- Codexus가 start하지 않은 process를 kill하지 않습니다.
- `pid` 존재만으로 healthy라고 주장하지 않습니다.
- 첫 launcher slice에서 browser를 자동으로 열거나, context를 주입하거나, Codex를 steer하지
  않습니다.
- 이것을 0.1.x stable JSON contract로 만들지 않습니다. Lifecycle invariant가 안정될
  때까지 모든 command는 `stability: "experimental"`입니다.

## Command Shape

제안하는 experimental command:

```bash
cx app instance profile list --json
cx app instance start --profile <name> --worktree <path> [--port <n>] [--dry-run] --json
cx app instance status [--instance-id <id>] [--worktree <path>] --json
cx app instance logs --instance-id <id> [--tail <n>] --json
cx app instance stop --instance-id <id> --json
```

현재 slice는 `profile list`, `status`, `logs`, `start --dry-run`, live `start`,
owned `stop`을 구현합니다. `stop`은 non-owned 또는 invalid artifact에는 계속
`unavailable`을 보고하며, 전체 surface는 0.1.x stable contract 밖의
experimental 상태로 남습니다.

## Descriptor Contract

첫 slice는 descriptor를 다음 순서로 읽습니다:

1. 명시적인 `--descriptor <path>`;
2. 선택한 command cwd의 `codexus.app-instances.json`;
3. `package.json#codexus.appInstances`.

Descriptor 형식은 다음과 같습니다:

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

Descriptor 규칙:

- command profile은 array이며 ad hoc shell string이 아닙니다;
- `cwd`는 선택한 worktree 내부로 resolve됩니다;
- port는 기본적으로 loopback-only입니다;
- health check는 명시적이며 unavailable일 수 있습니다;
- environment variable은 allowlist할 수 있지만 secret은 artifact에 복사하지 않습니다;
- descriptor는 capability declaration이지 app이 running이라는 증명이 아닙니다.

## Instance Artifact

각 started instance는 `.codexus/app-instances/` 아래에 durable artifact를 씁니다:

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

`status`와 `health.status`는 분리됩니다. Live process가 있어도 unhealthy일 수 있고,
health descriptor가 없으면 success가 아니라 unavailable로 보고해야 합니다.

## Safety Invariants

Live `start`와 `stop` slice는 아래 local fact를 enforce해야 합니다:

- `start`는 explicit descriptor profile과 trusted worktree path를 요구합니다;
- `start`는 control을 보고하기 전에 instance artifact를 씁니다;
- `start`는 bounded stdout/stderr path를 기록하고 unbounded log를 prompt에 stream하지
  않습니다;
- `stop`은 matching owner token과 live process identity가 있는 Codexus-owned instance
  artifact만 대상으로 합니다;
- `stop`은 가능한 경우 process-group termination을 사용하고 owned process group에만
  `SIGTERM -> timeout -> SIGKILL` escalation을 적용합니다;
- stale/orphan artifact는 `orphaned` 또는 `unknown`으로 보고하며 조용히 정리하지 않습니다;
- port conflict는 process start 전에 재할당되지 않으면 evidence gap입니다;
- health는 `passed`, `failed`, `unknown`, `unavailable` 같은 tri-state 이상으로
  보고합니다;
- browser/dev-server evidence는 `instanceId`를 인용해야 합니다. 그렇지 않으면
  per-worktree app evidence가 아니라 generic observation입니다.

## 다른 트랙과의 관계

- **Autopilot contract**: worktree isolation은 app instance artifact를 run evidence로 쓸
  수 있지만, app health만으로 completion authority가 되지는 않습니다.
- **Observability adapter**: browser, log, dev-server adapter는 어떤 server를 봤는지
  추측하지 말고 instance artifact를 인용해야 합니다.
- **Desktop app-server attachment**: app-server discovery는 Codex runtime attachment를
  관측합니다. User project application을 제어하지 않습니다.
- **Control plane**: policy catalog는 lifecycle policy를 `enforced`, `observed`,
  `advisory`, `unavailable`로 보고해야 합니다.

## 구현된 Slice

1. 완료: descriptor와 instance artifact schema를 추가합니다.
2. 완료: `cx app instance profile list --json`을 추가합니다.
3. 완료: 기존 instance artifact 위의 read-only projection으로 `cx app instance status --json`와
   `logs --json`를 추가합니다.
4. 완료: spawn 없이 worktree, branch/head, command profile, candidate port, log path, health
   descriptor를 resolve하는 `start --dry-run --json`을 추가합니다.
5. 완료: port allocation, heartbeat, artifact recording, active HTTP health check,
   bounded log capture를 포함한 live owned-process `start`를 구현합니다.
6. 완료: Codexus-owned instance만 대상으로 하는 owned `stop`을 구현하고,
   non-owned 또는 invalid artifact는 `unavailable`로 남깁니다.
7. 완료: live start, duplicate-start rejection, live owned process의 health promotion,
   bounded log, owned stop을 증명하는 테스트를 추가합니다.

## 다음 Slice

1. Screenshot과 adapter 관측이 하나의 `instanceId`를 가리키도록
   instance-linked browser/dev-server evidence descriptor를 추가합니다.
2. 오래된 artifact를 더 명시적으로 드러내는 stale/orphan policy를 강화하되,
   control이나 health를 과장하지 않게 유지합니다.
