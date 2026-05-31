# Codexus

[English](../../README.md)

**Codexus는 OpenAI Codex CLI를 검증 증거와 함께 실행합니다.**

무엇을 고칠지와 어떻게 검증할지를 알려주면, Codexus는 로컬에 로그인된 Codex CLI를
실행하고 검증 명령을 돌립니다. 검증이 실패하면 실제 실패 출력을 Codex에 다시 전달해
제한된 repair loop를 수행하고, 검증이 통과했을 때만 `complete`라고 보고합니다.

모든 실행은 `.codexus/runs/<id>` 아래에 저장됩니다. 터미널이 닫히거나 프로세스가
죽어도 이후에 상태를 확인하고, 이어서 검증하거나, 재개하거나, 취소할 수 있습니다.

같은 Codex 모델, 같은 로컬 Codex 인증을 사용합니다. 그 바깥에 감독, 복구, 메모리,
정직한 상태 보고를 더합니다.

## 왜 쓰나요

| 그냥 Codex CLI | Codexus 사용 |
| --- | --- |
| 테스트가 통과하기 전에 완료처럼 보일 수 있습니다. | 검증 명령이 통과해야만 `complete`입니다. |
| 실행 기록이 한 터미널 세션에 묶입니다. | 모든 실행이 `.codexus/runs/<id>`에 남습니다. |
| 실패 출력이 scrollback에 묻힙니다. | 실패 출력이 repair context와 증거로 저장됩니다. |
| 배운 점은 사람이 따로 기억해야 합니다. | 유용한 lesson을 memory나 replay-gated skill로 승격할 수 있습니다. |
| 실험 기능의 상태를 과대평가하기 쉽습니다. | proven/configured/unavailable 상태를 구분해서 보고합니다. |

## 바로 보기

Shell에서 실행:

```bash
npm install -g codexus@next
codexus run --verify "npm test" "fix the failing parser tests"
```

Codexus는 Codex를 실행한 뒤 `npm test`를 실행합니다. 테스트가 실패하면 실제 실패
출력을 Codex에 전달해 제한된 repair loop를 돌립니다. 실행은 검증 명령이 통과했을
때만 `complete`가 됩니다.

> 현재는 early alpha입니다. Live app-server turn, routine live model replay,
> automatic prompt injection, live cron/gateway dispatch는 의도적으로 gate 뒤에
> 있습니다. 자세한 상태는 [구현 상태](implementation-status.md)를 확인하세요.

## Codex CLI 채팅 안에서 사용하기

Codexus는 standalone `cx` 명령만 제공하는 도구가 아닙니다. Npm package는
Codex-native `codexus` skill도 설치하므로, 현재 Codex CLI/TUI 채팅 안에 머무른 채
Codex에게 로컬 Codexus core를 호출해 evidence를 남기게 할 수 있습니다.

Shell에서 한 번만 project setup을 실행합니다:

```bash
codexus setup codex-session --scope project --enable-notify-hook --json
```

그 다음 Codex 채팅창에는 일반 요청처럼 입력합니다:

```text
codexus skill을 사용해서 현재 session status를 보여줘.
```

```text
Codexus로 "before parser cleanup" checkpoint를 만들어줘.
```

```text
Codexus로 "npm test" session verification을 실행하고 evidence를 요약해줘.
```

```text
Codexus memory에서 "parser regression"을 검색하고 관련 있는 내용만 반영해줘.
```

현재 Codex conversation이 주 작업 loop로 유지됩니다. Codexus는 durable state,
checkpoint, verification artifact, memory lookup, replay, skill evidence를 추가합니다.
경쟁하는 별도 chat session을 만들지 않습니다.

전체 가이드: [Codex 안에서 Codexus 사용하기](codex-session-usage.md)

## 빠른 시작

현재 alpha package를 설치합니다:

```bash
npm install -g codexus@next
codexus doctor --json
```

검증이 붙은 supervised task를 실행합니다:

```bash
codexus run --verify "npm test" "fix the failing tests"
```

Global npm install은 기본적으로 Codex-native skill adapter도
`${CODEX_HOME:-~/.codex}/skills/codexus`에 설치합니다. CLI만 설치하고 싶으면
`CODEXUS_INSTALL_CODEX_SKILL=0`을 사용하세요.

자세한 setup: [빠른 시작](quickstart.md)

## 설치 옵션

Npm 설치:

```bash
npm install -g codexus@next
```

GitHub Pages installer:

```bash
curl -fsSL https://raeseoklee.github.io/codexus/install.sh | sh
```

Review-first install:

