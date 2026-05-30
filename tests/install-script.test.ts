import test from "node:test";
import assert from "node:assert/strict";
import { lstat, mkdir, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(".");

async function tempDir(): Promise<string> {
  return await mkdtemp(join(tmpdir(), "codexus-install-"));
}

async function packTarball(packDir: string): Promise<string> {
  await mkdir(packDir, { recursive: true });
  const pack = spawnSync("npm", ["pack", "--pack-destination", packDir], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      npm_config_dry_run: "false",
      NPM_CONFIG_DRY_RUN: "false",
    },
  });
  assert.equal(pack.status, 0, pack.stderr ?? pack.error?.message);
  const tarball = (await readdir(packDir)).find((name) => name.endsWith(".tgz"));
  assert.ok(tarball);
  return join(packDir, tarball);
}

test("install.sh delegates to npm install and links canonical bins", async () => {
  const cwd = await tempDir();
  const npmPrefix = join(cwd, "prefix");
  const binDir = join(cwd, "bin");
  const packDir = join(cwd, "pack");
  try {
    const tarball = await packTarball(packDir);
    const pkg = JSON.parse(await readFile(resolve("package.json"), "utf8")) as { version: string };

    const install = spawnSync("sh", [resolve("install.sh")], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        npm_config_dry_run: "false",
        NPM_CONFIG_DRY_RUN: "false",
        CODEXUS_NPM_SPEC: tarball,
        CODEXUS_NPM_PREFIX: npmPrefix,
        CODEXUS_BIN_DIR: binDir,
        CODEXUS_INSTALL_CODEX_SKILL: "0",
        CODEXUS_EXPECTED_VERSION: pkg.version,
      },
    });
    assert.equal(install.status, 0, install.stderr ?? install.error?.message);
    assert.match(install.stdout, new RegExp(`Installed Codexus ${pkg.version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));

    for (const name of ["cx", "codexus"]) {
      const stat = await lstat(join(binDir, name));
      assert.equal(stat.isSymbolicLink(), true);
    }

    const help = spawnSync(join(binDir, "cx"), ["--help"], {
      cwd,
      encoding: "utf8",
    });
    assert.equal(help.status, 0, help.stderr ?? help.error?.message);
    assert.match(help.stdout, /Codexus/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("npm global install postinstall installs the Codex skill adapter", async () => {
  const cwd = await tempDir();
  const npmPrefix = join(cwd, "prefix");
  const codexHome = join(cwd, "codex-home");
  const packDir = join(cwd, "pack");
  try {
    await mkdir(codexHome, { recursive: true });
    const tarball = await packTarball(packDir);

    const install = spawnSync("npm", ["install", "-g", tarball, "--prefix", npmPrefix], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        npm_config_dry_run: "false",
        NPM_CONFIG_DRY_RUN: "false",
        CODEX_HOME: codexHome,
      },
    });
    assert.equal(install.status, 0, install.stderr ?? install.error?.message);
    const stat = await lstat(join(codexHome, "skills", "codexus", "SKILL.md"));
    assert.equal(stat.isFile(), true);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("npm local install postinstall does not mutate Codex home by default", async () => {
  const cwd = await tempDir();
  const project = join(cwd, "project");
  const codexHome = join(cwd, "codex-home");
  const packDir = join(cwd, "pack");
  try {
    await mkdir(project, { recursive: true });
    await mkdir(codexHome, { recursive: true });
    const tarball = await packTarball(packDir);

    const install = spawnSync("npm", ["install", tarball, "--prefix", project], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        npm_config_dry_run: "false",
        NPM_CONFIG_DRY_RUN: "false",
        CODEX_HOME: codexHome,
      },
    });
    assert.equal(install.status, 0, install.stderr ?? install.error?.message);
    await assert.rejects(lstat(join(codexHome, "skills", "codexus", "SKILL.md")), { code: "ENOENT" });
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("publish helper enforces latest not older than next", async () => {
  const { compareVersions, assertLatestAtLeastNext } = await import("../scripts/publish-next.mjs");
  assert.ok(compareVersions("0.1.0-alpha.2", "0.1.0-alpha.1") > 0);
  assert.ok(compareVersions("0.1.0", "0.1.0-alpha.9") > 0);
  assert.doesNotThrow(() => assertLatestAtLeastNext({ latest: "0.1.0-alpha.2", next: "0.1.0-alpha.2" }));
  assert.throws(() => assertLatestAtLeastNext({ latest: "0.1.0-alpha.1", next: "0.1.0-alpha.2" }), /latest 0\.1\.0-alpha\.1 is older than next 0\.1\.0-alpha\.2/);
});
