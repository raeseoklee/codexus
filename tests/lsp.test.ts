import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const cli = resolve("src/cli/main.ts");

async function tempDir(): Promise<string> {
  return await mkdtemp(join(tmpdir(), "codexus-lsp-"));
}

function runCli(cwd: string, args: string[]) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env },
  });
}

async function writeTypeScriptProject(cwd: string, script: string): Promise<void> {
  await mkdir(join(cwd, "src"), { recursive: true });
  await writeFile(join(cwd, "src", "index.ts"), "export const value = 1;\n");
  await writeFile(join(cwd, "tsconfig.json"), `${JSON.stringify({ compilerOptions: { strict: true } }, null, 2)}\n`);
  await writeFile(join(cwd, "check.mjs"), script);
  await writeFile(join(cwd, "package.json"), `${JSON.stringify({
    name: "fixture",
    version: "1.0.0",
    type: "module",
    scripts: {
      typecheck: "node check.mjs",
    },
  }, null, 2)}\n`);
}

test("lsp status detects TypeScript diagnostics without starting a language server", async () => {
  const cwd = await tempDir();
  try {
    await writeTypeScriptProject(cwd, "console.log('ok');\n");
    const result = runCli(cwd, ["lsp", "status", "--json"]);
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.stability, "experimental");
    assert.equal(output.command, "lsp status");
    assert.equal(output.lsp.status, "available");
    assert.equal(output.lsp.providerCount, 1);
    assert.equal(output.providers[0].id, "typescript");
    assert.equal(output.providers[0].protocol.available, false);
    assert.equal(output.providers[0].protocol.startsServer, false);
    assert.equal(output.providers[0].diagnostics.available, true);
    assert.equal(output.autoApply.status, "detect_only");
    assert.equal(output.autoApply.startsLanguageServer, false);
    assert.equal(output.autoApply.runsDiagnostics, false);
    assert.ok(output.informationalUnknowns.some((item: { kind: string }) => item.kind === "lsp_protocol_server_not_started"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("lsp status rejects gate because it never runs diagnostics", async () => {
  const cwd = await tempDir();
  try {
    await writeTypeScriptProject(cwd, "console.log('ok');\n");
    const result = runCli(cwd, ["lsp", "status", "--gate", "--json"]);
    assert.equal(result.status, 1);
    const output = JSON.parse(result.stdout);
    assert.equal(output.type, "error");
    assert.equal(output.code, "unexpected_argument");
    assert.equal(output.message, "Unexpected argument: --gate.");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("lsp check runs explicit diagnostics and can gate failures", async () => {
  const cwd = await tempDir();
  try {
    await writeTypeScriptProject(cwd, "console.error('diagnostic token=secret-value');\nprocess.exit(1);\n");
    const result = runCli(cwd, ["lsp", "check", "--gate", "--json"]);
    assert.equal(result.status, 1);
    const output = JSON.parse(result.stdout);
    assert.equal(output.command, "lsp check");
    assert.equal(output.lsp.status, "failed");
    assert.equal(output.result.executed, true);
    assert.equal(output.result.status, "failed");
    assert.equal(output.gate.status, "failed");
    assert.ok(output.evidenceGaps.some((item: { kind: string }) => item.kind === "lsp_diagnostics_failed"));
    assert.match(output.result.stderrTail, /diagnostic token=\[REDACTED:possible-secret\]/);
    assert.doesNotMatch(output.result.stderrTail, /secret-value/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("lsp check passes when project diagnostics pass", async () => {
  const cwd = await tempDir();
  try {
    await writeTypeScriptProject(cwd, "console.log('diagnostics ok');\n");
    const result = runCli(cwd, ["lsp", "check", "--gate", "--json"]);
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.lsp.status, "passed");
    assert.equal(output.result.status, "passed");
    assert.equal(output.gate.status, "passed");
    assert.deepEqual(output.evidenceGaps, []);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("lsp check reports unavailable diagnostics without pretending to gate language-server output", async () => {
  const cwd = await tempDir();
  try {
    await mkdir(join(cwd, "src"), { recursive: true });
    await writeFile(join(cwd, "src", "index.ts"), "export const value = 1;\n");
    await writeFile(join(cwd, "package.json"), `${JSON.stringify({ name: "fixture", version: "1.0.0" }, null, 2)}\n`);
    const result = runCli(cwd, ["lsp", "check", "--gate", "--json"]);
    assert.equal(result.status, 1);
    const output = JSON.parse(result.stdout);
    assert.equal(output.lsp.status, "unavailable");
    assert.equal(output.result, null);
    assert.equal(output.gate.status, "blocked");
    assert.ok(output.blockingUnknowns.some((item: { kind: string }) => item.kind === "lsp_diagnostics_unavailable"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
