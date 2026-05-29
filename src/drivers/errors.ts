import type { DriverResult } from "./contract.ts";

export interface DriverFailureClassification {
  code: string;
  category: "auth" | "configuration" | "capability" | "sandbox" | "policy" | "network" | "task" | "unknown";
  repairable: boolean;
  message: string;
  suggestion: string;
}

export function classifyDriverFailure(result: DriverResult): DriverFailureClassification {
  const raw = result.error ?? result.finalMessage ?? "driver failed";
  const text = raw.toLowerCase();
  if (text.includes("unsupported_feature") || text.includes("unsupported flag") || text.includes("unknown option")) {
    return {
      code: "unsupported_feature",
      category: "capability",
      repairable: false,
      message: raw,
      suggestion: "Inspect driver capabilities with `cx doctor --json` before retrying.",
    };
  }
  if (text.includes("auth") || text.includes("login") || text.includes("oauth")) {
    return {
      code: "driver_auth_failed",
      category: "auth",
      repairable: false,
      message: raw,
      suggestion: "Run `codex login status` or reauthenticate Codex before retrying.",
    };
  }
  if (text.includes("sandbox") || text.includes("permission denied")) {
    return {
      code: "driver_sandbox_denied",
      category: "sandbox",
      repairable: false,
      message: raw,
      suggestion: "Review sandbox and approval settings before retrying.",
    };
  }
  if (text.includes("policy") || text.includes("blocked")) {
    return {
      code: "driver_policy_blocked",
      category: "policy",
      repairable: false,
      message: raw,
      suggestion: "Inspect policy events and narrow the requested action.",
    };
  }
  if (text.includes("network") || text.includes("timeout") || text.includes("econn")) {
    return {
      code: "driver_network_failed",
      category: "network",
      repairable: false,
      message: raw,
      suggestion: "Retry after checking local network and service availability.",
    };
  }
  return {
    code: "driver_task_failed",
    category: "task",
    repairable: true,
    message: raw,
    suggestion: "Inspect raw driver output and verification artifacts before retrying.",
  };
}
