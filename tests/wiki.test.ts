import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const cli = resolve("src/cli/main.ts");

async function tempDir(): Promise<string> {
  return await mkdtemp(join(tmpdir(), "codexus-wiki-"));
}

function runCli(cwd: string, args: string[]) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env },
  });
}

async function fixtureRepo(): Promise<string> {
  const cwd = await tempDir();
  await mkdir(join(cwd, "docs"), { recursive: true });
  await writeFile(join(cwd, "README.md"), "# Fixture\n");
  await writeFile(join(cwd, "docs", "README.md"), "# Docs Index\n");
  await writeFile(join(cwd, "package.json"), `${JSON.stringify({
    name: "fixture",
    version: "1.0.0",
    scripts: {
      test: "node --test",
      typecheck: "node -e \"console.log('ok')\"",
      lint: "node -e \"console.log('lint')\"",
    },
  }, null, 2)}\n`);
  return cwd;
}

test("wiki map lists deterministic source candidates and page plans", async () => {
  const cwd = await fixtureRepo();
  try {
    const result = runCli(cwd, ["wiki", "map", "--json"]);
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.command, "wiki map");
    assert.ok(output.candidates.some((candidate: { category: string; path: string; exists: boolean }) =>
      candidate.category === "package-metadata" && candidate.path === "package.json" && candidate.exists));
    assert.ok(output.pages.some((page: { pageId: string; buildable: boolean }) => page.pageId === "wiki.overview" && page.buildable));
    assert.ok(output.pages.some((page: { pageId: string }) => page.pageId === "wiki.commands"));
    assert.ok(output.pages.some((page: { pageId: string }) => page.pageId === "wiki.verification"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("wiki build writes a schema-valid manifest and markdown pages", async () => {
  const cwd = await fixtureRepo();
  try {
    const build = runCli(cwd, ["wiki", "build", "--mode", "deterministic", "--json"]);
    assert.equal(build.status, 0, build.stderr);
    const output = JSON.parse(build.stdout);
    assert.equal(output.command, "wiki build");
    assert.equal(output.mode, "deterministic");
    assert.ok(existsSync(join(cwd, ".codexus", "wiki", "pages", "overview.md")));
    assert.ok(existsSync(join(cwd, ".codexus", "wiki", "pages", "commands.md")));
    assert.ok(existsSync(join(cwd, ".codexus", "wiki", "pages", "verification.md")));

    const manifestSchema = runCli(cwd, ["schema", "validate", "--type", "wiki-manifest", "--file", output.manifestPath, "--json"]);
    assert.equal(manifestSchema.status, 0, manifestSchema.stderr);
    assert.equal(JSON.parse(manifestSchema.stdout).ok, true);

    const overview = await readFile(join(cwd, ".codexus", "wiki", "pages", "overview.md"), "utf8");
    assert.match(overview, /pageId: wiki\.overview/);
    assert.match(overview, /Source refs:/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("wiki check gates stale pages after a source change", async () => {
  const cwd = await fixtureRepo();
  try {
    const build = runCli(cwd, ["wiki", "build", "--mode", "deterministic", "--json"]);
    assert.equal(build.status, 0, build.stderr);

    const fresh = runCli(cwd, ["wiki", "check", "--gate", "--json"]);
    assert.equal(fresh.status, 0, fresh.stderr);
    const freshOutput = JSON.parse(fresh.stdout);
    assert.equal(freshOutput.wiki.status, "pass");
    assert.equal(freshOutput.gate.status, "passed");

    await writeFile(join(cwd, "package.json"), `${JSON.stringify({
      name: "fixture",
      version: "1.0.1",
      scripts: {
        test: "node --test",
        typecheck: "node -e \"console.log('ok')\"",
      },
    }, null, 2)}\n`);

    const stale = runCli(cwd, ["wiki", "check", "--gate", "--json"]);
    assert.equal(stale.status, 1);
    const staleOutput = JSON.parse(stale.stdout);
    assert.equal(staleOutput.wiki.status, "fail");
    assert.equal(staleOutput.gate.status, "failed");
    assert.ok(staleOutput.evidenceGaps.some((gap: { kind: string }) => gap.kind === "page_stale"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("wiki context returns bounded topic-matched pages", async () => {
  const cwd = await fixtureRepo();
  try {
    const build = runCli(cwd, ["wiki", "build", "--mode", "deterministic", "--json"]);
    assert.equal(build.status, 0, build.stderr);

    const context = runCli(cwd, ["wiki", "context", "--topic", "verification", "--budget", "4000", "--json"]);
    assert.equal(context.status, 0, context.stderr);
    const output = JSON.parse(context.stdout);
    assert.equal(output.command, "wiki context");
    assert.ok(output.selectedPages.length >= 1);
    assert.ok(output.selectedPages.some((page: { pageId: string }) => page.pageId === "wiki.verification"));
    assert.ok(output.selectedPages.every((page: { reason: string }) => typeof page.reason === "string" && page.reason.length > 0));
    assert.ok(output.tokenEstimate > 0);
    assert.equal(output.eligibleForAutomaticInjection, false);

    await writeFile(join(cwd, "package.json"), `${JSON.stringify({
      name: "fixture",
      version: "2.0.0",
      scripts: {
        test: "node --test",
      },
    }, null, 2)}\n`);
    const staleContext = runCli(cwd, ["wiki", "context", "--topic", "verification", "--budget", "4000", "--json"]);
    assert.equal(staleContext.status, 0, staleContext.stderr);
    const staleOutput = JSON.parse(staleContext.stdout);
    assert.ok(staleOutput.selectedPages.some((page: { freshness: string }) => page.freshness === "stale"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("wiki check fails when a local link resolves outside the registered wiki pages", async () => {
  const cwd = await fixtureRepo();
  try {
    const build = runCli(cwd, ["wiki", "build", "--mode", "deterministic", "--json"]);
    assert.equal(build.status, 0, build.stderr);
    const manifest = JSON.parse(await readFile(join(cwd, ".codexus", "wiki", "manifest.json"), "utf8"));
    manifest.pages[0].localLinks = ["../../../README.md"];
    await writeFile(join(cwd, ".codexus", "wiki", "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

    const overviewPath = join(cwd, ".codexus", "wiki", "pages", "overview.md");
    const overview = await readFile(overviewPath, "utf8");
    const updated = overview.replace(/localLinks:\n(?:  - .+\n)+/, 'localLinks:\n  - ../../../README.md\n');
    await writeFile(overviewPath, updated);

    const check = runCli(cwd, ["wiki", "check", "--gate", "--json"]);
    assert.equal(check.status, 1);
    const output = JSON.parse(check.stdout);
    assert.ok(output.evidenceGaps.some((gap: { kind: string }) => gap.kind === "local_link_unregistered"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("wiki advisory build remains honestly deferred", async () => {
  const cwd = await fixtureRepo();
  try {
    const result = runCli(cwd, ["wiki", "build", "--mode", "advisory", "--json"]);
    assert.equal(result.status, 1);
    const output = JSON.parse(result.stdout);
    assert.equal(output.code, "unsupported_wiki_build_mode");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
