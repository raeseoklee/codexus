# 상세 설계

[English](../../design/02-detailed-design.md)

## CLI 계약

목표 CLI는 `cx`이며, `codexus`는 long-form alias입니다. 현재 MVP는 `chx`도 compatibility alias로 노출합니다.

Claw에서 가져온 command rule: 자동화 대상 command는 안정적인 machine-readable
contract를 가져야 합니다. Human prose는 projection이지 source of truth가
아닙니다. JSON error는 typed code와 hint를 포함해야 하며, caller가 stderr나
문자열 substring에 의존하면 안 됩니다.

자동화 대상 CLI failure는 다음 envelope를 사용합니다:

```json
{
  "schemaVersion": 1,
  "type": "error",
  "code": "unknown_command",
  "message": "Unknown command: nonesuch.",
  "hint": "Run `cx --help` to see supported commands.",
  "command": "nonesuch",
  "details": {
    "target": "nonesuch"
  },
  "exitCode": 1
}
```

주요 명령:

- `cx doctor`
- `cx run`
- `cx plan`
- `cx status`
- `cx resume`
- `cx verify`
- `cx replay`
- `cx locks list/inspect/clear`
- `cx schema check`
- `cx app-server status/roundtrip/experiment`
- `cx memory add/search/list/review/curate/prune`
- `cx skill propose/index/review/promote/export/improve/deprecate/list`
- `cx adapt omx status/retrieve/context`
- `cx cron status/run-now`
- `cx gateway status/check`

자동화에 쓰이는 명령은 `--json`을 지원해야 합니다.

Generated skill record는 storage id와 Codex-facing display identity를
분리합니다. Storage id는 filesystem-safe하게 유지하고, Codex에 보이는
identity는 `codexus:<skill-name>`을 사용해 Codexus 생성 skill임을 명확히
표시합니다.

`cx status --json`은 run id, phase, terminal outcome, selected driver/model,
verification summary, latest typed events, evidence artifact path를 포함해야
합니다. state가 없거나 깨졌다면 recovery hint가 있는 typed error를 반환합니다.

## Config

우선순위:

1. CLI flags
2. project `.codex-harness/config.json`
3. user `~/.codex-harness/config.json`
4. defaults

Config는 driver, Codex command/model/sandbox/approval, verification commands,
verification repair budget, driver-failure repair budget, evolution policy, OMX
preference, automation gates를 포함합니다.

## 저장소 레이아웃

```text
.codex-harness/
  config.json
  runs/
  memory/
  skills/
  replay/
  omx/
```

Run layout:

```text
.codex-harness/runs/<run-id>/
  input.json
  state.json
  events.jsonl
  raw/
  artifacts/
  verification.json
  experience.json
  report.md
```

structured event가 있으면 raw log, terminal text, final prose는 supporting
evidence입니다. Consumer는 `events.jsonl`, `state.json`, `verification.json`을
우선해야 합니다.

## Driver 계약

Driver는 capability detection, flag mapping, raw output capture, error classification을 소유합니다. Workflow kernel은 driver-specific CLI quirk를 알면 안 됩니다.

`CodexExecDriver`는 `codex exec --json --skip-git-repo-check -C <cwd>`를 사용합니다. `--ask-for-approval`처럼 subcommand가 지원하지 않는 flag는 capability 확인 없이 전달하지 않습니다.

Capability가 없는 surface는 command 존재만으로 supported로 간주하지 않습니다.
app-server 또는 daemon-like surface는 truthful status/capability envelope를
먼저 제공해야 합니다.

## Verification과 Repair

Verification command는 stdout/stderr artifact와 status를 기록합니다.

Required verification이 `passed`가 아니면 run은 `complete`가 될 수 없습니다.

Verification repair는 driver가 성공했지만 verification이 실패한 경우에
실행됩니다. Driver failure repair는 classification이 `repairable`인 task
failure에 한해 `--max-driver-repairs <n>` 또는 config budget이 있을 때만
실행됩니다. Auth, capability, sandbox, policy failure는 retry하지 않습니다.

