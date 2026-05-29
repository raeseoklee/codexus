import test from "node:test";
import assert from "node:assert/strict";
import { lstat, mkdtemp, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(".");

async function tempDir(): Promise<string> {
  return await mkdtemp(join(tmpdir(), "codexus-install-"));
}

test("install.sh installs local source and links canonical bins", async () => {
  const cwd = await tempDir();
  const installDir = join(cwd, "share", "codexus");
  const binDir = join(cwd, "bin");
  try {
    const install = spawnSync("sh", [resolve("install.sh")], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        CODEXUS_SOURCE_DIR: root,
        CODEXUS_INSTALL_DIR: installDir,
        CODEXUS_BIN_DIR: binDir,
        CODEXUS_INSTALL_CODEX_SKILL: "0",
      },
    });
    assert.equal(install.status, 0, install.stderr);
    assert.match(install.stdout, /Installed Codexus/);

    for (const name of ["cx", "codexus", "chx"]) {
      const stat = await lstat(join(binDir, name));
      assert.equal(stat.isSymbolicLink(), true);
    }

    const help = spawnSync(join(binDir, "cx"), ["--help"], {
      cwd,
      encoding: "utf8",
    });
    assert.equal(help.status, 0, help.stderr);
    assert.match(help.stdout, /Codexus/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
