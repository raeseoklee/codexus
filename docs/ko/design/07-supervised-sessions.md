# 세션 네이티브 감독

[English](../../design/07-supervised-sessions.md)

작성일: 2026-05-30
상태: 제안된 방향 전환

## 결정

Codexus의 primary UX는 OMX에서 배운 Codex-session-native runtime으로 이동합니다. OMX는
session-native integration의 prior art이지 Codexus의 정체성이 아닙니다.

이전 external thread 제안은 `codex exec resume <thread-id>`로 별도
non-interactive Codex thread를 이어가는 구조였습니다. 이 기능은 외부 supervised run
기능으로는 유용하지만, 제품이 원하는 session-native 형태는 아닙니다. 현재 Codex TUI
conversation에 붙는 것이 아니라 별도 `codex exec` thread를 시작하고 재개하기 때문입니다.

새 방향은 다음입니다:

```text
Codex TUI session
  + Codexus skill adapter
  + Codexus AGENTS overlay
  + Codexus hooks / status state
  + Codexus CLI core
  + optional tmux/team runtime
```

`cx`는 backend engine과 automation surface로 남습니다. 일반 사용자 흐름은 현재 Codex
session 안에서 명시적인 Codexus skill command와 session guidance를 통해 이루어져야 합니다.

## 왜 가능한가

OMX는 가능한 통합 패턴을 보여줍니다. Codex를 대체하거나 두 번째 chat UI를 소유하지 않아도
됩니다. OMX는 설치 가능한 로컬 표면을 조합합니다:

- `${CODEX_HOME:-~/.codex}/skills` 아래 skill,
- marker-bounded `AGENTS.md` guidance overlay,
- 지원되는 경우 Codex TUI/statusline 설정,
- mode, turn, HUD, worker state를 위한 local state file,
- 설치된 Codex가 지원하는 hook/notification path,
- durable worker와 team execution을 위한 tmux pane,
- Codex session 안에서 호출 가능한 CLI.

Codexus도 같은 종류의 표면을 사용할 수 있습니다. 구현은 capability-gated이고 정직해야
합니다. hook, statusline, tmux feature가 없으면 Codexus는 보이지 않는 attach를 암시하지
말고 unavailable 상태를 보고해야 합니다.

## 제품 형태

Codexus는 제품 중요도 순서로 세 runtime layer를 가집니다.

### 1. Codex-Native Session Runtime

목표 primary UX입니다.

```text
User in Codex TUI
  -> codexus / $codexus 언급
  -> 설치된 Codexus skill이 bounded command 실행
  -> Codexus가 session state, evidence, memory, verification output 기록
  -> 현재 Codex conversation이 interaction owner로 유지
```

이 layer는 현재 Codex session에 붙은 harness처럼 느껴져야 합니다. 경쟁하는 readline/chat
loop를 만들면 안 됩니다.

Codex 안에서 기대하는 명령 예시:

```text
codexus doctor 상태 확인해줘.
codexus checkpoint "parser fix before refactor" 기록해줘.
codexus verify "npm test" 결과를 현재 작업 증거로 붙여줘.
codexus memory search "parser regression" 필요한 것만 요약해줘.
codexus mode ralph-like persistence 켜고 상태 보여줘.
codexus status 현재 세션과 최근 verification 상태 보여줘.
```

초기 구현은 기존 CLI command로 라우팅해도 됩니다. 이후 slice에서 `checkpoint`,
`session status`, `mode` 같은 더 자연스러운 alias를 추가할 수 있습니다.

### 2. External Supervised Runs

이미 구현된 안정적인 engine path입니다.

```text
cx run --verify "npm test" "<bounded task>"
```

별도 `codex exec --json` process를 시작하고 그 process에 Codexus의 전체 처리(ledger,
verification, repair, memory, replay, cancellation)를 적용합니다. bounded sub-run,
automation, reproducible evidence에 강합니다. 현재 Codex TUI conversation에 붙는다고
설명하면 안 됩니다.

### 3. External Exec-Resume Sessions

기존 `codex exec resume <thread-id>` 아이디어는 optional advanced feature로 deferred합니다.
구현한다면 다음처럼 문서화해야 합니다:

```text
cx thread start/continue
  -> one external non-interactive Codex exec thread
  -> multiple supervised turns over that external thread
```

이는 primary session-native path가 아닙니다. `cx session` namespace는 현재 Codex session-native
state, checkpoint, verification surface 전용으로 유지합니다.

## 세션 네이티브 구성요소

### Skill Adapter

npm package는 global install 시 `codexus` Codex skill을 기본 설치합니다. Skill은 계속
얇아야 합니다. 외부 `cx` CLI와 같은 Codexus CLI/core를 호출하고, JSON evidence를 현재
Codex conversation에 요약합니다.

### AGENTS Overlay

Codexus는 user 또는 project scope에 설치 가능한 marker-bounded overlay를 제공해야 합니다:

```markdown
<!-- CODEXUS:RUNTIME:START -->
... Codexus session-native operating contract ...
<!-- CODEXUS:RUNTIME:END -->
```

Overlay는 현재 session에서 Codex가 Codexus를 어떻게 사용할지 알려야 합니다:

