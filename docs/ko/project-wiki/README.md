# Codexus 프로젝트 LLM Wiki

[English](../../project-wiki/README.md)

이 문서는 Codexus의 체크인된 프로젝트 관리용 wiki입니다. 유지보수자와 LLM agent가
계획, 리뷰, 구현 전에 프로젝트 맥락을 빠르게 복구하도록 돕기 위한 문서입니다.

[Compiled repository wiki](../../design/18-compiled-repository-wiki.md)에 설명된
experimental 생성 wiki와는 별개입니다. 생성 wiki는 Codexus 제품 surface입니다. 이
project wiki는 `docs/project-wiki/`에 있는 curated management artifact입니다.

## 권위

이 wiki는 navigation과 synthesis layer입니다. Completion이나 verification authority가
아닙니다.

Source of truth 순서:

1. Code, test, schema, release workflow, package metadata.
2. [release-evidence](../release-evidence/) 아래의 release evidence.
3. [JSON contract](../json-contract.md), [구현 상태](../implementation-status.md),
   [남은 작업](../remaining-work.md) 같은 contract/status 문서.
4. 이 project wiki.

이 wiki가 source artifact와 충돌하면 wiki를 고치세요. Wiki 문장으로 evidence gate를
덮어쓰면 안 됩니다.

## 페이지

| Page | 용도 |
| --- | --- |
| [현재 상태](current-state.md) | Codexus의 stable/experimental/gated 상태를 빠르게 파악합니다. |
| [운영 모델](operating-model.md) | 프로젝트 원칙, evidence 규칙, dogfood workflow, 완료 판단 기준을 정리합니다. |
| [릴리스 관리](release-management.md) | Version policy, release gate, trusted publishing, post-publish evidence를 정리합니다. |
| [로드맵과 백로그](roadmap-and-backlog.md) | Active theme과 다음 작업 묶음을 management 관점에서 봅니다. |
| [도구](tooling.md) | `llms.txt`, Repomix 같은 선택 context 도구와 license/authority boundary를 정리합니다. |
| [Agent 온보딩](agent-onboarding.md) | 이 repository에서 작업하는 LLM agent의 첫 점검 목록입니다. |

## 사용 방법

새 작업을 시작할 때:

1. [현재 상태](current-state.md)와 [운영 모델](operating-model.md)을 읽습니다.
2. 관련 페이지에 링크된 source docs로 이동합니다.
3. 위험한 수정 전에는 Codexus checkpoint를 만듭니다.
4. claim을 증명하는 가장 작은 evidence command로 검증합니다.
5. 프로젝트 관리 요약이 바뀔 때만 이 wiki를 갱신합니다.

외부 context 공유에는 [llms.txt](../../../llms.txt)나 선택적
[도구](tooling.md) workflow부터 사용하세요. Tool-generated context pack은 advisory
projection이므로 사용 전에 직접 검토해야 합니다.

자주 쓰는 명령:

```bash
node codex/skills/codexus/scripts/cx.mjs session status --json
node codex/skills/codexus/scripts/cx.mjs session checkpoint "before <task>" --json
node codex/skills/codexus/scripts/cx.mjs session verify --verify "npm run ci" --json
node codex/skills/codexus/scripts/cx.mjs repo check --gate --json
node codex/skills/codexus/scripts/cx.mjs release check --gate --json
```

## 경계

이 wiki는 judgment를 요약할 수 있지만, judgment는 judgment로 표시해야 합니다. Work를
gate할 수 있는 fact는 source artifact나 command output에서 도출 가능해야 합니다.
