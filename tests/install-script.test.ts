import test from "node:test";
import assert from "node:assert/strict";
import { lstat, mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(".");

async function tempDir(): Promise<string> {
  return await mkdtemp(join(tmpdir(), "codexus-install-"));
}

test("install.sh delegates to npm install and links canonical bins", async () => {
  const cwd = await tempDir();
  const npmPrefix = join(cwd, "prefix");
  const binDir = join(cwd, "bin");
  const packDir = join(cwd, "pack");
  try {
    await mkdir(packDir, { recursive: true });
    const pack = spawnSync("npm", ["pack", "--pack-destination", packDir], {
      cwd: root,
      encoding: "utf8",
    });
    assert.equal(pack.status, 0, pack.stderr ?? pack.error?.message);
    const tarball = (await readdir(packDir)).find((name) => name.endsWith(".tgz"));
    assert.ok(tarball);

    const install = spawnSync("sh", [resolve("install.sh")], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        CODEXUS_NPM_SPEC: join(packDir, tarball),
        CODEXUS_NPM_PREFIX: npmPrefix,
        CODEXUS_BIN_DIR: binDir,
        CODEXUS_INSTALL_CODEX_SKILL: "0",
      },
    });
    assert.equal(install.status, 0, install.stderr ?? install.error?.message);
    assert.match(install.stdout, /Installed Codexus/);

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
