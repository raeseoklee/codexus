import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildExperience, writeExperience } from "../src/evolution/experience.ts";
import { appendMemoryEntry, searchMemoryEntries } from "../src/evolution/memory.ts";
import { buildSkillProposal, deprecateSkill, listSkills, promoteSkill, reviewSkill, writeSkillProposal } from "../src/evolution/skills.ts";
import { runPaths } from "../src/ledger/paths.ts";
import type { RunState } from "../src/types.ts";

async function tempDir(): Promise<string> {
  return await mkdtemp(join(tmpdir(), "chx-evolution-"));
}

function state(cwd: string): RunState {
  return {
    schemaVersion: 1,
    runId: "run_evo",
    status: "terminal",
    phase: "complete",
    outcome: "complete",
    createdAt: "2026-05-29T00:00:00.000Z",
    updatedAt: "2026-05-29T00:00:00.000Z",
    cwd,
    driver: "mock",
    promptHash: "sha256:test",
    repairIteration: 0,
    verification: { required: true, latestStatus: "passed" },
    artifacts: ["artifact.md"],
  };
}

test("writeExperience persists practical MVP record", async () => {
  const cwd = await tempDir();
  try {
    const paths = runPaths(cwd, "run_evo");
    const experience = await writeExperience({
      paths,
      state: state(cwd),
      prompt: "fix parser regression",
      driverResult: { status: "succeeded", exitCode: 0 },
    });
    assert.equal(experience.task.shape, "bugfix");
    const raw = JSON.parse(await readFile(paths.experience, "utf8"));
    assert.equal(raw.runId, "run_evo");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("memory entries are redacted and searchable", async () => {
  const cwd = await tempDir();
  try {
    const entry = await appendMemoryEntry(cwd, {
      id: "mem_test",
      sourceRunId: "run_evo",
      kind: "workflow_lesson",
      text: "Parser tests used key sk-abcdefghijklmnopqrstuvwxyz",
      tags: ["parser"],
      confidence: "medium",
    });
    assert.match(entry.text, /REDACTED/);
    assert.equal(searchMemoryEntries([entry], "parser").length, 1);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("skill proposal has promotion gate fields", async () => {
  const cwd = await tempDir();
  try {
    const experience = buildExperience({
      paths: runPaths(cwd, "run_evo"),
      state: state(cwd),
      prompt: "fix parser regression",
      driverResult: { status: "succeeded", exitCode: 0 },
    });
    const proposal = buildSkillProposal(experience);
    assert.equal(proposal.status, "proposed");
    assert.equal(proposal.promotion.requiredReplayStatus, "passed");
    await writeSkillProposal(cwd, experience);
    const raw = await readFile(join(cwd, ".codex-harness", "skills", "proposed", proposal.id, "SKILL.md"), "utf8");
    assert.match(raw, /Source run: run_evo/);
    const evidence = JSON.parse(await readFile(join(cwd, ".codex-harness", "skills", "proposed", proposal.id, "evidence.json"), "utf8"));
    assert.equal(evidence.skillId, proposal.id);
    assert.equal(evidence.verificationStatus, "passed");
    const replay = JSON.parse(await readFile(join(cwd, ".codex-harness", "skills", "proposed", proposal.id, "replay.json"), "utf8"));
    assert.equal(replay.skillId, proposal.id);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("skill promotion requires replay and writes active skill", async () => {
  const cwd = await tempDir();
  try {
    const experience = buildExperience({
      paths: runPaths(cwd, "run_evo"),
      state: state(cwd),
      prompt: "fix parser regression",
      driverResult: { status: "succeeded", exitCode: 0 },
    });
    const proposal = await writeSkillProposal(cwd, experience);
    const review = await reviewSkill(cwd, proposal.id);
    assert.equal(review.replay.status, "passed");
    assert.equal(review.promotable, true);

    const promotion = await promoteSkill(cwd, proposal.id);
    assert.equal(promotion.skill.status, "active");
    assert.match(promotion.activeDir, /skills\/active\/fix-parser-regression\/0\.1\.0$/);

    const proposedAfterPromotion = JSON.parse(
      await readFile(join(cwd, ".codex-harness", "skills", "proposed", proposal.id, "skill.json"), "utf8"),
    );
    assert.equal(proposedAfterPromotion.status, "active");

    const activeSkill = JSON.parse(await readFile(join(promotion.activeDir, "skill.json"), "utf8"));
    assert.equal(activeSkill.id, proposal.id);
    assert.equal(activeSkill.promotion.requiredReplayStatus, "passed");
    assert.equal(typeof activeSkill.promotion.promotedAt, "string");
    const activeEvidence = JSON.parse(await readFile(join(promotion.activeDir, "evidence.json"), "utf8"));
    assert.equal(activeEvidence.sourceRunIds[0], "run_evo");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("legacy skill proposals are normalized with Codexus display names", async () => {
  const cwd = await tempDir();
  try {
    const experience = buildExperience({
      paths: runPaths(cwd, "run_evo"),
      state: state(cwd),
      prompt: "fix parser regression",
      driverResult: { status: "succeeded", exitCode: 0 },
    });
    const proposal = await writeSkillProposal(cwd, experience);
    const skillPath = join(cwd, ".codex-harness", "skills", "proposed", proposal.id, "skill.json");
    const legacy = JSON.parse(await readFile(skillPath, "utf8"));
    delete legacy.displayName;
    await writeFile(skillPath, `${JSON.stringify(legacy, null, 2)}\n`);

    const review = await reviewSkill(cwd, proposal.id);
    assert.equal(review.skill.displayName, "codexus:fix-parser-regression");
    const listed = await listSkills(cwd);
    assert.equal(listed[0].skill.displayName, "codexus:fix-parser-regression");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("skill review blocks promotion when replay is missing", async () => {
  const cwd = await tempDir();
  try {
    const experience = buildExperience({
      paths: runPaths(cwd, "run_evo"),
      state: state(cwd),
      prompt: "fix parser regression",
      driverResult: { status: "succeeded", exitCode: 0 },
    });
    const proposal = await writeSkillProposal(cwd, experience);
    await rm(join(cwd, ".codex-harness", "skills", "proposed", proposal.id, "replay.json"));
    const review = await reviewSkill(cwd, proposal.id);
    assert.equal(review.promotable, false);
    assert.deepEqual(review.blockers, ["replay_missing"]);
    await assert.rejects(() => promoteSkill(cwd, proposal.id), /promotion_blocked:replay_missing/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("skill deprecation records status and reason", async () => {
  const cwd = await tempDir();
  try {
    const experience = buildExperience({
      paths: runPaths(cwd, "run_evo"),
      state: state(cwd),
      prompt: "fix parser regression",
      driverResult: { status: "succeeded", exitCode: 0 },
    });
    const proposal = await writeSkillProposal(cwd, experience);
    const deprecated = await deprecateSkill(cwd, proposal.id, "superseded by broader parser skill");
    assert.equal(deprecated.status, "deprecated");
    const record = JSON.parse(
      await readFile(join(cwd, ".codex-harness", "skills", "proposed", proposal.id, "deprecation.json"), "utf8"),
    );
    assert.equal(record.reason, "superseded by broader parser skill");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
