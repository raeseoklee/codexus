#!/usr/bin/env node
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
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
const metadataName = "codexus-root.json";

async function hashTree(rootDir, exclude = new Set()) {
  const entries = [];
  async function walk(dir, prefix = "") {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (exclude.has(relative)) continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(path, relative);
      } else if (entry.isFile()) {
        entries.push([relative, createHash("sha256").update(await readFile(path)).digest("hex")]);
      }
    }
  }
  await walk(rootDir);
  const hash = createHash("sha256");
  for (const [relative, fileHash] of entries.sort((left, right) => left[0].localeCompare(right[0]))) {
    hash.update(`${relative}\0${fileHash}\n`);
  }
  return `sha256:${hash.digest("hex")}`;
}

if (!existsSync(source)) {
  throw new Error(`source_skill_not_found:${source}`);
}

if (existsSync(target) && !existsSync(marker) && !force) {
  throw new Error(`target_exists_not_managed:${target}. Re-run with --force to overwrite.`);
}

await mkdir(dirname(target), { recursive: true });
const sourceTreeHash = await hashTree(source);
await rm(target, { recursive: true, force: true });
await cp(source, target, { recursive: true });
await writeFile(marker, "managed by Codexus install-codex-skill.mjs\n");
const installedTreeHash = await hashTree(target, new Set([".codexus-adapter-managed", metadataName]));
await writeFile(join(target, metadataName), `${JSON.stringify({ root, installedAt: new Date().toISOString(), sourceTreeHash, installedTreeHash }, null, 2)}\n`);

const result = { source, target, root, sourceTreeHash, installedTreeHash };
if (json) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`Installed Codexus skill to ${target}`);
}
