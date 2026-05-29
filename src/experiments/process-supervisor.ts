import { spawn } from "node:child_process";

export interface SupervisedProcessResult {
  schemaVersion: 1;
  command: string;
  args: string[];
  cwd: string;
  pid: number | null;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  timeoutMs: number;
  stopAfterMs: number;
  status: "stopped" | "exited" | "failed" | "timed_out" | "error";
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdoutPreview: string;
  stderrPreview: string;
  error: string | null;
  cleanup: {
    requested: boolean;
    signal: NodeJS.Signals | null;
    completed: boolean;
  };
}

export async function superviseProcess(options: {
  command: string;
  args: string[];
  cwd: string;
  timeoutMs: number;
  stopAfterMs?: number;
  previewChars?: number;
}): Promise<SupervisedProcessResult> {
  const timeoutMs = options.timeoutMs;
  const stopAfterMs = options.stopAfterMs ?? Math.min(250, Math.max(50, Math.floor(timeoutMs / 4)));
  const previewChars = options.previewChars ?? 1000;
  const startedAt = new Date().toISOString();
  const start = Date.now();
  let stdout = "";
  let stderr = "";
  let timedOut = false;
  let stopRequested = false;
  let cleanupSignal: NodeJS.Signals | null = null;

  return await new Promise<SupervisedProcessResult>((resolve) => {
    const child = spawn(options.command, options.args, {
      cwd: options.cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const finish = (status: SupervisedProcessResult["status"], exitCode: number | null, signal: NodeJS.Signals | null, error: string | null) => {
      clearTimeout(stopTimer);
      clearTimeout(timeoutTimer);
      resolve({
        schemaVersion: 1,
        command: options.command,
        args: options.args,
        cwd: options.cwd,
        pid: child.pid ?? null,
        startedAt,
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - start,
        timeoutMs,
        stopAfterMs,
        status,
        exitCode,
        signal,
        stdoutPreview: stdout.trim().slice(0, previewChars),
        stderrPreview: stderr.trim().slice(0, previewChars),
        error,
        cleanup: {
          requested: stopRequested || timedOut,
          signal: cleanupSignal,
          completed: stopRequested || timedOut ? true : false,
        },
      });
    };

    const stopTimer = setTimeout(() => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      stopRequested = true;
      cleanupSignal = "SIGTERM";
      child.kill("SIGTERM");
    }, stopAfterMs);

    const timeoutTimer = setTimeout(() => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      timedOut = true;
      cleanupSignal = "SIGKILL";
      child.kill("SIGKILL");
    }, timeoutMs);

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      finish("error", null, null, error instanceof Error ? error.message : String(error));
    });
    child.on("close", (code, signal) => {
      if (timedOut) {
        finish("timed_out", code, signal, null);
        return;
      }
      if (stopRequested) {
        finish("stopped", code, signal, null);
        return;
      }
      finish(code === 0 ? "exited" : "failed", code, signal, null);
    });
  });
}
