import test from "node:test";
import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { hostname, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { defaultConfig } from "../src/config/schema.ts";
import { appendMemoryEntry } from "../src/evolution/memory.ts";
import { runPaths } from "../src/ledger/paths.ts";
import { writeState } from "../src/ledger/state.ts";
import type { RunState } from "../src/types.ts";
import { executeRun } from "../src/workflow/kernel.ts";

const cli = resolve("src/cli/main.ts");

async function tempDir(): Promise<string> {
  return await mkdtemp(join(tmpdir(), "chx-cli-"));
}

function runCli(cwd: string, args: string[]) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd,
    encoding: "utf8",
  });
}

async function waitForRunningRunId(cwd: string): Promise<string> {
  const runsRoot = join(cwd, ".codexus", "runs");
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const entries = await readdir(runsRoot, { withFileTypes: true });
      for (const entry of entries.filter((item) => item.isDirectory())) {
        const state = JSON.parse(await readFile(join(runsRoot, entry.name, "state.json"), "utf8"));
        if (state.status === "running") return entry.name;
      }
    } catch {
      // The run directory can appear while the child is still bootstrapping.
    }
    await sleep(50);
  }
  throw new Error("running_run_not_found");
}

async function waitForChild(child: ChildProcessWithoutNullStreams): Promise<{ code: number | null; signal: string | null }> {
  return await Promise.race([
    new Promise<{ code: number | null; signal: string | null }>((resolve) => {
      child.once("exit", (code, signal) => resolve({ code, signal }));
    }),
    sleep(5_000).then(() => {
      child.kill("SIGKILL");
      throw new Error("child_timeout");
    }),
  ]);
}

