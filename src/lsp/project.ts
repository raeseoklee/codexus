import { existsSync, readFileSync } from "node:fs";
import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { basename, dirname, join, relative, resolve } from "node:path";
import { redactSensitiveText } from "../policy/redaction.ts";

type GateStatus = "not_requested" | "passed" | "failed" | "blocked";
type LspStatus = "available" | "unavailable" | "passed" | "failed" | "not_executed";

interface PackageInfo {
  path: string;
  root: string;
  scripts: Record<string, string>;
  devDependencies: Record<string, string>;
  dependencies: Record<string, string>;
}

export interface LspDiagnosticProvider {
  id: string;
  language: string;
  detected: boolean;
  detection: string[];
  protocol: {
    server: string;
    available: boolean;
    startsServer: false;
    reason: string;
  };
  diagnostics: {
    available: boolean;
    command: string[];
    displayCommand: string | null;
    source: "package-script:typecheck" | "local-tsc" | "unavailable";
    reason: string | null;
  };
}

export interface LspCommandResult {
  providerId: string;
  executed: boolean;
  status: "passed" | "failed" | "unavailable";
  exitCode: number | null;
  durationMs: number;
  stdoutTail: string;
  stderrTail: string;
}

export interface LspEvidenceReport {
  schemaVersion: 1;
  stability: "stable";
  command: "lsp status" | "lsp check";
  cwd: string;
  projectRoot: string | null;
  scanMode: "project-files";
  scanAccuracy: "best_effort";
  limits: {
    timeoutMs: number | null;
    outputTailLimit: number;
  };
  autoApply: {
    status: "detect_only";
    startsLanguageServer: false;
    runsDiagnostics: boolean;
    caveat: string;
  };
  lsp: {
    status: LspStatus;
    providerCount: number;
    executableProviderCount: number;
  };
  providers: LspDiagnosticProvider[];
  result: LspCommandResult | null;
  evidenceGaps: Array<Record<string, unknown>>;
  derivableFacts: Array<Record<string, unknown>>;
  heuristicClaims: Array<Record<string, unknown>>;
  blockingUnknowns: Array<Record<string, unknown>>;
  informationalUnknowns: Array<Record<string, unknown>>;
  gate: {
    enabled: boolean;
    status: GateStatus;
    exitCode: number;
    reason: string;
  };
}

