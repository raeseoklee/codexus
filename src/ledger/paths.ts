import { join, resolve } from "node:path";

export interface RunPaths {
  root: string;
  runDir: string;
  input: string;
  state: string;
  events: string;
  rawDir: string;
  artifactsDir: string;
  verification: string;
  experience: string;
  report: string;
}

export function harnessRoot(cwd = process.cwd()): string {
  return join(resolve(cwd), ".codex-harness");
}

export function runPaths(cwd: string, runId: string): RunPaths {
  const root = harnessRoot(cwd);
  const runDir = join(root, "runs", runId);
  return {
    root,
    runDir,
    input: join(runDir, "input.json"),
    state: join(runDir, "state.json"),
    events: join(runDir, "events.jsonl"),
    rawDir: join(runDir, "raw"),
    artifactsDir: join(runDir, "artifacts"),
    verification: join(runDir, "verification.json"),
    experience: join(runDir, "experience.json"),
    report: join(runDir, "report.md"),
  };
}
