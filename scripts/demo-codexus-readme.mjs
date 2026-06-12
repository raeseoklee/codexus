#!/usr/bin/env node

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const lines = [
  "$ npm install -g codexus",
  "added 1 package in 2s",
  "",
  "$ codexus run --verify \"npm test\" \"fix the failing parser tests\"",
  "codexus run run_demo_parser_fix",
  "driver: codex-exec (local authenticated Codex CLI)",
  "verify[1]: npm test",
  "",
  "[fail] npm test",
  "  parser.test.ts > preserves escaped separators",
  "  Expected: 3 tokens",
  "  Received: 2 tokens",
  "",
  "repair[1]: bounded failure output attached as repair context",
  "driver: Codex returned a patch",
  "verify[2]: npm test",
  "",
  "[pass] npm test",
  "status: complete",
  "ledger: .codexus/runs/run_demo_parser_fix",
  "verification: passed",
  "",
  "$ codexus status run_demo_parser_fix --json",
  "{",
  "  \"status\": \"complete\",",
  "  \"verification\": { \"status\": \"passed\", \"command\": \"npm test\" },",
  "  \"repairAttempts\": 1,",
  "  \"completionAuthority\": \"verification\"",
  "}",
  "",
  "# Redacted fixture demo. Full release verification is linked from README.",
];

for (const line of lines) {
  console.log(line);
  await sleep(line === "" ? 180 : 320);
}
