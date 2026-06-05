import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const cli = resolve("src/cli/main.ts");

async function tempDir(): Promise<string> {
  return await mkdtemp(join(tmpdir(), "codexus-update-"));
}

function runCli(cwd: string, args: string[], env: Record<string, string> = {}) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      CI: "",
      ...env,
    },
  });
}

async function writeFakeNpm(path: string): Promise<void> {
  await writeFile(
    path,
    `#!/usr/bin/env node
import { writeFileSync } from "node:fs";

if (process.env.CODEXUS_FAKE_NPM_MARKER) {
  writeFileSync(process.env.CODEXUS_FAKE_NPM_MARKER, "called\\n");
}

if (process.env.CODEXUS_FAKE_NPM_EXIT) {
  process.exit(Number(process.env.CODEXUS_FAKE_NPM_EXIT));
}

console.log(JSON.stringify({ latest: process.env.CODEXUS_FAKE_NPM_LATEST || "9.9.9" }));
`,
  );
  await chmod(path, 0o755);
}

test("update check reports registry-derived availability without mutating installation", async () => {
  const cwd = await tempDir();
  try {
    const fakeNpm = join(cwd, "fake-npm.mjs");
    const marker = join(cwd, "npm-called");
    const cacheDir = join(cwd, "update-cache");
    await writeFakeNpm(fakeNpm);

    const result = runCli(cwd, ["update", "check", "--json"], {
      CODEXUS_UPDATE_NPM_COMMAND: fakeNpm,
      CODEXUS_UPDATE_CACHE_DIR: cacheDir,
      CODEXUS_FAKE_NPM_MARKER: marker,
      CODEXUS_FAKE_NPM_LATEST: "9.9.9",
    });
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.schemaVersion, 1);
    assert.equal(output.stability, "experimental");
    assert.equal(output.packageName, "codexus");
    assert.equal(output.latestVersion, "9.9.9");
    assert.equal(output.status, "available");
    assert.equal(output.updateAvailable, true);
    assert.equal(output.source, "registry");
    assert.equal(output.registryChecked, true);
    assert.equal(output.advisory, true);
    assert.equal(output.completionAuthority, false);
    assert.equal(output.installationMutated, false);
    assert.equal(output.primaryCommandCanFail, false);
    assert.equal(existsSync(marker), true);
    assert.equal(existsSync(join(cacheDir, "latest.json")), true);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("update check can be disabled without calling npm", async () => {
  const cwd = await tempDir();
  try {
    const fakeNpm = join(cwd, "fake-npm.mjs");
    const marker = join(cwd, "npm-called");
    await writeFakeNpm(fakeNpm);

    const result = runCli(cwd, ["update", "check", "--json"], {
      CODEXUS_UPDATE_NPM_COMMAND: fakeNpm,
      CODEXUS_UPDATE_CACHE_DIR: join(cwd, "update-cache"),
      CODEXUS_FAKE_NPM_MARKER: marker,
      CODEXUS_NO_UPDATE_CHECK: "1",
    });
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.status, "disabled");
    assert.equal(output.source, "disabled");
    assert.equal(output.registryChecked, false);
    assert.equal(output.disabled, true);
    assert.equal(output.disabledReason, "env");
    assert.equal(existsSync(marker), false);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("stable primary JSON commands include cache-only update summaries and never query npm", async () => {
  const cwd = await tempDir();
  try {
    const fakeNpm = join(cwd, "fake-npm.mjs");
    const marker = join(cwd, "npm-called");
    const cacheDir = join(cwd, "update-cache");
    await writeFakeNpm(fakeNpm);

    const env = {
      CODEXUS_UPDATE_NPM_COMMAND: fakeNpm,
      CODEXUS_UPDATE_CACHE_DIR: cacheDir,
      CODEXUS_FAKE_NPM_MARKER: marker,
      CODEXUS_FAKE_NPM_EXIT: "13",
    };

    const version = runCli(cwd, ["version", "--json"], env);
    assert.equal(version.status, 0, version.stderr);
    const versionOutput = JSON.parse(version.stdout);
    assert.equal(versionOutput.stability, "stable");
    assert.equal(versionOutput.update.stability, "experimental");
    assert.equal(versionOutput.update.registryChecked, false);
    assert.equal(versionOutput.update.disabledReason, "cache_only_miss");

    const doctor = runCli(cwd, ["doctor", "--json"], env);
    assert.equal(doctor.status, 0, doctor.stderr);
    const doctorOutput = JSON.parse(doctor.stdout);
    assert.equal(doctorOutput.stability, "stable");
    assert.equal(doctorOutput.update.stability, "experimental");
    assert.equal(doctorOutput.update.registryChecked, false);

    const session = runCli(cwd, ["session", "status", "--json"], env);
    assert.equal(session.status, 0, session.stderr);
    const sessionOutput = JSON.parse(session.stdout);
    assert.equal(sessionOutput.stability, "stable");
    assert.equal(sessionOutput.update.stability, "experimental");
    assert.equal(sessionOutput.update.registryChecked, false);
    assert.equal(existsSync(marker), false);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("update check rejects unsupported subcommands with a truthful error", async () => {
  const cwd = await tempDir();
  try {
    const result = runCli(cwd, ["update", "install", "--json"], {
      CODEXUS_NO_UPDATE_CHECK: "1",
    });
    assert.equal(result.status, 1);
    const output = JSON.parse(result.stdout);
    assert.equal(output.code, "unsupported_update_command");
    assert.equal(output.details.target, "install");
    assert.match(output.hint, /cx update check --json/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
