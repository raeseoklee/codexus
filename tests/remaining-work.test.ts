import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const cli = resolve("src/cli/main.ts");

async function tempDir(): Promise<string> {
  return await mkdtemp(join(tmpdir(), "codexus-remaining-"));
}

function runCli(cwd: string, args: string[], env: Record<string, string> = {}) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

test("init command bootstraps project harness without mutating omx state", async () => {
  const cwd = await tempDir();
  try {
    await mkdir(join(cwd, ".omx"), { recursive: true });
    await writeFile(join(cwd, ".omx", "state"), "keep\n");
    const result = runCli(cwd, ["init", "--with-docs", "--json"]);
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.ok(existsSync(output.configPath));
    assert.equal(await readFile(join(cwd, ".omx", "state"), "utf8"), "keep\n");
    assert.ok(existsSync(join(cwd, ".codex-harness", "README.md")));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("observability commands list runs, tail events, and read reports", async () => {
  const cwd = await tempDir();
  try {
    const run = runCli(cwd, ["run", "--driver", "mock", "--json", "observability run"]);
    assert.equal(run.status, 0, run.stderr);
    const runOutput = JSON.parse(run.stdout);

    const runs = runCli(cwd, ["runs", "list", "--json"]);
    assert.equal(runs.status, 0, runs.stderr);
    assert.equal(JSON.parse(runs.stdout).runs[0].runId, runOutput.runId);

    const events = runCli(cwd, ["events", "tail", runOutput.runId, "--lines", "20", "--json"]);
    assert.equal(events.status, 0, events.stderr);
    const eventTypes = JSON.parse(events.stdout).events.map((event: { type: string }) => event.type);
    assert.ok(eventTypes.includes("permission.checked"));
    assert.ok(eventTypes.includes("run.terminal"));

    const report = runCli(cwd, ["report", runOutput.runId, "--json"]);
    assert.equal(report.status, 0, report.stderr);
    assert.match(JSON.parse(report.stdout).preview, /Outcome: complete/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("remaining P0 json errors cover unexpected args, corrupt state, and disabled driver", async () => {
  const cwd = await tempDir();
  try {
    const unexpected = runCli(cwd, ["status", "run_x", "extra", "--json"]);
    assert.equal(unexpected.status, 1);
    assert.equal(JSON.parse(unexpected.stdout).code, "unexpected_argument");

    const runDir = join(cwd, ".codex-harness", "runs", "run_bad");
    await mkdir(runDir, { recursive: true });
    await writeFile(join(runDir, "state.json"), "{ bad json");
    const corrupt = runCli(cwd, ["status", "run_bad", "--json"]);
    assert.equal(corrupt.status, 1);
    assert.equal(JSON.parse(corrupt.stdout).code, "state_corrupt");

    const disabled = runCli(cwd, ["run", "--driver", "codex-app-server", "--json", "disabled app server"]);
    assert.equal(disabled.status, 1);
    assert.equal(JSON.parse(disabled.stdout).code, "unsupported_feature");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("driver failures are classified and written to the run ledger", async () => {
  const cwd = await tempDir();
  try {
    const run = runCli(cwd, ["run", "--driver", "mock", "--json", "MOCK_FAIL"]);
    assert.equal(run.status, 1);
    const runOutput = JSON.parse(run.stdout);
    const state = JSON.parse(await readFile(runOutput.statePath, "utf8"));
    assert.equal(state.error.code, "driver_task_failed");
    const events = await readFile(join(cwd, ".codex-harness", "runs", runOutput.runId, "events.jsonl"), "utf8");
    assert.match(events, /driver\.failure_classified/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("skill index, export, adapter retrieval, replay stub, and memory lifecycle work together", async () => {
  const cwd = await tempDir();
  const codexHome = await tempDir();
  try {
    const run = runCli(cwd, ["run", "--driver", "mock", "--json", "parser regression behavior"]);
    assert.equal(run.status, 0, run.stderr);
    const runOutput = JSON.parse(run.stdout);
    const propose = runCli(cwd, ["skill", "propose", runOutput.runId, "--json"]);
    assert.equal(propose.status, 0, propose.stderr);
    const skillId = JSON.parse(propose.stdout).proposal.id;
    const promote = runCli(cwd, ["skill", "promote", skillId, "--json"]);
    assert.equal(promote.status, 0, promote.stderr);

    const memory = runCli(cwd, [
      "memory",
      "add",
      "--kind",
      "workflow_lesson",
      "--tags",
      "parser",
      "--json",
      "Parser regression work should retrieve active parser skills.",
    ]);
    assert.equal(memory.status, 0, memory.stderr);
    const review = runCli(cwd, ["memory", "review", "--json"]);
    assert.equal(JSON.parse(review.stdout).index.total, 1);
    const list = runCli(cwd, ["memory", "list", "--json"]);
    assert.equal(JSON.parse(list.stdout).entries.length, 1);
    const pruneDryRun = runCli(cwd, ["memory", "prune", "--before", "2999-01-01T00:00:00.000Z", "--dry-run", "--json"]);
    assert.equal(JSON.parse(pruneDryRun.stdout).prune.removed, 1);

    const retrieve = runCli(cwd, ["adapt", "omx", "retrieve", "--task", "parser regression", "--json"]);
    assert.equal(retrieve.status, 0, retrieve.stderr);
    const retrieveOutput = JSON.parse(retrieve.stdout);
    assert.equal(retrieveOutput.skills[0].id, skillId);
    assert.equal(retrieveOutput.memories[0].id, JSON.parse(memory.stdout).entry.id);

    const replay = runCli(cwd, ["replay", "skill", skillId, "--with-model-replay", "--json"]);
    assert.equal(replay.status, 0, replay.stderr);
    assert.equal(JSON.parse(replay.stdout).modelReplay.status, "not_run");

    const exported = runCli(cwd, ["skill", "export", skillId, "--target", "codex", "--force", "--json"], { CODEX_HOME: codexHome });
    assert.equal(exported.status, 0, exported.stderr);
    const exportPath = JSON.parse(exported.stdout).export.path;
    assert.ok(existsSync(join(exportPath, "SKILL.md")));
    const index = runCli(cwd, ["skill", "index", "--json"]);
    assert.equal(JSON.parse(index.stdout).activeIndex[0].exportState.codex.path, exportPath);
  } finally {
    await rm(cwd, { recursive: true, force: true });
    await rm(codexHome, { recursive: true, force: true });
  }
});

test("packaging metadata, adapter install, typecheck, and guarded features are exposed", async () => {
  const cwd = resolve(".");
  const codexHome = await tempDir();
  try {
    const pkg = JSON.parse(await readFile(resolve("package.json"), "utf8"));
    assert.equal(pkg.bin.cx, "./src/cli/main.ts");
    assert.equal(pkg.bin.codexus, "./src/cli/main.ts");
    assert.equal(pkg.bin.chx, "./src/cli/main.ts");

    const install = spawnSync(process.execPath, [resolve("scripts/install-codex-skill.mjs"), "--json"], {
      cwd,
      encoding: "utf8",
      env: { ...process.env, CODEX_HOME: codexHome },
    });
    assert.equal(install.status, 0, install.stderr);
    assert.ok(existsSync(join(codexHome, "skills", "codexus", "SKILL.md")));

    const typecheck = spawnSync("npm", ["run", "typecheck"], { cwd, encoding: "utf8" });
    assert.equal(typecheck.status, 0, typecheck.stderr);

    const cron = runCli(cwd, ["cron", "status", "--json"]);
    assert.equal(JSON.parse(cron.stdout).enabled, false);
    const gateway = runCli(cwd, ["gateway", "status", "--json"]);
    assert.equal(JSON.parse(gateway.stdout).enabled, false);
  } finally {
    await rm(codexHome, { recursive: true, force: true });
  }
});