- 일반 edit는 current-session work를 선호,
- durable evidence, verification, memory, replay, mode state가 필요할 때 Codexus 호출,
- bounded supervised sub-run이 명시적으로 유용할 때만 nested `cx run` 사용,
- 모든 Codexus claim은 command output 또는 local artifact에 근거,
- unsupported runtime hook은 조용히 active로 취급하지 않고 unavailable로 보고.

Installer는 Codexus marker region만 갱신하고 non-Codexus content를 보존해야 합니다.

### Session State

Codexus는 기존 storage root 아래 session-native state 영역을 추가해야 합니다:

```text
.codexus/session/
  state.json
  checkpoints/
  verification/
  context/
```

State가 추적할 항목:

- 보이는 경우 session id 또는 best available Codex session identifier,
- cwd와 project root,
- 마지막 Codexus command,
- active mode flag,
- checkpoint id,
- verification evidence,
- 외부 supervised sub-run의 linked run id,
- hook/status capability 상태.

이 state는 숨겨진 transcript가 아닙니다. Codex가 지원되는 transcript API를 제공하지 않는 한
Codexus는 현재 TUI conversation 전체를 캡처한다고 주장하면 안 됩니다. 대신 현재 Codex
agent가 사용자 또는 overlay 요청에 따라 checkpoint와 evidence를 명시적으로 기록합니다.

Codex가 안정적인 per-conversation identifier를 노출하기 전까지 이 state는
per-Codex-thread store가 아니라 cwd-scoped singleton입니다. 동시 write는 Codexus
`session` lock으로 보호되며, 겹치는 writer는 active session operation이 끝난 뒤 재시도해야
합니다.

### Hooks and HUD

Codexus는 hook/status integration을 hard dependency가 아니라 optional capability로
지원해야 합니다.

목표 동작:

- `codexus session status --json`은 session state를 읽습니다.
- `codexus session migrate --json`은 `.codexus/session/state.json`의 explicit
  migration boundary입니다. 새 session-state schema 변경은 writer를 바꾸기 전에
  여기 migration을 추가해야 합니다.
- `cx setup codex-session --enable-notify-hook --json`은 현재 project가 Codex에서
  이미 trusted일 때만 Codex notify hook을 설치할 수 있습니다.
- notify hook은 bounded turn activity를 `.codexus/session/state.json`에 기록하고,
  기존 top-level `notify = [...]` command가 있으면 `--previous-notify`로 chain합니다.
- Notify capability는 config 설치와 실제 dispatch 관측을 분리합니다.
  `capabilities.hooks`는 install 직후 `configured`이고, 실제 `turn-ended` event가
  관측된 뒤에만 `available`이 됩니다. 수동 smoke event는 dispatch observed로
  간주하지 않습니다.
- Runtime surface detection은 `unknown`에 강하게 편향합니다. Codexus는 hook이 실제로
  발화될 때 bounded runtime context를 기록하지만, dispatch 부재만으로 Desktop/app-server
  또는 CLI/TUI support를 단정하지 않습니다.
- Config rewrite는 atomic이어야 하고 one-time `config.toml.codexus.bak` backup을
  만들어야 하며, `--disable-notify-hook`으로 이전 notify command를 복원하거나
  previous command가 없을 때 AGENTS overlay를 refresh하지 않고 Codexus-only notify
  line을 제거해야 합니다.
- `codexus hud --json`은 이후 mode, verification, checkpoint state를 compact하게
  보고할 수 있습니다.
- Codex TUI statusline configuration이 Codexus state를 포함할 수 있으면 이후 setup
  slice에서 명시적인 user-visible configuration으로 활성화합니다.
- Desktop/app-server attachment는 CLI/TUI notify를 대체하는 것이 아니라
  session-native attachment의 두 번째 runtime 절반입니다. 이는 A/B evidence plan으로만
  조사합니다: 먼저 격리 app-server evidence, 그다음 실제 daemon에 대한 명시적 read-only
  opt-in입니다. Codexus는 remote control을 자동 활성화하거나, 사용자 Codex config를
  변경하거나, turn을 조종하거나, 실제 read-only event 관측 전 `desktop-app-server`
  availability를 보고하면 안 됩니다.

hook 또는 statusline path가 unavailable이면 `doctor`와 `session status`가 명확히 말해야
합니다.

### Tmux and Workers

OMX의 durable team behavior는 tmux-backed worker에서 나옵니다. Codexus도 나중에 비슷한
optional runtime을 채택할 수 있습니다:

```text
Codex leader pane
  -> codexus team start
  -> tmux worker panes
  -> shared .codexus/session/team state
```

이는 Codex native subagent를 대체하지 않고 보완해야 합니다.

현재 session 안의 Codex native subagent는
[Subagent evidence supervision](09-subagent-evidence-supervision.md)을 참고합니다. 같은 규칙이
적용됩니다: subagent는 claim을 만들 수 있지만 completion gate는 verification입니다.

## 명시적 비목표

