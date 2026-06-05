import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, mkdtemp, rm } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { buildCodexusPluginPackageReport } from "../src/plugin/package.ts";

const cli = resolve("src/cli/main.ts");
const pluginWrapper = resolve("codex/plugins/codexus/scripts/cx.mjs");
const pkg = JSON.parse(readFileSync(resolve("package.json"), "utf8")) as { version: string };

async function tempDir(): Promise<string> {
  return await mkdtemp(join(tmpdir(), "codexus-plugin-package-"));
}

function runCli(args: string[], cwd = process.cwd()) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd,
    encoding: "utf8",
  });
}

test("plugin package report validates the packaged manifest without claiming always-on authority", () => {
  const report = buildCodexusPluginPackageReport();
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.stability, "experimental");
  assert.equal(report.command, "plugin status");
  assert.equal(report.pluginPackage.present, true);
  assert.equal(report.pluginPackage.manifestValid, true);
  assert.equal(report.pluginPackage.manifest.name, "codexus");
  assert.equal(report.pluginPackage.manifest.version, pkg.version);
  assert.equal(report.pluginPackage.components.skills.count, 1);
  assert.equal(report.pluginPackage.components.scripts.wrapperPresent, true);
  assert.equal(report.installedPlugin.status, "deferred");
  assert.equal(report.installedPlugin.detectionSupported, false);
  assert.equal(report.authority.distributionLayer, true);
  assert.equal(report.authority.alwaysOnProof, false);
  assert.equal(report.authority.heartbeatObserved, false);
  assert.equal(report.authority.workflowKernelMoved, false);
  assert.equal(report.authority.completionAuthority, false);
  assert.equal(report.capabilities.codexSkillStableAdapter, true);
  assert.equal(report.capabilities.installedPluginStateDiagnostic, false);
  assert.equal(report.capabilities.alwaysOnSupervision, false);
});

test("plugin status command emits an experimental report-only JSON envelope", () => {
  const result = runCli(["plugin", "status", "--json"]);
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.schemaVersion, 1);
  assert.equal(output.stability, "experimental");
  assert.equal(output.pluginPackage.manifestValid, true);
  assert.equal(output.installedPlugin.reason, "codex_plugin_install_location_contract_deferred");
  assert.equal(output.authority.alwaysOnProof, false);
});

test("plugin wrapper calls the same Codexus core instead of carrying workflow logic", async () => {
  await chmod(pluginWrapper, 0o755);
  const result = spawnSync(process.execPath, [pluginWrapper, "plugin", "status", "--json"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.command, "plugin status");
  assert.equal(output.authority.workflowKernelMoved, false);
});

test("plugin status rejects unsupported subcommands with a truthful error", async () => {
  const cwd = await tempDir();
  try {
    const result = runCli(["plugin", "install", "--json"], cwd);
    assert.equal(result.status, 1);
    const output = JSON.parse(result.stdout);
    assert.equal(output.code, "unsupported_plugin_command");
    assert.equal(output.details.target, "install");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
