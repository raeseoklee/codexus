# npm Packaging Plan

[English](../../plans/2026-05-30-npm-packaging-plan.md)

날짜: 2026-05-30

상태: npm-installed CLI packaging slice로 구현됨.

## 결정

Codexus는 bundled JavaScript CLI entrypoint를 가진 npm package로 배포합니다.
Package는 `dist/cli/main.js`를 `codexus`와 `cx`의 executable target으로
사용합니다.

## 근거

Node는 `node_modules` 아래 `.ts` 파일에 대해 TypeScript type stripping을
거부합니다. 기존 package metadata는 public bin을 `src/cli/main.ts`로 가리켰기
때문에 npm으로 설치된 package는 Node 26에서도 실행되지 않았습니다. 따라서 bundled
JavaScript entrypoint는 최적화가 아니라 release 전제입니다.

## 구현

- `esbuild --bundle --platform=node --format=esm --target=node22`로 build합니다.
- Runtime dependency는 0개로 유지하고, `esbuild`는 development dependency로만 둡니다.
- `engines.node`는 `>=22`로 설정합니다.
- Public bin은 `codexus`와 `cx`만 publish합니다.
- 개발용 source 실행은 `node src/cli/main.ts`로 유지합니다.
- Runtime asset은 source-relative path 가정 대신 Codexus package root 탐색으로
  찾습니다.
- `fixtures/app-server/schema.fixture.json`은 schema/app-server dry-run command가
  runtime에 읽으므로 ship합니다.
- Source, tests, docs, replay fixture, migration fixture는 npm tarball에서 제외합니다.
- Global-install `postinstall` hook은 Codex-native skill adapter를 기본으로
  설치하고, local dependency install은 `CODEXUS_INSTALL_CODEX_SKILL=1`을 지정하지
  않으면 부작용 없이 유지합니다.
- `install.sh`는 기본적으로 `npm install -g codexus@next`에 위임합니다.

## Release Gate

Publish 전 `npm run package:smoke`는 필수입니다. 이 command는 다음을 실행합니다:

- `npm pack`
- packed tarball의 임시 global install
- `codexus --help`
- `cx --help`
- `codexus schema check --json`
- temporary `CODEX_HOME`에 postinstall Codex skill adapter 설치
- `codexus run --driver mock --json "package smoke"`

npm release는 guarded helper를 사용합니다:

```bash
npm run publish:next
```

이 helper는 `--tag next`로 publish한 뒤 `latest`를 같은 version으로 갱신하고
`latest >= next`를 검증합니다.
