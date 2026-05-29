import { writeFile } from "node:fs/promises";
import type { RunPaths } from "./paths.ts";
import type { RunState, TerminalOutcome } from "../types.ts";

export async function writeRunReport(paths: RunPaths, state: RunState, outcome: TerminalOutcome): Promise<void> {
  const report = `# Run ${state.runId}

- Outcome: ${outcome}
- Driver: ${state.driver}
- Verification: ${state.verification.latestStatus}
- Repair iterations: ${state.repairIteration}
- Driver repair iterations: ${state.driverRepairIteration ?? 0}
${state.error ? `- Error: ${state.error.message.split("\n")[0]}\n` : ""}
`;
  await writeFile(paths.report, report);
}
