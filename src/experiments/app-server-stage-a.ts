import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { superviseProcess, type SupervisedProcessResult } from "./process-supervisor.ts";
import { ensureDir, writeJsonAtomic } from "../util/fs.ts";
import { trimmedProcessOutput } from "../util/process-output.ts";

export const STAGE_A_PREVIEW_BYTES = 2048;
export const STAGE_A_MAX_SCHEMA_BYTES = 2 * 1024 * 1024;

export type SchemaGeneratedStatus = "ok" | `unavailable:${string}`;
export type MatchesFixture = true | false | "unknown";
export type ObserverAttachResult = "observed" | "unobserved" | "unsupported" | "unknown";
export type ConservativeCapability = "unobserved" | "observed";

export interface SchemaDriftEvidence {
  generated: SchemaGeneratedStatus;
  matchesFixture: MatchesFixture;
  generatedMethods: string[];
  fixtureMethods: string[];
  missingFixtureMethods: string[];
  extraGeneratedMethods: string[];
  sourceFile: string | null;
  schemaFileCount: number;
  boundedSummary: string;
}

export interface AppServerLifecycleEvidence {
  attempted: boolean;
  transport: "direct-listen";
  socketReady: boolean;
  supervised: SupervisedProcessResult | null;
  environmentUnsupported: string | null;
  reason: string;
}

export interface ObserverProbeEvidence {
  observerAttach: ObserverAttachResult;
  reason: string;
  overlapObserved: boolean;
  firstClient: SupervisedProcessResult | null;
  secondClient: SupervisedProcessResult | null;
}

export interface CleanupAssertions {
  appServerStopRequested: boolean;
  appServerStopCompleted: boolean;
  appServerStopSignal: NodeJS.Signals | null;
  daemonStopRequested: boolean;
  daemonStopCompleted: boolean;
  daemonStopSignal: NodeJS.Signals | null;
  daemonStopStatus: "not_attempted" | "passed" | "failed" | "timed_out" | "error";
  daemonStopExitCode: number | null;
  daemonStopError: string | null;
  noLingeringChild: boolean;
  tempDirsRemoved: boolean;
}

export interface StageAIsolation {
  codexHome: string;
  workspace: string;
  socketPath: string;
}

