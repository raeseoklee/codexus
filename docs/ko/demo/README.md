# Codexus Demo Tape

[English](../../demo/README.md)

이 디렉터리는 README demo를 재생성하기 위한 VHS source를 담습니다.

이 demo는 redacted fixture입니다. Live Codex model을 실행하지 않고, 실제 local path,
auth state, transcript, package-manager log를 출력하지 않습니다. 목적은 사용자에게
보이는 핵심 loop를 짧게 보여주는 것입니다:

1. Codexus를 global install합니다;
2. verification command를 붙여 supervised task를 실행합니다;
3. verification command를 실행합니다;
4. verification command가 통과한 뒤에만 `complete`를 보고합니다;
5. durable run ledger를 남깁니다.

README media는 첫인상 명확성을 위해 깨끗한 pass path만 보여줍니다. Repair 동작은
빨간 테스트 frame으로 demo에 넣지 않고, README 설명과 release evidence에서
검증합니다.

## 재생성

[VHS](https://github.com/charmbracelet/vhs)를 설치한 뒤 실행합니다:

```bash
vhs docs/demo/codexus-supervised-run.tape
```

생성되는 asset은 다음과 같습니다:

```text
docs/assets/codexus-supervised-run.gif
```
