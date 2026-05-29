#!/usr/bin/env node
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const roots = ["src", "tests", "scripts", "codex/skills/codexus/scripts"].filter((root) => {
  try {
    return statSync(root).isDirectory();
  } catch {
    return false;
  }
});

function collect(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) collect(path, files);
    else if (/\.(ts|mjs|js)$/.test(entry)) files.push(path);
  }
  return files;
}

const files = roots.flatMap((root) => collect(root));
let failed = false;
for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (result.status !== 0) {
    failed = true;
    console.error(`syntax check failed: ${file}`);
    if (result.stderr) console.error(result.stderr);
  }
}
if (failed) process.exit(1);
console.log(`syntax ok (${files.length} files)`);
