# Codexus

[English](../../README.md)

**Codexus는 OpenAI Codex CLI를 위한 harness engineering layer입니다.**

같은 로컬 Codex engine과 auth를 유지하면서, 그 주변에 durable run ledger,
verification gate, bounded repair loop, session evidence, memory, 정직한 상태 보고를
더합니다. 무엇을 고칠지와 통과해야 할 확인 명령을 알려주면, Codexus는 로컬에 로그인된
Codex CLI를 실행하고 그 명령을 돌립니다. 확인이 실패하면 실제 실패 출력을 Codex에
다시 전달해 제한된 repair loop를 수행하고, 확인 명령이 통과했을 때만 `complete`라고
보고합니다.

모든 실행은 `.codexus/runs/<id>` 아래에 저장됩니다. 터미널이 닫히거나 프로세스가
죽어도 이후에 상태를 확인하고, 이어서 검증하거나, 재개하거나, 취소할 수 있습니다.

같은 Codex 모델, 같은 로컬 Codex 인증을 사용합니다. 그 바깥에 감독, 복구, 메모리,
정직한 상태 보고를 더합니다.

## 왜 쓰나요

| 그냥 Codex CLI | Codexus 사용 |
| --- | --- |
| 테스트가 통과하기 전에 완료처럼 보일 수 있습니다. | 검증 명령이 통과해야만 `complete`입니다. |
| 실행 기록이 한 터미널 세션에 묶입니다. | 모든 실행이 `.codexus/runs/<id>`에 남습니다. |
| 실패 출력이 scrollback에 묻힙니다. | 실패 출력이 repair context와 근거 자료로 저장됩니다. |
| 배운 점은 사람이 따로 기억해야 합니다. | 유용한 lesson을 memory나 replay-gated skill로 승격할 수 있습니다. |
| 실험 기능의 상태를 과대평가하기 쉽습니다. | proven/configured/unavailable 상태를 구분해서 보고합니다. |

## 바로 보기

Shell에서 실행:

```bash
npm install -g codexus
codexus run --verify "npm test" "fix the parser regression"
```

Codexus는 Codex를 실행한 뒤 `npm test`를 실행합니다. 테스트가 실패하면 실제 실패
출력을 Codex에 전달해 제한된 repair loop를 돌립니다. 실행은 확인 명령이 통과했을
때만 `complete`가 됩니다.

