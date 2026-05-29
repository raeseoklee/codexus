import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ensureDir } from "../util/fs.ts";

export type VerificationStatus = "passed" | "failed" | "skipped" | "timed_out" | "error";

export interface VerificationCommandRecord {
  id: string;
  command: string;
  cwd: string;
  startedAt: string;
  completedAt: string;
  exitCode: number | null;
  status: Exclude<VerificationStatus, "skipped">;
  stdoutPath: string;
  stderrPath: string;
  summary: string;
}

export interface VerificationResult {
  schemaVersion: 1;
  status: VerificationStatus;
  commands: VerificationCommandRecord[];
}

export interface RunVerificationOptions {
  cwd: string;
  commands: string[];
  artifactsDir: string;
  timeoutMs?: number;
}

export function aggregateVerificationStatus(records: VerificationCommandRecord[]): VerificationStatus {
  if (records.length === 0) return "skipped";
  if (records.some((record) => record.status === "error")) return "error";
  if (records.some((record) => record.status === "timed_out")) return "timed_out";
  if (records.some((record) => record.status === "failed")) return "failed";
  return "passed";
}

async function runOne(command: string, index: number, options: RunVerificationOptions): Promise<VerificationCommandRecord> {
  await ensureDir(options.artifactsDir);
  const id = `verify_${String(index + 1).padStart(3, "0")}`;
  const stdoutPath = join(options.artifactsDir, `${id}.stdout.log`);
  const stderrPath = join(options.artifactsDir, `${id}.stderr.log`);
  const startedAt = new Date().toISOString();
  const timeoutMs = options.timeoutMs ?? 120_000;

  return await new Promise<VerificationCommandRecord>((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    const child = spawn(command, {
      cwd: options.cwd,
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const timer = setTimeout(() => {
      if (settled) return;
      child.kill("SIGTERM");
      settled = true;
      const completedAt = new Date().toISOString();
      void Promise.all([writeFile(stdoutPath, stdout), writeFile(stderrPath, stderr)]).finally(() => {
        resolve({
          id,
          command,
          cwd: options.cwd,
          startedAt,
          completedAt,
          exitCode: null,
          status: "timed_out",
          stdoutPath,
          stderrPath,
          summary: `timed out after ${timeoutMs}ms`,
        });
      });
    }, timeoutMs);

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      if (settled) return;
      clearTimeout(timer);
      settled = true;
      const completedAt = new Date().toISOString();
      stderr += `${error instanceof Error ? error.message : String(error)}\n`;
      void Promise.all([writeFile(stdoutPath, stdout), writeFile(stderrPath, stderr)]).finally(() => {
        resolve({
          id,
          command,
          cwd: options.cwd,
          startedAt,
          completedAt,
          exitCode: null,
          status: "error",
          stdoutPath,
          stderrPath,
          summary: "verification command failed to start",
        });
      });
    });
    child.on("close", (code) => {
      if (settled) return;
      clearTimeout(timer);
      settled = true;
      const completedAt = new Date().toISOString();
      const status = code === 0 ? "passed" : "failed";
      void Promise.all([writeFile(stdoutPath, stdout), writeFile(stderrPath, stderr)]).finally(() => {
        resolve({
          id,
          command,
          cwd: options.cwd,
          startedAt,
          completedAt,
          exitCode: code,
          status,
          stdoutPath,
          stderrPath,
          summary: status === "passed" ? "passed" : `failed with exit code ${code}`,
        });
      });
    });
  });
}

export async function runVerification(options: RunVerificationOptions): Promise<VerificationResult> {
  if (options.commands.length === 0) {
    return { schemaVersion: 1, status: "skipped", commands: [] };
  }

  const records: VerificationCommandRecord[] = [];
  for (let index = 0; index < options.commands.length; index += 1) {
    const record = await runOne(options.commands[index], index, options);
    records.push(record);
    if (record.status !== "passed") break;
  }

  return {
    schemaVersion: 1,
    status: aggregateVerificationStatus(records),
    commands: records,
  };
}
