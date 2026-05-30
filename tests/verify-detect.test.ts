import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectVerifyCandidates } from "../src/session/verify-detect.ts";

async function tempDir(): Promise<string> {
  return await mkdtemp(join(tmpdir(), "codexus-detect-"));
}

test("no recognized signals yields a null recommendation and empty candidates", async () => {
  const cwd = await tempDir();
  try {
    const detection = detectVerifyCandidates(cwd);
    assert.equal(detection.recommended, null);
    assert.deepEqual(detection.candidates, []);
    assert.match(detection.reason, /No recognized project signals/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("a single package.json test script becomes the recommendation", async () => {
  const cwd = await tempDir();
  try {
    await writeFile(join(cwd, "package.json"), JSON.stringify({ scripts: { test: "jest" } }));
    const detection = detectVerifyCandidates(cwd);
    assert.equal(detection.recommended, "npm test");
    assert.deepEqual(detection.candidates, ["npm test"]);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("multiple package.json scripts list all candidates with no single recommendation", async () => {
  const cwd = await tempDir();
  try {
    await writeFile(join(cwd, "package.json"), JSON.stringify({ scripts: { test: "x", typecheck: "y", lint: "z", ci: "w" } }));
    const detection = detectVerifyCandidates(cwd);
    assert.equal(detection.recommended, null);
    assert.deepEqual(detection.candidates, ["npm test", "npm run typecheck", "npm run lint", "npm run ci"]);
    assert.match(detection.reason, /Multiple verification candidates/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Cargo.toml maps to cargo test as a single recommendation", async () => {
  const cwd = await tempDir();
  try {
    await writeFile(join(cwd, "Cargo.toml"), "[package]\nname = \"x\"\n");
    const detection = detectVerifyCandidates(cwd);
    assert.equal(detection.recommended, "cargo test");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("go.mod maps to go test ./...", async () => {
  const cwd = await tempDir();
  try {
    await writeFile(join(cwd, "go.mod"), "module example.com/x\n");
    const detection = detectVerifyCandidates(cwd);
    assert.equal(detection.recommended, "go test ./...");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("pyproject.toml and pytest.ini both map to pytest without duplication", async () => {
  const cwd = await tempDir();
  try {
    await writeFile(join(cwd, "pyproject.toml"), "[tool.pytest.ini_options]\n");
    await writeFile(join(cwd, "pytest.ini"), "[pytest]\n");
    const detection = detectVerifyCandidates(cwd);
    assert.equal(detection.recommended, "pytest");
    assert.deepEqual(detection.candidates, ["pytest"]);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("mixed ecosystems surface multiple candidates", async () => {
  const cwd = await tempDir();
  try {
    await writeFile(join(cwd, "package.json"), JSON.stringify({ scripts: { test: "x" } }));
    await writeFile(join(cwd, "go.mod"), "module example.com/x\n");
    const detection = detectVerifyCandidates(cwd);
    assert.equal(detection.recommended, null);
    assert.deepEqual(detection.candidates, ["npm test", "go test ./..."]);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
