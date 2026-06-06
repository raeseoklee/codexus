import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { buildReleaseIntegrityReport } from "../src/release/integrity.ts";

const root = resolve(".");

async function tempDir(): Promise<string> {
  return await mkdtemp(join(tmpdir(), "codexus-release-integrity-"));
}

async function writeFixture(rootDir: string, options: { installDefault?: "stable" | "next"; evidence?: boolean } = {}): Promise<void> {
  const installDefault = options.installDefault ?? "stable";
  const evidence = options.evidence ?? true;
  await mkdir(join(rootDir, ".github", "workflows"), { recursive: true });
  await mkdir(join(rootDir, "docs", "ko", "release-evidence"), { recursive: true });
  await mkdir(join(rootDir, "docs", "release-evidence"), { recursive: true });
  await writeFile(
    join(rootDir, "package.json"),
    JSON.stringify(
      {
        name: "codexus-fixture",
        version: "9.9.9",
        repository: { type: "git", url: "git+https://github.com/raeseoklee/codexus.git" },
      },
      null,
      2
    )
  );
  await writeFile(
    join(rootDir, "install.sh"),
    [
      "#!/bin/sh",
      `package_spec="\${CODEXUS_NPM_SPEC:-${installDefault === "stable" ? "codexus" : "codexus@next"}}"`,
      'expected_version="${CODEXUS_EXPECTED_VERSION:-}"',
      'if [ -n "$expected_version" ]; then echo "$expected_version" >/dev/null; fi',
      "",
    ].join("\n")
  );
  await writeFile(
    join(rootDir, ".github", "workflows", "release.yml"),
    [
      "name: Release",
      "permissions:",
      "  contents: read",
      "  id-token: write",
      "jobs:",
      "  publish:",
      "    permissions:",
      "      contents: read",
      "      id-token: write",
      "    steps:",
      "      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd",
      "      - uses: actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e",
      '        with: { registry-url: "https://registry.npmjs.org" }',
      "      - run: npm run publish:stable -- --no-dist-tag-sync",
      '      - run: echo "Prerelease tags must publish via workflow_dispatch mode=next"',
      "  github-release:",
      "    permissions:",
      "      contents: write",
      "    steps:",
      "      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd",
      "      - shell: bash",
      "        run: |",
      '          gh release edit "$GITHUB_REF_NAME" --latest',
      '          gh release upload "$GITHUB_REF_NAME" install.sh --clobber',
      '          gh release create "$GITHUB_REF_NAME" install.sh --verify-tag --latest',
      "",
    ].join("\n")
  );
  if (evidence) {
    await writeFile(join(rootDir, "docs", "release-evidence", "9.9.9.md"), "# 9.9.9\n");
    await writeFile(join(rootDir, "docs", "ko", "release-evidence", "9.9.9.md"), "# 9.9.9\n");
  }
}

test("release integrity passes for local source release wiring", () => {
  const report = buildReleaseIntegrityReport(root, { gate: true });
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.stability, "stable");
  assert.equal(report.releaseIntegrity.status, "pass");
  assert.equal(report.gate.status, "passed");
  assert.equal(report.releaseIntegrity.installScript.defaultChannel, "stable");
  assert.equal(report.releaseIntegrity.workflow.installerAssetAttached, true);
  assert.ok(report.derivableFacts.some((fact) => fact.kind === "installer_expected_version_guard"));
  assert.ok(report.derivableFacts.some((fact) => fact.kind === "release_workflow_installer_asset"));
  assert.ok(report.informationalUnknowns.some((unknown) => unknown.kind === "github_release_not_checked"));
});

