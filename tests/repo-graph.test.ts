import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { computeRepoGraphId, type RepoGraphArtifact } from "../src/repo-graph/graph.ts";

const cli = resolve("src/cli/main.ts");

async function tempDir(): Promise<string> {
  return await mkdtemp(join(tmpdir(), "codexus-repo-graph-"));
}

function runCli(cwd: string, args: string[]) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env },
  });
}

function git(cwd: string, args: string[]): void {
  const result = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8" });
  assert.equal(result.status, 0, `git ${args.join(" ")} failed: ${result.stderr}`);
}

async function fixtureRepo(): Promise<string> {
  const cwd = await tempDir();
  git(cwd, ["init", "--quiet"]);
  git(cwd, ["config", "user.email", "test@codexus.local"]);
  git(cwd, ["config", "user.name", "Codexus Test"]);
  git(cwd, ["config", "commit.gpgsign", "false"]);
  await mkdir(join(cwd, "src"), { recursive: true });
  await writeFile(join(cwd, "package.json"), `${JSON.stringify({ name: "fixture", version: "1.0.0" }, null, 2)}\n`);
  await writeFile(join(cwd, "src", "b.ts"), "export const b = 1;\n");
  await writeFile(join(cwd, "src", "a.ts"), "import { b } from './b.ts';\nexport const a = b;\n");
  git(cwd, ["add", "package.json", "src/a.ts", "src/b.ts"]);
  git(cwd, ["commit", "--quiet", "-m", "initial"]);
  return cwd;
}

async function readGraph(path: string): Promise<RepoGraphArtifact> {
  return JSON.parse(await readFile(path, "utf8")) as RepoGraphArtifact;
}

function withFreshGraphId(graph: RepoGraphArtifact): RepoGraphArtifact {
  const { graphId: _graphId, ...withoutGraphId } = graph;
  return { ...graph, graphId: computeRepoGraphId(withoutGraphId) };
}

