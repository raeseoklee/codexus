import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { type ExperienceRecord } from "../../evolution/experience.ts";
import { deprecateSkill, exportActiveSkill, listSkills, promoteSkill, proposeSkillImprovement, readActiveSkillIndex, reviewSkill, writeSkillProposal } from "../../evolution/skills.ts";
import { runPaths } from "../../ledger/paths.ts";
import { flagBool, flagString, type ParsedArgs } from "../args.ts";

async function readExperienceForRun(cwd: string, runId: string): Promise<ExperienceRecord> {
  const path = runPaths(cwd, runId).experience;
  if (!existsSync(path)) throw new Error(`experience_not_found:${runId}`);
  return JSON.parse(await readFile(path, "utf8")) as ExperienceRecord;
}

export async function skillCommand(args: ParsedArgs): Promise<void> {
  const subcommand = args.positionals[0] ?? "list";
  const cwd = resolve(flagString(args.flags, "cwd") ?? process.cwd());
  const json = flagBool(args.flags, "json");

  if (subcommand === "propose") {
    const runId = args.positionals[1];
    if (!runId) throw new Error("missing_run_id");
    const proposal = await writeSkillProposal(cwd, await readExperienceForRun(cwd, runId));
    if (json) {
      console.log(JSON.stringify({ proposal }, null, 2));
      return;
    }
    console.log(`${proposal.displayName}: proposed (${proposal.id})`);
    return;
  }

  if (subcommand === "review") {
    const skillId = args.positionals[1];
    if (!skillId) throw new Error("missing_skill_id");
    const review = await reviewSkill(cwd, skillId);
    if (json) {
      console.log(JSON.stringify({ review }, null, 2));
      return;
    }
    console.log(`${skillId}: ${review.promotable ? "promotable" : `blocked (${review.blockers.join(", ")})`}`);
    return;
  }

  if (subcommand === "list") {
    const skills = await listSkills(cwd);
    const proposals = skills.filter((entry) => entry.location === "proposed").map((entry) => entry.skill);
    const active = skills.filter((entry) => entry.location === "active").map((entry) => entry.skill);
    if (json) {
      console.log(JSON.stringify({ skills, proposals, active }, null, 2));
      return;
    }
    for (const entry of skills) {
      console.log(`${entry.skill.displayName}: ${entry.skill.status} (${entry.location}, id: ${entry.skill.id})`);
    }
    return;
  }

  if (subcommand === "index") {
    const activeIndex = await readActiveSkillIndex(cwd);
    if (json) {
      console.log(JSON.stringify({ activeIndex }, null, 2));
      return;
    }
    for (const entry of activeIndex) console.log(`${entry.displayName}: ${entry.status} (${entry.version})`);
    return;
  }

  if (subcommand === "promote") {
    const skillId = args.positionals[1];
    if (!skillId) throw new Error("missing_skill_id");
    const result = await promoteSkill(cwd, skillId);
    if (json) {
      console.log(JSON.stringify({ promotion: result }, null, 2));
      return;
    }
    console.log(`${result.skill.displayName}: active at ${result.activeDir}`);
    return;
  }

  if (subcommand === "deprecate") {
    const skillId = args.positionals[1];
    if (!skillId) throw new Error("missing_skill_id");
    const reason = args.positionals.slice(2).join(" ").trim() || undefined;
    const skill = await deprecateSkill(cwd, skillId, reason);
    if (json) {
      console.log(JSON.stringify({ skill }, null, 2));
      return;
    }
    console.log(`${skillId}: deprecated`);
    return;
  }

  if (subcommand === "improve") {
    const skillId = args.positionals[1];
    if (!skillId) throw new Error("missing_skill_id");
    const reasonText = flagString(args.flags, "reason") ?? args.positionals.slice(2).join(" ").trim();
    const reason = reasonText || undefined;
    const result = await proposeSkillImprovement(cwd, skillId, reason);
    if (json) {
      console.log(JSON.stringify({ improvement: result }, null, 2));
      return;
    }
    console.log(`${result.proposal.displayName}: proposed from ${skillId}`);
    return;
  }

  if (subcommand === "export") {
    const skillId = args.positionals[1];
    if (!skillId) throw new Error("missing_skill_id");
    const target = flagString(args.flags, "target");
    if (target !== "codex") throw new Error(`invalid_skill_export_target:${target ?? "missing"}`);
    const result = await exportActiveSkill(cwd, skillId, target, flagBool(args.flags, "force"));
    if (json) {
      console.log(JSON.stringify({ export: result }, null, 2));
      return;
    }
    console.log(`${skillId}: exported to ${result.path}`);
    return;
  }

  throw new Error(`unsupported_skill_command:${subcommand}`);
}
