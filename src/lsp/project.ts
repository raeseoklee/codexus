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

type LspAdapterStatus = "implemented" | "unavailable";
type LspAdapterRole = "diagnostics-command" | "protocol-server";

export interface LspAdapterDescriptor {
  id: string;
  role: LspAdapterRole;
  status: LspAdapterStatus;
  language: string;
  command: string | null;
  input: {
    kind: "project-diagnostics" | "language-server-protocol";
    existingCommandRequired: boolean;
  };
  capability: {
    canRunDiagnostics: boolean;
    canStartLanguageServer: boolean;
    canApplyEdits: boolean;
    canReadOpenBuffers: boolean;
    canMutateWorkspace: boolean;
  };
  authority: {
    startsLanguageServerAuthority: false;
    diagnosticsAuthority: boolean;
    editAuthority: false;
    workspaceMutationAuthority: false;
    completionAuthority: false;
  };
  boundaries: {
    explicitCommandOnly: boolean;
    finiteTimeoutRequired: boolean;
    boundedOutput: boolean;
    redactionRequired: boolean;
    protocolLifecycleDeferred: boolean;
  };
  caveat: string;
}

export interface LspAdapterReport {
  schemaVersion: 1;
  stability: "experimental";
  type: "codexus.lsp.adapters";
  command: "lsp adapters";
  cwd: string;
  projectRoot: string | null;
  adapters: LspAdapterDescriptor[];
  summary: {
    total: number;
    implemented: number;
    unavailable: number;
    diagnosticsCommandImplemented: boolean;
    protocolServerImplemented: false;
  };
  authority: {
    startsLanguageServerAuthority: false;
    editAuthority: false;
    workspaceMutationAuthority: false;
    completionAuthority: false;
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

export function buildLspAdapterReport(cwd: string): LspAdapterReport {
  const status = buildLspStatusReport(cwd);
  const providers = status.providers.length > 0
    ? status.providers
    : [{
      id: "typescript",
      language: "typescript",
      detected: false,
      detection: [],
      protocol: {
        server: "typescript-language-server",
        available: false,
        startsServer: false as const,
        reason: "typescript_project_not_detected",
      },
      diagnostics: {
        available: false,
        command: [],
        displayCommand: null,
        source: "unavailable" as const,
        reason: "typescript_project_not_detected",
      },
    }];

  const adapters: LspAdapterDescriptor[] = providers.flatMap((provider) => {
    const diagnosticsImplemented = provider.diagnostics.available;
    return [
      {
        id: `${provider.id}-diagnostics-command`,
        role: "diagnostics-command",
        status: diagnosticsImplemented ? "implemented" : "unavailable",
        language: provider.language,
        command: provider.diagnostics.displayCommand,
        input: {
          kind: "project-diagnostics",
          existingCommandRequired: true,
        },
        capability: {
          canRunDiagnostics: diagnosticsImplemented,
          canStartLanguageServer: false,
          canApplyEdits: false,
          canReadOpenBuffers: false,
          canMutateWorkspace: false,
        },
        authority: {
          startsLanguageServerAuthority: false,
          diagnosticsAuthority: diagnosticsImplemented,
          editAuthority: false,
          workspaceMutationAuthority: false,
          completionAuthority: false,
        },
        boundaries: {
          explicitCommandOnly: true,
          finiteTimeoutRequired: true,
          boundedOutput: true,
          redactionRequired: true,
          protocolLifecycleDeferred: true,
        },
        caveat: diagnosticsImplemented
          ? "This adapter runs only the existing project diagnostics command when explicitly invoked; it does not start or control an LSP server."
          : `Project diagnostics are unavailable for this provider: ${provider.diagnostics.reason ?? "no explicit diagnostics command"}.`,
      },
      {
        id: `${provider.id}-protocol-server`,
        role: "protocol-server",
        status: "unavailable",
        language: provider.language,
        command: provider.protocol.server,
        input: {
          kind: "language-server-protocol",
          existingCommandRequired: true,
        },
        capability: {
          canRunDiagnostics: false,
          canStartLanguageServer: false,
          canApplyEdits: false,
          canReadOpenBuffers: false,
          canMutateWorkspace: false,
        },
        authority: {
          startsLanguageServerAuthority: false,
          diagnosticsAuthority: false,
          editAuthority: false,
          workspaceMutationAuthority: false,
          completionAuthority: false,
        },
        boundaries: {
          explicitCommandOnly: true,
          finiteTimeoutRequired: true,
          boundedOutput: true,
          redactionRequired: true,
          protocolLifecycleDeferred: true,
        },
        caveat: `Long-lived ${provider.protocol.server} lifecycle is deferred; Codexus does not auto-start project language servers in this slice.`,
      },
    ];
  });

  return {
    schemaVersion: 1,
    stability: "experimental",
    type: "codexus.lsp.adapters",
    command: "lsp adapters",
    cwd,
    projectRoot: status.projectRoot,
    adapters,
    summary: {
      total: adapters.length,
      implemented: adapters.filter((adapter) => adapter.status === "implemented").length,
      unavailable: adapters.filter((adapter) => adapter.status === "unavailable").length,
      diagnosticsCommandImplemented: adapters.some((adapter) => adapter.role === "diagnostics-command" && adapter.status === "implemented"),
      protocolServerImplemented: false,
    },
    authority: {
      startsLanguageServerAuthority: false,
      editAuthority: false,
      workspaceMutationAuthority: false,
      completionAuthority: false,
    },
  };
}

function isLspAdapterRole(value: unknown): value is LspAdapterRole {
  return value === "diagnostics-command" || value === "protocol-server";
}

function isLspAdapterStatus(value: unknown): value is LspAdapterStatus {
  return value === "implemented" || value === "unavailable";
}

function validateBooleanObject(value: unknown, errors: string[], path: string, required: string[]) {
  if (!isRecord(value)) {
    errors.push(`${path}:not_object`);
    return;
  }
  for (const key of required) {
    if (typeof value[key] !== "boolean") errors.push(`${path}.${key}:expected_boolean`);
  }
}

export function validateLspAdapterReport(value: unknown, path = "lsp-adapter") {
  const errors: string[] = [];
  if (!isRecord(value)) return { valid: false, errors: [`${path}:not_object`] };
  if (value.schemaVersion !== 1) errors.push("schemaVersion:not_1");
  if (value.stability !== "experimental") errors.push("stability:not_experimental");
  if (value.type !== "codexus.lsp.adapters") errors.push("type:not_codexus_lsp_adapters");
  if (value.command !== "lsp adapters") errors.push("command:not_lsp_adapters");
  if (typeof value.cwd !== "string" || !value.cwd) errors.push("cwd:missing_string");
  if (!(value.projectRoot === null || typeof value.projectRoot === "string")) errors.push("projectRoot:invalid");
  if (!Array.isArray(value.adapters)) {
    errors.push("adapters:expected_array");
  } else {
    for (const [index, adapter] of value.adapters.entries()) {
      const prefix = `adapters.${index}`;
      if (!isRecord(adapter)) {
        errors.push(`${prefix}:not_object`);
        continue;
      }
      if (typeof adapter.id !== "string" || !adapter.id) errors.push(`${prefix}.id:missing_string`);
      if (!isLspAdapterRole(adapter.role)) errors.push(`${prefix}.role:invalid_enum`);
      if (!isLspAdapterStatus(adapter.status)) errors.push(`${prefix}.status:invalid_enum`);
      if (typeof adapter.language !== "string" || !adapter.language) errors.push(`${prefix}.language:missing_string`);
      if (!(adapter.command === null || typeof adapter.command === "string")) errors.push(`${prefix}.command:invalid`);
      if (!isRecord(adapter.input)) {
        errors.push(`${prefix}.input:not_object`);
      } else {
        if (adapter.input.kind !== "project-diagnostics" && adapter.input.kind !== "language-server-protocol") errors.push(`${prefix}.input.kind:invalid_enum`);
        if (typeof adapter.input.existingCommandRequired !== "boolean") errors.push(`${prefix}.input.existingCommandRequired:expected_boolean`);
      }
      validateBooleanObject(adapter.capability, errors, `${prefix}.capability`, [
        "canRunDiagnostics",
        "canStartLanguageServer",
        "canApplyEdits",
        "canReadOpenBuffers",
        "canMutateWorkspace",
      ]);
      validateBooleanObject(adapter.authority, errors, `${prefix}.authority`, [
        "startsLanguageServerAuthority",
        "diagnosticsAuthority",
        "editAuthority",
        "workspaceMutationAuthority",
        "completionAuthority",
      ]);
      validateBooleanObject(adapter.boundaries, errors, `${prefix}.boundaries`, [
        "explicitCommandOnly",
        "finiteTimeoutRequired",
        "boundedOutput",
        "redactionRequired",
        "protocolLifecycleDeferred",
      ]);
      if (typeof adapter.caveat !== "string" || !adapter.caveat) errors.push(`${prefix}.caveat:missing_string`);
    }
  }
  if (!isRecord(value.summary)) {
    errors.push("summary:not_object");
  } else {
    if (typeof value.summary.total !== "number") errors.push("summary.total:expected_number");
    if (typeof value.summary.implemented !== "number") errors.push("summary.implemented:expected_number");
    if (typeof value.summary.unavailable !== "number") errors.push("summary.unavailable:expected_number");
    if (typeof value.summary.diagnosticsCommandImplemented !== "boolean") errors.push("summary.diagnosticsCommandImplemented:expected_boolean");
    if (value.summary.protocolServerImplemented !== false) errors.push("summary.protocolServerImplemented:not_false");
  }
  if (!isRecord(value.authority)) {
    errors.push("authority:not_object");
  } else {
    if (value.authority.startsLanguageServerAuthority !== false) errors.push("authority.startsLanguageServerAuthority:not_false");
    if (value.authority.editAuthority !== false) errors.push("authority.editAuthority:not_false");
    if (value.authority.workspaceMutationAuthority !== false) errors.push("authority.workspaceMutationAuthority:not_false");
    if (value.authority.completionAuthority !== false) errors.push("authority.completionAuthority:not_false");
  }
  return { valid: errors.length === 0, errors };
}
