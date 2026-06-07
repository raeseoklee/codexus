# Agent 온보딩

[English](../../project-wiki/agent-onboarding.md)

Codexus에서 작업하는 LLM agent의 첫 점검 목록입니다.

## 첫 10분

1. [AGENTS.md](../../../AGENTS.md)를 읽습니다.
2. [프로젝트 LLM Wiki](README.md), [현재 상태](current-state.md),
   [운영 모델](operating-model.md)을 읽습니다.
3. Local state를 확인합니다:

   ```bash
   git status --short
   node codex/skills/codexus/scripts/cx.mjs session status --json
   ```

4. 구현 작업 전에는 checkpoint를 만듭니다:

   ```bash
   node codex/skills/codexus/scripts/cx.mjs session checkpoint "before <task>" --json
   ```

5. 수정하려는 surface의 source design doc을 읽습니다.

## 하지 말 것

- 이 wiki, generated wiki page, task label, model agreement를 completion authority로
  취급하지 않습니다.
- [JSON contract](../json-contract.md)와 release evidence를 갱신하지 않고 experimental
  surface를 stable로 승격하지 않습니다.
- Wiki, memory, skill context를 prompt에 자동 주입하지 않습니다.
- Codexus가 소유권을 증명하지 못한 process를 stop하거나 cleanup하지 않습니다.
- Command와 policy가 명시적으로 요구하지 않는 live network/model behavior를 gate로
  사용하지 않습니다.

## Final Response 전

다음을 보고합니다:

- 무엇이 바뀌었는지,
- 어떤 verification이 통과했는지,
- 무엇이 아직 not tested인지,
- worktree가 clean인지 의도적으로 dirty인지.

Commit에는 [AGENTS.md](../../../AGENTS.md)의 Lore commit protocol을 사용합니다.
