#!/usr/bin/env node
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "codex", "skills", "codexus");
const codexHome = process.env.CODEX_HOME ? resolve(process.env.CODEX_HOME) : join(homedir(), ".codex");
const target = join(codexHome, "skills", "codexus");
const args = new Set(process.argv.slice(2));
const json = args.has("--json");
const force = args.has("--force");
const marker = join(target, ".codexus-adapter-managed");

if (!existsSync(source)) {
  throw new Error(`source_skill_not_found:${source}`);
}

if (existsSync(target) && !existsSync(marker) && !force) {
  throw new Error(`target_exists_not_managed:${target}. Re-run with --force to overwrite.`);
}

await mkdir(dirname(target), { recursive: true });
await rm(target, { recursive: true, force: true });
await cp(source, target, { recursive: true });
await writeFile(marker, "managed by Codexus install-codex-skill.mjs\n");
await writeFile(join(target, "codexus-root.json"), `${JSON.stringify({ root, installedAt: new Date().toISOString() }, null, 2)}\n`);

const result = { source, target, root };
if (json) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`Installed Codexus skill to ${target}`);
}
