#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const skillDir = resolve(scriptDir, "..");

function isCodexusRoot(dir) {
  const packagePath = join(dir, "package.json");
  const mainPath = join(dir, "src", "cli", "main.ts");
  if (!existsSync(packagePath) || !existsSync(mainPath)) return false;
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

function rootFromInstallMetadata() {
  const metadataPath = join(skillDir, "codexus-root.json");
  if (!existsSync(metadataPath)) return null;
  try {
    const metadata = JSON.parse(readFileSync(metadataPath, "utf8"));
    return typeof metadata.root === "string" && isCodexusRoot(metadata.root) ? metadata.root : null;
  } catch {
    return null;
  }
}

function findRoot() {
  if (process.env.CODEXUS_HOME && isCodexusRoot(process.env.CODEXUS_HOME)) {
    return resolve(process.env.CODEXUS_HOME);
  }
  return ascend(process.cwd()) ?? ascend(scriptDir) ?? rootFromInstallMetadata();
}

const root = findRoot();
if (!root) {
  console.error("codexus_root_not_found: set CODEXUS_HOME to the Codexus repository root or run from inside the repo");
  process.exit(1);
}

const args = process.argv.slice(2);
if (args[0] === "--print-root") {
  console.log(root);
  process.exit(0);
}

const main = join(root, "src", "cli", "main.ts");
const result = spawnSync(process.execPath, [main, ...args], {
  cwd: root,
  env: process.env,
  stdio: "inherit",
});

process.exit(result.status ?? 1);
