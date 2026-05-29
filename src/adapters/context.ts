import type { MemoryEntry } from "../evolution/memory.ts";
import type { SkillProposal } from "../evolution/skills.ts";

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
  }>;
  memories: Array<{
    id: string;
    kind: MemoryEntry["kind"];
    sourceRunId: string;
    confidence: MemoryEntry["confidence"];
  }>;
}

function compactLine(text: string, maxChars: number): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, Math.max(0, maxChars - 3)).trim()}...`;
}

export function buildCodexAdapterContext(options: {
  task: string;
  skills: SkillProposal[];
  memories: MemoryEntry[];
  maxChars?: number;
}): AdapterContextBlock {
  const maxChars = options.maxChars ?? 6000;
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
      lines.push(`- ${skill.displayName} (${skill.id}, ${skill.version})`);
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
    })),
    memories: options.memories.map((memory) => ({
      id: memory.id,
      kind: memory.kind,
      sourceRunId: memory.sourceRunId,
      confidence: memory.confidence,
    })),
  };
}
