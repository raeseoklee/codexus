#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const skillDir = resolve(scriptDir, "..");

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

function resolveMain(root) {
  for (const candidate of [
    join(root, "dist", "cli", "main.js"),
    join(root, "src", "cli", "main.ts"),
  ]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
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

const main = resolveMain(root);
if (!main) {
  console.error(`codexus_entrypoint_not_found: ${root}`);
  process.exit(1);
}
const result = spawnSync(process.execPath, [main, ...args], {
  cwd: root,
  env: process.env,
  stdio: "inherit",
});

process.exit(result.status ?? 1);