test("run command repairs failed verification once and completes", async () => {
  const cwd = await tempDir();
  try {
    const verify = "node -e \"const fs=require('fs'); if(!fs.existsSync('marker')){console.error('CODEXUS_REPAIR_MARKER'); fs.writeFileSync('marker','1'); process.exit(1)}\"";
    const result = runCli(cwd, [
      "run",
      "--driver",
      "mock",
      "--max-repairs",
      "1",
      "--verify",
      verify,
      "--json",
      "repair workflow",
    ]);
    assert.equal(result.status, 0, result.stderr);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.outcome, "complete");
    const state = JSON.parse(await readFile(parsed.statePath, "utf8"));
    assert.equal(state.repairIteration, 1);
    assert.equal(state.verification.latestStatus, "passed");
    const repairContextPath = state.artifacts.find((path: string) => path.endsWith("repair-context-001.md"));
    assert.ok(repairContextPath);
    assert.match(await readFile(repairContextPath, "utf8"), /CODEXUS_REPAIR_MARKER/);
    const events = await readFile(join(cwd, ".codexus", "runs", parsed.runId, "events.jsonl"), "utf8");
    assert.match(events, /repair.started/);
    const eventRecords = events.trim().split(/\n/).map((line) => JSON.parse(line));
    const driverMessages = eventRecords.filter((event) => event.type === "driver.mock.message");
    assert.equal(driverMessages[0].phase, "execute");
    assert.ok(driverMessages.some((event) => event.phase === "repair"));

    const status = runCli(cwd, ["status", parsed.runId, "--json"]);
    assert.equal(status.status, 0, status.stderr);
    const statusOutput = JSON.parse(status.stdout);
    assert.equal(statusOutput.state.outcome, "complete");
    assert.equal(statusOutput.verification.status, "passed");
    assert.ok(statusOutput.experience.decisions.length > 0);
    assert.ok(statusOutput.eventTail.length > 0);

    const verifyRun = runCli(cwd, ["verify", parsed.runId, "--json"]);
    assert.equal(verifyRun.status, 0, verifyRun.stderr);
    assert.equal(JSON.parse(verifyRun.stdout).status, "passed");

    const memory = runCli(cwd, ["memory", "search", "completion", "--json"]);
    assert.equal(memory.status, 0, memory.stderr);
    assert.ok(JSON.parse(memory.stdout).matches.length > 0);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("repair context artifacts redact secrets from verification output", async () => {
  const cwd = await tempDir();
  try {
    const password = "hunter2";
    const awsSecretKey = ["wJalrXUtnFEMI", "K7MDENG", "bPxRfiCYEXAMPLEKEY"].join("/");
    const jwt = [
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9",
      "aaaaaaaaaaaaaaaa",
      "bbbbbbbbbbbbbbbb",
    ].join(".");
    const message = `password=${password} AWS_SECRET_ACCESS_KEY=${awsSecretKey} jwt=${jwt}`;
    const script = [
      "const fs=require('fs');",
      "if(!fs.existsSync('marker')){",
      `console.error(${JSON.stringify(message)});`,
      "fs.writeFileSync('marker','1');",
      "process.exit(1)",
      "}",
    ].join(" ");
    const verify = `node -e ${JSON.stringify(script)}`;
    const result = runCli(cwd, [
      "run",
      "--driver",
      "mock",
      "--max-repairs",
      "1",
      "--verify",
      verify,
      "--json",
      "repair secret context",
    ]);
    assert.equal(result.status, 0, result.stderr);
    const parsed = JSON.parse(result.stdout);
    const state = JSON.parse(await readFile(parsed.statePath, "utf8"));
    const repairContextPath = state.artifacts.find((path: string) => path.endsWith("repair-context-001.md"));
    assert.ok(repairContextPath);
    const context = await readFile(repairContextPath, "utf8");
    assert.equal(context.includes(password), false);
    assert.equal(context.includes(awsSecretKey), false);
    assert.equal(context.includes(jwt), false);
    assert.match(context, /\[REDACTED:possible-secret\]/);
    assert.match(context, /\[REDACTED:possible-jwt\]/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("skill propose command writes proposal from run experience", async () => {
  const cwd = await tempDir();
  try {
    const run = runCli(cwd, ["run", "--driver", "mock", "--json", "document parser behavior"]);
    assert.equal(run.status, 0, run.stderr);
    const runOutput = JSON.parse(run.stdout);
    const propose = runCli(cwd, ["skill", "propose", runOutput.runId, "--json"]);
    assert.equal(propose.status, 0, propose.stderr);
    const proposalOutput = JSON.parse(propose.stdout);
    assert.equal(proposalOutput.proposal.status, "proposed");
    assert.equal(proposalOutput.proposal.displayName, "codexus:document-parser-behavior");
    assert.deepEqual(proposalOutput.proposal.sourceRunIds, [runOutput.runId]);

    const review = runCli(cwd, ["skill", "review", proposalOutput.proposal.id, "--json"]);
    assert.equal(review.status, 0, review.stderr);
    const reviewOutput = JSON.parse(review.stdout);
    assert.equal(reviewOutput.review.replay.status, "passed");
    assert.equal(reviewOutput.review.promotable, true);

    const replay = runCli(cwd, ["replay", "skill", proposalOutput.proposal.id, "--json"]);
    assert.equal(replay.status, 0, replay.stderr);
    assert.equal(JSON.parse(replay.stdout).replay.status, "passed");

    const promote = runCli(cwd, ["skill", "promote", proposalOutput.proposal.id, "--json"]);
    assert.equal(promote.status, 0, promote.stderr);
    const promoteOutput = JSON.parse(promote.stdout);
    assert.equal(promoteOutput.promotion.skill.status, "active");

    const list = runCli(cwd, ["skill", "list", "--json"]);
    assert.equal(list.status, 0, list.stderr);
    const listOutput = JSON.parse(list.stdout);
    assert.equal(listOutput.proposals[0].status, "active");
    assert.equal(listOutput.proposals[0].displayName, "codexus:document-parser-behavior");
    assert.equal(listOutput.active[0].status, "active");

    const textList = runCli(cwd, ["skill", "list"]);
    assert.equal(textList.status, 0, textList.stderr);
    assert.match(textList.stdout, /codexus:document-parser-behavior/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("json commands return typed error envelopes for cli failures", async () => {
  const cwd = await tempDir();
  try {
    const unknown = runCli(cwd, ["nonesuch", "--json"]);
    assert.equal(unknown.status, 1);
    assert.equal(unknown.stderr, "");
    const unknownOutput = JSON.parse(unknown.stdout);
    assert.equal(unknownOutput.type, "error");
    assert.equal(unknownOutput.code, "unknown_command");
    assert.equal(unknownOutput.command, "nonesuch");
    assert.equal(unknownOutput.details.target, "nonesuch");
    assert.match(unknownOutput.hint, /cx --help/);

    const invalidRepairLimit = runCli(cwd, [
      "run",
      "--driver",
      "mock",
      "--max-repairs",
      "nope",
      "--json",
      "repair limit",
    ]);
    assert.equal(invalidRepairLimit.status, 1);
    assert.equal(invalidRepairLimit.stderr, "");
    const repairOutput = JSON.parse(invalidRepairLimit.stdout);
    assert.equal(repairOutput.type, "error");
    assert.equal(repairOutput.code, "invalid_max_repairs");
    assert.match(repairOutput.hint, /non-negative integer/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("plan command writes harness and omx-compatible artifacts", async () => {
  const cwd = await tempDir();
  try {
    const plan = runCli(cwd, ["plan", "--omx", "--json", "implement workflow kernel"]);
    assert.equal(plan.status, 0, plan.stderr);
    const output = JSON.parse(plan.stdout);
    assert.match(output.path, /\.codexus\/plans\/plan_/);
    assert.match(output.omxPath, /\.omx\/plans\/plan_/);
    const text = await readFile(output.omxPath, "utf8");
    assert.match(text, /implement workflow kernel/);
    const metadata = await readFile(join(cwd, ".codexus", "omx", "last-plan.json"), "utf8");
    assert.ok(metadata.includes("without mutating .omx/state"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("resume command creates a follow-up supervised run from an existing ledger", async () => {
  const cwd = await tempDir();
  try {
    const run = runCli(cwd, ["run", "--driver", "mock", "--json", "initial supervised task"]);
    assert.equal(run.status, 0, run.stderr);
    const runOutput = JSON.parse(run.stdout);
    const resume = runCli(cwd, ["resume", runOutput.runId, "--json", "finish remaining checks"]);
    assert.equal(resume.status, 0, resume.stderr);
    const resumeOutput = JSON.parse(resume.stdout);
    assert.equal(resumeOutput.resumedFrom, runOutput.runId);
    assert.equal(resumeOutput.outcome, "complete");
    assert.notEqual(resumeOutput.runId, runOutput.runId);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("run command blocks dangerous verification commands before driver execution", async () => {
  const cwd = await tempDir();
  try {
    const result = runCli(cwd, ["run", "--driver", "mock", "--verify", "rm -rf /", "--json", "dangerous verification"]);
    assert.equal(result.status, 1);
    const output = JSON.parse(result.stdout);
    assert.equal(output.outcome, "blocked");
    const state = JSON.parse(await readFile(output.statePath, "utf8"));
    assert.equal(state.error.code, "policy_blocked");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("run command records verification failures as verification errors", async () => {
  const cwd = await tempDir();
  try {
    const result = runCli(cwd, [
      "run",
      "--driver",
      "mock",
      "--max-repairs",
      "0",
      "--verify",
      "node -e \"process.exit(2)\"",
      "--json",
      "verification failure",
    ]);
    assert.equal(result.status, 1);
    const output = JSON.parse(result.stdout);
    assert.equal(output.outcome, "failed");
    const state = JSON.parse(await readFile(output.statePath, "utf8"));
    assert.equal(state.verification.latestStatus, "failed");
    assert.equal(state.error.code, "verification_failed");
    assert.equal(state.error.source, "verification");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("run command preserves blocked and cancelled driver outcomes", async () => {
  const cwd = await tempDir();
  try {
    const blocked = runCli(cwd, ["run", "--driver", "mock", "--json", "MOCK_BLOCK"]);
    assert.equal(blocked.status, 1);
    assert.equal(JSON.parse(blocked.stdout).outcome, "blocked");

    const cancelled = runCli(cwd, ["run", "--driver", "mock", "--json", "MOCK_CANCEL"]);
    assert.equal(cancelled.status, 1);
    assert.equal(JSON.parse(cancelled.stdout).outcome, "cancelled");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("driver failure does not leave verification pending when checks were configured", async () => {
  const cwd = await tempDir();
  try {
    const failed = runCli(cwd, [
      "run",
      "--driver",
      "mock",
      "--verify",
      "node -e \"process.exit(0)\"",
      "--json",
      "MOCK_FAIL",
    ]);
    assert.equal(failed.status, 1);
    const output = JSON.parse(failed.stdout);
    assert.equal(output.outcome, "failed");
    const state = JSON.parse(await readFile(output.statePath, "utf8"));
    assert.equal(state.verification.latestStatus, "skipped");
    assert.equal(state.verification.reason, "not_reached_driver_failed");

    const validation = runCli(cwd, ["schema", "validate-run", output.runId, "--json"]);
    assert.equal(validation.status, 0, validation.stderr);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("aborted run reaches a cancelled terminal ledger", async () => {
  const cwd = await tempDir();
  try {
    const controller = new AbortController();
    setTimeout(() => controller.abort(new Error("test abort")), 25);
    const result = await executeRun({
      cwd,
      prompt: "MOCK_SLEEP",
      config: {
        ...defaultConfig,
        driver: "mock",
        evolution: {
          ...defaultConfig.evolution,
          enabled: false,
        },
      },
      signal: controller.signal,
    });
    assert.equal(result.outcome, "cancelled");
    const state = JSON.parse(await readFile(result.statePath, "utf8"));
    assert.equal(state.status, "terminal");
    assert.equal(state.outcome, "cancelled");
    const events = await readFile(join(cwd, ".codexus", "runs", result.runId, "events.jsonl"), "utf8");
    assert.match(events, /run.terminal/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("cancel command requests live owner cancellation through the run ledger", async () => {
  const cwd = await tempDir();
  const child = spawn(process.execPath, [cli, "run", "--driver", "mock", "--json", "MOCK_SLEEP"], {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });
  try {
    const runId = await waitForRunningRunId(cwd);
    const cancel = runCli(cwd, ["cancel", runId, "--reason", "test live cancel", "--json"]);
    assert.equal(cancel.status, 0, cancel.stderr);
    const cancelOutput = JSON.parse(cancel.stdout);
    assert.equal(cancelOutput.status, "requested");
    assert.equal(cancelOutput.owner.live, true);

    const exit = await waitForChild(child);
    assert.equal(exit.code, 1, stderr);
    const output = JSON.parse(stdout);
    assert.equal(output.runId, runId);
    assert.equal(output.outcome, "cancelled");
    const state = JSON.parse(await readFile(output.statePath, "utf8"));
    assert.equal(state.status, "terminal");
    assert.equal(state.outcome, "cancelled");
    assert.equal(state.error.code, "external_cancel_requested");
    const events = await readFile(join(cwd, ".codexus", "runs", runId, "events.jsonl"), "utf8");
    assert.match(events, /run.cancel_requested/);
    assert.match(events, /run.terminal/);
  } finally {
    child.kill("SIGKILL");
    await rm(cwd, { recursive: true, force: true });
  }
});

test("cancel command marks dead-owner running ledgers as orphan-cancelled", async () => {
  const cwd = await tempDir();
  try {
    const runId = "run_orphan_cancel";
    const paths = runPaths(cwd, runId);
    const state: RunState = {
      schemaVersion: 1,
      runId,
      status: "running",
      phase: "execute",
      outcome: null,
      createdAt: "2026-05-29T00:00:00.000Z",
      updatedAt: "2026-05-29T00:00:00.000Z",
      cwd,
      driver: "mock",
      promptHash: "sha256:test",
      repairIteration: 0,
      driverRepairIteration: 0,
      verification: { required: true, latestStatus: "pending" },
      artifacts: [],
    };
    await writeState(paths.state, state);
    await writeFile(paths.owner, `${JSON.stringify({
      schemaVersion: 1,
      runId,
      pid: 999_999_999,
      hostname: hostname(),
      createdAt: "2026-05-29T00:00:00.000Z",
      heartbeatAt: "2026-05-29T00:00:00.000Z",
      ttlMs: 1,
    }, null, 2)}\n`);

    const cancel = runCli(cwd, ["cancel", runId, "--reason", "dead owner", "--json"]);
    assert.equal(cancel.status, 0, cancel.stderr);
    const output = JSON.parse(cancel.stdout);
    assert.equal(output.status, "cancelled");
    assert.equal(output.owner.live, false);
    const cancelled = JSON.parse(await readFile(paths.state, "utf8"));
    assert.equal(cancelled.status, "terminal");
    assert.equal(cancelled.outcome, "cancelled");
    assert.equal(cancelled.verification.latestStatus, "skipped");
    assert.equal(cancelled.verification.reason, "not_reached_cancelled");
    assert.equal(cancelled.error.code, "external_cancel_orphaned");
    const events = await readFile(paths.events, "utf8");
    assert.match(events, /run.cancel_orphaned/);
    assert.match(events, /run.terminal/);
    const report = runCli(cwd, ["report", runId, "--json"]);
    assert.equal(report.status, 0, report.stderr);
    assert.match(JSON.parse(report.stdout).preview, /Outcome: cancelled/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("codex exec usage is stored in terminal state", async () => {
  const cwd = await tempDir();
  try {
    const fakeCodex = join(cwd, "fake-codex-usage.mjs");
    await writeFile(fakeCodex, `#!/usr/bin/env node
if (process.argv[2] === "exec" && process.argv.includes("--help")) {
  console.log("Options: --json --sandbox --model --output-last-message");
  process.exit(0);
}
if (process.argv[2] === "exec") {
  console.log(JSON.stringify({ type: "turn.completed", usage: { input_tokens: 5, output_tokens: 8, total_tokens: 13 } }));
  process.exit(0);
}
`);
    await chmod(fakeCodex, 0o755);
    const result = await executeRun({
      cwd,
      prompt: "usage",
      config: {
        ...defaultConfig,
        driver: "codex-exec",
        codex: {
          ...defaultConfig.codex,
          command: fakeCodex,
          runTimeoutMs: 1_000,
        },
        evolution: {
          ...defaultConfig.evolution,
          enabled: false,
        },
      },
    });
    assert.equal(result.outcome, "complete");
    const state = JSON.parse(await readFile(result.statePath, "utf8"));
    assert.deepEqual(state.usage, { available: true, input_tokens: 5, output_tokens: 8, total_tokens: 13 });
    const status = runCli(cwd, ["status", result.runId, "--json"]);
    assert.equal(status.status, 0, status.stderr);
    assert.deepEqual(JSON.parse(status.stdout).state.usage, state.usage);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("memory search command returns bounded JSON matches", async () => {
  const cwd = await tempDir();
  try {
    await appendMemoryEntry(cwd, {
      id: "mem_cli",
      sourceRunId: "run_cli",
      kind: "workflow_lesson",
      text: "Parser verification requires malformed token cases.",
      tags: ["parser"],
      confidence: "medium",
    });
    const search = runCli(cwd, ["memory", "search", "parser", "--json"]);
    assert.equal(search.status, 0, search.stderr);
    const output = JSON.parse(search.stdout);
    assert.equal(output.matches.length, 1);
    assert.equal(output.matches[0].id, "mem_cli");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