const OUTPUT_TAIL_LIMIT = 4_000;
const DEFAULT_TIMEOUT_MS = 60_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readPackageInfo(cwd: string): PackageInfo | null {
  let current = resolve(cwd);
  while (true) {
    const path = join(current, "package.json");
    if (existsSync(path)) {
      try {
        const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
        const scripts = isRecord(parsed) && isRecord(parsed.scripts)
          ? Object.fromEntries(Object.entries(parsed.scripts).filter(([, value]) => typeof value === "string")) as Record<string, string>
          : {};
        const devDependencies = isRecord(parsed) && isRecord(parsed.devDependencies)
          ? Object.fromEntries(Object.entries(parsed.devDependencies).filter(([, value]) => typeof value === "string")) as Record<string, string>
          : {};
        const dependencies = isRecord(parsed) && isRecord(parsed.dependencies)
          ? Object.fromEntries(Object.entries(parsed.dependencies).filter(([, value]) => typeof value === "string")) as Record<string, string>
          : {};
        return { path, root: current, scripts, devDependencies, dependencies };
      } catch {
        return { path, root: current, scripts: {}, devDependencies: {}, dependencies: {} };
      }
    }
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function hasTsSource(dir: string, depth = 0): boolean {
  if (depth > 4 || !existsSync(dir)) return false;
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return false;
  }
  for (const entry of entries) {
    if (entry === "node_modules" || entry === ".git" || entry === ".codexus" || entry === "dist") continue;
    const path = join(dir, entry);
    if (/\.(ts|tsx)$/.test(entry) && !/\.d\.ts$/.test(entry)) return true;
    if (!entry.includes(".") && hasTsSource(path, depth + 1)) return true;
  }
  return false;
}

function commandExists(path: string): boolean {
  return existsSync(path) || (process.platform === "win32" && existsSync(`${path}.cmd`));
}

function npmBin(): string {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function localTscPath(projectRoot: string): string {
  return join(projectRoot, "node_modules", ".bin", process.platform === "win32" ? "tsc.cmd" : "tsc");
}

function detectTypeScriptProvider(cwd: string, pkg: PackageInfo | null): LspDiagnosticProvider | null {
  const projectRoot = pkg?.root ?? resolve(cwd);
  const detection: string[] = [];
  const tsconfig = join(projectRoot, "tsconfig.json");
  if (existsSync(tsconfig)) detection.push("tsconfig.json");
  if (pkg?.scripts.typecheck) detection.push("package.json:scripts.typecheck");
  if (pkg?.devDependencies.typescript || pkg?.dependencies.typescript) detection.push("package.json:typescript-dependency");
  if (hasTsSource(projectRoot)) detection.push("typescript-source");
  if (detection.length === 0) return null;

  if (pkg?.scripts.typecheck) {
    return {
      id: "typescript",
      language: "typescript",
      detected: true,
      detection,
      protocol: {
        server: "typescript-language-server",
        available: false,
        startsServer: false,
        reason: "protocol_server_not_started_in_first_slice",
      },
      diagnostics: {
        available: true,
        command: [npmBin(), "run", "--silent", "typecheck"],
        displayCommand: "npm run --silent typecheck",
        source: "package-script:typecheck",
        reason: null,
      },
    };
  }

  const tsc = localTscPath(projectRoot);
  if (commandExists(tsc)) {
    return {
      id: "typescript",
      language: "typescript",
      detected: true,
      detection,
      protocol: {
        server: "typescript-language-server",
        available: false,
        startsServer: false,
        reason: "protocol_server_not_started_in_first_slice",
      },
      diagnostics: {
        available: true,
        command: [tsc, "--noEmit"],
        displayCommand: `${relative(projectRoot, tsc) || basename(tsc)} --noEmit`,
        source: "local-tsc",
        reason: null,
      },
    };
  }

  return {
    id: "typescript",
    language: "typescript",
    detected: true,
    detection,
    protocol: {
      server: "typescript-language-server",
      available: false,
      startsServer: false,
      reason: "protocol_server_not_started_in_first_slice",
    },
    diagnostics: {
      available: false,
      command: [],
      displayCommand: null,
      source: "unavailable",
      reason: "no_typecheck_script_or_local_tsc",
    },
  };
}

function tailOutput(value: string): string {
  const redacted = redactSensitiveText(value.trim());
  if (redacted.length <= OUTPUT_TAIL_LIMIT) return redacted;
  return `[truncated ${redacted.length - OUTPUT_TAIL_LIMIT} chars]\n${redacted.slice(-OUTPUT_TAIL_LIMIT)}`;
}

function gateFor(options: { gate: boolean; evidenceGaps: unknown[]; blockingUnknowns: unknown[] }) {
  if (!options.gate) {
    return {
      enabled: false,
      status: "not_requested" as const,
      exitCode: 0,
      reason: "gate flag was not set",
    };
  }
  if (options.evidenceGaps.length > 0) {
    return {
      enabled: true,
      status: "failed" as const,
      exitCode: 1,
      reason: "gateable LSP diagnostic evidence gaps are present",
    };
  }
  if (options.blockingUnknowns.length > 0) {
    return {
      enabled: true,
      status: "blocked" as const,
      exitCode: 1,
      reason: "blocking unknowns prevent LSP diagnostics from being derived",
    };
  }
  return {
    enabled: true,
    status: "passed" as const,
    exitCode: 0,
    reason: "no gateable LSP diagnostic gaps or blocking unknowns",
  };
}

export function buildLspStatusReport(cwd: string): LspEvidenceReport {
  const pkg = readPackageInfo(cwd);
  const providers = [detectTypeScriptProvider(cwd, pkg)].filter((item): item is LspDiagnosticProvider => item !== null);
  const executableProviderCount = providers.filter((provider) => provider.diagnostics.available).length;
  const derivableFacts: Array<Record<string, unknown>> = providers.map((provider) => ({
    kind: "lsp_provider_detected",
    gate: false,
    provider: provider.id,
    language: provider.language,
    detection: provider.detection,
    diagnosticsAvailable: provider.diagnostics.available,
  }));
  const informationalUnknowns = providers
    .filter((provider) => !provider.protocol.available)
    .map((provider) => ({
      kind: "lsp_protocol_server_not_started",
      provider: provider.id,
      server: provider.protocol.server,
      reason: provider.protocol.reason,
    }));
  return {
    schemaVersion: 1,
    stability: "stable",
    command: "lsp status",
    cwd,
    projectRoot: pkg?.root ?? null,
    scanMode: "project-files",
    scanAccuracy: "best_effort",
    limits: {
      timeoutMs: null,
      outputTailLimit: OUTPUT_TAIL_LIMIT,
    },
    autoApply: {
      status: "detect_only",
      startsLanguageServer: false,
      runsDiagnostics: false,
      caveat: "Codexus detects project LSP candidates automatically, but does not start a language server or run diagnostics unless a user invokes an explicit check command.",
    },
    lsp: {
      status: providers.length > 0 ? "available" : "unavailable",
      providerCount: providers.length,
      executableProviderCount,
    },
    providers,
    result: null,
    evidenceGaps: [],
    derivableFacts,
    heuristicClaims: [],
    blockingUnknowns: [],
    informationalUnknowns,
    gate: gateFor({ gate: false, evidenceGaps: [], blockingUnknowns: [] }),
  };
}

export function buildLspCheckReport(cwd: string, options: { gate: boolean; timeoutMs?: number }): LspEvidenceReport {
  const status = buildLspStatusReport(cwd);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const provider = status.providers.find((candidate) => candidate.diagnostics.available);
  const blockingUnknowns = [...status.blockingUnknowns];
  const evidenceGaps = [...status.evidenceGaps];
  let result: LspCommandResult | null = null;
  let lspStatus: LspStatus = "unavailable";

  if (!provider) {
    blockingUnknowns.push({
      kind: "lsp_diagnostics_unavailable",
      providerCount: status.providers.length,
      recommendation: "Add a package typecheck script or install a local TypeScript compiler before using LSP diagnostics as a gate.",
    });
  } else {
    const started = Date.now();
    const completed = spawnSync(provider.diagnostics.command[0], provider.diagnostics.command.slice(1), {
      cwd: status.projectRoot ?? cwd,
      encoding: "utf8",
      timeout: timeoutMs,
      env: { ...process.env },
    });
    const durationMs = Date.now() - started;
    const timedOut = completed.error && completed.error.message.includes("ETIMEDOUT");
    const commandError = completed.error && !timedOut ? `diagnostic command error: ${completed.error.message}\n` : "";
    const passed = completed.status === 0 && !timedOut;
    lspStatus = passed ? "passed" : "failed";
    result = {
      providerId: provider.id,
      executed: true,
      status: passed ? "passed" : "failed",
      exitCode: typeof completed.status === "number" ? completed.status : null,
      durationMs,
      stdoutTail: tailOutput(completed.stdout ?? ""),
      stderrTail: tailOutput(`${timedOut ? "diagnostic command timed out\n" : ""}${commandError}${completed.stderr ?? ""}`),
    };
    if (!passed) {
      evidenceGaps.push({
        kind: timedOut ? "lsp_diagnostics_timeout" : "lsp_diagnostics_failed",
        provider: provider.id,
        command: provider.diagnostics.displayCommand,
        exitCode: result.exitCode,
      });
    }
  }

  const gate = gateFor({ gate: options.gate, evidenceGaps, blockingUnknowns });
  return {
    ...status,
    command: "lsp check",
    limits: {
      timeoutMs,
      outputTailLimit: OUTPUT_TAIL_LIMIT,
    },
    autoApply: {
      status: "detect_only",
      startsLanguageServer: false,
      runsDiagnostics: result?.executed === true,
      caveat: "This first LSP slice runs only an explicit project diagnostics command; it does not start or control a long-lived language server.",
    },
    lsp: {
      ...status.lsp,
      status: result ? result.status : "unavailable",
    },
    result,
    evidenceGaps,
    blockingUnknowns,
    gate,
  };
}
