import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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

console.log(JSON.stringify({
  latest: process.env.CODEXUS_FAKE_NPM_LATEST || "9.9.9",
  next: process.env.CODEXUS_FAKE_NPM_NEXT || "9.9.9-alpha.0"
}));
`,
  );
  await chmod(path, 0o755);
}

async function writeUpdateCache(cacheDir: string, fileName: "latest.json" | "next.json", checkedAt: string, latestVersion: string): Promise<void> {
  await mkdir(cacheDir, { recursive: true });
  await writeFile(
    join(cacheDir, fileName),
    `${JSON.stringify({
      schemaVersion: 1,
      packageName: "codexus",
      channel: fileName === "next.json" ? "next" : "stable",
      distTag: fileName === "next.json" ? "next" : "latest",
      latestVersion,
      checkedAt,
      registryError: null,
    }, null, 2)}\n`,
  );
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
    assert.equal(output.channel, "stable");
    assert.equal(output.distTag, "latest");
    assert.equal(output.latestVersion, "9.9.9");
    assert.equal(output.status, "available");
    assert.equal(output.updateAvailable, true);
    assert.equal(output.source, "registry");
    assert.equal(output.cacheState, "fresh");
    assert.equal(output.versionFresh, true);
    assert.equal(output.registryChecked, true);
    assert.equal(output.advisory, true);
    assert.equal(output.completionAuthority, false);
    assert.equal(output.installationMutated, false);
    assert.equal(output.primaryCommandCanFail, false);
    assert.equal(output.notification.status, "available");
    assert.equal(output.notification.shouldNotify, true);
    assert.equal(output.notification.reason, "update_available");
    assert.match(output.notification.message, /Codexus stable update available/);
    assert.match(output.notification.message, /npm install -g codexus/);
    assert.equal(output.notification.installationMutated, false);
    assert.equal(existsSync(marker), true);
    assert.equal(existsSync(join(cacheDir, "latest.json")), true);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("update check only reads next dist-tag through explicit channel opt-in", async () => {
  const cwd = await tempDir();
  try {
    const fakeNpm = join(cwd, "fake-npm.mjs");
    const marker = join(cwd, "npm-called");
    const cacheDir = join(cwd, "update-cache");
    await writeFakeNpm(fakeNpm);

    const result = runCli(cwd, ["update", "check", "--channel", "next", "--json"], {
      CODEXUS_UPDATE_NPM_COMMAND: fakeNpm,
      CODEXUS_UPDATE_CACHE_DIR: cacheDir,
      CODEXUS_FAKE_NPM_MARKER: marker,
      CODEXUS_FAKE_NPM_LATEST: "1.0.0",
      CODEXUS_FAKE_NPM_NEXT: "10.0.0-alpha.1",
    });
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.channel, "next");
    assert.equal(output.distTag, "next");
    assert.equal(output.latestVersion, "10.0.0-alpha.1");
    assert.equal(output.status, "available");
    assert.equal(output.source, "registry");
    assert.equal(output.cacheState, "fresh");
    assert.equal(output.versionFresh, true);
    assert.equal(output.registryChecked, true);
    assert.equal(output.advisory, true);
    assert.equal(output.installationMutated, false);
    assert.equal(output.notification.status, "available");
    assert.equal(output.notification.shouldNotify, true);
    assert.match(output.notification.message, /codexus@next/);
    assert.equal(existsSync(marker), true);
    assert.equal(existsSync(join(cacheDir, "next.json")), true);
    assert.equal(existsSync(join(cacheDir, "latest.json")), false);
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
    assert.equal(output.channel, "stable");
    assert.equal(output.distTag, "latest");
    assert.equal(output.status, "disabled");
    assert.equal(output.source, "disabled");
    assert.equal(output.cacheState, "missing");
    assert.equal(output.versionFresh, false);
    assert.equal(output.registryChecked, false);
    assert.equal(output.disabled, true);
    assert.equal(output.disabledReason, "env");
    assert.equal(output.notification.status, "silent");
    assert.equal(output.notification.shouldNotify, false);
    assert.equal(output.notification.reason, "disabled");
    assert.equal(existsSync(marker), false);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("disabled next-channel update check does not query npm", async () => {
  const cwd = await tempDir();
  try {
    const fakeNpm = join(cwd, "fake-npm.mjs");
    const marker = join(cwd, "npm-called");
    await writeFakeNpm(fakeNpm);

    const result = runCli(cwd, ["update", "check", "--channel", "next", "--json"], {
      CODEXUS_UPDATE_NPM_COMMAND: fakeNpm,
      CODEXUS_UPDATE_CACHE_DIR: join(cwd, "update-cache"),
      CODEXUS_FAKE_NPM_MARKER: marker,
      CODEXUS_NO_UPDATE_CHECK: "1",
    });
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.channel, "next");
    assert.equal(output.distTag, "next");
    assert.equal(output.status, "disabled");
    assert.equal(output.source, "disabled");
    assert.equal(output.cacheState, "missing");
    assert.equal(output.versionFresh, false);
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
    assert.equal(versionOutput.update.channel, "stable");
    assert.equal(versionOutput.update.distTag, "latest");
    assert.equal(versionOutput.update.registryChecked, false);
    assert.equal(versionOutput.update.cacheState, "missing");
    assert.equal(versionOutput.update.versionFresh, false);
    assert.equal(versionOutput.update.disabledReason, "cache_only_miss");
    assert.equal(versionOutput.update.notification.shouldNotify, false);
    assert.equal(versionOutput.update.notification.reason, "cache_only_unavailable");

    const doctor = runCli(cwd, ["doctor", "--json"], env);
    assert.equal(doctor.status, 0, doctor.stderr);
    const doctorOutput = JSON.parse(doctor.stdout);
    assert.equal(doctorOutput.schemaVersion, 1);
    assert.equal(doctorOutput.stability, "stable");
    assert.equal(doctorOutput.update.stability, "experimental");
    assert.equal(doctorOutput.update.channel, "stable");
    assert.equal(doctorOutput.update.distTag, "latest");
    assert.equal(doctorOutput.update.registryChecked, false);
    assert.equal(doctorOutput.update.cacheState, "missing");
    assert.equal(doctorOutput.update.versionFresh, false);
    assert.equal(doctorOutput.update.notification.shouldNotify, false);

    const session = runCli(cwd, ["session", "status", "--json"], env);
    assert.equal(session.status, 0, session.stderr);
    const sessionOutput = JSON.parse(session.stdout);
    assert.equal(sessionOutput.stability, "stable");
    assert.equal(sessionOutput.update.stability, "experimental");
    assert.equal(sessionOutput.update.channel, "stable");
    assert.equal(sessionOutput.update.distTag, "latest");
    assert.equal(sessionOutput.update.registryChecked, false);
    assert.equal(sessionOutput.update.cacheState, "missing");
    assert.equal(sessionOutput.update.versionFresh, false);
    assert.equal(sessionOutput.update.notification.shouldNotify, false);
    assert.equal(existsSync(marker), false);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("stable primary JSON commands do not report stale cache as current", async () => {
  const cwd = await tempDir();
  try {
    const fakeNpm = join(cwd, "fake-npm.mjs");
    const marker = join(cwd, "npm-called");
    const cacheDir = join(cwd, "update-cache");
    await writeFakeNpm(fakeNpm);
    await writeUpdateCache(cacheDir, "latest.json", "2000-01-01T00:00:00.000Z", "0.0.1");

    const result = runCli(cwd, ["version", "--json"], {
      CODEXUS_UPDATE_NPM_COMMAND: fakeNpm,
      CODEXUS_UPDATE_CACHE_DIR: cacheDir,
      CODEXUS_FAKE_NPM_MARKER: marker,
    });
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.update.source, "cache");
    assert.equal(output.update.cacheState, "stale");
    assert.equal(output.update.versionFresh, false);
    assert.equal(output.update.status, "disabled");
    assert.equal(output.update.updateAvailable, null);
    assert.equal(output.update.disabledReason, "cache_only_stale");
    assert.equal(output.update.latestVersion, "0.0.1");
    assert.equal(output.update.registryChecked, false);
    assert.equal(output.update.notification.shouldNotify, false);
    assert.equal(output.update.notification.reason, "cache_only_unavailable");
    assert.equal(existsSync(marker), false);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("stable primary text commands surface fresh cached update notices without querying npm", async () => {
  const cwd = await tempDir();
  try {
    const fakeNpm = join(cwd, "fake-npm.mjs");
    const marker = join(cwd, "npm-called");
    const cacheDir = join(cwd, "update-cache");
    await writeFakeNpm(fakeNpm);
    await writeUpdateCache(cacheDir, "latest.json", new Date().toISOString(), "9.9.9");

    const env = {
      CODEXUS_UPDATE_NPM_COMMAND: fakeNpm,
      CODEXUS_UPDATE_CACHE_DIR: cacheDir,
      CODEXUS_FAKE_NPM_MARKER: marker,
      CODEXUS_FAKE_NPM_EXIT: "13",
    };

    const version = runCli(cwd, ["version"], env);
    assert.equal(version.status, 0, version.stderr);
    assert.match(version.stdout, /Update: Codexus stable update available:/);
    assert.match(version.stdout, /npm install -g codexus/);

    const session = runCli(cwd, ["session", "status"], env);
    assert.equal(session.status, 0, session.stderr);
    assert.match(session.stdout, /Update: Codexus stable update available:/);

    assert.equal(existsSync(marker), false);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("short --version output never surfaces update notices or queries npm", async () => {
  const cwd = await tempDir();
  try {
    const fakeNpm = join(cwd, "fake-npm.mjs");
    const marker = join(cwd, "npm-called");
    const cacheDir = join(cwd, "update-cache");
    await writeFakeNpm(fakeNpm);
    await writeUpdateCache(cacheDir, "latest.json", new Date().toISOString(), "9.9.9");

    const result = runCli(cwd, ["--version"], {
      CODEXUS_UPDATE_NPM_COMMAND: fakeNpm,
      CODEXUS_UPDATE_CACHE_DIR: cacheDir,
      CODEXUS_FAKE_NPM_MARKER: marker,
      CODEXUS_FAKE_NPM_EXIT: "13",
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout.trim(), /^\d+\.\d+\.\d+/);
    assert.doesNotMatch(result.stdout, /Update:/);
    assert.equal(existsSync(marker), false);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("stable primary text commands stay quiet for stale cached updates", async () => {
  const cwd = await tempDir();
  try {
    const fakeNpm = join(cwd, "fake-npm.mjs");
    const marker = join(cwd, "npm-called");
    const cacheDir = join(cwd, "update-cache");
    await writeFakeNpm(fakeNpm);
    await writeUpdateCache(cacheDir, "latest.json", "2000-01-01T00:00:00.000Z", "9.9.9");

    const result = runCli(cwd, ["version"], {
      CODEXUS_UPDATE_NPM_COMMAND: fakeNpm,
      CODEXUS_UPDATE_CACHE_DIR: cacheDir,
      CODEXUS_FAKE_NPM_MARKER: marker,
      CODEXUS_FAKE_NPM_EXIT: "13",
    });
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stdout, /Update:/);
    assert.equal(existsSync(marker), false);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("update check does not use stale cache to claim current when registry is unavailable", async () => {
  const cwd = await tempDir();
  try {
    const fakeNpm = join(cwd, "fake-npm.mjs");
    const marker = join(cwd, "npm-called");
    const cacheDir = join(cwd, "update-cache");
    await writeFakeNpm(fakeNpm);
    await writeUpdateCache(cacheDir, "latest.json", "2000-01-01T00:00:00.000Z", "0.0.1");

    const result = runCli(cwd, ["update", "check", "--json"], {
      CODEXUS_UPDATE_NPM_COMMAND: fakeNpm,
      CODEXUS_UPDATE_CACHE_DIR: cacheDir,
      CODEXUS_FAKE_NPM_MARKER: marker,
      CODEXUS_FAKE_NPM_EXIT: "13",
    });
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.source, "cache");
    assert.equal(output.cacheState, "stale");
    assert.equal(output.versionFresh, false);
    assert.equal(output.status, "unknown");
    assert.equal(output.updateAvailable, null);
    assert.equal(output.latestVersion, "0.0.1");
    assert.equal(output.registryChecked, true);
    assert.equal(output.error.kind, "registry_unavailable");
    assert.equal(output.notification.status, "silent");
    assert.equal(output.notification.shouldNotify, false);
    assert.equal(existsSync(marker), true);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("update check rejects invalid channels with a truthful error", async () => {
  const cwd = await tempDir();
  try {
    const result = runCli(cwd, ["update", "check", "--channel", "beta", "--json"], {
      CODEXUS_NO_UPDATE_CHECK: "1",
    });
    assert.equal(result.status, 1);
    const output = JSON.parse(result.stdout);
    assert.equal(output.code, "invalid_update_channel");
    assert.equal(output.details.target, "beta");
    assert.match(output.hint, /--channel stable/);
    assert.match(output.hint, /--channel next/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("update check rejects missing channel values instead of falling back to stable", async () => {
  const cwd = await tempDir();
  try {
    const result = runCli(cwd, ["update", "check", "--channel", "--json"], {
      CODEXUS_NO_UPDATE_CHECK: "1",
    });
    assert.equal(result.status, 1);
    const output = JSON.parse(result.stdout);
    assert.equal(output.code, "invalid_update_channel");
    assert.equal(output.details.target, "missing");
    assert.match(output.hint, /--channel stable/);
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
    assert.match(output.hint, /--channel next/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