- 별도 chat/readline UI를 만들지 않습니다.
- 지원되는 Codex API 없이 현재 TUI transcript에 투명하게 attach된다고 주장하지 않습니다.
- `codex exec resume`를 primary session-native story로 만들지 않습니다.
- user-visible approval step 없이 retrieved memory/skill을 prompt에 자동 주입하지 않습니다.
- Codexus marker 밖의 user/project `AGENTS.md`를 조용히 수정하지 않습니다.
- 기본 Codex-native usage에 tmux를 요구하지 않습니다.

## Command Surface 방향

구현된 첫 slice CLI surface:

```bash
cx setup codex-session [--scope user|project] [--enable-notify-hook|--disable-notify-hook] [--json]
cx session status [--json]
cx session migrate [--dry-run] [--json]
cx session checkpoint <label> [--json]
cx session verify --verify <cmd> [--json]
cx session notify [--event <name>] [--json]
```

이후 계획된 CLI surface:

```bash
cx session hud [--json]
cx session mode list [--json]
cx session mode enable <mode> [--json]
cx session mode disable <mode> [--json]
```

Codex 안의 사용자 표현은 자연스럽게 유지합니다:

```text
codexus로 checkpoint 남기고 npm test 검증 붙여줘.
codexus session status 확인해줘.
codexus memory search로 이 버그와 관련된 lesson 찾아줘.
```

## 기존 명령과의 관계

- `cx run`: 외부 supervised sub-run engine으로 유지합니다.
- `cx resume`: 이전 run 하나에 대한 shallow compatibility로 유지합니다.
- future `cx thread start/continue`: 구현한다면 Codex-native layer가 아니라 external
  exec-resume layer에 속합니다. external thread feature에 `cx session`을 재사용하지 않습니다.
- `$codexus`: 세션 네이티브 사용의 선호 in-Codex entrypoint가 됩니다.

## 수용 기준

- npm/global install이 동작하는 `codexus` skill adapter를 제공합니다.
- `cx setup codex-session --scope project --json`은 marker-bounded Codexus AGENTS
  overlay만 설치/갱신합니다.
- `cx doctor --json`은 skill install, overlay install, hook availability, statusline
  availability, tmux availability, session-state health를 보고합니다.
- Codex 안에서 Codexus status를 요청하면 skill이 local Codexus core를 호출하고 grounded
  JSON output을 요약합니다.
- `cx session migrate --json`은 explicit session-state migration을 보고하고
  persist합니다. `--dry-run`은 state rewrite 없이 같은 migration을 보고합니다.
- `cx session checkpoint <label> --json`은 같은 project에서 나중에 참조 가능한 local
  checkpoint artifact를 씁니다.
- `cx session verify --verify <cmd> --json`은 verification을 실행하고
  `.codexus/session/` 아래 artifact를 기록하며 typed result를 보고합니다.
- optional notify-hook attachment는 기존 notify chain을 보존하고, Codex project
  trust가 설정되지 않았으면 설치를 거부합니다.
- `notifyDispatch.status`는 실제 `turn-ended` event에서만 `observed`가 되며,
  `capabilities.hooks`는 `configured`와 `available`을 구분합니다.
- Codexus notify adapter event는 `runtimeSurface: "cli-tui"`를 기록하고, direct
  또는 모호한 `cx session notify` 호출은 명시 tag가 없으면 `unknown`으로 둡니다.
- notify-hook detach는 overlay를 install/refresh하지 않고 이전 notify command를
  복원하거나 Codexus-only notify line을 제거합니다.
- unsupported statusline/tmux feature는 정직한 unavailable status를 반환합니다.
- 외부 `cx run`은 변경 없이 계속 동작합니다.

## 구현 Slice

1. 완료: 이전 exec-resume 우선순위를 문서에서 이 session-native 방향으로 교체합니다.
2. 완료: skill, marker overlay, unavailable hook/statusline capability,
   session state root에 대한 setup/doctor check를 추가합니다.
3. 완료: session state file과 read-only `cx session status`를 추가합니다.
4. 완료: `checkpoint`와 `session verify` command를 추가합니다.
5. 완료: Codexus skill instruction을 갱신해 nested `cx run`보다 session-native
   command를 먼저 선호하게 합니다.
6. 완료: session-state schema artifact validation과 Codex project trust check 뒤의
   optional notify-hook attachment를 추가합니다.
7. 완료: Codex config rewrite를 atomic write, one-time backup, notify-hook detach로
   하드닝합니다.
8. 완료: explicit session-state migration boundary와 `cx session migrate` command를
   추가합니다.
9. 완료: session state를 v2로 승격하고 truthful notify dispatch capability semantics를
   추가합니다.
10. 다음:
   [Desktop app-server attachment evidence plan](../plans/2026-05-30-desktop-app-server-attachment-evidence-plan.md)의
   A/B contract에 따라 Desktop app-server attachment evidence slice를 실행합니다.
11. 이후: compact read-only session summary인 `cx session hud --json`을 추가합니다.
   Statusline integration은 Codex가 안정적인 supported configuration surface를 노출할
   때까지 계속 보류합니다.
12. 이후: Codex-native path가 유용해진 뒤에만 외부 `codex exec resume`을 별도 advanced
   feature로 재검토합니다.
