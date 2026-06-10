import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
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
    assert.ok(output.pages.some((page: { pageId: string }) => page.pageId === "wiki.release"));
    assert.ok(output.pages.some((page: { pageId: string }) => page.pageId === "wiki.runtime"));
    assert.ok(output.pages.some((page: { pageId: string }) => page.pageId === "wiki.graph"));
    assert.ok(output.pages.some((page: { pageId: string }) => page.pageId === "wiki.sessions"));
    assert.ok(output.pages.some((page: { pageId: string }) => page.pageId === "wiki.architecture"));
    assert.ok(output.pages.some((page: { pageId: string }) => page.pageId === "wiki.decisions"));
    assert.ok(output.pages.some((page: { pageId: string }) => page.pageId === "wiki.risks"));
    assert.ok(output.candidates.some((candidate: { category: string; path: string }) =>
      candidate.category === "json-contract" && candidate.path === "docs/json-contract.md"));
    assert.ok(output.candidates.some((candidate: { category: string; path: string }) =>
      candidate.category === "implementation-status" && candidate.path === "docs/implementation-status.md"));
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
    assert.ok(existsSync(join(cwd, ".codexus", "wiki", "pages", "release.md")));
    assert.ok(existsSync(join(cwd, ".codexus", "wiki", "pages", "runtime.md")));
    assert.ok(existsSync(join(cwd, ".codexus", "wiki", "pages", "graph.md")));
    assert.ok(existsSync(join(cwd, ".codexus", "wiki", "pages", "sessions.md")));

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

    const context = runCli(cwd, ["wiki", "context", "--topic", "verification", "--budget", "1200", "--json"]);
    assert.equal(context.status, 0, context.stderr);
    const output = JSON.parse(context.stdout);
    assert.equal(output.command, "wiki context");
    assert.equal(output.stability, "stable");
    assert.ok(output.selectedPages.length >= 1);
    assert.ok(output.selectedPages.some((page: { pageId: string }) => page.pageId === "wiki.verification"));
    assert.ok(output.selectedPages.every((page: { reason: string }) => typeof page.reason === "string" && page.reason.length > 0));
    assert.ok(output.tokenEstimate > 0);
    assert.equal(output.eligibleForAutomaticInjection, false);
    assert.equal(output.freshnessPolicy.freshOnly, false);
    assert.equal(output.gate.status, "not_requested");

    const releaseContext = runCli(cwd, ["wiki", "context", "--topic", "release contract", "--budget", "4000", "--json"]);
    assert.equal(releaseContext.status, 0, releaseContext.stderr);
    const releaseOutput = JSON.parse(releaseContext.stdout);
    assert.ok(releaseOutput.selectedPages.some((page: { pageId: string }) => page.pageId === "wiki.release"));

    const graphContext = runCli(cwd, ["wiki", "context", "--topic", "repository graph session", "--budget", "4000", "--json"]);
    assert.equal(graphContext.status, 0, graphContext.stderr);
    const graphOutput = JSON.parse(graphContext.stdout);
    assert.ok(graphOutput.selectedPages.some((page: { pageId: string }) => page.pageId === "wiki.graph"));
    assert.ok(graphOutput.selectedPages.some((page: { pageId: string }) => page.pageId === "wiki.sessions"));

    const architectureContext = runCli(cwd, ["wiki", "context", "--topic", "architecture decision risk", "--budget", "5000", "--json"]);
    assert.equal(architectureContext.status, 0, architectureContext.stderr);
    const architectureOutput = JSON.parse(architectureContext.stdout);
    assert.ok(architectureOutput.selectedPages.some((page: { pageId: string }) => page.pageId === "wiki.architecture"));
    assert.ok(architectureOutput.selectedPages.some((page: { pageId: string }) => page.pageId === "wiki.decisions"));
    assert.ok(architectureOutput.selectedPages.some((page: { pageId: string }) => page.pageId === "wiki.risks"));

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

