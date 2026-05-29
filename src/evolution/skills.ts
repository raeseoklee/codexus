import { copyFile, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { ensureDir, writeJsonAtomic } from "../util/fs.ts";
import { withFileLock } from "../util/lock.ts";
import type { ExperienceRecord } from "./experience.ts";
import { buildDefaultReplaySpec, evaluateReplaySpec, readReplaySpec, type ReplayResult } from "./replay.ts";

export interface SkillProposal {
  schemaVersion: 1;
  id: string;
  name: string;
  displayName: string;
  status: "proposed" | "active" | "deprecated";
  version: "0.1.0";
  sourceRunIds: string[];
  trigger: {
    keywords: string[];
    pathGlobs: string[];
  };
  scope: {
    allowedTaskShapes: string[];
    excludedTaskShapes: string[];
  };
  procedure: string[];
  safety: {
    requiresVerification: boolean;
    forbiddenActions: string[];
  };
  promotion: {
    requiredReplayStatus: "passed";
    reviewedBy: string | null;
    promotedAt: string | null;
  };
}

export interface SkillEvidence {
  schemaVersion: 1;
  skillId: string;
  sourceRunIds: string[];
  generatedAt: string;
  verificationStatus: ExperienceRecord["verification"]["status"];
  artifacts: string[];
  reusableLessons: ExperienceRecord["reusableLessons"];
  sources: string[];
}

export interface SkillReview {
  skill: SkillProposal;
  replay: ReplayResult;
  promotable: boolean;
  blockers: string[];
}

export interface PromotionResult {
  skill: SkillProposal;
  activeDir: string;
}

export interface SkillListEntry {
  location: "proposed" | "active";
  path: string;
  skill: SkillProposal;
}

export interface ActiveSkillIndexEntry {
  schemaVersion: 1;
  id: string;
  name: string;
  displayName: string;
  version: string;
  status: "active" | "deprecated";
  sourceRunIds: string[];
  replayStatus: ReplayResult["status"];
  exportState: Record<string, { exportedAt: string; path: string }>;
  promotedAt: string | null;
  updatedAt: string;
  activeDir: string;
}

type StoredSkillProposal = Omit<SkillProposal, "displayName"> & {
  displayName?: string;
};

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "general";
}

export function codexusSkillDisplayName(name: string): string {
  return `codexus:${name}`;
}

function normalizeSkillProposal(skill: StoredSkillProposal): SkillProposal {
  return {
    ...skill,
    displayName: skill.displayName ?? codexusSkillDisplayName(skill.name),
  };
}

export function buildSkillProposal(experience: ExperienceRecord): SkillProposal {
  const base = slugify(experience.task.summary);
  return {
    schemaVersion: 1,
    id: `skill_${base}`,
    name: base,
    displayName: codexusSkillDisplayName(base),
    status: "proposed",
    version: "0.1.0",
    sourceRunIds: [experience.runId],
    trigger: {
      keywords: experience.task.summary.toLowerCase().split(/\s+/).filter((word) => word.length > 4).slice(0, 6),
      pathGlobs: [],
    },
    scope: {
      allowedTaskShapes: [experience.task.shape],
      excludedTaskShapes: ["security_fix"],
    },
    procedure: [
      "Review source run evidence before applying this procedure.",
      "Apply the reusable lesson only within the declared scope.",
      "Run required verification before claiming completion.",
    ],
    safety: {
      requiresVerification: true,
      forbiddenActions: ["promote without replay validation"],
    },
    promotion: {
      requiredReplayStatus: "passed",
      reviewedBy: null,
      promotedAt: null,
    },
  };
}

export function buildSkillEvidence(skill: SkillProposal, experience: ExperienceRecord): SkillEvidence {
  return {
    schemaVersion: 1,
    skillId: skill.id,
    sourceRunIds: skill.sourceRunIds,
    generatedAt: new Date().toISOString(),
    verificationStatus: experience.verification.status,
    artifacts: experience.context.artifacts,
    reusableLessons: experience.reusableLessons,
    sources: experience.sources,
  };
}

