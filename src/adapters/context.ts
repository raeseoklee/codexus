import { join } from "node:path";
import { writeFile } from "node:fs/promises";
import type { MemoryEntry } from "../evolution/memory.ts";
import type { ActiveSkillIndexEntry, SkillProposal } from "../evolution/skills.ts";
import { harnessRoot } from "../ledger/paths.ts";
import { ensureDir, writeJsonAtomic } from "../util/fs.ts";
import { sha256Text } from "../util/hash.ts";

export interface AdapterContextBlock {
  schemaVersion: 1;
  task: string;
  contextBlock: string;
  budget: {
    maxChars: number;
    usedChars: number;
    truncated: boolean;
  };
  skills: Array<{
    id: string;
    displayName: string;
    version: string;
    replayStatus: string | null;
    promotedAt: string | null;
  }>;
  memories: Array<{
    id: string;
    kind: MemoryEntry["kind"];
    sourceRunId: string;
    confidence: MemoryEntry["confidence"];
  }>;
}

export interface AdapterContextArtifact {
  schemaVersion: 1;
  artifactId: string;
  status: "approved";
  approval: {
    approvedAt: string;
    approvedBy: string;
    contextHash: string;
    injectedAutomatically: false;
  };
  paths: {
    dir: string;
    markdown: string;
    json: string;
  };
}

export interface AdapterInjectionArtifact {
  schemaVersion: 1;
  artifactId: string;
  status: "approved_not_injected";
  approval: {
    approvedAt: string;
    approvedBy: string;
    contextHash: string;
    userVisibleApproval: true;
  };
  injection: {
    automatic: false;
    applied: false;
    reason: string;
  };
  paths: {
    dir: string;
    markdown: string;
    json: string;
  };
  contextArtifact: AdapterContextArtifact;
}

function compactLine(text: string, maxChars: number): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, Math.max(0, maxChars - 3)).trim()}...`;
}

export function buildCodexAdapterContext(options: {
  task: string;
  skills: SkillProposal[];
  approvals?: ActiveSkillIndexEntry[];
  memories: MemoryEntry[];
  maxChars?: number;
}): AdapterContextBlock {
  const maxChars = options.maxChars ?? 6000;
  const approvals = new Map((options.approvals ?? []).map((approval) => [approval.id, approval]));
  const lines: string[] = [
    "# Codexus Retrieved Context",
    "",
    `Task: ${compactLine(options.task, 500)}`,
    "",
    "Use this context as advisory input. Verify behavior before claiming completion.",
    "",
    "## Skills",
  ];

  if (options.skills.length === 0) {
    lines.push("- None");
  } else {
    for (const skill of options.skills) {
      const approval = approvals.get(skill.id);
      lines.push(`- ${skill.displayName} (${skill.id}, ${skill.version})`);
      lines.push(`  Approval: replay=${approval?.replayStatus ?? "unknown"} promotedAt=${approval?.promotedAt ?? "unknown"} scenarios=${approval?.scenarioCount ?? 0}`);
      lines.push(`  Sources: ${skill.sourceRunIds.join(", ") || "unspecified"}`);
      lines.push(`  Scope: ${skill.scope.allowedTaskShapes.join(", ") || "unspecified"}`);
      lines.push(`  Triggers: ${skill.trigger.keywords.join(", ") || "unspecified"}`);
      lines.push(`  Procedure: ${skill.procedure.map((step) => compactLine(step, 180)).join(" / ")}`);
      lines.push(`  Safety: ${skill.safety.requiresVerification ? "verification required" : "verification not declared"}`);
    }
  }

  lines.push("", "## Memories");
  if (options.memories.length === 0) {
    lines.push("- None");
  } else {
    for (const memory of options.memories) {
      lines.push(`- ${memory.id} [${memory.kind}, ${memory.confidence}, source ${memory.sourceRunId}]: ${compactLine(memory.text, 260)}`);
    }
  }

  let contextBlock = `${lines.join("\n")}\n`;
  let truncated = false;
  if (contextBlock.length > maxChars) {
    contextBlock = `${contextBlock.slice(0, Math.max(0, maxChars - 38)).trimEnd()}\n\n[Codexus context truncated]\n`;
    truncated = true;
  }

  return {
    schemaVersion: 1,
    task: options.task,
    contextBlock,
    budget: {
      maxChars,
      usedChars: contextBlock.length,
      truncated,
    },
    skills: options.skills.map((skill) => ({
      id: skill.id,
      displayName: skill.displayName,
      version: skill.version,
      replayStatus: approvals.get(skill.id)?.replayStatus ?? null,
      promotedAt: approvals.get(skill.id)?.promotedAt ?? null,
    })),
    memories: options.memories.map((memory) => ({
      id: memory.id,
      kind: memory.kind,
      sourceRunId: memory.sourceRunId,
      confidence: memory.confidence,
    })),
  };
}

export async function writeApprovedAdapterContext(options: {
  cwd: string;
  context: AdapterContextBlock;
  approvedBy?: string;
}): Promise<AdapterContextArtifact> {
  const approvedAt = new Date().toISOString();
  const artifactId = `context_${Date.now()}`;
  const dir = join(harnessRoot(options.cwd), "adapters", "context", artifactId);
  const markdown = join(dir, "context.md");
  const json = join(dir, "context.json");
  const artifact: AdapterContextArtifact = {
    schemaVersion: 1,
    artifactId,
    status: "approved",
    approval: {
      approvedAt,
      approvedBy: options.approvedBy ?? "codexus-adapter",
      contextHash: sha256Text(options.context.contextBlock),
      injectedAutomatically: false,
    },
    paths: {
      dir,
      markdown,
      json,
    },
  };
  await ensureDir(dir);
  await writeFile(markdown, options.context.contextBlock);
  await writeJsonAtomic(json, {
    schemaVersion: 1,
    artifact,
    context: options.context,
  });
  return artifact;
}

export async function writeApprovedAdapterInjection(options: {
  cwd: string;
  context: AdapterContextBlock;
  approvedBy?: string;
}): Promise<AdapterInjectionArtifact> {
  const contextArtifact = await writeApprovedAdapterContext(options);
  const approvedAt = new Date().toISOString();
  const artifactId = `injection_${Date.now()}`;
  const dir = join(harnessRoot(options.cwd), "adapters", "injection", artifactId);
  const markdown = join(dir, "injection.md");
  const json = join(dir, "injection.json");
  const artifact: AdapterInjectionArtifact = {
    schemaVersion: 1,
    artifactId,
    status: "approved_not_injected",
    approval: {
      approvedAt,
      approvedBy: options.approvedBy ?? "codexus-adapter",
      contextHash: sha256Text(options.context.contextBlock),
      userVisibleApproval: true,
    },
    injection: {
      automatic: false,
      applied: false,
      reason: "Codexus records a visible approval artifact but does not insert retrieved context into the active Codex prompt automatically.",
    },
    paths: {
      dir,
      markdown,
      json,
    },
    contextArtifact,
  };
  await ensureDir(dir);
  await writeFile(markdown, [
    "# Codexus Adapter Injection Approval",
    "",
    "Status: approved_not_injected",
    "",
    "Codexus does not inject this context automatically. The active Codex session must read and apply the approved context explicitly.",
    "",
    `Context artifact: ${contextArtifact.paths.markdown}`,
    "",
  ].join("\n"));
  await writeJsonAtomic(json, {
    schemaVersion: 1,
    artifact,
    context: options.context,
  });
  return artifact;
}
