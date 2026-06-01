# 공급망 증거 (Supply-Chain Evidence)

[English](../../design/11-supply-chain-evidence.md)

작성일: 2026-05-31
상태: 첫 slice 구현 및 출시 완료; advisory/network 후속은 deferred

## 결정

Codexus는 공급망 증거 surface를 추가하되, **패키지/릴리스 자체에 대한 로컬·derivable
증거**로 만듭니다 — 그리고 선택적 pre-publish gate. CVE/취약점 스캐너가 되어서는 안 됩니다.

이는 [quality evidence guard](10-quality-evidence-guard.md)와 같은 evidence-first 논지를
다른 artifact에 적용한 것입니다: "이 변경이 검증 가능한 문제 해결인가" 대신 "이 패키지/릴리스가
검증 가능한 공급망 사실에 근거하는가"를 묻습니다. 같은 3-bucket / tri-state 모델과 gate
메커니즘을 재사용합니다.

## 왜 Codexus에 맞나

- 공급망 검토는 본질적으로 **derivable**입니다: dependency 개수, install script 존재, tarball
  유출, network import, lockfile integrity, CI 핀은 객관적 사실.
- 기존 `evidenceGaps` / `derivableFacts` / `heuristicClaims` 모델과 `--gate`(`gateFor`)에
  그대로 매핑되어 병렬 subsystem을 더하지 않음.
- **engine-agnostic**: 일반 npm/git artifact에서 동작하고 Codex 무의존 → 코어 강화.
- pre-publish gate가 release flow(`npm run publish:next`)에 직결.

## 하드 경계 (make-or-break)

> Codexus는 derivable 공급망 **사실**을 보고하고 gate한다. threat-intelligence 제품이 되지
> 않는다.

이 선을 넘으면 정체성이 깨집니다:

- **CVE/취약점 DB 금지.** 알려진 CVE 조회는 **취약점 DB로의 네트워크 호출**이 필요해 no-network
  / local-first 경계를 위반합니다(공급망 자세를 강하게 만든 그 속성). `npm audit`/Snyk/Socket/
  OSV가 이미 합니다 — Codexus는 링크하지 재구현 안 함.
- **"이 dependency는 악성" 권위 단정 금지.** 판단이므로 heuristic claim(advisory)에 그침.
- **자동 수정 금지.**
- **검사 자체가 코드를 실행하면 안 됨.** 패키지의 lifecycle script를 실행하는 공급망 검사는,
  막으려던 바로 그 임의코드실행 벡터가 됩니다("Lifecycle 미실행" 참조).

## 사실 ≠ 위반: 선언형 policy

