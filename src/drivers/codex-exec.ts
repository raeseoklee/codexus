import { spawn, spawnSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import type { DriverCapabilities, DriverEvent, DriverProbe, DriverRequest, DriverResult, HarnessDriver } from "./contract.ts";

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

export class CodexExecDriver implements HarnessDriver {
  readonly name = "codex-exec";

  async probe(command = "codex"): Promise<DriverProbe> {
    const result = spawnSync(command, ["exec", "--help"], { encoding: "utf8" });
    const help = result.stdout || result.stderr || "";
    const capabilities = result.status === 0
      ? parseCodexExecCapabilities(help)
      : defaultCodexExecCapabilities();
    return {
      available: result.status === 0,
      summary: result.status === 0 ? "codex exec available" : (result.stderr.trim() || "codex exec unavailable"),
      capabilities,
      details: { status: result.status },
    };
  }

  async run(request: DriverRequest, emit: (event: DriverEvent) => Promise<void>): Promise<DriverResult> {
    const probe = await this.probe(request.config.codex.command);
    const args = buildCodexExecArgs(request, probe.capabilities);
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
      const rawStdoutPath = typeof request.context?.rawStdoutPath === "string" ? request.context.rawStdoutPath : null;
      const rawStderrPath = typeof request.context?.rawStderrPath === "string" ? request.context.rawStderrPath : null;
      const child = spawn(request.config.codex.command, args, {
        cwd: request.cwd,
        stdio: ["ignore", "pipe", "pipe"],
      });

      async function handleLine(line: string): Promise<void> {
        const trimmed = line.trim();
        if (!trimmed) return;
        try {
          const parsed = JSON.parse(trimmed) as unknown;
          const text = finalTextFromEvent(parsed);
          if (text) finalMessage = text;
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
        const writes = [
          rawStdoutPath ? writeFile(rawStdoutPath, stdout) : Promise.resolve(),
          rawStderrPath ? writeFile(rawStderrPath, `${stderr}${message}\n`) : Promise.resolve(),
        ];
        void Promise.all(writes);
        resolve({
          status: "failed",
          error: message,
        });
      });
      child.on("close", (code) => {
        const flush = buffer.trim() ? handleLine(buffer) : Promise.resolve();
        void flush.finally(() => {
          const writes = [
            rawStdoutPath ? writeFile(rawStdoutPath, stdout) : Promise.resolve(),
            rawStderrPath ? writeFile(rawStderrPath, stderr) : Promise.resolve(),
          ];
          void Promise.all(writes).finally(() => {
            resolve({
              status: code === 0 ? "succeeded" : "failed",
              exitCode: code ?? null ?? undefined,
              ...(finalMessage ? { finalMessage } : {}),
              ...(code !== 0 && stderr ? { error: stderr.trim() } : {}),
            });
          });
        });
      });
    });
  }
}
