import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const cli = resolve("src/cli/main.ts");

async function tempDir(): Promise<string> {
  return await mkdtemp(join(tmpdir(), "codexus-repo-knowledge-"));
}

function runCli(cwd: string, args: string[]) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env },
  });
}

async function writeFixtureDocs(cwd: string): Promise<void> {
  await mkdir(join(cwd, "docs", "ko", "design"), { recursive: true });
  await writeFile(join(cwd, "package.json"), `${JSON.stringify({ name: "fixture", version: "1.0.0" }, null, 2)}\n`);
  await writeFile(join(cwd, "docs", "README.md"), [
    "# Docs",
    "",
    "[Korean](ko/README.md)",
    "[Design](design/01-architecture.md#architecture)",
    "[External](https://example.com)",
    "",
  ].join("\n"));
  await writeFile(join(cwd, "docs", "ko", "README.md"), [
    "# 문서",
    "",
    "[English](../README.md)",
    "[설계](design/01-architecture.md#architecture)",
    "",
  ].join("\n"));
  await writeFile(join(cwd, "docs", "design", "01-architecture.md"), "# Architecture\n");
  await writeFile(join(cwd, "docs", "ko", "design", "01-architecture.md"), "# Architecture\n");
}

test("repo map reports mechanical indexes without enabling the gate", async () => {
  const cwd = await tempDir();
  try {
    await mkdir(join(cwd, "docs", "design"), { recursive: true });
    await writeFixtureDocs(cwd);

    const result = runCli(cwd, ["repo", "map", "--json"]);
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.command, "map");
    assert.equal(output.stability, "experimental");
    assert.equal(output.scanAccuracy, "best_effort");
    assert.equal(output.repoKnowledge.status, "pass");
    assert.equal(output.gate.status, "not_requested");
    assert.ok(output.repoKnowledge.indexLinkCount >= 4);
    assert.ok(output.derivableFacts.some((fact: { kind: string }) => fact.kind === "index_link_resolved"));
    assert.ok(output.heuristicClaims.some((claim: { kind: string }) => claim.kind === "semantic_freshness_not_evaluated"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("repo check --gate fails on broken index links", async () => {
  const cwd = await tempDir();
  try {
    await mkdir(join(cwd, "docs", "design"), { recursive: true });
    await writeFixtureDocs(cwd);
    await writeFile(join(cwd, "docs", "README.md"), "# Docs\n\n[Broken](missing.md)\n[Korean](ko/README.md)\n");

    const result = runCli(cwd, ["repo", "check", "--gate", "--json"]);
    assert.equal(result.status, 1);
    const output = JSON.parse(result.stdout);
    assert.equal(output.command, "check");
    assert.equal(output.repoKnowledge.status, "fail");
    assert.equal(output.gate.status, "failed");
    const gap = output.evidenceGaps.find((item: { kind: string }) => item.kind === "index_link_broken");
    assert.ok(gap.links.some((link: string) => link.includes("missing.md")));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("repo check --gate fails on missing Korean counterparts", async () => {
  const cwd = await tempDir();
  try {
    await mkdir(join(cwd, "docs", "design"), { recursive: true });
    await writeFixtureDocs(cwd);
    await writeFile(join(cwd, "docs", "design", "02-new.md"), "# New design\n");

    const result = runCli(cwd, ["repo", "check", "--gate", "--json"]);
    assert.equal(result.status, 1);
    const output = JSON.parse(result.stdout);
    assert.equal(output.gate.status, "failed");
    const gap = output.evidenceGaps.find((item: { kind: string }) => item.kind === "counterpart_missing");
    assert.ok(gap.files.includes("docs/ko/design/02-new.md"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Codexus package dogfoods repo knowledge gate", () => {
  const result = runCli(resolve("."), ["repo", "check", "--gate", "--json"]);
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.command, "check");
  assert.equal(output.repoKnowledge.status, "pass");
  assert.equal(output.gate.status, "passed");
  assert.equal(output.scanAccuracy, "best_effort");
  assert.deepEqual(output.evidenceGaps, []);
});
