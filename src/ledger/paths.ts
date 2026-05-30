import { existsSync } from "node:fs";
import { mkdir, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

export const HARNESS_DIR = ".codexus";
export const LEGACY_HARNESS_DIR = ".codex-harness";

export interface RunPaths {
  root: string;
  runDir: string;
  input: string;
  state: string;
  events: string;
  owner: string;
  cancelRequest: string;
  rawDir: string;
  artifactsDir: string;
  verification: string;
  experience: string;
  report: string;
}

export function harnessRoot(cwd = process.cwd()): string {
  return join(resolve(cwd), HARNESS_DIR);
}

export function legacyHarnessRoot(cwd = process.cwd()): string {
  return join(resolve(cwd), LEGACY_HARNESS_DIR);
}

export function userHarnessRoot(): string {
  return join(homedir(), HARNESS_DIR);
}

export function legacyUserHarnessRoot(): string {
  return join(homedir(), LEGACY_HARNESS_DIR);
}

export function harnessRootCandidates(cwd = process.cwd()): string[] {
  return [harnessRoot(cwd), legacyHarnessRoot(cwd)];
}

export function existingHarnessRoot(cwd = process.cwd()): string {
  for (const root of harnessRootCandidates(cwd)) {
    if (existsSync(root)) return root;
  }
  return harnessRoot(cwd);
}

export interface HarnessRootMigration {
  schemaVersion: 1;
  migrated: boolean;
  from: string;
  to: string;
  strategy: "none" | "renamed" | "merged";
  conflicts: string[];
  removedLegacy: boolean;
}

async function moveIntoConflictRoot(src: string, conflictRoot: string, relative: string): Promise<string> {
  const target = join(conflictRoot, relative);
  await mkdir(dirname(target), { recursive: true });
  await rename(src, target);
  return target;
}

async function mergeLegacyDir(srcDir: string, dstDir: string, conflictRoot: string, prefix = ""): Promise<string[]> {
  await mkdir(dstDir, { recursive: true });
  const conflicts: string[] = [];
  for (const entry of await readdir(srcDir, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const src = join(srcDir, entry.name);
    const dst = join(dstDir, entry.name);
    if (!existsSync(dst)) {
      await rename(src, dst);
      continue;
    }
    const dstStat = await stat(dst);
    if (entry.isDirectory() && dstStat.isDirectory()) {
      conflicts.push(...await mergeLegacyDir(src, dst, conflictRoot, relative));
      await rm(src, { recursive: true, force: true });
      continue;
    }
    conflicts.push(relative);
    await moveIntoConflictRoot(src, conflictRoot, relative);
  }
  return conflicts;
}

async function migrateHarnessRootPair(legacyRoot: string, root: string, lockDir: string): Promise<HarnessRootMigration> {
  if (!existsSync(legacyRoot)) {
    return { schemaVersion: 1, migrated: false, from: legacyRoot, to: root, strategy: "none", conflicts: [], removedLegacy: false };
  }
  try {
    await mkdir(lockDir);
  } catch {
    return { schemaVersion: 1, migrated: false, from: legacyRoot, to: root, strategy: "none", conflicts: [], removedLegacy: false };
  }
  try {
    if (!existsSync(legacyRoot)) {
      return { schemaVersion: 1, migrated: false, from: legacyRoot, to: root, strategy: "none", conflicts: [], removedLegacy: false };
    }
    if (!existsSync(root)) {
      await rename(legacyRoot, root);
      return { schemaVersion: 1, migrated: true, from: legacyRoot, to: root, strategy: "renamed", conflicts: [], removedLegacy: true };
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const conflictRoot = join(root, "migration-conflicts", `codex-harness-${stamp}`);
    const conflicts = await mergeLegacyDir(legacyRoot, root, conflictRoot);
    if (conflicts.length > 0) {
      await writeFile(join(conflictRoot, "manifest.json"), `${JSON.stringify({
        schemaVersion: 1,
        migratedAt: new Date().toISOString(),
        from: legacyRoot,
        to: root,
        conflicts,
      }, null, 2)}\n`);
    }
    await rm(legacyRoot, { recursive: true, force: true });
    return { schemaVersion: 1, migrated: true, from: legacyRoot, to: root, strategy: "merged", conflicts, removedLegacy: true };
  } finally {
    await rm(lockDir, { recursive: true, force: true });
  }
}

export async function migrateLegacyHarnessRoot(cwd = process.cwd()): Promise<HarnessRootMigration> {
  return await migrateHarnessRootPair(
    legacyHarnessRoot(cwd),
    harnessRoot(cwd),
    join(resolve(cwd), ".codexus-migration.lock"),
  );
}

function runRoot(cwd: string, runId: string): string {
  for (const root of harnessRootCandidates(cwd)) {
    if (existsSync(join(root, "runs", runId))) return root;
  }
  return harnessRoot(cwd);
}

export function runPaths(cwd: string, runId: string): RunPaths {
  const root = runRoot(cwd, runId);
  const runDir = join(root, "runs", runId);
  return {
    root,
    runDir,
    input: join(runDir, "input.json"),
    state: join(runDir, "state.json"),
    events: join(runDir, "events.jsonl"),
    owner: join(runDir, "owner.json"),
    cancelRequest: join(runDir, "cancel-request.json"),
    rawDir: join(runDir, "raw"),
    artifactsDir: join(runDir, "artifacts"),
    verification: join(runDir, "verification.json"),
    experience: join(runDir, "experience.json"),
    report: join(runDir, "report.md"),
  };
}
