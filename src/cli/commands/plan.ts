import { writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { ensureDir, writeJsonAtomic } from "../../util/fs.ts";
import { createRunId } from "../../util/id.ts";
import { flagBool, flagString, type ParsedArgs } from "../args.ts";

function planText(task: string, createdAt: string): string {
  return `# Harness Plan

Created: ${createdAt}

## Goal

${task}

## Execution Strategy

1. Inspect the relevant code and docs before changing behavior.
2. Implement the smallest reversible slice that advances the goal.
3. Run verification that proves the behavioral claim.
4. Record evidence in the run ledger or follow-up artifacts.
5. Promote reusable lessons only through the explicit skill/memory gates.

## Acceptance Checks

- Required files or commands are identified before execution.
- Verification evidence is available before claiming completion.
- Any reusable procedure remains proposed until replay-gated promotion.
`;
}

export async function planCommand(args: ParsedArgs): Promise<void> {
  const cwd = resolve(flagString(args.flags, "cwd") ?? process.cwd());
  const json = flagBool(args.flags, "json");
  const writeOmx = flagBool(args.flags, "omx");
  const task = args.positionals.join(" ").trim();
  if (!task) throw new Error("missing_plan_task");

  const id = createRunId().replace(/^run_/, "plan_");
  const createdAt = new Date().toISOString();
  const root = join(cwd, ".codex-harness", "plans");
  await ensureDir(root);
  const path = join(root, `${id}.md`);
  const text = planText(task, createdAt);
  await writeFile(path, text);

  let omxPath: string | null = null;
  if (writeOmx) {
    const omxRoot = join(cwd, ".omx", "plans");
    await ensureDir(omxRoot);
    omxPath = join(omxRoot, `${id}.md`);
    await writeFile(omxPath, text);
    const adapterRoot = join(cwd, ".codex-harness", "omx");
    await ensureDir(adapterRoot);
    await writeJsonAtomic(join(adapterRoot, "last-plan.json"), {
      schemaVersion: 1,
      id,
      createdAt,
      path,
      omxPath,
      note: "Plan exported without mutating .omx/state.",
    });
  }

  if (json) {
    console.log(JSON.stringify({ id, path, omxPath }, null, 2));
  } else {
    console.log(`${id}: ${path}`);
    if (omxPath) console.log(`omx: ${omxPath}`);
  }
}