```bash
curl -fsSLO https://raeseoklee.github.io/codexus/install.sh
less install.sh
sh install.sh
```

Repository clone 후 검증:

```bash
git clone https://github.com/raeseoklee/codexus.git
cd codexus
npm run ci
npm run package:smoke
```

## 핵심 기능

- `.codexus/runs/<run-id>/` 아래 evidence-backed run ledger
- 검증 게이트와 제한된 repair loop
- Timeout, SIGINT, 외부 `cx cancel <run-id>` 취소 경로
- Automation을 위한 structured JSON error envelope
- Memory record, curation, bounded retrieval
- Replay-gated skill 제안, 리뷰, 승격, 개선, export, deprecation
- 같은 core를 Codex session 안에서 쓰기 위한 `$codexus` adapter
- Session-native quality evidence guard와 subagent claim recorder
- Schema artifact validation, stale-lock recovery, local CI parity
- Legacy `.codex-harness/`에서 `.codexus/`로 자동 migration
- Stable `codex exec --json` path에 영향을 주지 않는 gated app-server, cron, gateway, model-replay experiment

## 상태

Codexus는 early local harness로 사용할 수 있습니다. 안정 경로는
`codex exec --json`을 감싸는 CLI입니다. Live app-server turn, routine live model
replay, automatic prompt injection, live cron/gateway dispatch는 의도적으로 gate 뒤에
있습니다.

정확한 coverage와 gap은 [구현 상태](implementation-status.md)와
[남은 작업](remaining-work.md)을 확인하세요.

## 요구 사항

- Node.js 22 이상
- Installer와 package workflow를 위한 npm
- Git
- 실제 Codex run을 위한 로컬 `codex` CLI
- `codex-exec` driver를 위한 로그인된 Codex CLI session

대부분의 테스트는 deterministic mock driver를 사용하므로 CI에는 모델이나 네트워크
접근이 필요하지 않습니다. 실제 run은 로컬에 인증된 Codex CLI를 사용합니다.

## 자주 쓰는 명령

```bash
cx doctor --json
cx init --with-docs --json
cx setup codex-session --scope project --always-on --enable-notify-hook --json
cx session status --json
cx session hud --json
cx session checkpoint "before risky refactor" --json
cx session verify --auto --json
cx session verify --verify "npm test" --json
cx session slop --json
cx session subagent record --file <result.json> --json
cx session workers status --json
cx schema engine --json
cx replay parity --json
cx adapt omx injection --task "parser cleanup" --approve --json
cx slop check --scope "src/**" --gate --json
cx supply-chain check --gate --json
cx run --verify "npm test" "fix the failing parser tests"
cx cancel <run-id> --reason "no longer needed" --json
cx status <run-id> --json
cx events tail <run-id> --json
cx verify <run-id> --json
cx replay skill <skill-id> --json
cx memory search "parser regression" --json
cx skill review <skill-id> --json
cx skill export <skill-id> --target codex --json
cx schema check --json
cx app-server experiment --dry-run --record --supervise-fake --json
```

Public bin은 `cx`와 `codexus`입니다.

## 문서 지도

- [빠른 시작](quickstart.md)
- [Codex 안에서 Codexus 사용하기](codex-session-usage.md)
- [아키텍처](design/01-architecture.md)
- [상세 설계](design/02-detailed-design.md)
- [진화 엔진](design/03-evolution-engine.md)
- [Codex-native adapter](design/06-codex-native-adapter.md)
- [세션 네이티브 감독](design/07-supervised-sessions.md)
- [단독 정체성과 always-on evidence](design/08-standalone-identity-and-always-on-evidence.md)
- [Subagent evidence supervision](design/09-subagent-evidence-supervision.md)
- [품질 증거 가드 (slop guard)](design/10-quality-evidence-guard.md)
- [공급망 증거](design/11-supply-chain-evidence.md)
- [레퍼런스 거버넌스](references/README.md)
- [구현 상태](implementation-status.md)
- [남은 작업](remaining-work.md)
- [0.1.0 stable 준비 계획](plans/2026-05-31-0.1.0-stable-readiness-plan.md)
- [JSON contract](json-contract.md)
- [Public release checklist](public-release.md)
- [Roadmap](ROADMAP.md)
- [Changelog](CHANGELOG.md)

## 안전 경계

Codexus는 private ChatGPT/Codex backend API를 의도적으로 사용하지 않습니다. 안정적인
driver boundary는 로컬에 인증된 Codex CLI입니다. Experimental surface는 feature gate
뒤에 있으며, live dispatch path를 활성화하기 전에 dry-run, policy, approval, evidence
record를 먼저 보고합니다.
