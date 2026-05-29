import { resolve } from "node:path";
import { buildCodexAdapterContext } from "../../adapters/context.ts";
import { retrieveActiveSkillsForTask } from "../../evolution/skills.ts";
import { readMemoryEntries, searchMemoryEntries } from "../../evolution/memory.ts";
import { flagBool, flagString, type ParsedArgs } from "../args.ts";
import { readOmxStatus } from "../../adapters/omx.ts";

async function retrieveContext(cwd: string, task: string, args: ParsedArgs) {
  const skillLimit = Number(flagString(args.flags, "skill-limit") ?? "3");
  const memoryLimit = Number(flagString(args.flags, "memory-limit") ?? "5");
  const skills = await retrieveActiveSkillsForTask(cwd, task, Number.isInteger(skillLimit) && skillLimit > 0 ? skillLimit : 3);
  const memories = searchMemoryEntries(await readMemoryEntries(cwd), task, Number.isInteger(memoryLimit) && memoryLimit > 0 ? memoryLimit : 5);
  return { skills, memories };
}

export async function adaptOmxCommand(args: ParsedArgs): Promise<void> {
  const topic = args.positionals[0] ?? "status";
  if (topic === "retrieve" || topic === "context") {
    const cwd = resolve(flagString(args.flags, "cwd") ?? process.cwd());
    const task = flagString(args.flags, "task") ?? args.positionals.slice(1).join(" ").trim();
    if (!task) throw new Error("missing_prompt");
    const { skills, memories } = await retrieveContext(cwd, task, args);
    if (topic === "context") {
      const maxChars = Number(flagString(args.flags, "max-chars") ?? "6000");
      const context = buildCodexAdapterContext({
        task,
        skills,
        memories,
        maxChars: Number.isInteger(maxChars) && maxChars > 0 ? maxChars : 6000,
      });
      if (flagBool(args.flags, "json")) {
        console.log(JSON.stringify(context, null, 2));
        return;
      }
      console.log(context.contextBlock);
      return;
    }
    if (flagBool(args.flags, "json")) {
      console.log(JSON.stringify({ task, skills, memories }, null, 2));
      return;
    }
    for (const skill of skills) console.log(`skill ${skill.displayName}`);
    for (const memory of memories) console.log(`memory ${memory.id}: ${memory.text}`);
    return;
  }
  if (topic !== "status") {
    throw new Error(`unsupported_adapt_omx_command:${topic}`);
  }
  const status = readOmxStatus();
  if (flagBool(args.flags, "json")) {
    console.log(JSON.stringify(status, null, 2));
    return;
  }
  console.log(`OMX: ${status.available ? status.version ?? "available" : "unavailable"}`);
  console.log(`features: explore=${status.features.explore} sparkshell=${status.features.sparkshell} team=${status.features.team} agents=${status.features.agents}`);
  for (const warning of status.warnings) {
    console.log(`WARN ${warning.code}: ${warning.message}`);
  }
}