Error는 `unknown_command`, `unexpected_arguments`, `permission_denied`,
`approval_required`, `capability_unavailable`처럼 typed code를 가져야 합니다.
invalid suffix argument는 prompt dispatch로 떨어지지 말고 parse 단계에서
실패해야 합니다.

## Replay와 parity fixture

Replay는 Claw mock parity category를 따라 확장합니다:

- streaming text
- file/tool roundtrip
- write denial
- multi-tool turn
- shell output
- permission prompt approved/denied
- plugin 또는 skill path
- compaction/large-output behavior
- usage accounting

Live model replay는 implicit하지 않습니다. Structural replay를 먼저 통과한 뒤
`--with-model-replay`, `--allow-live-model-replay`, 양수 `--model-budget`,
`CODEXUS_ENABLE_LIVE_MODEL_REPLAY=1` local experiment gate가 모두 필요합니다.

현재 structural replay는 fixture-backed pass/failure/extended case를 포함합니다.
새 parity label을 받기 전에 fixture matrix가 모든 canonical label을 덮어야
합니다: deterministic pass, streaming text, tool success/denial, permission
branch/approved/denied, multi-tool turn, skill path, file/tool roundtrip, shell
output, interruption, compaction, large output, usage accounting. 이것은 live
model behavior parity 증명이 아니라 structural coverage입니다.

## Schema validation

`cx schema check`는 versioned schema artifact와 app-server fixture가 존재하고
기본 구조가 유효한지 확인합니다. `cx schema validate --type <type> --file
<path>`는 단일 durable JSON record를 focused local validator로 검사합니다.
`cx schema validate-run <run-id>`는 state, event JSONL shape, event/run id
consistency, terminal event consistency, 그리고 run state/input config에 따른
optional verification/experience artifact를 검사합니다.

## Codex-native adapter

외부 CLI가 MVP입니다. 향후 adapter는 Codex interactive session 안에서 Codexus core를 호출해야 합니다.

요구사항:

- `cx`와 같은 core runtime 사용
- `.codex-harness` ledger/memory/skill store 공유
- workflow kernel 중복 구현 금지
- status, memory retrieval, skill review, bounded context retrieval, supervised run handoff부터 시작

`cx adapt omx context`는 active index에서 approved/replay-passed 상태인
`codexus:<skill-name>` skill과 memory를 bounded prompt-safe block으로
formatting합니다. 자동 prompt injection이나 별도 chat loop는 만들지 않습니다.
`--approve`를 사용하면 `.codex-harness/adapters/context/<id>/` 아래
`context.md`, `context.json`, hash를 가진 durable artifact를 씁니다. 이것은
명시적 handoff artifact이며 prompt를 자동 mutate하지 않습니다.

## Experimental runtime gates

- `cx app-server roundtrip --dry-run --json`은 live process 없이 schema/roundtrip
  contract를 검증합니다. `cx app-server experiment --dry-run --json`은 lifecycle,
  timeout, cleanup intent가 담긴 sandbox manifest를 preview합니다. `--live`는
  local experiment gate 없이는 거부됩니다.
- `cx app-server experiment --dry-run --record --json`은 process를 시작하지
  않으면서 manifest를 기록합니다.
- `--probe-process`는 bounded `codex app-server --help` process evidence를
  추가할 수 있지만, supervised app-server lifecycle이나 JSON-RPC turn 실행은
  아닙니다.
- `--supervise-fake`는 pid, timeout, stop signal, cleanup, bounded stdout/stderr
  preview를 가진 deterministic fake process lifecycle evidence를 기록합니다.
  실제 app-server를 시작하지 않습니다.
- `cx cron run-now --dry-run --json`과 `cx gateway check --dry-run --json`은
  lock name과 ledger event intent를 포함한 automation plan만 반환합니다.
  Real dispatch는 approval/policy event가 완성된 뒤에만 추가합니다.
- `--record`는 policy-check, lock-planning, dispatch-skipped event가 들어 있는
  dry-run audit record를 씁니다. 이 record가 향후 live dispatch와의
  compatibility boundary입니다.
- Plan에는 policy와 approval contract field도 포함됩니다. Feature gate가 켜져
  있어도 dispatcher capability가 구현/검토되기 전까지 live dispatch는 blocked
  상태로 남습니다.
