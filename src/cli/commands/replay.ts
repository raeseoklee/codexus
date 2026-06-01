import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { loadConfig } from "../../config/loader.ts";
import { buildReplayParityContract, evaluateModelReplay, evaluateReplaySpec, readReplaySpec, type ReplaySpec } from "../../evolution/replay.ts";
import { reviewSkill } from "../../evolution/skills.ts";
import { flagBool, flagString, type ParsedArgs } from "../args.ts";

async function replayFile(path: string) {
  const spec = await readReplaySpec(path);
  if (!spec) throw new Error(`replay_not_found:${path}`);
  const skillPath = resolve(dirname(path), "skill.json");
  if (!existsSync(skillPath)) throw new Error(`skill_not_found_for_replay:${skillPath}`);
  const skill = JSON.parse(await readFile(skillPath, "utf8")) as {
    id: string;
    procedure: string[];
    safety: { requiresVerification: boolean; forbiddenActions: string[] };
  };
  return evaluateReplaySpec(spec as ReplaySpec, skill);
}

export async function replayCommand(args: ParsedArgs): Promise<void> {
  const cwd = resolve(flagString(args.flags, "cwd") ?? process.cwd());
  const json = flagBool(args.flags, "json");
  const modeOrTarget = args.positionals[0];
  if (!modeOrTarget) throw new Error("missing_replay_target");

  let result;
  if (modeOrTarget === "parity") {
    const parity = await buildReplayParityContract();
    if (json) {
      console.log(JSON.stringify({ stability: "stable" as const, ...parity }, null, 2));
      process.exitCode = parity.status === "covered" || parity.status === "fixtures_unavailable" ? 0 : 1;
      return;
    }
    console.log(`Replay parity: ${parity.status}`);
    console.log(`covered: ${parity.coveredLabels.length}/${parity.labels.length}`);
    process.exitCode = parity.status === "covered" || parity.status === "fixtures_unavailable" ? 0 : 1;
    return;
  }
  if (modeOrTarget === "skill") {
    const skillId = args.positionals[1];
    if (!skillId) throw new Error("missing_skill_id");
    result = (await reviewSkill(cwd, skillId)).replay;
  } else {
    result = await replayFile(resolve(cwd, modeOrTarget));
  }

  if (json) {
    const { config } = loadConfig({ cwd });
    const modelBudget = flagString(args.flags, "model-budget");
    const modelReplay = await evaluateModelReplay({
      cwd,
      requested: flagBool(args.flags, "with-model-replay"),
      allowLive: flagBool(args.flags, "allow-live-model-replay"),
      budget: modelBudget !== undefined ? Number(modelBudget) : null,
      replay: result,
      codexCommand: config.codex.command,
      codexModel: config.codex.model,
    });
    console.log(JSON.stringify({ schemaVersion: 1, stability: "stable" as const, replay: result, modelReplay }, null, 2));
    process.exitCode = result.status === "passed" && !["blocked", "failed", "error"].includes(modelReplay.status) ? 0 : 1;
    return;
  } else {
    console.log(`${result.skillId}: replay ${result.status}`);
    for (const scenario of result.scenarios) {
      console.log(`- ${scenario.id}: ${scenario.status}${scenario.failures.length > 0 ? ` (${scenario.failures.join(", ")})` : ""}`);
    }
  }
  process.exitCode = result.status === "passed" ? 0 : 1;
}
