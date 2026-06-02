import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const cli = resolve("src/cli/main.ts");

async function tempDir(): Promise<string> {
  return await mkdtemp(join(tmpdir(), "codexus-policy-"));
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

async function initGitRepo(cwd: string): Promise<void> {
  git(cwd, ["init", "--quiet"]);
  git(cwd, ["config", "user.email", "test@codexus.local"]);
  git(cwd, ["config", "user.name", "Codexus Test"]);
  git(cwd, ["config", "commit.gpgsign", "false"]);
  await writeFile(join(cwd, "README.md"), "initial\n");
  await writeFile(join(cwd, "package.json"), `${JSON.stringify({
    name: "fixture",
    version: "1.0.0",
    type: "module",
  }, null, 2)}\n`);
  git(cwd, ["add", "README.md", "package.json"]);
  git(cwd, ["commit", "--quiet", "-m", "initial"]);
}

test("policy catalog reports advisory scope and unavailable driver capability without a declared scope", async () => {
  const cwd = await tempDir();
  try {
    await initGitRepo(cwd);
    const result = runCli(cwd, ["policy", "catalog", "check", "--json"]);
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.command, "policy catalog check");
    assert.equal(output.stability, "experimental");
    assert.equal(output.scope, null);
    assert.equal(output.rules.find((rule: { ruleId: string }) => rule.ruleId === "scope.out-of-declared")?.status, "advisory");
    assert.equal(output.rules.find((rule: { ruleId: string }) => rule.ruleId === "driver.command.preflight")?.status, "unavailable");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("policy catalog reports observed risk facts for dependency, schema, migration, and out-of-scope changes", async () => {
  const cwd = await tempDir();
  try {
    await initGitRepo(cwd);
    await mkdir(join(cwd, "src"), { recursive: true });
    await mkdir(join(cwd, "schemas"), { recursive: true });
    await mkdir(join(cwd, "migrations"), { recursive: true });
    await writeFile(join(cwd, "src", "changed.ts"), "export const changed = true;\n");
    await writeFile(join(cwd, "package-lock.json"), "{\n  \"name\": \"fixture\"\n}\n");
    await writeFile(join(cwd, "schemas", "sample.schema.json"), "{\n  \"$schema\": \"https://json-schema.org/draft/2020-12/schema\",\n  \"$id\": \"urn:sample\",\n  \"title\": \"Sample\",\n  \"type\": \"object\"\n}\n");
    await writeFile(join(cwd, "migrations", "001_init.sql"), "create table test(id int);\n");
    await writeFile(join(cwd, "README.md"), "outside declared scope\n");

    const result = runCli(cwd, ["policy", "catalog", "check", "--scope", "src/**", "--json"]);
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.scope, "src/**");
    assert.ok(output.riskFacts.some((fact: { kind: string }) => fact.kind === "changed_file_count"));
    assert.ok(output.riskFacts.some((fact: { kind: string }) => fact.kind === "diff_line_volume"));
    assert.ok(output.riskFacts.some((fact: { kind: string }) => fact.kind === "dependency_or_lockfile_touched"));
    assert.ok(output.riskFacts.some((fact: { kind: string }) => fact.kind === "schema_file_touched"));
    assert.ok(output.riskFacts.some((fact: { kind: string }) => fact.kind === "migration_file_touched"));
    assert.ok(output.riskFacts.some((fact: { kind: string }) => fact.kind === "out_of_scope_paths"));
    assert.equal(output.rules.find((rule: { ruleId: string }) => rule.ruleId === "dependency.manifest-or-lockfile-touch")?.status, "observed");
    assert.equal(output.rules.find((rule: { ruleId: string }) => rule.ruleId === "schema.registry-touch")?.status, "observed");
    assert.equal(output.rules.find((rule: { ruleId: string }) => rule.ruleId === "migration.touch")?.status, "observed");
    assert.equal(output.rules.find((rule: { ruleId: string }) => rule.ruleId === "scope.out-of-declared")?.status, "observed");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
