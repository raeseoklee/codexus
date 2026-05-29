import { spawnSync } from "node:child_process";

export interface PolicyFinding {
  level: "warning" | "block";
  code: string;
  message: string;
  source: "prompt" | "verification" | "workspace";
  evidence?: string;
}

export interface PolicyPreflightInput {
  cwd: string;
  prompt: string;
  verificationCommands: string[];
}

export interface PolicyPreflightResult {
  status: "passed" | "blocked";
  findings: PolicyFinding[];
}

const dangerousCommandPatterns: Array<{ code: string; pattern: RegExp; message: string }> = [
  {
    code: "dangerous_root_delete",
    pattern: /\brm\s+-(?:[^\s]*r[^\s]*f|[^\s]*f[^\s]*r)\s+\/(?:\s|$)/,
    message: "Verification command attempts to recursively delete the filesystem root.",
  },
  {
    code: "dangerous_disk_format",
    pattern: /\b(mkfs|diskutil\s+eraseDisk|format)\b/i,
    message: "Verification command appears to format a disk or filesystem.",
  },
  {
    code: "dangerous_raw_disk_write",
    pattern: /\bdd\b.+\bof=\/dev\/(?:disk|rdisk|sd|nvme)/i,
    message: "Verification command appears to write directly to a disk device.",
  },
];

function isGitWorkspace(cwd: string): boolean {
  const result = spawnSync("git", ["rev-parse", "--show-toplevel"], {
    cwd,
    encoding: "utf8",
  });
  return result.status === 0;
}

export function runPolicyPreflight(input: PolicyPreflightInput): PolicyPreflightResult {
  const findings: PolicyFinding[] = [];

  if (!isGitWorkspace(input.cwd)) {
    findings.push({
      level: "warning",
      code: "workspace_not_git",
      message: "Workspace is not inside a git repository; rollback and touched-file detection are limited.",
      source: "workspace",
    });
  }

  if (/\brm\s+-rf\b|\bdelete\s+all\b/i.test(input.prompt)) {
    findings.push({
      level: "warning",
      code: "prompt_mentions_destructive_action",
      message: "Prompt mentions broad destructive action; rely on Codex sandboxing and verification before trusting the result.",
      source: "prompt",
    });
  }

  for (const command of input.verificationCommands) {
    for (const check of dangerousCommandPatterns) {
      if (check.pattern.test(command)) {
        findings.push({
          level: "block",
          code: check.code,
          message: check.message,
          source: "verification",
          evidence: command,
        });
      }
    }
  }

  return {
    status: findings.some((finding) => finding.level === "block") ? "blocked" : "passed",
    findings,
  };
}
