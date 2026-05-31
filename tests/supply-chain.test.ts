import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const cli = resolve("src/cli/main.ts");

async function tempDir(): Promise<string> {
  return await mkdtemp(join(tmpdir(), "codexus-supply-chain-"));
}

function runCli(cwd: string, args: string[]) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env },
  });
}

async function writePackage(cwd: string, pkg: Record<string, unknown>): Promise<void> {
  await writeFile(join(cwd, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`);
}

async function writeBasicPackageFiles(cwd: string): Promise<void> {
  await mkdir(join(cwd, "dist"), { recursive: true });
  await writeFile(join(cwd, "dist", "index.js"), "console.log('ok');\n");
  await writeFile(join(cwd, "README.md"), "# package\n");
  await writeFile(join(cwd, "LICENSE"), "MIT\n");
}

function basePackage(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: "fixture-package",
    version: "1.0.0",
    type: "module",
    files: ["dist", "README.md", "LICENSE"],
    bin: { fixture: "dist/index.js" },
    ...extra,
  };
}

test("supply-chain check is report-only when no policy is declared", async () => {
  const cwd = await tempDir();
  try {
    await writeBasicPackageFiles(cwd);
    await writePackage(cwd, basePackage());

    const result = runCli(cwd, ["supply-chain", "check", "--json"]);
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.stability, "stable");
    assert.equal(output.lifecycleExecuted, false);
    assert.equal(output.projectionMode, "static");
    assert.equal(output.policy.declared, false);
    assert.equal(output.supplyChain.policyMode, "report_only");
    assert.equal(output.supplyChain.status, "pass");
    assert.deepEqual(output.evidenceGaps, []);
    assert.ok(output.derivableFacts.some((fact: { kind: string }) => fact.kind === "policy_missing_report_only"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("supply-chain policy validation rejects wrong types and unknown keys without crashing", async () => {
  const cwd = await tempDir();
  try {
    await writeBasicPackageFiles(cwd);
    await writePackage(cwd, basePackage({
      codexus: {
        supplyChain: {
          runtimeDependenciesMax: "zero",
          mystery: true,
        },
      },
    }));

    const result = runCli(cwd, ["supply-chain", "check", "--gate", "--json"]);
    assert.equal(result.status, 1);
    const output = JSON.parse(result.stdout);
    assert.equal(output.policy.declared, true);
    assert.equal(output.policy.validation.valid, false);
    assert.ok(output.policy.validation.errors.includes("runtimeDependenciesMax:expected_non_negative_integer"));
    assert.ok(output.policy.validation.errors.includes("mystery:unknown_key"));
    assert.equal(output.supplyChain.policyMode, "invalid");
    assert.equal(output.gate.status, "blocked");
    assert.ok(output.blockingUnknowns.some((item: { kind: string }) => item.kind === "policy_invalid"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("schema validate supports supply-chain policy artifacts", async () => {
  const cwd = await tempDir();
  try {
    const validPolicy = join(cwd, "policy.json");
    await writeFile(validPolicy, `${JSON.stringify({
      runtimeDependenciesMax: 0,
      allowedLifecycleScripts: [],
      allowedDevDependencyInstallScripts: [],
      allowRuntimeNetworkImports: [],
      forbiddenPackageFiles: [],
      requiredPackageFiles: ["package.json"],
      binTargetsMustBeBuiltArtifacts: true,
      lockfileIntegrityRequired: false,
    }, null, 2)}\n`);
    const valid = runCli(cwd, ["schema", "validate", "--type", "supply-chain-policy", "--file", validPolicy, "--json"]);
    assert.equal(valid.status, 0, valid.stderr);
    assert.equal(JSON.parse(valid.stdout).ok, true);

    const invalidPolicy = join(cwd, "invalid-policy.json");
    await writeFile(invalidPolicy, `${JSON.stringify({ runtimeDependenciesMax: -1, mystery: true }, null, 2)}\n`);
    const invalid = runCli(cwd, ["schema", "validate", "--type", "supply-chain-policy", "--file", invalidPolicy, "--json"]);
    assert.equal(invalid.status, 1);
    const invalidOutput = JSON.parse(invalid.stdout);
    assert.equal(invalidOutput.ok, false);
    assert.ok(invalidOutput.validation.errors.includes("runtimeDependenciesMax:expected_non_negative_integer"));
    assert.ok(invalidOutput.validation.errors.includes("mystery:unknown_key"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("supply-chain check does not execute prepack or prepare lifecycle scripts", async () => {
  const cwd = await tempDir();
  try {
    await writeBasicPackageFiles(cwd);
    await writePackage(cwd, basePackage({
      scripts: {
        prepack: "node -e \"require('fs').writeFileSync('prepack-ran','yes')\"",
        prepare: "node -e \"require('fs').writeFileSync('prepare-ran','yes')\"",
      },
    }));

    const result = runCli(cwd, ["supply-chain", "check", "--json"]);
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.lifecycleExecuted, false);
    assert.equal(output.projectionMode, "static");
    assert.equal(existsSync(join(cwd, "prepack-ran")), false);
    assert.equal(existsSync(join(cwd, "prepare-ran")), false);
    const lifecycleFact = output.derivableFacts.find((fact: { kind: string }) => fact.kind === "package_lifecycle_scripts");
    assert.deepEqual(lifecycleFact.scripts, ["prepack", "prepare"]);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("supply-chain --gate is driven only by evidence gaps and blocking unknowns", async () => {
  const cwd = await tempDir();
  try {
    await writeBasicPackageFiles(cwd);
    await writePackage(cwd, basePackage({
      codexus: {
        supplyChain: {
          runtimeDependenciesMax: 0,
          allowedLifecycleScripts: [],
          allowedDevDependencyInstallScripts: [],
          allowRuntimeNetworkImports: [],
          forbiddenPackageFiles: [],
          requiredPackageFiles: ["dist/index.js", "README.md", "LICENSE", "package.json"],
          binTargetsMustBeBuiltArtifacts: true,
          lockfileIntegrityRequired: false,
        },
      },
    }));

    const result = runCli(cwd, ["supply-chain", "check", "--gate", "--json"]);
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.supplyChain.status, "pass");
    assert.equal(output.gate.status, "passed");
    assert.ok(output.informationalUnknowns.some((item: { kind: string }) => item.kind === "known_cve_status"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("secret patterns in package artifacts gate even without declared policy", async () => {
  const cwd = await tempDir();
  try {
    await writeBasicPackageFiles(cwd);
    await writeFile(join(cwd, "dist", "index.js"), "console.log('npm_1234567890abcdef');\n");
    await writePackage(cwd, basePackage());

    const result = runCli(cwd, ["supply-chain", "check", "--gate", "--json"]);
    assert.equal(result.status, 1);
    const output = JSON.parse(result.stdout);
    assert.equal(output.supplyChain.policyMode, "report_only");
    assert.equal(output.gate.status, "failed");
    const gap = output.evidenceGaps.find((item: { kind: string }) => item.kind === "secret_pattern_in_package_artifact");
    assert.equal(gap.policy, "built-in:secret-pattern-leak");
    assert.ok(gap.files.includes("dist/index.js"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("secret-like variable assignments do not trigger the built-in secret gate", async () => {
  const cwd = await tempDir();
  try {
    await writeBasicPackageFiles(cwd);
    await writeFile(join(cwd, "dist", "index.js"), [
      "export function auth(req) {",
      "  const token = req.headers.authorization;",
      "  const secret = computeSessionSecret(req);",
      "  return { token, secret };",
      "}",
      "",
    ].join("\n"));
    await writePackage(cwd, basePackage());

    const result = runCli(cwd, ["supply-chain", "check", "--gate", "--json"]);
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.gate.status, "passed");
    assert.equal(output.evidenceGaps.some((item: { kind: string }) => item.kind === "secret_pattern_in_package_artifact"), false);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("declared policy promotes package-file facts into gateable findings", async () => {
  const cwd = await tempDir();
  try {
    await mkdir(join(cwd, "src"), { recursive: true });
    await writeFile(join(cwd, "src", "index.js"), "console.log('source');\n");
    await writeBasicPackageFiles(cwd);
    await writePackage(cwd, basePackage({
      files: ["dist", "src", "README.md", "LICENSE"],
      codexus: {
        supplyChain: {
          runtimeDependenciesMax: 0,
          allowedLifecycleScripts: [],
          allowedDevDependencyInstallScripts: [],
          allowRuntimeNetworkImports: [],
          forbiddenPackageFiles: ["src/**"],
          requiredPackageFiles: ["dist/index.js", "package.json"],
          binTargetsMustBeBuiltArtifacts: true,
          lockfileIntegrityRequired: false,
        },
      },
    }));

    const result = runCli(cwd, ["supply-chain", "check", "--gate", "--json"]);
    assert.equal(result.status, 1);
    const output = JSON.parse(result.stdout);
    assert.equal(output.gate.status, "failed");
    const gap = output.evidenceGaps.find((item: { kind: string }) => item.kind === "forbidden_package_file");
    assert.ok(gap.files.includes("src/index.js"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Codexus package dogfoods supply-chain report without false-positive gate gaps", () => {
  const result = runCli(resolve("."), ["supply-chain", "check", "--gate", "--json"]);
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.policy.declared, true);
  assert.equal(output.policy.validation.valid, true);
  assert.equal(output.supplyChain.status, "pass");
  assert.equal(output.gate.status, "passed");
  assert.equal(output.lifecycleExecuted, false);
  assert.equal(output.projectionMode, "static");
  assert.deepEqual(output.evidenceGaps, []);
});