derivable 사실("`postinstall`이 있음", "런타임 dependency가 있음", "shipped code가 `node:net`
import")은 **자동으로 위반이 아닙니다.** fact가 gate되는지는 선언된 policy에 달려 있습니다.
이건 slop guard의 declared scope와 동형입니다: fact는 *선언된 bound를 위반할 때만* gateable한
`evidenceGap`이 되고, 선언이 없으면 `derivableFact`로 보고만 되며 gate하지 않습니다(fact만으로
위반을 날조하지 않음).

Codexus 자신이 이유를 보여줍니다: 자기 패키지에 `postinstall`(skill installer)이 있고,
`esbuild` devDependency에 install script가 있고, Stage B가 `node:net`을 ship합니다. naive
"install script 있음 → fail"이면 Codexus 자기 검사에 자기가 실패합니다.

Policy는 `package.json`의 `codexus.supplyChain` 또는 `.codexus/supply-chain-policy.json`:

아래 블록은 **Codexus repo policy candidate**이지 범용 기본값이 아닙니다: policy 미선언
non-Codexus 패키지는 `report-only`(사실 보고, 무조건적 secret-leak invariant 외엔 gate 안 함).
forbidden/required 파일 리스트는 `scripts/package-smoke.mjs`가 이미 강제하는 assertion을
**formalize하고 확장**한 것입니다.

```json
{
  "codexus": {
    "supplyChain": {
      "runtimeDependenciesMax": 0,
      "allowedLifecycleScripts": ["postinstall", "prepack", "prepublishOnly"],
      "allowedDevDependencyInstallScripts": ["esbuild"],
      "allowRuntimeNetworkImports": ["node:net"],
      "forbiddenPackageFiles": [
        ".env", ".env.*", ".codexus/**", ".codex-harness/**",
        "node_modules/**", "src/**", "tests/**", "docs/**",
        "fixtures/replay/**", "fixtures/migrations/**"
      ],
      "requiredPackageFiles": [
        "dist/cli/main.js", "package.json", "README.md", "LICENSE",
        "CHANGELOG.md", "schemas/config.schema.json",
        "schemas/session-state.schema.json",
        "schemas/supply-chain-policy.schema.json",
        "fixtures/app-server/schema.fixture.json",
        "codex/skills/codexus/SKILL.md", "scripts/postinstall.mjs",
        "scripts/install-codex-skill.mjs", "scripts/codexus-notify-hook.mjs",
        "scripts/publish-next.mjs", "install.sh"
      ],
      "binTargetsMustBeBuiltArtifacts": true,
      "lockfileIntegrityRequired": true
    }
  }
}
```

여기서 따라오는 통합 제약 셋:

- **Single source of truth.** 이 파일 리스트는 `package-smoke.mjs`가 지금 하드코딩한 것을
  formalize하고 확장합니다(정책이 superset — `package.json`/`README.md`/`LICENSE`/`CHANGELOG.md`도
  required로 두고 더 많은 경로를 forbid). policy가 `package-smoke`와 `cx supply-chain check`가 함께
  읽는 단일 출처가 되어 drift를 막아야 합니다.
- **policy 검증.** `codexus.supplyChain`은 구조화 config이므로 schema artifact + validation
  (`config.schema.json`처럼)을 줘서 malformed policy가 조용히 mis-gate하지 않고 loud하게 실패.
- **zero-dependency glob 매칭.** 파일 glob은 hand-rolled / Node 내장 매처로 — glob 의존성을
  끌어오면 이 기능이 검사하는 zero-runtime-dependency 속성을 스스로 배반함.

gate 결과는 각 gap을 만든 policy bound 또는 built-in invariant를 기록해야 합니다(예:
"`postinstall`이 `allowedLifecycleScripts`에 없음") — gate가 audit 가능하도록. policy 없이 gate하는
built-in invariant는 *무조건적 안전 사실*에 한정합니다(예: package artifact에 secret 패턴 유출).
그 외 전부는 선언된 policy에 대해서만 gate합니다.

## 3-bucket + 두 종류의 Unknown

derivable 테스트는 동일: 두 정직한 리뷰어가 이견을 낼 수 있는가, 도구/artifact가 없으면 틀릴 수
있는가? 그렇다면 derivable이 아닙니다.

| 계층 | 예 (전부 로컬, 무네트워크) | 권한 |
| --- | --- | --- |
| Derivable fact/evidence | install script 존재; 런타임 dependency 개수; package-artifact(pack file list) secret 패턴 유출; shipped code의 network import; lockfile + integrity hash; CI action SHA 핀 vs mutable tag; `bin`이 built artifact vs raw source | 사실 — policy 또는 built-in 안전 invariant로만 gate |
| Heuristic claim | dependency 이름이 typosquat 같음; 코드가 exfiltration 같음; install script가 비정상 광범위 | 추측 — advisory, 자동 fail 금지 |

Unknown은 두 종류로 나뉘고, **하나만 gate합니다**:

- **`blockingUnknowns`** — 로컬에서 *도출 가능해야 하는데* 못 한 것이라 안전을 단정할 수 없음:
  `package-lock.json` 읽기 실패, package file-list 생성/검사 실패. 이건 gate(알아야 했는데 실패).
- **`informationalUnknowns`** — 원래 로컬에서 알 수 없는 것: npm 2FA, maintainer account 상태,
  publish provenance 부재, dependency의 알려진 CVE(네트워크 DB 필요, 범위 밖). 보고만 하고
  **절대 gate 안 함** — 안 그러면 2FA를 repo에서 도출 못 한다는 이유로 모든 publish가 영원히 막힘.

"알려진 CVE 있음"은 `npm audit`/OSV 포인터와 함께 `informationalUnknown` — 날조된 gap도, 조용한
pass도 아님.

## Pre-Publish Gate

`cx slop check --gate`(완료 전)와 평행한 publish 전 gate:

```bash
cx supply-chain check --json          # report-only, exit 0
cx supply-chain check --gate --json   # gateable finding에서만 exit code
```

gate exit code는 **`evidenceGaps + blockingUnknowns`만** 주도:

- `fail`(exit 1): policy 위반(선언 bound를 깬 fact) 또는 built-in 안전 invariant(예: package
  artifact secret 패턴).
- `blocked`(exit 1): `blockingUnknown` — 로컬에서 도출됐어야 하는데 못 해 안전을 단정 불가.
- `pass`(exit 0): gap 없음, blocking unknown 없음.

`informationalUnknowns`, `heuristicClaims`, non-gating `derivableFacts`는 보고·집계되지만 gate
exit code를 **절대** 못 움직임 — change-evidence gate처럼 gate 함수에 gateable status만 넘겨 보장.

## Lifecycle 미실행 (기본)

공급망 검사는 기본적으로 대상 패키지의 lifecycle script를 실행하면 안 됩니다 — `npm pack`은
(`--dry-run`이어도) `prepack`/`prepare`를 실행하므로, 임의 패키지를 naive하게 pack하면 그 코드가
실행됩니다. 기본값:

- **기본: lifecycle 미실행.** ship될 file-list를 `files[]` + `.npmignore` 해소로 *정적* 도출하거나
  `npm pack --ignore-scripts`. 패키지 코드 실행 없이 file-list·secret-leak 증거를 얻음.
- **lifecycle 포함 full pack: 자기 패키지의 release gate 안에서만**(`prepack -> npm run build`가
  신뢰됨), 명시적 opt-in(예: `--execute-lifecycle`).
- 출력은 `lifecycleExecuted`(기본 false)와 `projectionMode`를 기록: `"static"`(best-effort
  `files[]` + `.npmignore` projection — npm packing과 byte-동일이라 주장하지 **않음**),
  `"npm-pack-ignore-scripts"`, `"npm-pack-lifecycle"`(release gate 전용). static projection은
  best-effort이며 npm packing semantics와 같다고 암시하지 말고 그렇게 명시해야 함.
- 현재 구현은 `projectionMode: "static"`만 지원하며, `files[]`, public `bin` target, npm이
  흔히 포함하는 metadata 파일에서 best-effort file list를 도출합니다. 아직 `.npmignore`나
  `.gitignore`는 해소하지 않습니다. `npm-pack-ignore-scripts`와 `npm-pack-lifecycle`은
  trust/execution 경계가 명시 구현될 때까지 deferred입니다.

## 표면 (subsystem 최소화)

change-evidence 출력 형태(`evidenceGaps`/`derivableFacts`/`heuristicClaims` + tri-state 요약 +
두 unknown 리스트)와 `gateFor`를 재사용. 병렬 스캐너 subsystem 금지.

```bash
cx supply-chain check --json
cx supply-chain check --gate --json
```

`cx doctor`가 compact 요약을 surface할 수 있고, `cx supply-chain check`가 전체 증거 리포트 생성.

## 비목표

- CVE/취약점 스캐너 아님; 어떤 네트워크/DB 조회도 안 함.
- 대상 패키지 lifecycle script를 기본 실행 안 함.
- dependency/maintainer가 악성/신뢰불가라고 단정 안 함.
- 자동 수정/제거/publish 설정 변경 안 함.
- risk 등급 안 냄; 요약은 gateable finding만 주도하는 tri-state.
- 선언 policy나 built-in 안전 invariant 없이 bare fact로 위반 날조 안 함.
- `informationalUnknowns`(2FA, provenance, CVE)로 block 안 함.
- `npm audit`/Snyk/Socket/OSV 대체 안 함; CVE 커버리지는 그것들로 링크.

## 첫 슬라이스

로컬 패키지/repo에서만, **lifecycle script 미실행**으로 보고하는 `cx supply-chain check --json`:

- 이 패키지와 (정적 해소 가능 시) 직접 dependency의 install script 존재(derivable fact),
- 선언된 `runtimeDependenciesMax` 대비 런타임 dependency 개수(derivable; policy 선언 시만 gate),
- 정적 file-list / secret 패턴 유출 스캔(derivable; `.env`/`.codexus`/`tests`/`src`/
  고신뢰 key·token 패턴) — secret 유출은 built-in 안전 invariant. `token = value` 같은
  redaction 전용 assignment heuristic은 release blocker로 쓰기엔 너무 noisy하므로 기본 gate에
  사용하지 않음,
- shipped code의 network import(derivable **fact**; `allowRuntimeNetworkImports` policy로만 gate),
- lockfile 존재와 integrity hash(derivable),

그리고 `--gate`(`evidenceGaps + blockingUnknowns`에서 exit code), 네트워크 DB(CVE)나 외부
설정(2FA/provenance)이 필요한 모든 것은 `informationalUnknowns`, `lifecycleExecuted: false`.
heuristic 레인(typosquat/exfiltration)과 `npm audit`/OSV/Snyk/Socket 링크는 recommendation으로
deferred.

## 수용 기준

- finding이 `evidenceGaps`, `derivableFacts`, `heuristicClaims`, `blockingUnknowns`,
  `informationalUnknowns`로 분리되며 각각 evidence-linked.
- gate exit code는 `evidenceGaps + blockingUnknowns`만 주도; informationalUnknowns·heuristic·
  non-gating fact는 못 움직임.
- 어떤 체크도 네트워크/취약점-DB 조회 안 함; CVE는 `npm audit`/OSV 포인터와 함께
  `informationalUnknown`.
- 검사는 기본적으로 대상 lifecycle script를 실행 안 하고, 출력이 `lifecycleExecuted`를 보고.
- bare derivable fact는 선언 policy bound나 built-in 안전 invariant 없이 gate 안 함; 각 gap은
  그것을 만든 policy/invariant를 기록.
- package artifact의 secret 패턴 유출은 policy 없이도 built-in 안전 invariant로 gate.
- 병렬 subsystem 없음, Codex-specific 의존성 없음.
