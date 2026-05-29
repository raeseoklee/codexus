import { spawn, spawnSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import type { HarnessConfig } from "../config/schema.ts";
import type { DriverCapabilities, DriverEvent, DriverProbe, DriverRequest, DriverResult, HarnessDriver } from "./contract.ts";
import { trimmedProcessOutput } from "../util/process-output.ts";

export function parseCodexExecCapabilities(help: string): DriverCapabilities {
  return {
    supportsJsonl: /--json\b/.test(help),
    supportsSandboxFlag: /--sandbox\b/.test(help),
    supportsApprovalFlag: /--ask-for-approval\b/.test(help),
    supportsModelFlag: /--model\b/.test(help),
    supportsOutputLastMessage: /--output-last-message\b/.test(help),
    stderrMayContainWarningsOnSuccess: true,
    finalMessageShapes: ["item.completed.item.text", "driver.raw_text"],
  };
}

export function defaultCodexExecCapabilities(): DriverCapabilities {
  return {
    supportsJsonl: true,
    supportsSandboxFlag: true,
    supportsApprovalFlag: false,
    supportsModelFlag: true,
    supportsOutputLastMessage: true,
    stderrMayContainWarningsOnSuccess: true,
    finalMessageShapes: ["item.completed.item.text", "driver.raw_text"],
  };
}

export function buildCodexExecArgs(
  request: DriverRequest,
  capabilities: DriverCapabilities = defaultCodexExecCapabilities(),
): string[] {
  const args = [
    "exec",
    "--skip-git-repo-check",
    "-C",
    request.cwd,
  ];
  if (capabilities.supportsJsonl) {
    args.splice(1, 0, "--json");
  }
  if (capabilities.supportsSandboxFlag) {
    args.push("--sandbox", request.config.codex.sandbox);
  }
  if (request.config.codex.model && capabilities.supportsModelFlag) {
    args.push("--model", request.config.codex.model);
  }
  if (capabilities.supportsApprovalFlag) {
    args.push("--ask-for-approval", request.config.codex.approval);
  }
  args.push(request.prompt);
  return args;
}

function stringifyEventPayload(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  for (const key of ["message", "text", "content", "summary"]) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
    if (Array.isArray(candidate)) {
      const parts = candidate
        .map((item) => stringifyEventPayload(item))
        .filter((item): item is string => Boolean(item));
      if (parts.length > 0) return parts.join("\n");
    }
  }
  for (const key of ["item", "message", "delta"]) {
    const candidate = record[key];
    if (candidate && typeof candidate === "object") {
      const nested = stringifyEventPayload(candidate);
      if (nested) return nested;
    }
  }
  if (Array.isArray(record.items)) {
    const parts = record.items
      .map((item) => stringifyEventPayload(item))
      .filter((item): item is string => Boolean(item));
    if (parts.length > 0) return parts.join("\n");
  }
  return null;
}

export function extractCodexEventText(value: unknown): string | null {
  return finalTextFromEvent(value);
}

function finalTextFromEvent(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const type = typeof record.type === "string" ? record.type : "";
  if (type.includes("assistant") || type.includes("message") || type.includes("completed")) {
    return stringifyEventPayload(record);
  }
  return stringifyEventPayload(record);
}

function extractUsage(value: unknown): DriverResult["usage"] | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.usage && typeof record.usage === "object" && !Array.isArray(record.usage)) {
    return { available: true, ...(record.usage as DriverResult["usage"]) };
  }
  const usage: DriverResult["usage"] = {};
  for (const key of ["input_tokens", "output_tokens", "total_tokens", "cached_input_tokens", "reasoning_tokens"]) {
    if (typeof record[key] === "number") usage[key] = record[key];
  }
  for (const key of ["inputTokens", "outputTokens", "totalTokens", "cachedInputTokens", "reasoningTokens"]) {
    if (typeof record[key] === "number") usage[key] = record[key];
  }
  return Object.keys(usage).length > 0 ? { available: true, ...usage } : null;
}

export class CodexExecDriver implements HarnessDriver {
  readonly name = "codex-exec";

  async probe(configOrCommand: HarnessConfig | string = "codex"): Promise<DriverProbe> {
    const command = typeof configOrCommand === "string" ? configOrCommand : configOrCommand.codex.command;
    const result = spawnSync(command, ["exec", "--help"], { encoding: "utf8" });
    const stdout = trimmedProcessOutput(result.stdout);
    const stderr = trimmedProcessOutput(result.stderr);
    const help = stdout || stderr;
    const capabilities = result.status === 0
      ? parseCodexExecCapabilities(help)
      : defaultCodexExecCapabilities();
    return {
      available: result.status === 0,
      summary: result.status === 0 ? "codex exec available" : (stderr || result.error?.message || "codex exec unavailable"),
      capabilities,
      details: { status: result.status },
    };
  }

