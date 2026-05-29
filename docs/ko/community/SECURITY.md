# Security Policy

[English](../../../SECURITY.md)

## Supported Versions

Codexus는 pre-1.0입니다. Release branch가 생기기 전까지 security fix는 `main`
branch를 대상으로 합니다.

## Vulnerability Reporting

Repository가 public이면 가능한 경우 GitHub private security advisory를 열어 주세요.
Advisory가 활성화되어 있지 않다면 GitHub profile을 통해 maintainer에게 연락하고,
public issue에 exploit detail을 올리지 마세요.

포함하면 좋은 정보:

- 영향을 받는 command 또는 module
- reproduction steps
- impact
- local file, Codex credential, shell execution, generated skill 관련 여부
- secret을 제거한 relevant log

## Security Boundaries

- Codexus는 local authenticated Codex CLI를 감쌉니다. Private ChatGPT/Codex
  backend API를 직접 호출하면 안 됩니다.
- Verification command는 user local shell에서 실행되므로 trusted project
  automation으로 취급해야 합니다.
- Live app-server, cron, gateway, model replay behavior는 policy와 approval
  contract가 충분히 구현될 때까지 gated 상태를 유지해야 합니다.
- Ledger, memory, skill artifact에는 task context가 포함될 수 있습니다.
  `.codex-harness/` artifact를 공개하기 전에 반드시 검토하세요.

## Secret Handling

Credential, Codex session material, environment file, private prompt가 포함된 raw
ledger를 commit하지 마세요. Repository `.gitignore`는 local Codexus/OMX state
directory를 기본적으로 제외합니다.
