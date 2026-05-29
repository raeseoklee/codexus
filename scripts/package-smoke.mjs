#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? root,
    env: { ...process.env, ...(options.env ?? {}) },
    encoding: "utf8",
  });
  if (result.status !== 0) {
    const rendered = [result.stdout, result.stderr].filter(Boolean).join("\n");
    throw new Error(`${command} ${args.join(" ")} failed with ${result.status}\n${rendered}`);
  }
  return { stdout: result.stdout.trim(), stderr: result.stderr.trim() };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function binPath(prefix, name) {
  return process.platform === "win32" ? join(prefix, `${name}.cmd`) : join(prefix, "bin", name);
}

const workspace = await mkdtemp(join(tmpdir(), "codexus-package-smoke-"));
const packDir = join(workspace, "pack");
const prefix = join(workspace, "prefix");
const project = join(workspace, "project");

try {
  await mkdir(packDir, { recursive: true });
  await mkdir(project, { recursive: true });

  run("npm", ["pack", "--pack-destination", packDir]);
  const packed = (await readdir(packDir)).filter((name) => name.endsWith(".tgz"));
  assert(packed.length === 1, `expected one packed tarball, found ${packed.length}`);
  const tarball = join(packDir, packed[0]);

  const tarEntries = run("tar", ["-tf", tarball]).stdout.split(/\n/).filter(Boolean);
  for (const required of [
    "package/dist/cli/main.js",
    "package/schemas/config.schema.json",
    "package/fixtures/app-server/schema.fixture.json",
    "package/codex/skills/codexus/SKILL.md",
    "package/scripts/install-codex-skill.mjs",
    "package/install.sh",
  ]) {
    assert(tarEntries.includes(required), `packed tarball missing ${required}`);
  }
  for (const forbiddenPrefix of [
    "package/src/",
    "package/tests/",
    "package/docs/",
    "package/fixtures/replay/",
    "package/fixtures/migrations/",
  ]) {
    assert(!tarEntries.some((entry) => entry.startsWith(forbiddenPrefix)), `packed tarball should not contain ${forbiddenPrefix}`);
  }

  run("npm", ["install", "-g", tarball, "--prefix", prefix]);

  const codexus = binPath(prefix, "codexus");
  const cx = binPath(prefix, "cx");
  assert(run(codexus, ["--help"]).stdout.includes("Codexus"), "codexus --help did not render help");
  assert(run(cx, ["--help"]).stdout.includes("Codexus"), "cx --help did not render help");

  const schema = JSON.parse(run(codexus, ["schema", "check", "--json"]).stdout);
  assert(schema.ok === true, "codexus schema check did not return ok=true");
  assert(schema.appServerFixture?.valid === true, "app-server runtime fixture was not readable from the installed package");

  const mockRun = JSON.parse(run(codexus, ["run", "--driver", "mock", "--json", "package smoke"], { cwd: project }).stdout);
  assert(mockRun.outcome === "complete", "mock run did not complete from the installed package");

  console.log("package smoke ok");
} finally {
  if (process.env.CODEXUS_KEEP_PACKAGE_SMOKE !== "1") {
    await rm(workspace, { recursive: true, force: true });
  }
}
