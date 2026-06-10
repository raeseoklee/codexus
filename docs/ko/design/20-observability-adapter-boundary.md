# Observability Adapter Boundary

[English](../../design/20-observability-adapter-boundary.md)

날짜: 2026-06-10
상태: boundary design. Live Browser/DevTools driver는 아직 구현되지 않았습니다.

## 결정

Codexus는 observability adapter를 **evidence producer**로만 추가할 수 있습니다. Adapter는
기존 Codexus-owned app instance에 연결되는 bounded capture artifact를 만들 수 있지만,
workflow kernel, browser automation framework, health authority, completion authority가
되어서는 안 됩니다.

현재 구현된 baseline은 이미 외부에서 만들어진 evidence를 받을 수 있습니다:

```text
Codexus-owned app instance
  -> HTTP/log/metric/screenshot/browser capture-file evidence
  -> app-instance observation artifact
  -> session evidence-loop summary
```

다음 가능한 단계는 `cx app instance evidence browser --capture <file>`이 이미 import하는
capture JSON을 선택적 live Browser/DevTools capture driver가 생성하는 것입니다. Driver는
수동 작업을 줄일 수 있지만, 생성한 evidence의 authority를 강화하면 안 됩니다.

## 문제

Codex는 코드를 수정하는 동안 local app을 inspect해야 하는 경우가 많습니다. Codexus는 이제
이미 capture된 file을 `instanceId`에 연결할 수 있지만, Browser/DevTools capture를 직접
생성하지는 않습니다. 성급한 구현은 세 가지를 과장할 수 있습니다:

- browser page가 reachable하다는 사실을 app instance가 healthy하다는 증거로 취급;
- endpoint match를 관측된 process가 Codexus-owned process라는 증거로 취급;
- capture artifact가 있다는 사실을 Codex가 그 artifact를 읽거나 사용했다는 증거로 취급.

이 설계는 live capture driver가 추가되기 전에 이 주장들을 막습니다.

## Non-Goals

- Browser, Playwright, Chrome DevTools, stack-specific behavior를 workflow kernel에 넣지
  않습니다.
- 첫 adapter slice에서 browser를 자동으로 열거나 click/type/navigate/app state mutation을
  하지 않습니다.
- 명시적 opt-in 없이 사용자의 기존 browser profile에 attach하지 않습니다.
- Cookie, local storage, credential, screenshot을 자동 prompt context로 쓰지 않습니다.
- Observation artifact에서 health, control, cleanup, source-truth, prompt-injection,
  completion authority를 주장하지 않습니다.
- Evidence가 명시적으로 전달, 인용, 첨부되지 않았다면 "Codex가 봤다"고 주장하지 않습니다.

## Adapter 역할

Codexus는 adapter 역할을 세 가지로 나눕니다:

1. **Import-only**: 사용자나 host tool이 capture JSON file을 제공합니다. Codexus는 이를
   validate, bound, redact, hash하고 `instanceId`에 연결합니다.
2. **Host-mediated**: Codex Desktop, browser plugin, 다른 host surface가 Codexus 밖에서
   capture를 만듭니다. Codexus는 artifact와 host claim을 기록하지만 host를 제어했다고
   주장하지 않습니다.
3. **Driver-mediated**: Codexus가 호출한 executable 또는 protocol client가 capture artifact를
   만듭니다. 이는 명시적 adapter capability, timeout, redaction, loopback, storage boundary가
   있을 때만 허용됩니다.

오늘 완전히 구현된 것은 role 1뿐입니다. Role 2와 3은 future work입니다.

## Capture Artifact Contract

Codexus가 import하려면 모든 adapter는 최소한 아래 field를 가진 artifact를 만들어야 합니다:

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

기존 `app instance evidence browser --capture`는 현재의 더 단순한 JSON input을 계속 받을
수 있습니다. Future driver-created capture는 더 풍부한 contract를 source artifact로 쓰고,
기존 app-instance observation schema로 projection할 수 있습니다.

## Safety Invariants

Live adapter는 artifact를 만들기 전에 아래 사실을 enforce해야 합니다:

- target URL은 loopback이어야 하며 선택한 app instance endpoint와 일치해야 합니다. 단,
  future explicit remote-host policy가 생기면 예외를 설계할 수 있습니다;
- output은 기록되기 전에 byte와 token estimate 기준으로 bounded여야 합니다;
- 모든 text field는 log/repair context와 같은 redaction path를 통과해야 합니다;
- screenshot, trace, DOM snapshot, console log는 prompt에 inline하지 않고 file로 저장한 뒤
  path/hash로 참조합니다;
- capture timeout은 finite하고 보수적이어야 합니다;
- adapter execution은 기본적으로 사용자 browser credential을 재사용하지 않습니다;
- endpoint match는 process identity와 별도로 보고합니다;
- process identity는 browser page가 아니라 app-instance owner artifact, heartbeat, process
  evidence에서 나옵니다;
- failure는 `unavailable` 또는 `failed` observation으로 기록하며, 별도 health check 없이
  health failure로 승격하지 않습니다.

## Authority Matrix

| Claim | Gate 가능? | Source |
| --- | --- | --- |
| Capture file이 존재하고 parse 가능함 | yes | file metadata + schema check |
| Capture URL이 instance endpoint와 일치함 | yes | normalized loopback URL comparison |
| Capture text가 bounded/redacted임 | yes | byte limits + redaction pass |
| Page title/text가 관련 있어 보임 | no | advisory only |
| App이 healthy함 | no | 별도 health evidence only |
| Codex가 capture를 읽음 | no | explicit pass/citation artifact only |
| Task가 complete임 | no | verification gates only |

## 첫 Slice

이 설계 다음의 첫 구현은 report-only로 유지해야 합니다:

1. 지원 역할과 authority flag를 나열하는 schema-validatable
   `observability-adapter` descriptor를 추가합니다.
2. `cx app instance evidence adapters --json`을 추가해 available adapter를 보고합니다:
   import-only는 implemented, host-mediated/driver-mediated는 unavailable.
3. Adapter availability가 health, control, prompt injection, completion authority를 의미하지
   않음을 증명하는 테스트를 추가합니다.
4. User credential을 쓰거나 application state를 mutate하지 않고 capture artifact를 만들 수
   있는 구체 driver가 생기기 전까지 live Browser/DevTools capture creation은 deferred로
   유지합니다.

## 기존 트랙과의 관계

- **Worktree app instance launcher**는 process lifecycle과 instance identity를 소유합니다.
  Observability adapter는 그 identity에 evidence를 붙일 뿐입니다.
- **Compiled wiki/context**는 나중에 observation을 요약할 수 있지만, 명시적 source-linked
  projection으로만 가능합니다.
- **Autopilot**은 observation artifact를 input으로 인용할 수 있지만, completion은 여전히
  verification과 approved acceptance evidence에 의존합니다.
- **Codex Desktop app-server**는 별도 runtime-attachment track이며 project app
  observability adapter로 쓰면 안 됩니다.