test("release integrity gates installer prerelease defaults", async () => {
  const cwd = await tempDir();
  try {
    await writeFixture(cwd, { installDefault: "next" });
    const report = buildReleaseIntegrityReport(cwd, { gate: true });
    assert.equal(report.releaseIntegrity.status, "fail");
    assert.equal(report.gate.status, "failed");
    assert.equal(report.gate.exitCode, 1);
    assert.ok(report.evidenceGaps.some((gap) => gap.kind === "installer_default_channel_not_stable"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("release integrity gates missing release evidence docs", async () => {
  const cwd = await tempDir();
  try {
    await writeFixture(cwd, { evidence: false });
    const report = buildReleaseIntegrityReport(cwd, { gate: true });
    assert.equal(report.releaseIntegrity.status, "fail");
    assert.ok(report.evidenceGaps.some((gap) => gap.kind === "release_evidence_missing"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("release integrity gates mutable third-party action refs", async () => {
  const cwd = await tempDir();
  try {
    await writeFixture(cwd);
    const workflowPath = join(cwd, ".github", "workflows", "release.yml");
    const workflow = readFileSync(workflowPath, "utf8").replace(
      "      - uses: actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e",
      [
        "      - uses: pnpm/action-setup@v4",
        "      - uses: actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e",
      ].join("\n")
    );
    writeFileSync(workflowPath, workflow);

    const report = buildReleaseIntegrityReport(cwd, { gate: true });
    assert.equal(report.releaseIntegrity.status, "fail");
    assert.equal(report.gate.status, "failed");
    const gap = report.evidenceGaps.find((item) => item.kind === "release_workflow_unpinned_action");
    assert.ok(gap);
    assert.ok(gap.actions?.includes("pnpm/action-setup@v4"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("release integrity live sign-off compares gh latest without relying on isLatest", async () => {
  const cwd = await tempDir();
  try {
    await writeFixture(cwd);
    const runner = (command: string, args: string[]) => {
      if (command === "gh" && args[0] === "release" && args[1] === "view" && args[2] === "v9.9.9") {
        return { status: 0, stdout: JSON.stringify({ tagName: "v9.9.9", url: "https://example.test/releases/v9.9.9" }), stderr: "" };
      }
      if (command === "gh" && args[0] === "release" && args[1] === "view") {
        return { status: 0, stdout: JSON.stringify({ tagName: "v9.9.9", url: "https://example.test/releases/v9.9.9" }), stderr: "" };
      }
      if (command === "gh" && args[0] === "release" && args[1] === "download") {
        const dir = args[args.indexOf("--dir") + 1];
        writeFileSync(join(dir, "install.sh"), readFileSync(join(cwd, "install.sh")));
        return { status: 0, stdout: "", stderr: "" };
      }
      if (command === "npm" && args[0] === "view") {
        return { status: 0, stdout: JSON.stringify({ latest: "9.9.9" }), stderr: "" };
      }
      return { status: 1, stdout: "", stderr: `unexpected command ${command} ${args.join(" ")}` };
    };
    const report = buildReleaseIntegrityReport(cwd, { gate: true, live: true, commandRunner: runner });
    assert.equal(report.stability, "experimental");
    assert.equal(report.releaseIntegrity.status, "pass");
    assert.equal(report.gate.status, "passed");
    assert.equal(report.releaseIntegrity.githubRelease.isLatest, true);
    assert.equal(report.releaseIntegrity.npm.latest, "9.9.9");
    assert.ok(report.derivableFacts.some((fact) => fact.kind === "github_release_asset_matches_local"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("release check CLI emits stable local-mode JSON and gate result", () => {
  const result = spawnSync(process.execPath, ["src/cli/main.ts", "release", "check", "--gate", "--json"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout) as {
    stability: string;
    releaseIntegrity: { status: string };
    gate: { status: string };
  };
  assert.equal(payload.stability, "stable");
  assert.equal(payload.releaseIntegrity.status, "pass");
  assert.equal(payload.gate.status, "passed");
});

test("release check --live keeps live sign-off fields experimental", async () => {
  const cwd = await tempDir();
  try {
    await writeFixture(cwd);
    const result = spawnSync(process.execPath, [resolve(root, "src/cli/main.ts"), "release", "check", "--cwd", cwd, "--live", "--json"], {
      cwd: root,
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    const payload = JSON.parse(result.stdout) as { stability: string; live: boolean };
    assert.equal(payload.stability, "experimental");
    assert.equal(payload.live, true);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
