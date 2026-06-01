import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { defaultConfig } from "../../config/schema.ts";
import { harnessRoot } from "../../ledger/paths.ts";
import { writeJsonAtomic } from "../../util/fs.ts";
import { flagBool, flagString, type ParsedArgs } from "../args.ts";

export async function initCommand(args: ParsedArgs): Promise<void> {
  const cwd = resolve(flagString(args.flags, "cwd") ?? process.cwd());
  const root = harnessRoot(cwd);
  const force = flagBool(args.flags, "force");
  const created: string[] = [];
  for (const dir of ["runs", "plans", "skills/proposed", "skills/active", "memory", "locks", "exports", "artifacts"]) {
    const path = join(root, dir);
    await mkdir(path, { recursive: true });
    created.push(path);
  }
  const gitignore = join(root, ".gitignore");
  if (!existsSync(gitignore) || force) {
    await writeFile(gitignore, "runs/\nartifacts/\nlocks/\nexports/\n*.tmp\n");
    created.push(gitignore);
  }
  const configPath = join(root, "config.json");
  if (!existsSync(configPath) || force) {
    await writeJsonAtomic(configPath, defaultConfig);
    created.push(configPath);
  }
  let docsPath: string | null = null;
  if (flagBool(args.flags, "with-docs")) {
    docsPath = join(root, "README.md");
    if (!existsSync(docsPath) || force) {
      await writeFile(docsPath, "# Codexus Project Harness\n\nProject-local Codexus state and configuration live here.\n");
      created.push(docsPath);
    }
  }
  const result = { schemaVersion: 1, stability: "stable" as const, root, configPath, docsPath, created };
  if (flagBool(args.flags, "json")) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`initialized ${root}`);
}
