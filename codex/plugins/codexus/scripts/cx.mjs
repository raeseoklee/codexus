#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));

function resolveMain(root) {
  for (const candidate of [
    join(root, "src", "cli", "main.ts"),
    join(root, "dist", "cli", "main.js"),
  ]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function isCodexusRoot(dir) {
  const packagePath = join(dir, "package.json");
  if (!existsSync(packagePath) || !resolveMain(dir)) return false;
  try {
    const pkg = JSON.parse(readFileSync(packagePath, "utf8"));
    return pkg.name === "codexus";
  } catch {
    return false;
  }
}

function ascend(start) {
  let current = resolve(start);
  while (true) {
    if (isCodexusRoot(current)) return current;
    const next = dirname(current);
    if (next === current) return null;
    current = next;
  }
}

function findRoot() {
  if (process.env.CODEXUS_HOME && isCodexusRoot(process.env.CODEXUS_HOME)) {
    return resolve(process.env.CODEXUS_HOME);
  }
  return ascend(process.cwd()) ?? ascend(scriptDir);
}

const args = process.argv.slice(2);
const root = findRoot();
if (root) {
  if (args[0] === "--print-root") {
    console.log(root);
    process.exit(0);
  }
  const main = resolveMain(root);
  const result = spawnSync(process.execPath, [main, ...args], {
    cwd: root,
    env: process.env,
    stdio: "inherit",
  });
  process.exit(result.status ?? 1);
}

const result = spawnSync(process.env.CODEXUS_CLI ?? "codexus", args, {
  env: process.env,
  stdio: "inherit",
});

if (result.error) {
  console.error("codexus_root_not_found: set CODEXUS_HOME to the Codexus package root or install the global codexus binary");
  process.exit(1);
}

process.exit(result.status ?? 1);
