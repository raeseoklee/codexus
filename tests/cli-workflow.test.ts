import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { appendMemoryEntry } from "../src/evolution/memory.ts";

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

test("run command repairs failed verification once and completes", async () => {
  const cwd = await tempDir();
  try {
    const verify = "node -e \"const fs=require('fs'); if(!fs.existsSync('marker')){fs.writeFileSync('marker','1'); process.exit(1)}\"";
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
    const events = await readFile(join(cwd, ".codex-harness", "runs", parsed.runId, "events.jsonl"), "utf8");
    assert.match(events, /repair.started/);

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
    assert.equal(listOutput.active[0].status, "active");
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
    assert.match(output.path, /\.codex-harness\/plans\/plan_/);
    assert.match(output.omxPath, /\.omx\/plans\/plan_/);
    const text = await readFile(output.omxPath, "utf8");
    assert.match(text, /implement workflow kernel/);
    const metadata = await readFile(join(cwd, ".codex-harness", "omx", "last-plan.json"), "utf8");
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
