import { existsSync, realpathSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { findCodexusPackageRoot } from "../util/package-root.ts";

export type NotifyHookStatus = "installed" | "missing" | "blocked";

export interface NotifyHookTrustStatus {
  projectPath: string;
  trusted: boolean;
  trustLevel: string | null;
  reason: "trusted" | "project_not_found" | "trust_level_not_trusted";
}

export interface NotifyHookConfigStatus {
  schemaVersion: 1;
  status: NotifyHookStatus;
  installed: boolean;
  configPath: string;
  scriptPath: string;
  command: string[] | null;
  previousNotify: string[] | null;
  trust: NotifyHookTrustStatus;
  reason: string | null;
}

export interface NotifyHookInstallResult extends NotifyHookConfigStatus {
  changed: boolean;
}

interface NotifyLine {
  index: number;
  command: string[] | null;
  error: string | null;
}

export function codexHome(): string {
  return process.env.CODEX_HOME ? resolve(process.env.CODEX_HOME) : join(homedir(), ".codex");
}

export function codexConfigPath(): string {
  return join(codexHome(), "config.toml");
}

export function notifyHookScriptPath(): string {
  return join(findCodexusPackageRoot(), "scripts", "codexus-notify-hook.mjs");
}

function notifyCommand(previousNotify: string[] | null = null): string[] {
  const command = [process.execPath, notifyHookScriptPath(), "--event", "turn-ended"];
  if (previousNotify) command.push("--previous-notify", JSON.stringify(previousNotify));
  return command;
}

function formatNotify(command: string[]): string {
  return `notify = ${JSON.stringify(command)}`;
}

function readTopLevelNotify(text: string): NotifyLine | null {
  const lines = text.split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    if (trimmed.startsWith("[")) return null;
    const match = line.match(/^\s*notify\s*=\s*(.+?)\s*$/);
    if (!match) continue;
    const raw = match[1];
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) {
        return { index, command: null, error: "notify_not_string_array" };
      }
      return { index, command: parsed, error: null };
    } catch {
      return { index, command: null, error: "notify_not_json_array" };
    }
  }
  return null;
}

function isCodexusNotifyCommand(command: string[] | null): boolean {
  return command?.some((item) => item.endsWith("codexus-notify-hook.mjs")) ?? false;
}

function previousNotify(command: string[] | null): string[] | null {
  if (!command) return null;
  const index = command.indexOf("--previous-notify");
  if (index === -1 || typeof command[index + 1] !== "string") return null;
  try {
    const parsed = JSON.parse(command[index + 1]) as unknown;
    return Array.isArray(parsed) && parsed.every((item) => typeof item === "string") ? parsed : null;
  } catch {
    return null;
  }
}

function projectPathCandidates(cwd: string): string[] {
  const candidates = new Set<string>();
  const resolved = resolve(cwd);
  candidates.add(resolved);
  try {
    candidates.add(realpathSync.native(resolved));
  } catch {
    // Keep the resolved path as the only candidate when realpath is unavailable.
  }
  for (const candidate of [...candidates]) {
    if (candidate.startsWith("/private/")) candidates.add(candidate.slice("/private".length));
    if (candidate.startsWith("/var/")) candidates.add(`/private${candidate}`);
  }
  return [...candidates];
}

function projectTableHeader(cwd: string): string {
  return `[projects.${JSON.stringify(cwd)}]`;
}

function readProjectTrust(text: string, cwd: string): NotifyHookTrustStatus {
  const projectPath = resolve(cwd);
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => projectPathCandidates(cwd).some((candidate) => line.trim() === projectTableHeader(candidate)));
  if (start === -1) {
    return { projectPath, trusted: false, trustLevel: null, reason: "project_not_found" };
  }
  let trustLevel: string | null = null;
  for (let index = start + 1; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) break;
    const match = lines[index].match(/^\s*trust_level\s*=\s*"([^"]+)"\s*$/);
    if (match) {
      trustLevel = match[1];
      break;
    }
  }
  return trustLevel === "trusted"
    ? { projectPath, trusted: true, trustLevel, reason: "trusted" }
    : { projectPath, trusted: false, trustLevel, reason: "trust_level_not_trusted" };
}

function statusFromText(text: string, cwd: string, configPath = codexConfigPath()): NotifyHookConfigStatus {
  const trust = readProjectTrust(text, cwd);
  const line = readTopLevelNotify(text);
  const command = line?.command ?? null;
  const installed = isCodexusNotifyCommand(command);
  return {
    schemaVersion: 1,
    status: installed ? "installed" : "missing",
    installed,
    configPath,
    scriptPath: notifyHookScriptPath(),
    command,
    previousNotify: previousNotify(command),
    trust,
    reason: line?.error ?? null,
  };
}

export async function inspectNotifyHookConfig(cwd: string): Promise<NotifyHookConfigStatus> {
  const path = codexConfigPath();
  const text = existsSync(path) ? await readFile(path, "utf8") : "";
  return statusFromText(text, cwd, path);
}

export async function installNotifyHookConfig(cwd: string): Promise<NotifyHookInstallResult> {
  const path = codexConfigPath();
  const text = existsSync(path) ? await readFile(path, "utf8") : "";
  const trust = readProjectTrust(text, cwd);
  if (!trust.trusted) {
    return {
      ...statusFromText(text, cwd, path),
      status: "blocked",
      installed: false,
      trust,
      reason: trust.reason,
      changed: false,
    };
  }

  const lines = text.split(/\r?\n/);
  const line = readTopLevelNotify(text);
  if (line?.error) {
    return {
      ...statusFromText(text, cwd, path),
      status: "blocked",
      reason: line.error,
      changed: false,
    };
  }
  if (isCodexusNotifyCommand(line?.command ?? null)) {
    return { ...statusFromText(text, cwd, path), changed: false };
  }

  const nextCommand = notifyCommand(line?.command ?? null);
  let next: string;
  if (line) {
    lines[line.index] = formatNotify(nextCommand);
    next = lines.join("\n");
  } else {
    const insertion = formatNotify(nextCommand);
    next = text.trim().length === 0
      ? `${insertion}\n`
      : text.startsWith("[")
        ? `${insertion}\n\n${text}`
        : `${insertion}\n${text.startsWith("\n") ? text : `\n${text}`}`;
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, next);
  return { ...statusFromText(next, cwd, path), changed: true };
}
