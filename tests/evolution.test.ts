import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildExperience, writeExperience } from "../src/evolution/experience.ts";
import { appendMemoryEntry, curateMemoryEntries, searchMemoryEntries } from "../src/evolution/memory.ts";
import { buildSkillProposal, deprecateSkill, listSkills, promoteSkill, proposeSkillImprovement, retrieveActiveSkillsForTask, reviewSkill, writeSkillProposal } from "../src/evolution/skills.ts";
import { buildDefaultReplaySpec, evaluateReplaySpec } from "../src/evolution/replay.ts";
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
      verificationCommands: ["npm test"],
    });
    assert.equal(experience.task.shape, "bugfix");
    assert.match(experience.reusableLessons[0].summary, /npm test/);
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

test("memory read path validates records and curator flags duplicates", async () => {
  const cwd = await tempDir();
  try {
    const first = await appendMemoryEntry(cwd, {
      id: "mem_duplicate_1",
      sourceRunId: "run_evo",
      kind: "workflow_lesson",
      text: "Use parser fixtures for regression coverage.",
      tags: ["parser"],
      confidence: "medium",
    });
    await appendMemoryEntry(cwd, {
      id: "mem_duplicate_2",
      sourceRunId: "run_evo",
      kind: "workflow_lesson",
      text: first.text,
      tags: ["parser"],
      confidence: "medium",
    });
    const curation = await curateMemoryEntries(cwd);
    assert.equal(curation.duplicateCandidates[0].id, "mem_duplicate_2");
    assert.equal(curation.conflictCandidates.length, 0);
    assert.equal(curation.qualityFindings.length, 2);

    await writeFile(join(cwd, ".codexus", "memory", "entries.jsonl"), `${JSON.stringify({ bad: true })}\n`);
    await assert.rejects(() => curateMemoryEntries(cwd), /schema_validation_failed:memory-entry/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("memory curator reports conflicts and tri-state quality without trusting entry flags", async () => {
  const cwd = await tempDir();
  try {
    await appendMemoryEntry(cwd, {
      id: "mem_use_npm",
      sourceRunId: "run_package_a",
      kind: "workflow_lesson",
      text: "Use npm for package scripts and run npm test.",
      tags: ["package", "scripts"],
      confidence: "high",
    });
    await appendMemoryEntry(cwd, {
      id: "mem_do_not_use_npm",
      sourceRunId: "run_package_b",
      kind: "workflow_lesson",
      text: "Do not use npm for package scripts.",
      tags: ["package", "scripts"],
      confidence: "high",
    });
    await appendMemoryEntry(cwd, {
      id: "mem_use_npm_ci",
      sourceRunId: "run_package_c",
      kind: "workflow_lesson",
      text: "Run npm ci for package installs.",
      tags: ["package", "scripts"],
      confidence: "medium",
    });

    const curation = await curateMemoryEntries(cwd);
    assert.equal(curation.conflictCandidates.length, 1);
    assert.deepEqual(curation.conflictCandidates[0], {
      id: "mem_do_not_use_npm",
      conflictsWith: "mem_use_npm",
      reason: "same kind with overlapping subject terms and opposite directive (use/not_use)",
      confidence: "high",
      suggestedResolution: "review_for_supersession",
    });
    const useFinding = curation.qualityFindings.find((finding) => finding.id === "mem_use_npm");
    const conflictFinding = curation.qualityFindings.find((finding) => finding.id === "mem_do_not_use_npm");
    const nonConflictFinding = curation.qualityFindings.find((finding) => finding.id === "mem_use_npm_ci");
    assert.equal(useFinding?.traceable.status, "pass");
    assert.equal(useFinding?.verifiable.status, "pass");
    assert.equal(useFinding?.conflictReviewed.status, "fail");
    assert.equal(conflictFinding?.conflictReviewed.status, "fail");
    assert.equal(nonConflictFinding?.conflictReviewed.status, "pass");

    const path = join(cwd, ".codexus", "memory", "entries.jsonl");
    const manual = {
      schemaVersion: 1,
      id: "mem_manual_quality_claim",
      createdAt: "2026-05-30T00:00:00.000Z",
      sourceRunId: "manual",
      kind: "tooling_note",
      text: "Handle well.",
      tags: ["manual"],
      confidence: "medium",
      quality: { traceable: { status: "pass", reason: "self asserted" } },
    };
    await writeFile(path, `${JSON.stringify(manual)}\n`);
    const manualCuration = await curateMemoryEntries(cwd);
    assert.equal(manualCuration.qualityFindings[0].traceable.status, "unknown");
    assert.equal(manualCuration.qualityFindings[0].unambiguous.status, "fail");
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
      verificationCommands: ["npm test"],
    });
    const proposal = buildSkillProposal(experience);
    assert.equal(proposal.status, "proposed");
    assert.equal(proposal.promotion.requiredReplayStatus, "passed");
    assert.ok(proposal.procedure.some((step) => step.includes("npm test")));
    await writeSkillProposal(cwd, experience);
    const raw = await readFile(join(cwd, ".codexus", "skills", "proposed", proposal.id, "SKILL.md"), "utf8");
    assert.match(raw, /Source run: run_evo/);
    const evidence = JSON.parse(await readFile(join(cwd, ".codexus", "skills", "proposed", proposal.id, "evidence.json"), "utf8"));
    assert.equal(evidence.skillId, proposal.id);
    assert.equal(evidence.verificationStatus, "passed");
    const replay = JSON.parse(await readFile(join(cwd, ".codexus", "skills", "proposed", proposal.id, "replay.json"), "utf8"));
    assert.equal(replay.skillId, proposal.id);
    assert.deepEqual(replay.scenarios[0].expected.requiresTests, ["npm test"]);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("source-specific replay fails boilerplate skills", () => {
  const replay = buildDefaultReplaySpec("skill_parser", "fix parser regression", {
    requiresTests: ["npm test"],
    forbids: ["claim completion without running npm test"],
  });
  const result = evaluateReplaySpec(replay, {
    id: "skill_parser",
    procedure: [
      "Review source run evidence before applying this procedure.",
      "Run required verification before claiming completion.",
    ],
    safety: {
      requiresVerification: true,
      forbiddenActions: ["promote without replay validation"],
    },
  });
  assert.equal(result.status, "failed");
  const failures = result.scenarios.flatMap((scenario) => scenario.failures);
  assert.ok(failures.includes("missing_required_test:npm test"));
  assert.ok(failures.includes("missing_forbidden_action:claim completion without running npm test"));
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
      await readFile(join(cwd, ".codexus", "skills", "proposed", proposal.id, "skill.json"), "utf8"),
    );
    assert.equal(proposedAfterPromotion.status, "active");

    const activeSkill = JSON.parse(await readFile(join(promotion.activeDir, "skill.json"), "utf8"));
    assert.equal(activeSkill.id, proposal.id);
    assert.equal(activeSkill.promotion.requiredReplayStatus, "passed");
    assert.equal(typeof activeSkill.promotion.promotedAt, "string");
    const activeEvidence = JSON.parse(await readFile(join(promotion.activeDir, "evidence.json"), "utf8"));
    assert.equal(activeEvidence.sourceRunIds[0], "run_evo");
    const promotionReview = JSON.parse(await readFile(join(promotion.activeDir, "promotion-review.json"), "utf8"));
    assert.equal(promotionReview.replay.coverage.scenarioCount, 2);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("deprecated skills are excluded from approved adapter retrieval and can seed improvements", async () => {
  const cwd = await tempDir();
  try {
    const experience = buildExperience({
      paths: runPaths(cwd, "run_evo"),
      state: state(cwd),
      prompt: "fix parser regression",
      driverResult: { status: "succeeded", exitCode: 0 },
    });
    const proposal = await writeSkillProposal(cwd, experience);
    const promotion = await promoteSkill(cwd, proposal.id);
    const beforeDeprecation = await retrieveActiveSkillsForTask(cwd, "parser regression", 3);
    assert.equal(beforeDeprecation[0].id, proposal.id);

    const improvement = await proposeSkillImprovement(cwd, proposal.id, "tighten parser trigger coverage");
    assert.equal(improvement.sourceSkillId, proposal.id);
    assert.match(improvement.proposal.displayName, /^codexus:/);

    await deprecateSkill(cwd, proposal.id, "superseded by improvement");
    const afterDeprecation = await retrieveActiveSkillsForTask(cwd, "parser regression", 3);
    assert.equal(afterDeprecation.length, 0);
    assert.ok(promotion.activeDir);
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
    const skillPath = join(cwd, ".codexus", "skills", "proposed", proposal.id, "skill.json");
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
    await rm(join(cwd, ".codexus", "skills", "proposed", proposal.id, "replay.json"));
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
      await readFile(join(cwd, ".codexus", "skills", "proposed", proposal.id, "deprecation.json"), "utf8"),
    );
    assert.equal(record.reason, "superseded by broader parser skill");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
