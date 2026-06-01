import test from "node:test";
import assert from "node:assert/strict";
import { lstat, mkdir, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(".");

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

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
    assert.match(install.stdout, new RegExp(`Installed Codexus ${escapeRegExp(pkg.version)}`));
    assert.match(install.stdout, new RegExp(`Linked cx and codexus into ${escapeRegExp(binDir)}`));
    assert.match(install.stdout, new RegExp(`Try: ${escapeRegExp(join(binDir, "cx"))} schema check --json`));

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

test("install.sh defaults to the stable npm channel", async () => {
  const text = await readFile(resolve("install.sh"), "utf8");
  assert.match(text, /CODEXUS_NPM_SPEC:-codexus}/);
  assert.doesNotMatch(text, /CODEXUS_NPM_SPEC:-codexus@next}/);
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
  const { compareVersions, assertLatestAtLeastNext, publishPlanForArgs } = await import("../scripts/publish-next.mjs");
  assert.ok(compareVersions("0.1.0-alpha.2", "0.1.0-alpha.1") > 0);
  assert.ok(compareVersions("0.1.0", "0.1.0-alpha.9") > 0);
  assert.doesNotThrow(() => assertLatestAtLeastNext({ latest: "0.1.0-alpha.2", next: "0.1.0-alpha.2" }));
  assert.throws(() => assertLatestAtLeastNext({ latest: "0.1.0-alpha.1", next: "0.1.0-alpha.2" }), /latest 0\.1\.0-alpha\.1 is older than next 0\.1\.0-alpha\.2/);

  const nextPlan = publishPlanForArgs([], { name: "codexus", version: "0.1.0-alpha.5" });
  assert.equal(nextPlan.mode, "next");
  assert.equal(nextPlan.syncDistTags, true);
  assert.deepEqual(nextPlan.expectedTags, { latest: "0.1.0-alpha.5", next: "0.1.0-alpha.5" });
  assert.deepEqual(nextPlan.publishArgs, ["publish", "--access", "public", "--tag", "next"]);

  const trustedNextPlan = publishPlanForArgs(["--no-dist-tag-sync"], { name: "codexus", version: "0.1.0-alpha.5" });
  assert.equal(trustedNextPlan.syncDistTags, false);
  assert.deepEqual(trustedNextPlan.expectedTags, { next: "0.1.0-alpha.5" });
  assert.deepEqual(trustedNextPlan.publishArgs, ["publish", "--access", "public", "--tag", "next"]);

  const stablePlan = publishPlanForArgs(["--stable"], { name: "codexus", version: "0.1.0" });
  assert.equal(stablePlan.mode, "stable");
  assert.equal(stablePlan.syncDistTags, true);
  assert.deepEqual(stablePlan.expectedTags, { latest: "0.1.0", next: "0.1.0" });
  assert.deepEqual(stablePlan.publishArgs, ["publish", "--access", "public"]);
  const trustedStablePlan = publishPlanForArgs(["--stable", "--no-dist-tag-sync"], { name: "codexus", version: "0.1.0" });
  assert.equal(trustedStablePlan.syncDistTags, false);
  assert.deepEqual(trustedStablePlan.expectedTags, { latest: "0.1.0" });
  assert.throws(
    () => publishPlanForArgs(["--stable"], { name: "codexus", version: "0.1.0-alpha.5" }),
    /stable publish requires a non-prerelease package version/
  );
  assert.doesNotThrow(() => publishPlanForArgs(["--stable", "--dry-run"], { name: "codexus", version: "0.1.0-alpha.5" }));
});

test("release workflow is wired for trusted publishing and stable-only tag publish", async () => {
  const workflow = await readFile(resolve(".github/workflows/release.yml"), "utf8");
  assert.match(workflow, /id-token:\s*write/);
  assert.match(workflow, /registry-url:\s*"https:\/\/registry\.npmjs\.org"/);
  assert.match(workflow, /npm run publish:stable/);
  assert.match(workflow, /npm run publish:next/);
  assert.match(workflow, /--no-dist-tag-sync/);
  assert.match(workflow, /Prerelease tags must publish via workflow_dispatch mode=next/);
  assert.match(workflow, /actions\/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd/);
  assert.match(workflow, /actions\/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e/);
  assert.doesNotMatch(workflow, /actions\/checkout@v\d/);
  assert.doesNotMatch(workflow, /actions\/setup-node@v\d/);
});

test("ci verifies the minimum supported Node version", async () => {
  const workflow = await readFile(resolve(".github/workflows/ci.yml"), "utf8");
  assert.match(workflow, /name:\s*Node 22 compatibility/);
  assert.match(workflow, /node-version:\s*"22"/);
  assert.match(workflow, /npm run package:smoke/);
  assert.match(workflow, /actions\/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd/);
  assert.match(workflow, /actions\/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e/);
});