test("repo graph build writes a schema-valid codexus-lite artifact", async () => {
  const cwd = await fixtureRepo();
  try {
    const build = runCli(cwd, ["repo", "graph", "build", "--graph-provider", "codexus-lite", "--scope", "src/**", "--json"]);
    assert.equal(build.status, 0, build.stderr);
    const output = JSON.parse(build.stdout);
    assert.equal(output.command, "graph build");
    assert.equal(output.stability, "experimental");
    assert.equal(output.provider.id, "codexus-lite");
    assert.equal(output.sourceWorkspaceFingerprint.kind, "scoped");
    assert.match(output.graphId, /^sha256:/);
    assert.ok(existsSync(output.artifactPath), "expected graph artifact to be persisted");
    assert.ok(output.nodes.some((node: { id: string }) => node.id === "file:src/a.ts"));

    const schema = runCli(cwd, ["schema", "validate", "--type", "repo-graph", "--file", output.artifactPath, "--json"]);
    assert.equal(schema.status, 0, schema.stderr);
    const schemaOutput = JSON.parse(schema.stdout);
    assert.equal(schemaOutput.ok, true);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("repo graph check --gate passes for a fresh graph id and ignores out-of-scope changes", async () => {
  const cwd = await fixtureRepo();
  try {
    const build = runCli(cwd, ["repo", "graph", "build", "--scope", "src/**", "--json"]);
    assert.equal(build.status, 0, build.stderr);
    const graph = JSON.parse(build.stdout);

    await mkdir(join(cwd, "docs"), { recursive: true });
    await writeFile(join(cwd, "docs", "note.md"), "# unrelated\n");

    const check = runCli(cwd, ["repo", "graph", "check", "--graph", graph.graphId, "--gate", "--json"]);
    assert.equal(check.status, 0, check.stderr);
    const output = JSON.parse(check.stdout);
    assert.equal(output.command, "graph check");
    assert.equal(output.repoGraph.status, "pass");
    assert.equal(output.repoGraph.freshness, "fresh");
    assert.equal(output.gate.status, "passed");
    assert.deepEqual(output.evidenceGaps, []);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("repo graph check --gate fails when scoped source content changes", async () => {
  const cwd = await fixtureRepo();
  try {
    const build = runCli(cwd, ["repo", "graph", "build", "--scope", "src/**", "--json"]);
    assert.equal(build.status, 0, build.stderr);
    const graph = JSON.parse(build.stdout);
    await writeFile(join(cwd, "src", "a.ts"), "import { b } from './b.ts';\nexport const a = b + 1;\n");

    const check = runCli(cwd, ["repo", "graph", "check", "--graph", graph.graphId, "--gate", "--json"]);
    assert.equal(check.status, 1);
    const output = JSON.parse(check.stdout);
    assert.equal(output.repoGraph.freshness, "stale");
    assert.equal(output.gate.status, "failed");
    assert.ok(output.evidenceGaps.some((gap: { kind: string }) => gap.kind === "scoped_fingerprint_stale"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("repo graph id ignores volatile gate output but fails dangling edges", async () => {
  const cwd = await fixtureRepo();
  try {
    const build = runCli(cwd, ["repo", "graph", "build", "--scope", "src/**", "--json"]);
    assert.equal(build.status, 0, build.stderr);
    const built = JSON.parse(build.stdout);
    const graph = await readGraph(built.artifactPath);
    graph.gate = { enabled: true, status: "failed", exitCode: 1, reason: "volatile check result" };
    await writeFile(join(cwd, "volatile-gate.json"), `${JSON.stringify(graph, null, 2)}\n`);

    const volatile = runCli(cwd, ["repo", "graph", "check", "--graph", "volatile-gate.json", "--gate", "--json"]);
    assert.equal(volatile.status, 0, volatile.stderr);
    const volatileOutput = JSON.parse(volatile.stdout);
    assert.ok(!volatileOutput.evidenceGaps.some((gap: { kind: string }) => gap.kind === "graph_id_mismatch"));

    const dangling = withFreshGraphId({
      ...graph,
      edges: [
        ...graph.edges,
        { id: "edge:dangling", kind: "imports", from: "file:src/a.ts", to: "file:src/missing.ts", evidence: "test" },
      ],
    });
    await writeFile(join(cwd, "dangling.json"), `${JSON.stringify(dangling, null, 2)}\n`);

    const check = runCli(cwd, ["repo", "graph", "check", "--graph", "dangling.json", "--gate", "--json"]);
    assert.equal(check.status, 1);
    const output = JSON.parse(check.stdout);
    assert.equal(output.gate.status, "failed");
    assert.ok(output.evidenceGaps.some((gap: { kind: string }) => gap.kind === "dangling_edge"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("repo graph import/search/explain stay JSON-only and advisory", async () => {
  const cwd = await fixtureRepo();
  try {
    await mkdir(join(cwd, ".understand-anything"), { recursive: true });
    await writeFile(join(cwd, ".understand-anything", "knowledge-graph.json"), JSON.stringify({
      nodes: [
        { id: "file:src/a.ts", kind: "file", path: "src/a.ts" },
        { id: "file:src/b.ts", kind: "file", path: "src/b.ts", label: "b value module" },
      ],
      edges: [
        { id: "edge:a-b", kind: "imports", from: "file:src/a.ts", to: "file:src/b.ts", evidence: "src/a.ts:1" },
      ],
    }, null, 2));

    const imported = runCli(cwd, [
      "repo",
      "graph",
      "import",
      "--graph-provider",
      "understand-anything",
      "--source",
      ".understand-anything/knowledge-graph.json",
      "--scope",
      "src/**",
      "--json",
    ]);
    assert.equal(imported.status, 0, imported.stderr);
    const importedOutput = JSON.parse(imported.stdout);
    assert.equal(importedOutput.command, "graph import");
    assert.equal(importedOutput.provider.external, true);
    assert.equal(importedOutput.provider.runtimeDeps, false);
    assert.equal(importedOutput.imported.execution, "none");
    assert.equal(importedOutput.imported.packageImported, false);
    assert.equal(importedOutput.imported.completionAuthority, false);
    assert.equal(importedOutput.source.path, ".understand-anything/knowledge-graph.json");
    assert.equal(importedOutput.source.sanitized, true);
    assert.equal(typeof importedOutput.source.hash, "string");

    const check = runCli(cwd, ["repo", "graph", "check", "--graph", importedOutput.graphId, "--gate", "--json"]);
    assert.equal(check.status, 0, check.stderr);
    const checked = JSON.parse(check.stdout);
    assert.equal(checked.gate.status, "passed");
    assert.equal(checked.repoGraph.freshness, "fresh");

    const search = runCli(cwd, ["repo", "graph", "search", "--graph", importedOutput.graphId, "value", "--json"]);
    assert.equal(search.status, 0, search.stderr);
    const searchOutput = JSON.parse(search.stdout);
    assert.equal(searchOutput.command, "graph search");
    assert.equal(searchOutput.eligibleForAutomaticInjection, false);
    assert.equal(searchOutput.completionAuthority, false);
    assert.ok(searchOutput.results.some((item: { id: string }) => item.id === "file:src/b.ts"));

    const explain = runCli(cwd, ["repo", "graph", "explain", "--graph", importedOutput.graphId, "file:src/a.ts", "--json"]);
    assert.equal(explain.status, 0, explain.stderr);
    const explainOutput = JSON.parse(explain.stdout);
    assert.equal(explainOutput.command, "graph explain");
    assert.equal(explainOutput.found, true);
    assert.equal(explainOutput.kind, "node");
    assert.equal(explainOutput.advisoryOnly, true);
    assert.equal(explainOutput.eligibleForAutomaticInjection, false);
    assert.equal(explainOutput.completionAuthority, false);
    assert.equal(explainOutput.adjacentEdges.length, 1);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