![Redacted Codexus supervised run demo](https://raw.githubusercontent.com/raeseoklee/codexus/main/docs/assets/codexus-supervised-run.gif)

이 이미지는 live model transcript가 아니라 redacted fixture tape입니다. Local path,
auth state, private output을 노출하지 않고 사용자에게 보이는 핵심 loop만 보여줍니다.
첫인상 명확성을 위해 media는 깨끗한 pass path만 보여주며, repair 동작은 위 설명과
release evidence에서 검증합니다.
재생성 가능한 VHS source는 [docs/demo](../demo/README.md)에 있고, 전체 release
verification은 [release evidence](../release-evidence/0.2.8.md)에 남깁니다.

> 0.2 stable contract는 의도적으로 좁습니다. Live app-server turn, routine live
> model replay, automatic prompt injection은 계속 gate 뒤에 있습니다. Architecture
> check와 manual wiki context는 [구현 상태](implementation-status.md)에 문서화된
> bounded evidence surface에 한해서만 stable입니다.

## Codex CLI 채팅 안에서 사용하기

Codexus는 standalone `codexus` 명령만 제공하는 도구가 아닙니다. Npm package는
Codex-native `codexus` skill도 설치하므로, 현재 Codex CLI/TUI 채팅 안에 머무른 채
Codex에게 로컬 Codexus core를 호출해 상태와 결과를 기록하게 할 수 있습니다.

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
Codexus로 "npm test" session verification을 실행하고 결과 기록을 요약해줘.
```

```text
Codexus memory에서 "parser regression"을 검색하고 관련 있는 내용만 반영해줘.
```

현재 Codex conversation이 주 작업 loop로 유지됩니다. Codexus는 durable state,
checkpoint, verification artifact, memory lookup, replay, skill evidence를 추가합니다.
경쟁하는 별도 chat session을 만들지 않습니다.

전체 가이드: [Codex 안에서 Codexus 사용하기](codex-session-usage.md)

Demo tape: [README demo VHS source](demo/README.md).

## 프로젝트 관리 Wiki

Maintainer와 LLM agent는 빠른 프로젝트 context 복구를 위해 체크인된
[Project LLM Wiki](project-wiki/README.md)를 사용하세요. 이 문서는
management/navigation artifact이며, experimental generated repository wiki도 아니고
completion authority도 아닙니다.

## 빠른 시작

현재 stable package를 설치합니다:

```bash
npm install -g codexus
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
npm install -g codexus
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

`sh install.sh --help`를 실행하면 아무것도 설치하지 않고 (환경 변수로 설정하는) 옵션을 출력합니다.

Repository clone 후 검증:

```bash
git clone https://github.com/raeseoklee/codexus.git
cd codexus
npm run ci
npm run lsp:check
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
- Session-native quality evidence guard와 subagent claim recorder/completion handoff
- Schema artifact validation, stale-lock recovery, local CI parity
- Legacy `.codex-harness/`에서 `.codexus/`로 자동 migration
- Stable `codex exec --json` path에 영향을 주지 않는 gated app-server, app-instance, cron, gateway, model-replay experiment

## 상태

Codexus 0.2.x는 `codex exec --json`을 감싸는 좁은 stable path, stable local evidence
gate, architecture/manual wiki context surface의 첫 stable promotion을 가진 local
harness로 사용할 수 있습니다. Live app-server turn, routine live model replay,
automatic prompt injection은 의도적으로 gate 뒤에 있습니다.

## 지원 상태 매트릭스

| Surface | 0.2 상태 |
| --- | --- |
| `codex exec --json` supervised run, verification/repair, run ledger, resume/cancel/status/events | 안정 경로 |
| Codex-native `$codexus` skill, session status/checkpoint/verify/hud, notify-hook evidence | 안정적인 session evidence surface |
| `slop check`, `supply-chain check`, schema subset engine, replay parity, memory/skill lifecycle | 안정적인 local evidence surface |
| `architecture check --gate`, `repo check --gate`, `release check --gate`, `lsp check --gate`, `wiki context --fresh-only --gate` | 문서화된 bounded contract에 한한 stable local evidence gate |
| `repo graph build/check/import/search/explain`, `wiki build/check/export`, `wiki context approve/approvals` | Experimental graph/wiki evidence surface; context approval artifact는 visible/listable하고 non-injected |
| `app instance profile list/status/logs/start/stop/evidence record/evidence list/evidence summary/probe/logs/metrics/screenshot/browser/adapters` | Experimental owned-process와 observation-evidence surface; live start/stop은 Codexus-owned instance에서만 동작하고 observation은 authority가 되지 않은 채 `instanceId`를 인용 |
| app-server, cron/gateway, LSP adapter, model replay, adapter injection, tmux worker, native subagent launch | Experimental/deferred; app-server는 read-only, cron/gateway는 explicit approval live dispatch와 scheduler readiness gap 보고를 지원하며, LSP protocol-server lifecycle은 unavailable, 나머지는 status/record/launch-contract/gated surface |
| autopilot contract layer | Experimental foundation slice 구현 (`plan`, `contract validate/approve/scope-check`, `run-gate`, relay recorder/checker, relay adapter status); live `autopilot run`과 active relay driver는 계속 0.2/0.3 트랙에서 deferred |

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
codexus doctor --json
codexus init --with-docs --json
codexus setup codex-session --scope project --always-on --enable-notify-hook --json
codexus session status --json
codexus session hud --json
codexus session checkpoint "before risky refactor" --json
codexus session verify --auto --json
codexus session verify --verify "npm test" --json
codexus session slop --json
codexus session subagent probe --record --json
codexus session subagent launch --role reviewer --task "review the staged diff" --json
codexus session subagent complete --task-id <id> --claim "review found no API drift" --assumptions-surfaced pass --json
codexus session subagent record --file <result.json> --json
codexus session workers status --json
codexus lsp status --json
codexus lsp adapters --json
codexus lsp check --gate --json
codexus schema engine --json
codexus replay parity --json
codexus repo graph build --graph-provider codexus-lite --scope "src/**" --json
codexus repo graph check --graph <graph-id-or-path> --gate --json
codexus wiki build --json
codexus wiki context --topic verification --fresh-only --gate --json
codexus wiki context --topic verification --approve --approved-by "$USER" --json
codexus wiki context approvals --json
codexus slop check --scope "src/**" --gate --json
codexus supply-chain check --gate --json
codexus release check --gate --json
codexus app instance profile list --json
codexus app instance start --profile web --worktree . --json
codexus app instance status --json
codexus app instance evidence record --instance-id <id> --kind browser --source manual --summary "checked app" --json
codexus app instance evidence probe --instance-id <id> --url http://127.0.0.1:<port>/ --json
codexus app instance evidence logs --instance-id <id> --json
codexus app instance evidence metrics --instance-id <id> --json
codexus app instance evidence screenshot --instance-id <id> --evidence-path ./screen.png --json
codexus app instance evidence browser --instance-id <id> --capture ./browser-capture.json --json
codexus app instance evidence adapters --json
codexus app instance evidence summary --json
codexus app instance stop --instance-id <id> --json
codexus run --verify "npm test" "fix the parser regression"
codexus cancel <run-id> --reason "no longer needed" --json
codexus status <run-id> --json
codexus events tail <run-id> --json
codexus verify <run-id> --json
codexus replay skill <skill-id> --json
codexus memory search "parser regression" --json
codexus skill review <skill-id> --json
codexus skill export <skill-id> --target codex --json
codexus schema check --json
codexus app-server experiment --dry-run --record --supervise-fake --json
```

Canonical bin은 `codexus`이고, `cx`는 지원되는 short alias입니다.

## 문서 지도

- [빠른 시작](quickstart.md)
- [Codex 안에서 Codexus 사용하기](codex-session-usage.md)
- [기능 레퍼런스](features.md)
- [아키텍처](design/01-architecture.md)
- [상세 설계](design/02-detailed-design.md)
- [진화 엔진](design/03-evolution-engine.md)
- [Codex-native adapter](design/06-codex-native-adapter.md)
- [세션 네이티브 감독](design/07-supervised-sessions.md)
- [단독 정체성과 always-on evidence](design/08-standalone-identity-and-always-on-evidence.md)
- [Subagent evidence supervision](design/09-subagent-evidence-supervision.md)
- [품질 증거 가드 (slop guard)](design/10-quality-evidence-guard.md)
- [공급망 증거](design/11-supply-chain-evidence.md)
- [Autopilot 계약](design/12-autopilot-contract.md): 장시간 supervised run을 위한 experimental foundation slice입니다. `cx autopilot plan`, contract validate/approve/scope-check, run-gate readiness, 사람이 승인한 scope, worktree 격리, detect-then-stop, evidence-gated acceptance를 다루며, live `autopilot run`은 계속 deferred입니다.
- [하네스 엔지니어링 정렬](design/13-harness-engineering-alignment.md): OpenAI harness engineering 글과 Karpathy-style behavior contract를 종합한 정렬 문서. repository map, architecture gate, behavior evidence, non-goal을 정의합니다.
- [Repository knowledge graph](design/14-repository-knowledge-graph.md): experimental codexus-lite graph build/check 첫 slice와, deferred Understand-Anything JSON import용 graph-provider boundary, scoped freshness, structural graph gate를 정의합니다.
- [Multi-engine relay autopilot](design/15-multi-engine-relay-autopilot.md): author/reviewer artifact, stage-gate evidence, relay adapter status, convergence validation을 위한 experimental recorder/checker 첫 slice입니다. Convergence는 완료 권한이 아닙니다.
- [Codex task panel projection](design/16-codex-task-panel-projection.md): durable Codexus task state를 native Codex task panel로 projection하되, host UI를 source of truth로 만들지 않는 0.2 제안 설계입니다.
- [Operational control invariants](design/17-operational-control-invariants.md): autonomy preset, policy catalog reporting, docs-code invariant, decision record, loop breaker, HUD projection의 실험적 첫 slice를 정리하되 새 완료 권한은 만들지 않습니다.
- [Compiled repository wiki](design/18-compiled-repository-wiki.md): repository fact, ledger, graph artifact, decision, verification evidence 위의 재생성 가능한 markdown page를 위한 experimental deterministic 첫 slice입니다. `cx wiki map/build/check/context/export`가 local하게 동작하며 advisory synthesis는 계속 deferred이고, export는 자동이 아니라 명시적으로만 수행됩니다.
- [Worktree app instance launcher](design/19-worktree-app-instance-launcher.md): worktree별 app evidence를 위한 experimental live ownership과 observation-evidence app instance surface입니다. Live start/stop은 Codexus-owned instance에 대해 동작하고 observation은 authority가 되지 않은 채 `instanceId`를 인용합니다.
- [Observability adapter boundary](design/20-observability-adapter-boundary.md): 선택적 live Browser/DevTools capture driver를 추가하기 전의 경계 설계입니다. Adapter는 bounded capture artifact를 만들 수 있지만 health, control, prompt-injection, completion authority가 될 수 없습니다.
- [레퍼런스 거버넌스](references/README.md)
- [구현 상태](implementation-status.md)
- [남은 작업](remaining-work.md)
- [로드맵 칸반](roadmap-kanban.html): 남은 작업을 ready, evidence, gated, later 4컬럼 HTML board로 정리합니다.
- [0.1.0 stable 준비 계획](plans/2026-05-31-0.1.0-stable-readiness-plan.md)
- [0.2.0 promotion 준비 계획](plans/2026-06-04-0.2.0-promotion-readiness-plan.md)
- [0.1.1 release evidence](release-evidence/0.1.1.md)
- [0.1.2 release evidence](release-evidence/0.1.2.md)
- [0.1.3 release evidence](release-evidence/0.1.3.md)
- [0.1.4 release evidence](release-evidence/0.1.4.md)
- [0.1.5 release evidence](release-evidence/0.1.5.md)
- [0.1.6 release evidence](release-evidence/0.1.6.md)
- [0.1.7 release evidence](release-evidence/0.1.7.md)
- [0.1.8 release evidence](release-evidence/0.1.8.md)
- [0.1.9 release evidence](release-evidence/0.1.9.md)
- [0.1.10 release evidence](release-evidence/0.1.10.md)
- [0.1.11 release evidence](release-evidence/0.1.11.md)
- [0.1.12 release evidence](release-evidence/0.1.12.md)
- [0.1.13 release evidence](release-evidence/0.1.13.md)
- [0.1.14 release evidence](release-evidence/0.1.14.md)
- [0.1.15 release evidence](release-evidence/0.1.15.md)
- [0.2.0 release evidence](release-evidence/0.2.0.md)
- [0.2.1 release evidence](release-evidence/0.2.1.md)
- [0.2.2 release evidence](release-evidence/0.2.2.md)
- [0.2.3 release evidence](release-evidence/0.2.3.md)
- [0.2.4 release evidence](release-evidence/0.2.4.md)
- [0.2.5 release evidence](release-evidence/0.2.5.md)
- [0.2.6 release evidence](release-evidence/0.2.6.md)
- [0.2.7 release evidence](release-evidence/0.2.7.md)
- [0.2.8 release evidence](release-evidence/0.2.8.md)
- [JSON contract](json-contract.md)
- [릴리즈 정책](release-policy.md)
- [Public release checklist](public-release.md)
- [Roadmap](ROADMAP.md)
- [Changelog](CHANGELOG.md)

## 안전 경계

Codexus는 private ChatGPT/Codex backend API를 의도적으로 사용하지 않습니다. 안정적인
driver boundary는 로컬에 인증된 Codex CLI입니다. Experimental surface는 feature gate
뒤에 있으며, live dispatch path는 explicit approval, policy, lock, evidence
record를 남긴 뒤에만 실행됩니다.