export async function writeSkillProposal(cwd: string, experience: ExperienceRecord): Promise<SkillProposal> {
  const proposal = buildSkillProposal(experience);
  const dir = join(cwd, ".codex-harness", "skills", "proposed", proposal.id);
  await ensureDir(dir);
  await writeJsonAtomic(join(dir, "skill.json"), proposal);
  await writeJsonAtomic(join(dir, "evidence.json"), buildSkillEvidence(proposal, experience));
  await writeJsonAtomic(join(dir, "replay.json"), buildDefaultReplaySpec(proposal.id, experience.task.summary));
  await writeFile(join(dir, "SKILL.md"), `# ${proposal.displayName}

Source run: ${experience.runId}
Codexus skill id: ${proposal.id}

## Procedure

${proposal.procedure.map((step) => `- ${step}`).join("\n")}

## Safety

${proposal.safety.forbiddenActions.map((item) => `- ${item}`).join("\n")}
`);
  return proposal;
}

export function proposedSkillDir(cwd: string, skillId: string): string {
  return join(cwd, ".codex-harness", "skills", "proposed", skillId);
}

export function activeSkillDir(cwd: string, skill: SkillProposal): string {
  return join(cwd, ".codex-harness", "skills", "active", skill.name, skill.version);
}

export function activeSkillsRoot(cwd: string): string {
  return join(cwd, ".codex-harness", "skills", "active");
}

export function activeSkillIndexPath(cwd: string): string {
  return join(activeSkillsRoot(cwd), "index.json");
}

export async function readActiveSkillIndex(cwd: string): Promise<ActiveSkillIndexEntry[]> {
  const path = activeSkillIndexPath(cwd);
  if (!existsSync(path)) return [];
  return JSON.parse(await readFile(path, "utf8")) as ActiveSkillIndexEntry[];
}

export async function upsertActiveSkillIndexEntry(cwd: string, entry: ActiveSkillIndexEntry): Promise<void> {
  await withFileLock(cwd, "active-skills", async () => {
    const entries = existsSync(activeSkillIndexPath(cwd)) ? await readActiveSkillIndex(cwd) : [];
    const next = [
      ...entries.filter((candidate) => !(candidate.id === entry.id && candidate.version === entry.version)),
      { ...entry, updatedAt: new Date().toISOString() },
    ].sort((left, right) => left.displayName.localeCompare(right.displayName));
    await ensureDir(activeSkillsRoot(cwd));
    await writeJsonAtomic(activeSkillIndexPath(cwd), next);
  });
}

export async function readSkillProposal(cwd: string, skillId: string): Promise<SkillProposal> {
  const path = join(proposedSkillDir(cwd, skillId), "skill.json");
  if (!existsSync(path)) throw new Error(`skill_not_found:${skillId}`);
  return normalizeSkillProposal(JSON.parse(await readFile(path, "utf8")) as StoredSkillProposal);
}

async function readSkillJson(path: string): Promise<SkillProposal | null> {
  if (!existsSync(path)) return null;
  return normalizeSkillProposal(JSON.parse(await readFile(path, "utf8")) as StoredSkillProposal);
}

