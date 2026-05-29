import type { JsonValue } from "../types.ts";
import type { HarnessConfig } from "../config/schema.ts";

export interface DriverCapabilities {
  supportsJsonl: boolean;
  supportsSandboxFlag: boolean;
  supportsApprovalFlag: boolean;
  supportsModelFlag: boolean;
  supportsOutputLastMessage: boolean;
  stderrMayContainWarningsOnSuccess: boolean;
  finalMessageShapes: string[];
}

export interface DriverProbe {
  available: boolean;
  summary: string;
  capabilities: DriverCapabilities;
  details?: JsonValue;
}

export interface DriverRequest {
  runId: string;
  cwd: string;
  prompt: string;
  config: HarnessConfig;
  context?: Record<string, unknown>;
}

export interface DriverEvent {
  type: string;
  source: string;
  payload: JsonValue;
  raw?: unknown;
}

export interface DriverResult {
  status: "succeeded" | "failed" | "blocked" | "cancelled";
  finalMessage?: string;
  exitCode?: number;
  usage?: Record<string, unknown>;
  error?: string;
}

export interface HarnessDriver {
  name: string;
  probe(config?: HarnessConfig): Promise<DriverProbe>;
  run(request: DriverRequest, emit: (event: DriverEvent) => Promise<void>): Promise<DriverResult>;
}
