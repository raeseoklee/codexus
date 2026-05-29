import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../src/config/loader.ts";
import { appendEvent } from "../src/ledger/events.ts";
import { runPaths } from "../src/ledger/paths.ts";
import { readState, terminal, writeState } from "../src/ledger/state.ts";
import type { RunState } from "../src/types.ts";

async function tempDir(): Promise<string> {
  return await mkdtemp(join(tmpdir(), "chx-test-"));
}

test("loadConfig applies CLI-style overrides", async () => {
  const cwd = await tempDir();
  try {
    const loaded = loadConfig({
      cwd,
      overrides: {
        driver: "mock",
        verification: { commands: ["node --version"] },
      },
    });
    assert.equal(loaded.config.driver, "mock");
    assert.deepEqual(loaded.config.verification.commands, ["node --version"]);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("loadConfig warns for unknown keys and normalizes invalid values", async () => {
  const cwd = await tempDir();
  try {
    await mkdir(join(cwd, ".codex-harness"), { recursive: true });
    await writeFile(join(cwd, ".codex-harness", "config.json"), JSON.stringify({
      driver: "not-real",
      codex: { sandbox: "unsafe", extra: true },
      verification: { timeoutMs: -1 },
      mystery: 1,
    }));
    const loaded = loadConfig({ cwd });
    assert.equal(loaded.config.driver, "codex-exec");
    assert.equal(loaded.config.codex.sandbox, "workspace-write");
    assert.equal(loaded.config.verification.timeoutMs, 120_000);
    assert.ok(loaded.warnings.some((warning) => warning.includes("unknown config key 'mystery'")));
    assert.ok(loaded.warnings.some((warning) => warning.includes("unknown config key 'codex.extra'")));
    assert.ok(loaded.warnings.some((warning) => warning.includes("invalid config driver")));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("runPaths creates project-local ledger paths", async () => {
  const cwd = await tempDir();
  try {
    const paths = runPaths(cwd, "run_test");
    assert.equal(paths.root, join(cwd, ".codex-harness"));
    assert.equal(paths.state, join(cwd, ".codex-harness", "runs", "run_test", "state.json"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("state write/read and terminal transition are durable", async () => {
  const cwd = await tempDir();
  try {
    const paths = runPaths(cwd, "run_state");
    const state: RunState = {
      schemaVersion: 1,
      runId: "run_state",
      status: "running",
      phase: "execute",
      outcome: null,
      createdAt: "2026-05-29T00:00:00.000Z",
      updatedAt: "2026-05-29T00:00:00.000Z",
      cwd,
      driver: "mock",
      promptHash: "sha256:test",
      repairIteration: 0,
      verification: { required: false, latestStatus: "skipped" },
      artifacts: [],
    };
    await writeState(paths.state, terminal(state, "complete"));
    const read = await readState(paths.state);
    assert.equal(read.status, "terminal");
    assert.equal(read.outcome, "complete");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("appendEvent writes JSONL records", async () => {
  const cwd = await tempDir();
  try {
    const paths = runPaths(cwd, "run_events");
    const event = await appendEvent(paths.events, {
      runId: "run_events",
      phase: "execute",
      type: "driver.test",
      source: "test",
      payload: { ok: true },
    });
    const raw = await readFile(paths.events, "utf8");
    assert.equal(JSON.parse(raw).eventId, event.eventId);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
