import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const cli = resolve("src/cli/main.ts");

async function tempDir(): Promise<string> {
  return await mkdtemp(join(tmpdir(), "codexus-architecture-"));
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

async function writeSource(cwd: string, path: string, content: string): Promise<void> {
  await mkdir(join(cwd, "src"), { recursive: true });
  await writeFile(join(cwd, path), content);
}

function architecturePolicy(extraRule: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    type: "codexus.architecture.policy",
    rules: [
      {
        id: "no-runtime-package-imports-in-src",
        kind: "forbidden-import",
        from: ["src/**"],
        forbidden: ["**"],
        allow: ["node:**", "./**", "../**"],
        ...extraRule,
      },
    ],
  };
}

test("architecture check is report-only when no policy is declared", async () => {
  const cwd = await tempDir();
  try {
    await writePackage(cwd, { name: "fixture", version: "1.0.0", type: "module" });
    await writeSource(cwd, "src/index.ts", "import { readFileSync } from 'node:fs';\nexport const ok = readFileSync;\n");

    const result = runCli(cwd, ["architecture", "check", "--json"]);
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.stability, "stable");
    assert.equal(output.scanMode, "static");
    assert.equal(output.scanAccuracy, "best_effort");
    assert.equal(output.policy.declared, false);
    assert.equal(output.architecture.policyMode, "report_only");
    assert.equal(output.architecture.status, "pass");
    assert.equal(output.gate.status, "not_requested");
    assert.deepEqual(output.evidenceGaps, []);
    assert.ok(output.derivableFacts.some((fact: { kind: string }) => fact.kind === "policy_missing_report_only"));
    assert.ok(output.heuristicClaims.some((claim: { kind: string }) => claim.kind === "broad_layering_rule_deferred"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("architecture policy validation rejects malformed rules without crashing", async () => {
  const cwd = await tempDir();
  try {
    await writePackage(cwd, {
      name: "fixture",
      version: "1.0.0",
      codexus: {
        architecture: {
          schemaVersion: 2,
          mystery: true,
          rules: [{ id: "", kind: "layering", from: "src/**" }],
        },
      },
    });

    const result = runCli(cwd, ["architecture", "check", "--gate", "--json"]);
    assert.equal(result.status, 1);
    const output = JSON.parse(result.stdout);
    assert.equal(output.policy.declared, true);
    assert.equal(output.policy.validation.valid, false);
    assert.ok(output.policy.validation.errors.includes("schemaVersion:not_1"));
    assert.ok(output.policy.validation.errors.includes("mystery:unknown_key"));
    assert.ok(output.policy.validation.errors.includes("rules[0].kind:unsupported_rule_kind"));
    assert.equal(output.architecture.policyMode, "invalid");
    assert.equal(output.gate.status, "blocked");
    assert.ok(output.blockingUnknowns.some((item: { kind: string }) => item.kind === "policy_invalid"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("schema validate supports architecture policy artifacts", async () => {
  const cwd = await tempDir();
  try {
    const validPolicy = join(cwd, "architecture-policy.json");
    await writeFile(validPolicy, `${JSON.stringify(architecturePolicy(), null, 2)}\n`);
    const valid = runCli(cwd, ["schema", "validate", "--type", "architecture-policy", "--file", validPolicy, "--json"]);
    assert.equal(valid.status, 0, valid.stderr);
    assert.equal(JSON.parse(valid.stdout).ok, true);

    const invalidPolicy = join(cwd, "invalid-architecture-policy.json");
    await writeFile(invalidPolicy, `${JSON.stringify({ rules: [{ kind: "forbidden-import", from: [] }] }, null, 2)}\n`);
    const invalid = runCli(cwd, ["schema", "validate", "--type", "architecture-policy", "--file", invalidPolicy, "--json"]);
    assert.equal(invalid.status, 1);
    const invalidOutput = JSON.parse(invalid.stdout);
    assert.equal(invalidOutput.ok, false);
    assert.ok(invalidOutput.validation.errors.includes("rules[0].id:expected_non_empty_string"));
    assert.ok(invalidOutput.validation.errors.includes("rules[0].forbidden:expected_non_empty_string_array"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("architecture --gate fails only on declared forbidden imports", async () => {
  const cwd = await tempDir();
  try {
    await writePackage(cwd, {
      name: "fixture",
      version: "1.0.0",
      type: "module",
      codexus: { architecture: architecturePolicy() },
    });
    await writeSource(cwd, "src/index.ts", "import lodash from 'lodash';\nexport default lodash;\n");

    const result = runCli(cwd, ["architecture", "check", "--gate", "--json"]);
    assert.equal(result.status, 1);
    const output = JSON.parse(result.stdout);
    assert.equal(output.architecture.status, "fail");
    assert.equal(output.gate.status, "failed");
    const gap = output.evidenceGaps.find((item: { kind: string }) => item.kind === "forbidden_import");
    assert.ok(gap.files.includes("src/index.ts"));
    assert.ok(gap.imports.includes("lodash"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("computed dynamic imports stay informational and do not move the gate", async () => {
  const cwd = await tempDir();
  try {
    await writePackage(cwd, {
      name: "fixture",
      version: "1.0.0",
      type: "module",
      codexus: { architecture: architecturePolicy() },
    });
    await writeSource(cwd, "src/index.ts", "const mod = './local.js';\nexport async function load() { return import(mod); }\n");

    const result = runCli(cwd, ["architecture", "check", "--gate", "--json"]);
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.gate.status, "passed");
    assert.equal(output.evidenceGaps.length, 0);
    assert.ok(output.informationalUnknowns.some((item: { kind: string }) => item.kind === "computed_dynamic_import"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Codexus package dogfoods architecture report without forbidden imports", () => {
  const result = runCli(resolve("."), ["architecture", "check", "--gate", "--json"]);
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.policy.declared, true);
  assert.equal(output.policy.validation.valid, true);
  assert.equal(output.architecture.status, "pass");
  assert.equal(output.gate.status, "passed");
  assert.equal(output.stability, "stable");
  assert.equal(output.scanAccuracy, "best_effort");
  assert.deepEqual(output.evidenceGaps, []);
  assert.ok(output.heuristicClaims.some((claim: { kind: string }) => claim.kind === "broad_layering_rule_deferred"));
});
