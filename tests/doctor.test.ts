import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const cli = resolve("src/cli/main.ts");
const installer = resolve("scripts/install-codex-skill.mjs");

async function tempDir(): Promise<string> {
  return await mkdtemp(join(tmpdir(), "codexus-doctor-"));
}

test("doctor reports selected driver capabilities", () => {
  const result = spawnSync(process.execPath, [cli, "doctor", "--json"], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.ok, true);
  assert.equal(output.driverProbe.capabilities.supportsJsonl, true);
  assert.equal(typeof output.driverProbe.capabilities.supportsApprovalFlag, "boolean");
  assert.ok(output.checks.some((check: { id: string }) => check.id === "driver.codex-exec"));
});

test("doctor reports missing codex command without crashing", async () => {
  const cwd = await tempDir();
  try {
    await mkdir(join(cwd, ".codex-harness"), { recursive: true });
    await writeFile(join(cwd, ".codex-harness", "config.json"), JSON.stringify({
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