export async function listSkills(cwd: string): Promise<SkillListEntry[]> {
  const entries: SkillListEntry[] = [];
  const proposedRoot = join(cwd, ".codex-harness", "skills", "proposed");
  if (existsSync(proposedRoot)) {
    for (const entry of await readdir(proposedRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const path = join(proposedRoot, entry.name, "skill.json");
      const skill = await readSkillJson(path);
      if (skill) entries.push({ location: "proposed", path, skill });
    }
  }

  const activeRoot = activeSkillsRoot(cwd);
  if (existsSync(activeRoot)) {
    for (const nameEntry of await readdir(activeRoot, { withFileTypes: true })) {
      if (!nameEntry.isDirectory()) continue;
      const nameDir = join(activeRoot, nameEntry.name);
      for (const versionEntry of await readdir(nameDir, { withFileTypes: true })) {
        if (!versionEntry.isDirectory()) continue;
        const path = join(nameDir, versionEntry.name, "skill.json");
        const skill = await readSkillJson(path);
        if (skill) entries.push({ location: "active", path, skill });
      }
    }
  }
  return entries.sort((left, right) => `${left.location}:${left.skill.id}`.localeCompare(`${right.location}:${right.skill.id}`));
}

export async function reviewSkill(cwd: string, skillId: string): Promise<SkillReview> {
  const skill = await readSkillProposal(cwd, skillId);
  const replayPath = join(proposedSkillDir(cwd, skillId), "replay.json");
  const replaySpec = await readReplaySpec(replayPath);
  const replay = replaySpec
    ? evaluateReplaySpec(replaySpec, skill)
    : { schemaVersion: 1 as const, skillId, status: "missing" as const, scenarios: [] };
  const blockers: string[] = [];
  if (replay.status !== "passed") blockers.push(`replay_${replay.status}`);
  if (!existsSync(join(proposedSkillDir(cwd, skillId), "evidence.json"))) blockers.push("missing_evidence");
  if (!skill.safety.requiresVerification) blockers.push("verification_not_required");
  if (skill.trigger.keywords.length === 0 && skill.trigger.pathGlobs.length === 0) {
    blockers.push("missing_trigger");
  }
  return {
    skill,
    replay,
    promotable: blockers.length === 0,
    blockers,
  };
}

export async function promoteSkill(cwd: string, skillId: string): Promise<PromotionResult> {
  const review = await reviewSkill(cwd, skillId);
  if (!review.promotable) {
    throw new Error(`promotion_blocked:${review.blockers.join(",")}`);
  }
  const promoted: SkillProposal = {
    ...review.skill,
    status: "active",
    promotion: {
      ...review.skill.promotion,
      promotedAt: new Date().toISOString(),
    },
  };
  const sourceDir = proposedSkillDir(cwd, skillId);
  const targetDir = activeSkillDir(cwd, promoted);
  await ensureDir(targetDir);
  await writeJsonAtomic(join(sourceDir, "skill.json"), promoted);
  await writeJsonAtomic(join(targetDir, "skill.json"), promoted);
  await copyFile(join(sourceDir, "SKILL.md"), join(targetDir, "SKILL.md"));
  await copyFile(join(sourceDir, "evidence.json"), join(targetDir, "evidence.json"));
  await copyFile(join(sourceDir, "replay.json"), join(targetDir, "replay.json"));
  await upsertActiveSkillIndexEntry(cwd, {
    schemaVersion: 1,
    id: promoted.id,
    name: promoted.name,
    displayName: promoted.displayName,
    version: promoted.version,
    status: "active",
    sourceRunIds: promoted.sourceRunIds,
    replayStatus: review.replay.status,
    exportState: {},
    promotedAt: promoted.promotion.promotedAt,
    updatedAt: new Date().toISOString(),
    activeDir: targetDir,
  });
  return {
    skill: promoted,
    activeDir: targetDir,
  };
}

export async function deprecateSkill(cwd: string, skillId: string, reason = "deprecated by user request"): Promise<SkillProposal> {
  const skill = await readSkillProposal(cwd, skillId);
  const deprecated: SkillProposal = { ...skill, status: "deprecated" };
  await writeJsonAtomic(join(proposedSkillDir(cwd, skillId), "skill.json"), deprecated);
  await writeJsonAtomic(join(proposedSkillDir(cwd, skillId), "deprecation.json"), {
    skillId,
    version: skill.version,
    deprecatedAt: new Date().toISOString(),
    reason,
  });
  const index = await readActiveSkillIndex(cwd);
  const existing = index.find((entry) => entry.id === skillId);
  if (existing) {
    await upsertActiveSkillIndexEntry(cwd, { ...existing, status: "deprecated" });
  }
  return deprecated;
}

async function findActiveSkillEntry(cwd: string, skillId: string): Promise<SkillListEntry> {
  const active = (await listSkills(cwd)).find((entry) => entry.location === "active" && entry.skill.id === skillId);
  if (!active) throw new Error(`skill_not_active:${skillId}`);
  return active;
}

function exportRoot(target: "codex" | "omx"): string {
  if (target === "codex") return join(process.env.CODEX_HOME ?? join(homedir(), ".codex"), "skills");
  return join(process.env.OMX_HOME ?? join(homedir(), ".omx"), "skills");
}

function exportDirName(skill: SkillProposal): string {
  return `codexus-${skill.name}`;
}

function validateSkillForExternalTarget(skill: SkillProposal): void {
  if (!skill.displayName.startsWith("codexus:")) throw new Error(`skill_export_validation_failed:${skill.id}`);
  if (skill.procedure.length === 0 || skill.scope.allowedTaskShapes.length === 0) throw new Error(`skill_export_validation_failed:${skill.id}`);
  if (!skill.safety.requiresVerification) throw new Error(`skill_export_validation_failed:${skill.id}`);
}

export async function exportActiveSkill(cwd: string, skillId: string, target: "codex" | "omx", force = false): Promise<{ skillId: string; target: "codex" | "omx"; path: string; writtenAt: string }> {
  if (target !== "codex" && target !== "omx") throw new Error(`invalid_skill_export_target:${target}`);
  const entry = await findActiveSkillEntry(cwd, skillId);
  const skill = entry.skill;
  validateSkillForExternalTarget(skill);
  const outputDir = join(exportRoot(target), exportDirName(skill));
  if (existsSync(outputDir) && !force) throw new Error(`skill_export_target_exists:${outputDir}`);
  if (force) await rm(outputDir, { recursive: true, force: true });
  await ensureDir(outputDir);
  const sourceDir = entry.path.slice(0, -"skill.json".length);
  const body = await readFile(join(sourceDir, "SKILL.md"), "utf8");
  await writeFile(join(outputDir, "SKILL.md"), `---
name: ${JSON.stringify(skill.displayName)}
description: ${JSON.stringify(`Generated Codexus skill ${skill.displayName}.`)}
---

${body}`);
  await copyFile(join(sourceDir, "skill.json"), join(outputDir, "skill.json"));
  await copyFile(join(sourceDir, "evidence.json"), join(outputDir, "evidence.json"));
  await copyFile(join(sourceDir, "replay.json"), join(outputDir, "replay.json"));
  const writtenAt = new Date().toISOString();
  await writeJsonAtomic(join(outputDir, "codexus-export.json"), { schemaVersion: 1, skillId, target, writtenAt, source: entry.path });
  const index = await readActiveSkillIndex(cwd);
  const indexed = index.find((candidate) => candidate.id === skillId) ?? {
    schemaVersion: 1 as const,
    id: skill.id,
    name: skill.name,
    displayName: skill.displayName,
    version: skill.version,
    status: "active" as const,
    sourceRunIds: skill.sourceRunIds,
    replayStatus: "passed" as const,
    exportState: {},
    promotedAt: skill.promotion.promotedAt,
    updatedAt: writtenAt,
    activeDir: sourceDir,
  };
  await upsertActiveSkillIndexEntry(cwd, {
    ...indexed,
    exportState: { ...indexed.exportState, [target]: { exportedAt: writtenAt, path: outputDir } },
  });
  return { skillId, target, path: outputDir, writtenAt };
}

export async function retrieveActiveSkillsForTask(cwd: string, taskText: string, limit = 3): Promise<SkillProposal[]> {
  const terms = taskText.toLowerCase().split(/\s+/).filter(Boolean);
  const active = (await listSkills(cwd)).filter((entry) => entry.location === "active").map((entry) => entry.skill);
  return active
    .map((skill) => {
      const text = `${skill.name} ${skill.displayName} ${skill.trigger.keywords.join(" ")} ${skill.scope.allowedTaskShapes.join(" ")}`.toLowerCase();
      const score = terms.reduce((sum, term) => sum + (text.includes(term) ? 1 : 0), 0);
      return { skill, score };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.skill.displayName.localeCompare(right.skill.displayName))
    .slice(0, limit)
    .map((item) => item.skill);
}
