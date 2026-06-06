import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const cli = resolve("src/cli/main.ts");
const installer = resolve("scripts/install-codex-skill.mjs");

async function tempDir(): Promise<string> {
  return await mkdtemp(join(tmpdir(), "codexus-doctor-"));
}

test("doctor reports selected driver capabilities", async () => {
  const cwd = await tempDir();
  try {
    await mkdir(join(cwd, ".codexus"), { recursive: true });
    const fakeCodex = join(cwd, "fake-codex.mjs");
    await writeFile(fakeCodex, `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] === "--version") {
  console.log("codex-cli test");
} else if (args[0] === "login" && args[1] === "status") {
  console.log("logged in");
} else if (args[0] === "exec" && args[1] === "--help") {
  console.log("Usage: codex exec --json --sandbox --model --output-last-message");
} else if (args[0] === "app-server" && args[1] === "--help") {
  console.log("Usage: codex app-server");
} else if (args[0] === "features" && args[1] === "list") {
  console.log("mock stable true");
} else {
  console.error("unexpected args", args.join(" "));
  process.exit(2);
}
`);
    await chmod(fakeCodex, 0o755);
    await writeFile(join(cwd, ".codexus", "config.json"), JSON.stringify({
      codex: { command: fakeCodex },
    }));
    const result = spawnSync(process.execPath, [cli, "doctor", "--cwd", cwd, "--json"], {
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.stability, "stable");
    assert.equal(output.ok, true);
    assert.equal(output.driverProbe.capabilities.supportsJsonl, true);
    assert.equal(typeof output.driverProbe.capabilities.supportsApprovalFlag, "boolean");
    assert.ok(output.checks.some((check: { id: string }) => check.id === "driver.codex-exec"));
    const pluginPackage = output.checks.find((check: { id: string }) => check.id === "codexus.plugin_package");
    assert.equal(pluginPackage.status, "pass");
    assert.equal(pluginPackage.details.pluginPackage.manifestValid, true);
    assert.equal(pluginPackage.details.installedPlugin.detectionSupported, false);
    assert.equal(pluginPackage.details.authority.alwaysOnProof, false);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("doctor reports missing codex command without crashing", async () => {
  const cwd = await tempDir();
  try {
    await mkdir(join(cwd, ".codexus"), { recursive: true });
    await writeFile(join(cwd, ".codexus", "config.json"), JSON.stringify({
      codex: { command: "definitely-not-a-command-codexus-test" },
    }));
    const result = spawnSync(process.execPath, [cli, "doctor", "--cwd", cwd, "--json"], {
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.ok, false);
    const codexVersion = output.checks.find((check: { id: string }) => check.id === "codex.version");
    assert.equal(codexVersion.status, "fail");
    assert.match(codexVersion.summary, /ENOENT/);
    const driver = output.checks.find((check: { id: string }) => check.id === "driver.codex-exec");
    assert.equal(driver.status, "warn");
    assert.match(driver.summary, /ENOENT|unavailable/);
    const strict = spawnSync(process.execPath, [cli, "doctor", "--cwd", cwd, "--json", "--strict"], {
      encoding: "utf8",
    });
    assert.equal(strict.status, 1);
    const strictOutput = JSON.parse(strict.stdout);
    assert.equal(strictOutput.ok, false);
    assert.equal(strictOutput.strict, true);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("doctor reports missing, current, and stale Codexus skill installs", async () => {
  const codexHome = await tempDir();
  try {
    const missing = spawnSync(process.execPath, [cli, "doctor", "--json"], {
      encoding: "utf8",
      env: { ...process.env, CODEX_HOME: codexHome },
    });
    assert.equal(missing.status, 0, missing.stderr);
    const missingCheck = JSON.parse(missing.stdout).checks.find((check: { id: string }) => check.id === "codexus.skill_install");
    assert.equal(missingCheck.status, "warn");
    assert.match(missingCheck.summary, /not installed/);

    const install = spawnSync(process.execPath, [installer, "--json"], {
      encoding: "utf8",
      env: { ...process.env, CODEX_HOME: codexHome },
    });
    assert.equal(install.status, 0, install.stderr);
    const installOutput = JSON.parse(install.stdout);
    assert.equal(installOutput.sourceTreeHash, installOutput.installedTreeHash);

    const current = spawnSync(process.execPath, [cli, "doctor", "--json"], {
      encoding: "utf8",
      env: { ...process.env, CODEX_HOME: codexHome },
    });
    assert.equal(current.status, 0, current.stderr);
    const currentCheck = JSON.parse(current.stdout).checks.find((check: { id: string }) => check.id === "codexus.skill_install");
    assert.equal(currentCheck.status, "pass");
    assert.equal(currentCheck.details.sourceTreeHash, currentCheck.details.installedTreeHash);

    await writeFile(join(codexHome, "skills", "codexus", "references", "commands.md"), "\n# stale\n", { flag: "a" });
    const stale = spawnSync(process.execPath, [cli, "doctor", "--json"], {
      encoding: "utf8",
      env: { ...process.env, CODEX_HOME: codexHome },
    });
    assert.equal(stale.status, 0, stale.stderr);
    const staleCheck = JSON.parse(stale.stdout).checks.find((check: { id: string }) => check.id === "codexus.skill_install");
    assert.equal(staleCheck.status, "warn");
    assert.notEqual(staleCheck.details.sourceTreeHash, staleCheck.details.installedTreeHash);
  } finally {
    await rm(codexHome, { recursive: true, force: true });
  }
});

test("doctor reports deferred self-report aggregation", async () => {
  const cwd = await tempDir();
  try {
    await mkdir(join(cwd, ".codexus"), { recursive: true });
    await mkdir(join(cwd, "src"), { recursive: true });
    await mkdir(join(cwd, "docs", "ko"), { recursive: true });
    await writeFile(join(cwd, "package.json"), JSON.stringify({ name: "fixture", version: "1.0.0" }));
    await writeFile(join(cwd, "src", "feature.ts"), "export const claim = 'example_capability_deferred';\n");
    await writeFile(join(cwd, "docs", "implementation-status.md"), "Deferred: `example_capability_deferred`.\n");
    await writeFile(join(cwd, "docs", "ko", "implementation-status.md"), "Deferred: `example_capability_deferred`.\n");
    const fakeCodex = join(cwd, "fake-codex.mjs");
    await writeFile(fakeCodex, `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] === "--version") {
  console.log("codex-cli test");
} else if (args[0] === "login" && args[1] === "status") {
  console.log("logged in");
} else if (args[0] === "exec" && args[1] === "--help") {
  console.log("Usage: codex exec --json --sandbox --model --output-last-message");
} else if (args[0] === "app-server" && args[1] === "--help") {
  console.log("Usage: codex app-server");
} else if (args[0] === "features" && args[1] === "list") {
  console.log("mock stable true");
} else {
  console.error("unexpected args", args.join(" "));
  process.exit(2);
}
`);
    await chmod(fakeCodex, 0o755);
    await writeFile(join(cwd, ".codexus", "config.json"), JSON.stringify({
      codex: { command: fakeCodex },
    }));

    const result = spawnSync(process.execPath, [cli, "doctor", "--cwd", cwd, "--json"], {
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    const check = output.checks.find((item: { id: string }) => item.id === "codexus.deferred_self_reports");
    assert.equal(check.status, "pass");
    assert.equal(check.details.status, "clear");
    assert.deepEqual(check.details.sourceClaims, ["example_capability_deferred"]);
    assert.deepEqual(check.details.documentedClaims, ["example_capability_deferred"]);
    assert.equal(check.details.completionAuthority, false);
    const control = output.checks.find((item: { id: string }) => item.id === "codexus.control_plane");
    assert.equal(control.status, "pass");
    assert.equal(control.details.completionAuthority, false);
    assert.equal(control.details.deferredSelfReports.status, "clear");
    assert.equal(control.details.policyCatalog.completionAuthority, false);
    assert.ok(control.details.policyCatalog.unavailableRules.includes("driver.command.preflight"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