export interface StageAManifest {
  schemaVersion: 1;
  stability: "experimental";
  experimentId: string;
  mode: "isolated-real";
  cwd: string;
  experimentDir: string;
  timeoutMs: number;
  isolation: StageAIsolation;
  schemaDrift: SchemaDriftEvidence;
  appServerLifecycle: AppServerLifecycleEvidence;
  observerAttach: ObserverProbeEvidence;
  cleanup: CleanupAssertions;
  relevantEventMethods: string[];
  conservativeCapability: ConservativeCapability;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundText(value: string, max = STAGE_A_PREVIEW_BYTES): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}...[+${value.length - max}b]`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function stageATempBase(): string {
  return existsSync("/tmp") ? "/tmp" : tmpdir();
}

/**
 * Best-effort extraction of app-server JSON-RPC method names from a generated or
 * fixture schema document. Returns [] when the shape is not understood.
 */
export function extractSchemaMethods(parsed: unknown): string[] {
  const methods = new Set<string>();
  if (!isRecord(parsed)) return [];
  if (Array.isArray(parsed.methods)) {
    for (const method of parsed.methods) {
      if (typeof method === "string") methods.add(method);
    }
  }
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (!isRecord(value)) return;
    const properties = value.properties;
    if (isRecord(properties)) {
      const method = properties.method;
      if (isRecord(method)) {
        if (Array.isArray(method.enum)) {
          for (const candidate of method.enum) {
            if (typeof candidate === "string") methods.add(candidate);
          }
        }
        if (typeof method.const === "string") methods.add(method.const);
      }
    }
    for (const child of Object.values(value)) visit(child);
  };
  visit(parsed);
  return [...methods].sort();
}

const RELEVANT_METHOD_HINTS = ["turn", "thread", "session", "item", "event", "notification"];

/**
 * Best-effort selection of method names that look relevant to turn/session
 * observation. Conservative: returns [] when no methods are known.
 */
export function selectRelevantEventMethods(methods: string[]): string[] {
  return methods.filter((method) => {
    const lower = method.toLowerCase();
    return RELEVANT_METHOD_HINTS.some((hint) => lower.includes(hint));
  });
}

/**
 * Pure, spawn-free builder of the schema drift evidence. Compares a generated
 * schema document (already parsed) against the committed fixture methods.
 */
export function buildSchemaDrift(input: {
  generated: SchemaGeneratedStatus;
  generatedRaw: string;
  generatedParsed: unknown;
  fixtureMethods: string[];
  sourceFile?: string | null;
  schemaFileCount?: number;
}): SchemaDriftEvidence {
  const generatedMethods = input.generated === "ok" ? extractSchemaMethods(input.generatedParsed) : [];
  const generatedSet = new Set(generatedMethods);
  const fixtureSet = new Set(input.fixtureMethods);
  const missingFixtureMethods = input.fixtureMethods.filter((method) => !generatedSet.has(method));
  const extraGeneratedMethods = generatedMethods.filter((method) => !fixtureSet.has(method));
  let matchesFixture: MatchesFixture;
  if (input.generated !== "ok") {
    matchesFixture = "unknown";
  } else if (generatedMethods.length === 0) {
    matchesFixture = "unknown";
  } else {
    matchesFixture = missingFixtureMethods.length === 0;
  }
  const boundedSummary = input.generated === "ok"
    ? boundText(input.generatedRaw)
    : `schema generation ${input.generated}`;
  return {
    generated: input.generated,
    matchesFixture,
    generatedMethods,
    fixtureMethods: input.fixtureMethods,
    missingFixtureMethods,
    extraGeneratedMethods,
    sourceFile: input.sourceFile ?? null,
    schemaFileCount: input.schemaFileCount ?? 0,
    boundedSummary,
  };
}

function processIntervalsOverlap(first: SupervisedProcessResult, second: SupervisedProcessResult): boolean {
  const firstStart = Date.parse(first.startedAt);
  const firstEnd = Date.parse(first.completedAt);
  const secondStart = Date.parse(second.startedAt);
  const secondEnd = Date.parse(second.completedAt);
  if ([firstStart, firstEnd, secondStart, secondEnd].some((value) => Number.isNaN(value))) return false;
  return firstStart < secondEnd && secondStart < firstEnd;
}

function proxyAttached(result: SupervisedProcessResult): boolean {
  if (result.status === "error" || result.status === "failed") return false;
  if (result.stderrPreview.toLowerCase().includes("failed to connect")) return false;
  return result.status === "stopped" || result.status === "timed_out";
}

export function buildObserverProbeEvidence(input: {
  firstClient: SupervisedProcessResult;
  secondClient: SupervisedProcessResult;
}): ObserverProbeEvidence {
  const overlapObserved = processIntervalsOverlap(input.firstClient, input.secondClient);
  const firstAttached = proxyAttached(input.firstClient);
  const secondAttached = proxyAttached(input.secondClient);
  if (input.firstClient.status === "error" || input.secondClient.status === "error") {
    return {
      observerAttach: "unknown",
      reason: "proxy client could not be spawned in this environment",
      overlapObserved,
      firstClient: input.firstClient,
      secondClient: input.secondClient,
    };
  }
  if (overlapObserved && firstAttached && secondAttached) {
    return {
      observerAttach: "observed",
      reason: "two proxy clients overlapped and stayed attached without an immediate connection failure",
      overlapObserved,
      firstClient: input.firstClient,
      secondClient: input.secondClient,
    };
  }
  if (firstAttached && !secondAttached) {
    return {
      observerAttach: "unsupported",
      reason: "second concurrent observer client could not attach; socket appears single-client or disruptive",
      overlapObserved,
      firstClient: input.firstClient,
      secondClient: input.secondClient,
    };
  }
  return {
    observerAttach: "unknown",
    reason: "could not confirm a concurrent read-only observer attachment in this environment",
    overlapObserved,
    firstClient: input.firstClient,
    secondClient: input.secondClient,
  };
}

/**
 * Pure, spawn-free assembly of the Stage A manifest from already-collected
 * evidence. Enforces the conservative capability invariant: capability is only
 * "observed" when the observer probe actually observed concurrent attachment.
 */
export function buildStageAManifest(input: {
  experimentId: string;
  cwd: string;
  experimentDir: string;
  timeoutMs: number;
  isolation: StageAIsolation;
  schemaDrift: SchemaDriftEvidence;
  appServerLifecycle: AppServerLifecycleEvidence;
  observerAttach: ObserverProbeEvidence;
  cleanup: CleanupAssertions;
  relevantEventMethods: string[];
}): StageAManifest {
  const conservativeCapability: ConservativeCapability = input.observerAttach.observerAttach === "observed"
    ? "observed"
    : "unobserved";
  return {
    schemaVersion: 1,
    stability: "experimental",
    experimentId: input.experimentId,
    mode: "isolated-real",
    cwd: input.cwd,
    experimentDir: input.experimentDir,
    timeoutMs: input.timeoutMs,
    isolation: input.isolation,
    schemaDrift: input.schemaDrift,
    appServerLifecycle: input.appServerLifecycle,
    observerAttach: input.observerAttach,
    cleanup: input.cleanup,
    relevantEventMethods: input.relevantEventMethods,
    conservativeCapability,
  };
}

interface SchemaGenerationOutcome {
  generated: SchemaGeneratedStatus;
  generatedRaw: string;
  generatedParsed: unknown;
  sourceFile: string | null;
  schemaFileCount: number;
}

async function listJsonFiles(dir: string, prefix = ""): Promise<string[]> {
  const entries = await readdir(join(dir, prefix), { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const relative = join(prefix, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listJsonFiles(dir, relative));
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      files.push(relative);
    }
  }
  return files;
}

async function generateSchema(
  command: string,
  outDir: string,
  timeoutMs: number,
  env: NodeJS.ProcessEnv,
): Promise<SchemaGenerationOutcome> {
  await ensureDir(outDir);
  const result = spawnSync(command, ["app-server", "generate-json-schema", "--out", outDir, "--experimental"], {
    encoding: "utf8",
    timeout: timeoutMs,
    env,
  });
  if (result.error) {
    const code = (result.error as NodeJS.ErrnoException).code ?? "spawn_error";
    return { generated: `unavailable:${code}`, generatedRaw: "", generatedParsed: null, sourceFile: null, schemaFileCount: 0 };
  }
  if (typeof result.status === "number" && result.status !== 0) {
    const stderr = trimmedProcessOutput(result.stderr).slice(0, 200) || `exit_${result.status}`;
    return { generated: `unavailable:${stderr}`, generatedRaw: "", generatedParsed: null, sourceFile: null, schemaFileCount: 0 };
  }
  const jsonFiles = await listJsonFiles(outDir);
  const preferred = [
    "codex_app_server_protocol.v2.schemas.json",
    "codex_app_server_protocol.schemas.json",
    "app-server.json",
    "schema.json",
    "app-server-schema.json",
  ];
  const candidates = [
    ...preferred.filter((name) => jsonFiles.includes(name)),
    ...jsonFiles.filter((name) => !preferred.includes(name)).sort(),
  ];
  let raw: string | null = null;
  let sourceFile: string | null = null;
  for (const candidate of candidates) {
    const path = join(outDir, candidate);
    if (existsSync(path)) {
      const info = await stat(path);
      if (info.size > STAGE_A_MAX_SCHEMA_BYTES) continue;
      raw = await readFile(path, "utf8");
      sourceFile = candidate;
      break;
    }
  }
  if (raw === null) {
    const stdout = trimmedProcessOutput(result.stdout);
    if (stdout.startsWith("{")) {
      raw = stdout;
      sourceFile = "stdout";
    }
  }
  if (raw === null) {
    const oversized = jsonFiles.length > 0 ? "schema_too_large_or_unrecognized" : "no_schema_file";
    return { generated: `unavailable:${oversized}`, generatedRaw: "", generatedParsed: null, sourceFile: null, schemaFileCount: jsonFiles.length };
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    return { generated: "ok", generatedRaw: raw, generatedParsed: parsed, sourceFile, schemaFileCount: jsonFiles.length };
  } catch {
    return { generated: "unavailable:schema_parse_failed", generatedRaw: boundText(raw), generatedParsed: null, sourceFile, schemaFileCount: jsonFiles.length };
  }
}

function noLingeringChild(supervised: SupervisedProcessResult | null): boolean {
  if (!supervised) return true;
  // The supervised process result is only resolved on close/error/timeout, so a
  // resolved result means the child is no longer running. We additionally treat
  // "error" (failed to spawn) as no lingering child.
  return supervised.status !== null;
}

async function waitForSocket(path: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (existsSync(path)) return true;
    await sleep(25);
  }
  return existsSync(path);
}

function classifyEnvironmentUnsupported(supervised: SupervisedProcessResult): string | null {
  const output = `${supervised.stdoutPreview}\n${supervised.stderrPreview}`.toLowerCase();
  if (output.includes("managed standalone codex install not found")) return "missing_standalone_install";
  if (output.includes("path must be shorter than sun_len")) return "socket_path_too_long";
  return null;
}

/**
 * Run the Stage A isolated-real evidence flow against the REAL codex binary in
 * full isolation (temp CODEX_HOME, temp workspace, temp socket). Records
 * truthful evidence including NEGATIVE/unavailable outcomes. Never touches the
 * user's real daemon, socket, or config.
 */
export async function runIsolatedRealStageA(input: {
  command: string;
  cwd: string;
  experimentDir: string;
  experimentId: string;
  timeoutMs: number;
  fixtureMethods: string[];
  record: boolean;
}): Promise<{ manifest: StageAManifest; manifestPath: string | null }> {
  const tempBase = stageATempBase();
  const codexHome = await mkdtemp(join(tempBase, "codexus-stagea-home-"));
  const workspace = await mkdtemp(join(tempBase, "codexus-stagea-ws-"));
  const socketDir = await mkdtemp(join(tempBase, "codexus-stagea-sock-"));
  const socketPath = join(socketDir, "app-server.sock");
  const schemaOutDir = join(workspace, "schema");

  const env = {
    ...process.env,
    CODEX_HOME: codexHome,
  };

  let schemaDrift: SchemaDriftEvidence;
  let appServerLifecycle: AppServerLifecycleEvidence;
  let observerAttach: ObserverProbeEvidence;
  let cleanup: CleanupAssertions = {
    appServerStopRequested: false,
    appServerStopCompleted: false,
    appServerStopSignal: null,
    daemonStopRequested: false,
    daemonStopCompleted: false,
    daemonStopSignal: null,
    daemonStopStatus: "not_attempted",
    daemonStopExitCode: null,
    daemonStopError: null,
    noLingeringChild: true,
    tempDirsRemoved: false,
  };
  let relevantEventMethods: string[];

  try {
    // Step 1: schema drift.
    const generation = await generateSchema(input.command, schemaOutDir, input.timeoutMs, env);
    schemaDrift = buildSchemaDrift({
      generated: generation.generated,
      generatedRaw: generation.generatedRaw,
      generatedParsed: generation.generatedParsed,
      fixtureMethods: input.fixtureMethods,
      sourceFile: generation.sourceFile,
      schemaFileCount: generation.schemaFileCount,
    });
    const generatedMethods = schemaDrift.generatedMethods.length > 0
      ? schemaDrift.generatedMethods
      : input.fixtureMethods;
    relevantEventMethods = selectRelevantEventMethods(generatedMethods);

    // Step 2: isolated app-server lifecycle + observer probe. Use direct
    // `--listen` instead of managed daemon start so Stage A does not require or
    // mutate a standalone install under the user's real CODEX_HOME.
    const lifecycleStopAfterMs = Math.max(750, Math.min(1500, Math.floor(input.timeoutMs / 2)));
    const daemonPromise = superviseProcess({
      command: input.command,
      args: ["app-server", "--listen", `unix://${socketPath}`],
      cwd: workspace,
      timeoutMs: input.timeoutMs,
      stopAfterMs: lifecycleStopAfterMs,
      previewChars: STAGE_A_PREVIEW_BYTES,
      env,
      keepStdinOpen: true,
    });
    const socketReady = await waitForSocket(socketPath, Math.min(1000, Math.max(100, Math.floor(input.timeoutMs / 4))));
    const proxyArgs = ["app-server", "proxy", "--sock", socketPath];
    if (socketReady) {
      const proxyStopAfterMs = Math.max(300, Math.min(900, Math.floor(input.timeoutMs / 4)));
      const firstClientPromise = superviseProcess({
        command: input.command,
        args: proxyArgs,
        cwd: workspace,
        timeoutMs: input.timeoutMs,
        stopAfterMs: proxyStopAfterMs,
        previewChars: STAGE_A_PREVIEW_BYTES,
        env,
        keepStdinOpen: true,
      });
      await sleep(Math.min(100, Math.max(10, Math.floor(proxyStopAfterMs / 3))));
      const secondClientPromise = superviseProcess({
        command: input.command,
        args: proxyArgs,
        cwd: workspace,
        timeoutMs: input.timeoutMs,
        stopAfterMs: proxyStopAfterMs,
        previewChars: STAGE_A_PREVIEW_BYTES,
        env,
        keepStdinOpen: true,
      });
      const [firstClient, secondClient] = await Promise.all([firstClientPromise, secondClientPromise]);
      observerAttach = buildObserverProbeEvidence({ firstClient, secondClient });
    } else {
      observerAttach = {
        observerAttach: "unknown",
        reason: "isolated app-server socket did not become ready; skipping observer probe",
        overlapObserved: false,
        firstClient: null,
        secondClient: null,
      };
    }
    const daemon = await daemonPromise;
    const environmentUnsupported = classifyEnvironmentUnsupported(daemon);
    appServerLifecycle = {
      attempted: true,
      transport: "direct-listen",
      socketReady,
      supervised: daemon,
      environmentUnsupported,
      reason: daemon.status === "error"
        ? `isolated app-server could not start: ${daemon.error ?? "spawn_error"}`
        : socketReady
          ? `isolated app-server listened on a temporary control socket and was supervised to status:${daemon.status}`
          : `isolated app-server did not expose a temporary control socket before status:${daemon.status}`,
    };

    // Step 3: cleanup: the direct-listen app-server is stopped by the process
    // supervisor. Managed daemon stop is intentionally not used in Stage A.
    const lingering = !noLingeringChild(daemon)
      || !noLingeringChild(observerAttach.firstClient)
      || !noLingeringChild(observerAttach.secondClient);
    cleanup = {
      appServerStopRequested: daemon.cleanup.requested,
      appServerStopCompleted: daemon.cleanup.completed,
      appServerStopSignal: daemon.cleanup.signal,
      daemonStopRequested: false,
      daemonStopCompleted: false,
      daemonStopSignal: null,
      daemonStopStatus: "not_attempted",
      daemonStopExitCode: null,
      daemonStopError: null,
      noLingeringChild: !lingering,
      tempDirsRemoved: false,
    };
  } finally {
    // Always remove the temp isolation dirs. The manifest under .codexus is
    // preserved separately.
    await rm(codexHome, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    await rm(workspace, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    await rm(socketDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }

  cleanup.tempDirsRemoved = !existsSync(codexHome) && !existsSync(workspace) && !existsSync(socketDir);

  const manifest = buildStageAManifest({
    experimentId: input.experimentId,
    cwd: input.cwd,
    experimentDir: input.experimentDir,
    timeoutMs: input.timeoutMs,
    isolation: { codexHome, workspace, socketPath },
    schemaDrift,
    appServerLifecycle,
    observerAttach,
    cleanup,
    relevantEventMethods,
  });

  let manifestPath: string | null = null;
  if (input.record) {
    await ensureDir(input.experimentDir);
    manifestPath = resolve(input.experimentDir, "manifest.json");
    await writeJsonAtomic(manifestPath, manifest);
  }

  return { manifest, manifestPath };
}
