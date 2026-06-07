# 도구

[English](../../project-wiki/tooling.md)

이 페이지는 프로젝트 관리 context를 돕는 선택 도구를 기록합니다. 이 도구들은 Codexus
runtime dependency가 아니며, 그 자체로 evidence gate나 completion authority가 되지
않습니다.

## llms.txt

Repository root에 [llms.txt](../../../llms.txt)를 추가했습니다. LLM agent와 문서 독자를 위한
curated map입니다. Project wiki, implementation status, JSON contract, release policy,
remaining work, 최신 release evidence로 연결합니다.

첫 navigation file로 사용하세요. Source artifact와 충돌하면 `llms.txt`를 갱신합니다.

## Repomix

[Repomix](https://repomix.com/guide/)는 AI-friendly context file을 만들 수 있는 선택적
repository packing tool입니다. 공개 문서는 MIT license라고 설명하며, guide에는
`npx repomix@latest`, git-aware ignore, security check, token counting, configurable
output format이 문서화되어 있습니다.

Codexus는 이 도구를 optional dev-time tool로만 둡니다:

- `package.json` dependency 없음,
- runtime import 없음,
- npm package inclusion 없음,
- completion authority 없음,
- automatic prompt injection 없음.

체크인된 [repomix.config.json](../../../repomix.config.json)은 project-management context에
scope를 맞춥니다. Project wiki, 핵심 design docs, release policy, JSON contract,
implementation status, remaining work, 최신 release evidence를 포함합니다. 기본적으로 source,
tests, fixtures, `dist`, Codexus state는 제외합니다.

Local context pack 생성:

```bash
npx repomix@latest --config repomix.config.json
```

Configured output path는 git에서 무시되는 `.codexus/context/` 아래입니다. 어떤 model에
전달하기 전에는 generated pack을 직접 검토하세요.

## License Rule

Optional tool의 config file을 추가하는 것과 project dependency를 추가하는 것은 다릅니다.
나중에 Codexus가 어떤 tool을 import, vendor, bundle, depend하게 된다면 merge 전에 license와
supply-chain fact를 다시 확인해야 합니다.
