import { copyFile, readdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { ensureDir, writeJsonAtomic } from "../util/fs.ts";
import type { ExperienceRecord } from "./experience.ts";
import { buildDefaultReplaySpec, evaluateReplaySpec, readReplaySpec, type ReplayResult } from "./replay.ts";

export interface SkillProposal {
  schemaVersion: 1;
  id: string;
  name: string;
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

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "general";
}

export function buildSkillProposal(experience: ExperienceRecord): SkillProposal {
  const base = slugify(experience.task.summary);
  return {
    schemaVersion: 1,
    id: `skill_${base}`,
    name: base,
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
  await writeFile(join(dir, "SKILL.md"), `# ${proposal.name}

Source run: ${experience.runId}

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

export async function readSkillProposal(cwd: string, skillId: string): Promise<SkillProposal> {
  const path = join(proposedSkillDir(cwd, skillId), "skill.json");
  if (!existsSync(path)) throw new Error(`skill_not_found:${skillId}`);
  return JSON.parse(await readFile(path, "utf8")) as SkillProposal;
}

async function readSkillJson(path: string): Promise<SkillProposal | null> {
  if (!existsSync(path)) return null;
  return JSON.parse(await readFile(path, "utf8")) as SkillProposal;
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
  return deprecated;
}
