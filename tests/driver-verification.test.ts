import test from "node:test";
import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { aggregateVerificationStatus, runVerification } from "../src/verification/runner.ts";
import { buildCodexExecArgs, CodexExecDriver, extractCodexEventText, parseCodexExecCapabilities } from "../src/drivers/codex-exec.ts";
import { defaultConfig } from "../src/config/schema.ts";

async function tempDir(): Promise<string> {
  return await mkdtemp(join(tmpdir(), "chx-verify-"));
}

test("aggregateVerificationStatus handles skipped and failures", () => {
  assert.equal(aggregateVerificationStatus([]), "skipped");
  assert.equal(aggregateVerificationStatus([
    {
      id: "verify_001",
      command: "false",
      cwd: "/tmp",
      startedAt: "",
      completedAt: "",
      exitCode: 1,
      status: "failed",
      stdoutPath: "",
      stderrPath: "",
      summary: "",
    },
  ]), "failed");
});

test("buildCodexExecArgs avoids unsupported exec approval flag", () => {
  const args = buildCodexExecArgs({
    runId: "run_test",
    cwd: "/tmp",
    prompt: "hello",
    config: defaultConfig,
  });
  assert.equal(args.includes("--ask-for-approval"), false);
  assert.equal(args.includes("--sandbox"), true);
});

test("buildCodexExecArgs includes approval only when capability supports it", () => {
  const args = buildCodexExecArgs({
    runId: "run_test",
    cwd: "/tmp",
    prompt: "hello",
    config: defaultConfig,
  }, {
    supportsJsonl: true,
    supportsSandboxFlag: true,
    supportsApprovalFlag: true,
    supportsModelFlag: true,
    supportsOutputLastMessage: true,
    stderrMayContainWarningsOnSuccess: true,
    finalMessageShapes: [],
  });
  assert.equal(args.includes("--ask-for-approval"), true);
});

test("parseCodexExecCapabilities reads help text", () => {
  const capabilities = parseCodexExecCapabilities("Options:\n --json\n --sandbox <SANDBOX_MODE>\n --model <MODEL>\n --output-last-message <FILE>\n");
  assert.equal(capabilities.supportsJsonl, true);
  assert.equal(capabilities.supportsApprovalFlag, false);
  assert.equal(capabilities.supportsOutputLastMessage, true);
});

test("codex exec probe reports missing command without throwing", async () => {
  const probe = await new CodexExecDriver().probe("definitely-not-a-command-codexus-test");
  assert.equal(probe.available, false);
  assert.match(probe.summary, /ENOENT|unavailable/);
});

test("codex exec driver timeout cancels the child and preserves raw output", async () => {
  const cwd = await tempDir();
  try {
    const fakeCodex = join(cwd, "fake-codex.mjs");
    await writeFile(fakeCodex, `#!/usr/bin/env node
if (process.argv[2] === "exec" && process.argv.includes("--help")) {
  console.log("Options: --json --sandbox --model --output-last-message");
  process.exit(0);
}
if (process.argv[2] === "exec") {
  console.log(JSON.stringify({ type: "item.completed", item: { text: "started" } }));
  setInterval(() => {}, 1000);
}
`);
    await chmod(fakeCodex, 0o755);
    const events: unknown[] = [];
    const rawStdoutPath = join(cwd, "stdout.jsonl");
    const rawStderrPath = join(cwd, "stderr.log");
    const result = await new CodexExecDriver().run({
      runId: "run_timeout",
      cwd,
      prompt: "hang",
      config: {
        ...defaultConfig,
        codex: {
          ...defaultConfig.codex,
          command: fakeCodex,
          runTimeoutMs: 1_000,
        },
      },
      context: { rawStdoutPath, rawStderrPath },
    }, async (event) => {
      events.push(event);
    });
    assert.equal(result.status, "cancelled");
    assert.match(result.error ?? "", /timed out/);
    assert.ok(events.some((event) => (event as { type?: string }).type === "driver.timeout"));
    assert.match(await readFile(rawStdoutPath, "utf8"), /started/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("codex exec driver captures usage and ignored config options", async () => {
  const cwd = await tempDir();
  try {
    const fakeCodex = join(cwd, "fake-codex-usage.mjs");
    await writeFile(fakeCodex, `#!/usr/bin/env node
if (process.argv[2] === "exec" && process.argv.includes("--help")) {
  console.log("Options: --json --sandbox --model --output-last-message");
  process.exit(0);
}
if (process.argv[2] === "exec") {
  console.log(JSON.stringify({ type: "turn.completed", usage: { input_tokens: 3, output_tokens: 4, total_tokens: 7 } }));
  process.exit(0);
}
`);
    await chmod(fakeCodex, 0o755);
    const events: Array<{ type?: string }> = [];
    const result = await new CodexExecDriver().run({
      runId: "run_usage",
      cwd,
      prompt: "usage",
      config: {
        ...defaultConfig,
        codex: {
          ...defaultConfig.codex,
          command: fakeCodex,
          runTimeoutMs: 1_000,
        },
      },
    }, async (event) => {
      events.push(event);
    });
    assert.equal(result.status, "succeeded");
    assert.deepEqual(result.usage, { available: true, input_tokens: 3, output_tokens: 4, total_tokens: 7 });
    assert.ok(events.some((event) => event.type === "config.option_ignored"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("extractCodexEventText reads item.completed agent text", () => {
  const text = extractCodexEventText({
    type: "item.completed",
    item: { id: "item_0", type: "agent_message", text: "CHX-CODEX-OK" },
  });
  assert.equal(text, "CHX-CODEX-OK");
});

test("runVerification records passing command output", async () => {
  const cwd = await tempDir();
  try {
    const result = await runVerification({
      cwd,
      commands: ["node -e \"console.log('ok')\""],
      artifactsDir: join(cwd, "artifacts"),
    });
    assert.equal(result.status, "passed");
    assert.equal(result.commands[0].status, "passed");
    assert.match(await readFile(result.commands[0].stdoutPath, "utf8"), /ok/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("runVerification stops at first failing command", async () => {
  const cwd = await tempDir();
  try {
    const result = await runVerification({
      cwd,
      commands: ["node -e \"process.exit(2)\"", "node -e \"console.log('never')\""],
      artifactsDir: join(cwd, "artifacts"),
    });
    assert.equal(result.status, "failed");
    assert.equal(result.commands.length, 1);
    assert.equal(result.commands[0].exitCode, 2);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