test("wiki context fresh-only gate rejects stale context without injection authority", async () => {
  const cwd = await fixtureRepo();
  try {
    const build = runCli(cwd, ["wiki", "build", "--mode", "deterministic", "--json"]);
    assert.equal(build.status, 0, build.stderr);
    await writeFile(join(cwd, "package.json"), `${JSON.stringify({
      name: "fixture",
      version: "2.0.0",
      scripts: {
        test: "node --test",
      },
    }, null, 2)}\n`);

    const context = runCli(cwd, [
      "wiki",
      "context",
      "--topic",
      "verification",
      "--budget",
      "4000",
      "--fresh-only",
      "--gate",
      "--json",
    ]);
    assert.equal(context.status, 1);
    const output = JSON.parse(context.stdout);
    assert.equal(output.command, "wiki context");
    assert.equal(output.stability, "stable");
    assert.equal(output.freshnessPolicy.freshOnly, true);
    assert.equal(output.freshnessPolicy.status, "fail");
    assert.equal(output.selectedPages.length, 0);
    assert.equal(output.gate.status, "failed");
    assert.equal(output.eligibleForAutomaticInjection, false);
    assert.ok(output.evidenceGaps.some((gap: { kind: string }) => gap.kind === "page_stale"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("wiki context approval refuses failed fresh-only context even without gate", async () => {
  const cwd = await fixtureRepo();
  try {
    const build = runCli(cwd, ["wiki", "build", "--mode", "deterministic", "--json"]);
    assert.equal(build.status, 0, build.stderr);
    await writeFile(join(cwd, "package.json"), `${JSON.stringify({ name: "fixture", version: "2.0.0" }, null, 2)}\n`);

    const approval = runCli(cwd, [
      "wiki",
      "context",
      "--topic",
      "verification",
      "--budget",
      "4000",
      "--fresh-only",
      "--approve",
      "--approved-by",
      "tester",
      "--json",
    ]);
    assert.equal(approval.status, 1);
    const output = JSON.parse(approval.stdout);
    assert.equal(output.code, "wiki_context_freshness_gate_failed");

    const staleApproval = runCli(cwd, [
      "wiki",
      "context",
      "--topic",
      "verification",
      "--budget",
      "4000",
      "--approve",
      "--approved-by",
      "tester",
      "--json",
    ]);
    assert.equal(staleApproval.status, 1);
    assert.equal(JSON.parse(staleApproval.stdout).code, "wiki_context_handoff_requires_fresh_context");

    const contextDir = join(cwd, ".codexus", "wiki", "context");
    const entries = existsSync(contextDir) ? await readdir(contextDir) : [];
    assert.deepEqual(entries, []);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("wiki context approval writes a visible non-injected artifact", async () => {
  const cwd = await fixtureRepo();
  try {
    const build = runCli(cwd, ["wiki", "build", "--mode", "deterministic", "--json"]);
    assert.equal(build.status, 0, build.stderr);

    const approval = runCli(cwd, [
      "wiki",
      "context",
      "--topic",
      "verification",
      "--budget",
      "4000",
      "--approve",
      "--approved-by",
      "tester",
      "--json",
    ]);
    assert.equal(approval.status, 0, approval.stderr);
    const output = JSON.parse(approval.stdout);
    assert.equal(output.command, "wiki context approve");
    assert.equal(output.approval.status, "approved_not_injected");
    assert.equal(output.approval.approvedBy, "tester");
    assert.equal(output.approval.injection.automatic, false);
    assert.equal(output.approval.injection.applied, false);
    assert.equal(output.approval.handoffPolicy.status, "manual_only");
    assert.equal(output.approval.handoffPolicy.requiresFreshContext, true);
    assert.equal(output.approval.handoffPolicy.requiresExplicitReference, true);
    assert.equal(output.approval.handoffPolicy.automaticInjection, false);
    assert.equal(output.approval.handoffPolicy.applied, false);
    assert.equal(output.approval.handoffPolicy.sourceTruth, false);
    assert.equal(output.approval.handoffPolicy.completionAuthority, false);
    assert.ok(output.approval.handoffPolicy.allowedConsumers.includes("codex-session-explicit-reference"));
    assert.equal(output.approval.authority.sourceTruth, false);
    assert.equal(output.approval.authority.completionAuthority, false);
    assert.equal(output.eligibleForAutomaticInjection, false);
    assert.equal(output.completionAuthority, false);
    assert.ok(existsSync(output.approval.paths.markdown));
    assert.ok(existsSync(output.approval.paths.json));

    const markdown = await readFile(output.approval.paths.markdown, "utf8");
    assert.match(markdown, /approved_not_injected/);
    assert.match(markdown, /does not inject it automatically/);
    assert.match(markdown, /Handoff Policy/);
    assert.match(markdown, /manual_only/);

    const schema = runCli(cwd, ["schema", "validate", "--type", "wiki-context-approval", "--file", output.approval.paths.json, "--json"]);
    assert.equal(schema.status, 0, schema.stderr);
    assert.equal(JSON.parse(schema.stdout).validation.valid, true);
    assert.equal(JSON.parse(schema.stdout).artifactValidation.valid, true);

    const artifact = JSON.parse(await readFile(output.approval.paths.json, "utf8"));
    artifact.handoffPolicy.allowedConsumers = [];
    await writeFile(output.approval.paths.json, `${JSON.stringify(artifact, null, 2)}\n`);
    const invalidSchema = runCli(cwd, ["schema", "validate", "--type", "wiki-context-approval", "--file", output.approval.paths.json, "--json"]);
    assert.equal(invalidSchema.status, 1);
    const invalidOutput = JSON.parse(invalidSchema.stdout);
    assert.equal(invalidOutput.validation.valid, false);
    assert.ok(invalidOutput.validation.errors.includes("handoffPolicy.allowedConsumers:expected_non_empty_string_array"));
    assert.equal(invalidOutput.artifactValidation.valid, true);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("wiki injection policy reports manual-only handoff without enabling injection", async () => {
  const cwd = await fixtureRepo();
  try {
    const emptyPolicy = runCli(cwd, ["wiki", "injection-policy", "--gate", "--json"]);
    assert.equal(emptyPolicy.status, 0, emptyPolicy.stderr);
    const emptyOutput = JSON.parse(emptyPolicy.stdout);
    assert.equal(emptyOutput.command, "wiki injection-policy");
    assert.equal(emptyOutput.policy.status, "manual_only");
    assert.equal(emptyOutput.policy.automaticInjection.supported, false);
    assert.equal(emptyOutput.policy.automaticInjection.status, "deferred");
    assert.equal(emptyOutput.policy.approvedContextUse.requiresFreshContext, true);
    assert.equal(emptyOutput.policy.approvedContextUse.requiresExplicitReference, true);
    assert.equal(emptyOutput.policy.authority.promptMutation, false);
    assert.equal(emptyOutput.policy.authority.sourceTruth, false);
    assert.equal(emptyOutput.policy.authority.completionAuthority, false);
    assert.equal(emptyOutput.eligibleForAutomaticInjection, false);
    assert.equal(emptyOutput.policy.handoff.approvalCount, 0);
    assert.equal(emptyOutput.policy.handoff.latestHandoffStatus, null);
    assert.equal(emptyOutput.gate.status, "passed");
    assert.ok(emptyOutput.derivableFacts.some((fact: { kind: string }) => fact.kind === "automatic_context_injection_deferred"));

    const build = runCli(cwd, ["wiki", "build", "--mode", "deterministic", "--json"]);
    assert.equal(build.status, 0, build.stderr);
    const approval = runCli(cwd, [
      "wiki",
      "context",
      "--topic",
      "verification",
      "--budget",
      "4000",
      "--approve",
      "--approved-by",
      "tester",
      "--json",
    ]);
    assert.equal(approval.status, 0, approval.stderr);

    const observedPolicy = runCli(cwd, ["wiki", "injection-policy", "--json"]);
    assert.equal(observedPolicy.status, 0, observedPolicy.stderr);
    const observedOutput = JSON.parse(observedPolicy.stdout);
    assert.equal(observedOutput.policy.handoff.approvalCount, 1);
    assert.equal(observedOutput.policy.handoff.latestHandoffStatus, "manual_only");
    assert.equal(observedOutput.policy.automaticInjection.supported, false);
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

test("wiki advisory build records source-bundle evidence without injection authority", async () => {
  const cwd = await fixtureRepo();
  try {
    const deterministic = runCli(cwd, ["wiki", "build", "--mode", "deterministic", "--json"]);
    assert.equal(deterministic.status, 0, deterministic.stderr);

    const result = runCli(cwd, ["wiki", "build", "--mode", "advisory", "--json"]);
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.command, "wiki build");
    assert.equal(output.mode, "advisory");
    assert.equal(output.synthesis.driver.modelInvoked, false);
    assert.equal(output.synthesis.eligibleForAutomaticInjection, false);
    assert.equal(output.synthesis.sourceTruth, false);
    assert.equal(output.synthesis.completionAuthority, false);
    assert.equal(output.completionAuthority, false);
    assert.ok(existsSync(join(cwd, ".codexus", "wiki", "advisory", "advisory.json")));

    const schema = runCli(cwd, ["schema", "validate", "--type", "wiki-advisory", "--file", ".codexus/wiki/advisory/advisory.json", "--json"]);
    assert.equal(schema.status, 0, schema.stderr);
    assert.equal(JSON.parse(schema.stdout).ok, true);

    await writeFile(join(cwd, "package.json"), `${JSON.stringify({ name: "fixture", version: "2.0.0" }, null, 2)}\n`);
    const stale = runCli(cwd, ["wiki", "build", "--mode", "advisory", "--json"]);
    assert.equal(stale.status, 1);
    assert.equal(JSON.parse(stale.stdout).code, "wiki_advisory_source_not_fresh");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("wiki export writes an explicit projection only after a fresh check", async () => {
  const cwd = await fixtureRepo();
  try {
    const build = runCli(cwd, ["wiki", "build", "--mode", "deterministic", "--json"]);
    assert.equal(build.status, 0, build.stderr);

    const exported = runCli(cwd, ["wiki", "export", "--target", "docs/codexus-wiki", "--json"]);
    assert.equal(exported.status, 0, exported.stderr);
    const output = JSON.parse(exported.stdout);
    assert.equal(output.command, "wiki export");
    assert.equal(output.export.status, "exported");
    assert.equal(output.export.autoCommitted, false);
    assert.equal(output.export.sourceTruth, false);
    assert.equal(output.check.gate, "passed");
    assert.equal(output.pageCount, 10);
    assert.ok(output.exportedFiles.includes("docs/codexus-wiki/index.md"));
    assert.ok(existsSync(join(cwd, "docs", "codexus-wiki", "overview.md")));
    assert.ok(existsSync(join(cwd, "docs", "codexus-wiki", "release.md")));
    assert.ok(existsSync(join(cwd, "docs", "codexus-wiki", "runtime.md")));
    assert.ok(existsSync(join(cwd, "docs", "codexus-wiki", "graph.md")));
    assert.ok(existsSync(join(cwd, "docs", "codexus-wiki", "sessions.md")));
    assert.ok(existsSync(join(cwd, "docs", "codexus-wiki", "architecture.md")));
    assert.ok(existsSync(join(cwd, "docs", "codexus-wiki", "decisions.md")));
    assert.ok(existsSync(join(cwd, "docs", "codexus-wiki", "risks.md")));
    const index = await readFile(join(cwd, "docs", "codexus-wiki", "index.md"), "utf8");
    assert.match(index, /generated projection, not the source of truth/);
    assert.match(index, /does not auto-commit/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("wiki export blocks stale pages before writing the target", async () => {
  const cwd = await fixtureRepo();
  try {
    const build = runCli(cwd, ["wiki", "build", "--mode", "deterministic", "--json"]);
    assert.equal(build.status, 0, build.stderr);
    await writeFile(join(cwd, "package.json"), `${JSON.stringify({ name: "fixture", version: "2.0.0" }, null, 2)}\n`);

    const exported = runCli(cwd, ["wiki", "export", "--target", "docs/codexus-wiki", "--json"]);
    assert.equal(exported.status, 1);
    const output = JSON.parse(exported.stdout);
    assert.equal(output.export.status, "blocked");
    assert.equal(output.gate.status, "failed");
    assert.ok(output.evidenceGaps.some((gap: { kind: string }) => gap.kind === "page_stale"));
    assert.equal(existsSync(join(cwd, "docs", "codexus-wiki")), false);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("wiki export rejects unsafe targets", async () => {
  const cwd = await fixtureRepo();
  try {
    const build = runCli(cwd, ["wiki", "build", "--mode", "deterministic", "--json"]);
    assert.equal(build.status, 0, build.stderr);

    const exported = runCli(cwd, ["wiki", "export", "--target", "../outside", "--json"]);
    assert.equal(exported.status, 1);
    const output = JSON.parse(exported.stdout);
    assert.equal(output.type, "error");
    assert.equal(output.code, "unsafe_wiki_export_target");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
