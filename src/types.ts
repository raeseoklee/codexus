export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export type HarnessPhase =
  | "intake"
  | "research"
  | "plan"
  | "execute"
  | "verify"
  | "repair"
  | "evolve"
  | "complete"
  | "failed"
  | "blocked"
  | "cancelled";

export type TerminalOutcome = "complete" | "failed" | "blocked" | "cancelled";

export type RunStatus = "running" | "terminal";

export interface HarnessError {
  code: string;
  message: string;
  source?: string;
  suggestion?: string;
}

export interface RunState {
  schemaVersion: 1;
  runId: string;
  status: RunStatus;
  phase: HarnessPhase;
  outcome: TerminalOutcome | null;
  createdAt: string;
  updatedAt: string;
  cwd: string;
  driver: string;
  promptHash: string;
  repairIteration: number;
  driverRepairIteration?: number;
  verification: {
    required: boolean;
    latestStatus: "pending" | "passed" | "failed" | "skipped" | "timed_out" | "error";
  };
  artifacts: string[];
  error?: HarnessError;
}

export interface HarnessEvent {
  schemaVersion: 1;
  eventId: string;
  runId: string;
  timestamp: string;
  phase: HarnessPhase;
  type: string;
  source: string;
  payload: JsonValue;
}
