import type { CodexusSessionState, SessionVerificationRecord } from "./state.ts";

export interface SessionLoopSummary {
  schemaVersion: 1;
  status: "none" | "watch" | "boundary";
  threshold: number;
  repeatedFailureCount: number;
  latestStatus: string | null;
  latestCommands: string[];
  evidenceLinks: string[];
  reason: string;
  completionAuthority: false;
}

function isPassingStatus(status: string): boolean {
  return status === "passed" || status === "skipped";
}

function commandKey(record: SessionVerificationRecord): string {
  return JSON.stringify(record.commands);
}

export function summarizeVerificationLoop(state: CodexusSessionState | null, threshold = 3): SessionLoopSummary {
  const verifications = state?.verifications ?? [];
  const latest = verifications.at(-1) ?? null;
  if (!latest) {
    return {
      schemaVersion: 1,
      status: "none",
      threshold,
      repeatedFailureCount: 0,
      latestStatus: null,
      latestCommands: [],
      evidenceLinks: [],
      reason: "No session verification records exist.",
      completionAuthority: false,
    };
  }
  if (isPassingStatus(latest.status)) {
    return {
      schemaVersion: 1,
      status: "none",
      threshold,
      repeatedFailureCount: 0,
      latestStatus: latest.status,
      latestCommands: latest.commands,
      evidenceLinks: [latest.path],
      reason: "Latest verification is passing or skipped, so no repeated-failure loop is active.",
      completionAuthority: false,
    };
  }

  const latestKey = commandKey(latest);
  const repeated: SessionVerificationRecord[] = [];
  for (let index = verifications.length - 1; index >= 0; index -= 1) {
    const record = verifications[index];
    if (isPassingStatus(record.status) || commandKey(record) !== latestKey) break;
    repeated.push(record);
  }
  const repeatedFailureCount = repeated.length;
  const status = repeatedFailureCount >= threshold ? "boundary" : repeatedFailureCount > 1 ? "watch" : "none";
  return {
    schemaVersion: 1,
    status,
    threshold,
    repeatedFailureCount,
    latestStatus: latest.status,
    latestCommands: latest.commands,
    evidenceLinks: repeated.reverse().map((record) => record.path),
    reason: status === "boundary"
      ? `The same verification command set has failed ${repeatedFailureCount} consecutive times; stop for a decision record before continuing autonomous repair.`
      : status === "watch"
        ? `The same verification command set has failed ${repeatedFailureCount} consecutive times; continue only with explicit repair evidence.`
        : "Latest verification failed once; not enough repetition to classify a loop.",
    completionAuthority: false,
  };
}