  async run(request: DriverRequest, emit: (event: DriverEvent) => Promise<void>, signal?: AbortSignal): Promise<DriverResult> {
    const probe = await this.probe(request.config);
    const args = buildCodexExecArgs(request, probe.capabilities);
    if (!probe.capabilities.supportsApprovalFlag) {
      await emit({
        type: "config.option_ignored",
        source: this.name,
        payload: {
          option: "codex.approval",
          value: request.config.codex.approval,
          reason: "codex exec does not advertise --ask-for-approval support",
        },
      });
    }
    if (request.config.codex.model && !probe.capabilities.supportsModelFlag) {
      await emit({
        type: "config.option_ignored",
        source: this.name,
        payload: {
          option: "codex.model",
          value: request.config.codex.model,
          reason: "codex exec does not advertise --model support",
        },
      });
    }
    await emit({
      type: "driver.started",
      source: this.name,
      payload: {
        command: request.config.codex.command,
        args: args.slice(0, -1).concat("[prompt]"),
        capabilities: probe.capabilities,
      },
    });

    return await new Promise<DriverResult>((resolve) => {
      let stderr = "";
      let stdout = "";
      let buffer = "";
      let finalMessage = "";
      let usage: DriverResult["usage"] | null = null;
      let settled = false;
      let termination: { reason: "timeout" | "abort"; message: string } | null = null;
      let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
      let killTimer: ReturnType<typeof setTimeout> | null = null;
      const rawStdoutPath = typeof request.context?.rawStdoutPath === "string" ? request.context.rawStdoutPath : null;
      const rawStderrPath = typeof request.context?.rawStderrPath === "string" ? request.context.rawStderrPath : null;
      const runTimeoutMs = request.config.codex.runTimeoutMs;
      const child = spawn(request.config.codex.command, args, {
        cwd: request.cwd,
        stdio: ["ignore", "pipe", "pipe"],
      });

      const cleanup = (): void => {
        if (timeoutTimer) clearTimeout(timeoutTimer);
        if (killTimer) clearTimeout(killTimer);
        signal?.removeEventListener("abort", onAbort);
      };

      const persistAndResolve = (result: DriverResult, stderrOverride?: string): void => {
        if (settled) return;
        settled = true;
        cleanup();
        const writes = [
          rawStdoutPath ? writeFile(rawStdoutPath, stdout) : Promise.resolve(),
          rawStderrPath ? writeFile(rawStderrPath, stderrOverride ?? stderr) : Promise.resolve(),
        ];
        void Promise.all(writes).finally(() => {
          resolve(result);
        });
      };

      const terminate = (reason: "timeout" | "abort", message: string): void => {
        if (settled || termination) return;
        termination = { reason, message };
        void emit({
          type: reason === "timeout" ? "driver.timeout" : "driver.cancel_requested",
          source: this.name,
          payload: {
            reason,
            message,
            ...(reason === "timeout" ? { timeoutMs: runTimeoutMs } : {}),
          },
        });
        child.kill("SIGTERM");
        killTimer = setTimeout(() => {
          if (!settled) child.kill("SIGKILL");
        }, 2_000);
      };

      function onAbort(): void {
        terminate("abort", signal?.reason instanceof Error ? signal.reason.message : "run aborted");
      }

      if (signal?.aborted) {
        terminate("abort", signal.reason instanceof Error ? signal.reason.message : "run aborted");
      } else {
        signal?.addEventListener("abort", onAbort, { once: true });
      }

      if (typeof runTimeoutMs === "number") {
        timeoutTimer = setTimeout(() => {
          terminate("timeout", `codex exec timed out after ${runTimeoutMs}ms`);
        }, runTimeoutMs);
      }

      async function handleLine(line: string): Promise<void> {
        const trimmed = line.trim();
        if (!trimmed) return;
        try {
          const parsed = JSON.parse(trimmed) as unknown;
          const text = finalTextFromEvent(parsed);
          if (text) finalMessage = text;
          const parsedUsage = extractUsage(parsed);
          if (parsedUsage) usage = { ...(usage ?? {}), ...parsedUsage };
          await emit({
            type: "driver.raw",
            source: "codex-exec",
            payload: parsed as DriverEvent["payload"],
          });
        } catch {
          if (trimmed) {
            finalMessage = trimmed;
            await emit({
              type: "driver.raw_text",
              source: "codex-exec",
              payload: { line: trimmed },
            });
          }
        }
      }

      child.stdout?.on("data", (chunk) => {
        const text = chunk.toString();
        stdout += text;
        buffer += text;
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          void handleLine(line);
        }
      });
      child.stderr?.on("data", (chunk) => {
        stderr += chunk.toString();
      });
      child.on("error", (error) => {
        const message = error instanceof Error ? error.message : String(error);
        persistAndResolve(termination
          ? {
            status: "cancelled",
            exitCode: 130,
            ...(finalMessage ? { finalMessage } : {}),
            usage: usage ?? { available: false },
            error: termination.message,
          }
          : {
            status: "failed",
            usage: usage ?? { available: false },
            error: message,
          }, `${stderr}${message}\n`);
      });
      child.on("close", (code) => {
        const flush = buffer.trim() ? handleLine(buffer) : Promise.resolve();
        void flush.finally(() => {
          if (termination) {
            persistAndResolve({
              status: "cancelled",
              exitCode: 130,
              ...(finalMessage ? { finalMessage } : {}),
              usage: usage ?? { available: false },
              error: termination.message,
            });
            return;
          }
          persistAndResolve({
            status: code === 0 ? "succeeded" : "failed",
            exitCode: code ?? null ?? undefined,
            ...(finalMessage ? { finalMessage } : {}),
            usage: usage ?? { available: false },
            ...(code !== 0 && stderr ? { error: stderr.trim() } : {}),
          });
        });
      });
    });
  }
}
