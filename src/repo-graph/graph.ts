import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { harnessRoot } from "../ledger/paths.ts";
import { ensureDir, writeJsonAtomic } from "../util/fs.ts";
import { matchesPattern, normalizeGlobPath } from "../util/glob.ts";
import { sha256Bytes, sha256CanonicalJson, sha256Text } from "../util/hash.ts";
import { extractStaticImportEdges, isStaticSourceFile, listRepositoryFiles } from "../util/static-import-scan.ts";

export type RepoGraphStatus = "pass" | "fail" | "unknown";

export interface RepoGraphProviderDescriptor {
  id: "codexus-lite" | string;
  type: "codexus.repo.graph.provider";
  external: boolean;
  runtimeDeps: boolean;
  accuracy: "best_effort_text" | string;
  capabilities: {
    build: boolean;
    import: boolean;
    check: boolean;
    semanticClaims: boolean;
  };
}

export interface ScopedUntrackedFingerprint {
  hash: string;
  count: number;
  partial: boolean;
}

export interface ScopedWorkspaceFingerprint {
  schemaVersion: 1;
  kind: "scoped";
  root: ".";
  patterns: string[];
  scopeHash: string;
  trackedContentHash: string | null;
  stagedDiffHash: string | null;
  unstagedDiffHash: string | null;
  untracked: ScopedUntrackedFingerprint;
  head: string | null;
  cwd: string;
  computedAt: string;
  degraded: boolean;
  degradedReason: string | null;
}

export interface RepoGraphNode {
  id: string;
  kind: "file" | "module" | string;
  path?: string;
  label?: string;
}

export interface RepoGraphEdge {
  id: string;
  kind: "imports" | string;
  from: string;
  to: string;
  evidence?: string;
}

export interface RepoGraphEvidenceGap {
  kind:
    | "package_json_missing"
    | "graph_schema_invalid"
    | "provider_invalid"
    | "scope_invalid"
    | "source_path_unsafe"
    | "source_hash_missing"
    | "graph_id_mismatch"
    | "scoped_fingerprint_stale"
    | "dangling_edge"
    | "node_invalid";
  gate: true;
  evidence: string | null;
  policy: string;
  recommendation: string;
  files?: string[];
  edges?: string[];
}

export interface RepoGraphDerivableFact {
  kind:
    | "graph_built"
    | "graph_loaded"
    | "graph_schema_valid"
    | "provider_descriptor_valid"
    | "scope_declared"
    | "scoped_fingerprint_fresh"
    | "edge_endpoints_resolved"
    | "source_provenance_recorded";
  gate: boolean;
  evidence: string;
  count?: number;
  files?: string[];
}

export interface RepoGraphHeuristicClaim {
  kind: "semantic_graph_meaning_not_evaluated";
  confidence: "low" | "medium" | "high";
  evidence: string;
  recommendation: string;
}

export interface RepoGraphUnknown {
  kind: "scoped_fingerprint_degraded" | "scoped_fingerprint_partial" | "graph_unreadable";
  gate: boolean;
  evidence: string | null;
  recommendation: string;
  files?: string[];
}

export interface RepoGraphGate {
  enabled: boolean;
  status: "not_requested" | "passed" | "failed" | "blocked";
  exitCode: 0 | 1;
  reason: string;
}

export interface RepoGraphArtifact {
  schemaVersion: 1;
  stability: "experimental";
  type: "codexus.repo.graph";
  graphId: string;
  provider: RepoGraphProviderDescriptor;
  scope: {
    patterns: string[];
    root: ".";
  };
  sourceWorkspaceFingerprint: ScopedWorkspaceFingerprint;
  source: {
    kind: string;
    path: string | null;
    hash: string | null;
    sanitized: boolean;
  };
  nodes: RepoGraphNode[];
  edges: RepoGraphEdge[];
  layers: unknown[];
  tour: unknown[];
  evidenceGaps: RepoGraphEvidenceGap[];
  derivableFacts: RepoGraphDerivableFact[];
  heuristicClaims: RepoGraphHeuristicClaim[];
  blockingUnknowns: RepoGraphUnknown[];
  informationalUnknowns: RepoGraphUnknown[];
  gate: RepoGraphGate;
}

export interface RepoGraphBuildResult extends RepoGraphArtifact {
  command: "graph build";
  artifactPath: string;
}

export interface RepoGraphCheckResult extends RepoGraphArtifact {
  command: "graph check";
  graphRef: string | null;
  graphPath: string | null;
  repoGraph: {
    status: RepoGraphStatus;
    nodeCount: number;
    edgeCount: number;
    freshness: "fresh" | "stale" | "unknown";
  };
}

export interface RepoGraphImportOptions {
  cwd: string;
  graphProvider?: string;
  source: string;
  scope?: string[];
}

export interface RepoGraphImportResult extends RepoGraphArtifact {
  command: "graph import";
  artifactPath: string;
  sourcePath: string;
  sourceHash: string;
  imported: {
    nodeCount: number;
    edgeCount: number;
    execution: "none";
    packageImported: false;
    completionAuthority: false;
  };
}

export interface RepoGraphSearchOptions {
  cwd: string;
  graph: string;
  query: string;
  limit?: number;
}

export interface RepoGraphSearchResult {
  schemaVersion: 1;
  stability: "experimental";
  command: "graph search";
  cwd: string;
  graphRef: string;
  graphId: string;
  query: string;
  results: Array<{
    id: string;
    kind: "node" | "edge";
    label: string;
    score: number;
    evidence: string | null;
  }>;
  check: {
    status: RepoGraphStatus;
    freshness: RepoGraphCheckResult["repoGraph"]["freshness"];
    evidenceGaps: number;
    blockingUnknowns: number;
  };
  eligibleForAutomaticInjection: false;
  completionAuthority: false;
}

export interface RepoGraphExplainOptions {
  cwd: string;
  graph: string;
  id: string;
}

export interface RepoGraphExplainResult {
  schemaVersion: 1;
  stability: "experimental";
  command: "graph explain";
  cwd: string;
  graphRef: string;
  graphId: string;
  id: string;
  found: boolean;
  kind: "node" | "edge" | "missing";
  node: RepoGraphNode | null;
  edge: RepoGraphEdge | null;
  adjacentEdges: RepoGraphEdge[];
  check: {
    status: RepoGraphStatus;
    freshness: RepoGraphCheckResult["repoGraph"]["freshness"];
    evidenceGaps: number;
    blockingUnknowns: number;
  };
  advisoryOnly: true;
  eligibleForAutomaticInjection: false;
  completionAuthority: false;
}

export interface RepoGraphBuildOptions {
  cwd: string;
  graphProvider?: string;
  scope?: string[];
}

export interface RepoGraphCheckOptions {
  cwd: string;
  graph: string;
  gate?: boolean;
}

const DEFAULT_SCOPE = ["src/**"];
const MAX_IMPORTED_GRAPH_BYTES = 5 * 1024 * 1024;
const MAX_SCOPED_UNTRACKED_FILES = 200;
const MAX_SCOPED_UNTRACKED_BYTES = 5 * 1024 * 1024;
const EXCLUDED_UNTRACKED_PREFIXES = [".codexus/", ".codex-harness/"];

interface GitResult {
  ok: boolean;
  stdout: string;
  status: number | null;
  error?: string;
}

function runGit(cwd: string, args: string[]): GitResult {
  const result = spawnSync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return {
    ok: result.status === 0,
    stdout: typeof result.stdout === "string" ? result.stdout : "",
    status: result.status,
    ...(result.error instanceof Error ? { error: result.error.message } : {}),
  };
}

function findPackageRoot(cwd: string): string | null {
  let current = resolve(cwd);
  while (true) {
    if (existsSync(join(current, "package.json"))) return current;
    const next = dirname(current);
    if (next === current) return null;
    current = next;
  }
}

function normalizePath(value: string): string {
  return normalizeGlobPath(value).replace(/^\/+/, "");
}

function normalizeScopes(scopes: string[] | undefined): string[] {
  const raw = scopes && scopes.length > 0 ? scopes : DEFAULT_SCOPE;
  return [...new Set(raw.map((scope) => normalizePath(scope)).filter(Boolean))].sort();
}

function isSafeRelativePath(path: string): boolean {
  const normalized = normalizePath(path);
  return normalized.length > 0
    && !path.startsWith("/")
    && !/^[a-z]:/i.test(path)
    && !normalized.startsWith("../")
    && normalized !== ".."
    && !normalized.includes("/../")
    && !normalized.includes("\0");
}

function isPathInside(root: string, path: string): boolean {
  const relativePath = relative(root, path).replace(/\\/g, "/");
  return relativePath === "" || (!relativePath.startsWith("../") && relativePath !== ".." && !relativePath.startsWith("/"));
}

function pathInScope(path: string, patterns: string[]): boolean {
  return patterns.some((pattern) => matchesPattern(path, pattern));
}

function splitZ(value: string): string[] {
  return value.split("\0").filter((line) => line.length > 0).map(normalizePath).sort();
}

function emptyUntracked(): ScopedUntrackedFingerprint {
  return { hash: sha256Text(""), count: 0, partial: false };
}

function hashPathBytes(root: string, paths: string[]): string {
  const parts: string[] = [];
  for (const path of paths) {
    const absolute = join(root, path);
    const stat = existsSync(absolute) ? statSync(absolute) : null;
    const contentHash = stat?.isFile() ? sha256Bytes(readFileSync(absolute)) : "absent";
    parts.push(`${path}\0${contentHash}`);
  }
  return sha256Text(parts.join("\n"));
}

function hashUntracked(root: string, paths: string[]): ScopedUntrackedFingerprint {
  let partial = paths.length > MAX_SCOPED_UNTRACKED_FILES;
  const bounded = paths.slice(0, MAX_SCOPED_UNTRACKED_FILES);
  const parts: string[] = [];
  let totalBytes = 0;
  let included = 0;
  for (const path of bounded) {
    const absolute = join(root, path);
    let contentHash = "absent";
    try {
      const stat = existsSync(absolute) ? statSync(absolute) : null;
      if (stat?.isFile()) {
        if (totalBytes + stat.size > MAX_SCOPED_UNTRACKED_BYTES) {
          partial = true;
          break;
        }
        totalBytes += stat.size;
        contentHash = sha256Bytes(readFileSync(absolute));
      }
    } catch {
      partial = true;
      contentHash = `unreadable:${path}`;
    }
    parts.push(`${path}\0${contentHash}`);
    included += 1;
  }
  return { hash: sha256Text(parts.join("\n")), count: included, partial };
}

function scopeHashPayload(fingerprint: Omit<ScopedWorkspaceFingerprint, "scopeHash" | "computedAt" | "cwd" | "head">): string {
  return sha256CanonicalJson({
    patterns: fingerprint.patterns,
    trackedContentHash: fingerprint.trackedContentHash,
    stagedDiffHash: fingerprint.stagedDiffHash,
    unstagedDiffHash: fingerprint.unstagedDiffHash,
    untracked: fingerprint.untracked,
    degraded: fingerprint.degraded,
    degradedReason: fingerprint.degradedReason,
  });
}

function degradedScopedFingerprint(cwd: string, patterns: string[], reason: string): ScopedWorkspaceFingerprint {
  const base = {
    schemaVersion: 1 as const,
    kind: "scoped" as const,
    root: "." as const,
    patterns,
    trackedContentHash: null,
    stagedDiffHash: null,
    unstagedDiffHash: null,
    untracked: emptyUntracked(),
    head: null,
    cwd,
    computedAt: new Date().toISOString(),
    degraded: true,
    degradedReason: reason,
  };
  return { ...base, scopeHash: scopeHashPayload(base) };
}

export function computeScopedWorkspaceFingerprint(cwd: string, patternsInput: string[] = DEFAULT_SCOPE): ScopedWorkspaceFingerprint {
  const packageRoot = findPackageRoot(cwd) ?? resolve(cwd);
  const patterns = normalizeScopes(patternsInput);
  const topLevel = runGit(packageRoot, ["rev-parse", "--show-toplevel"]);
  if (!topLevel.ok) return degradedScopedFingerprint(packageRoot, patterns, topLevel.error ? `git_unavailable:${topLevel.error}` : "not_a_git_repository");
  const root = topLevel.stdout.trim();
  if (!isPathInside(root, packageRoot)) return degradedScopedFingerprint(packageRoot, patterns, "package_root_outside_git_root");

  const packagePrefix = normalizePath(relative(root, packageRoot));
  const pathspecs = (patterns.length > 0 ? patterns : DEFAULT_SCOPE)
    .map((pattern) => packagePrefix ? `${packagePrefix}/${pattern}` : pattern);
  const tracked = runGit(root, ["ls-files", "-z", "--", ...pathspecs]);
  const stagedDiff = runGit(root, ["diff", "--binary", "--cached", "--", ...pathspecs]);
  const unstagedDiff = runGit(root, ["diff", "--binary", "--", ...pathspecs]);
  const untracked = runGit(root, ["ls-files", "--others", "--exclude-standard", "-z", "--", ...pathspecs]);
  const head = runGit(root, ["rev-parse", "HEAD"]);
  if (!tracked.ok || !stagedDiff.ok || !unstagedDiff.ok || !untracked.ok) return degradedScopedFingerprint(packageRoot, patterns, "git_scoped_query_failed");

  const trackedPaths = splitZ(tracked.stdout)
    .filter((path) => isPathInside(packageRoot, join(root, path)))
    .map((path) => normalizePath(relative(packageRoot, join(root, path))))
    .sort();
  const untrackedPaths = splitZ(untracked.stdout)
    .filter((path) => !EXCLUDED_UNTRACKED_PREFIXES.some((prefix) => path.startsWith(prefix)))
    .filter((path) => isPathInside(packageRoot, join(root, path)))
    .map((path) => normalizePath(relative(packageRoot, join(root, path))))
    .sort();

  const base = {
    schemaVersion: 1 as const,
    kind: "scoped" as const,
    root: "." as const,
    patterns,
    trackedContentHash: hashPathBytes(packageRoot, trackedPaths),
    stagedDiffHash: sha256Text(stagedDiff.stdout),
    unstagedDiffHash: sha256Text(unstagedDiff.stdout),
    untracked: hashUntracked(packageRoot, untrackedPaths),
    head: head.ok ? head.stdout.trim() : null,
    cwd: packageRoot,
    computedAt: new Date().toISOString(),
    degraded: false,
    degradedReason: null,
  };
  return { ...base, scopeHash: scopeHashPayload(base) };
}

export function scopedFingerprintsEqual(a: ScopedWorkspaceFingerprint | null | undefined, b: ScopedWorkspaceFingerprint | null | undefined): boolean {
  if (!a || !b) return false;
  if (a.degraded || b.degraded) return false;
  if (a.untracked.partial || b.untracked.partial) return false;
  return a.root === b.root
    && JSON.stringify(a.patterns) === JSON.stringify(b.patterns)
    && a.trackedContentHash === b.trackedContentHash
    && a.stagedDiffHash === b.stagedDiffHash
    && a.unstagedDiffHash === b.unstagedDiffHash
    && a.untracked.hash === b.untracked.hash;
}

function codexusLiteProvider(): RepoGraphProviderDescriptor {
  return {
    id: "codexus-lite",
    type: "codexus.repo.graph.provider",
    external: false,
    runtimeDeps: false,
    accuracy: "best_effort_text",
    capabilities: {
      build: true,
      import: false,
      check: true,
      semanticClaims: false,
    },
  };
}

function externalJsonProvider(id: string): RepoGraphProviderDescriptor {
  return {
    id,
    type: "codexus.repo.graph.provider",
    external: true,
    runtimeDeps: false,
    accuracy: "external_json_declared",
    capabilities: {
      build: false,
      import: true,
      check: true,
      semanticClaims: true,
    },
  };
}

function fileNodeId(path: string): string {
  return `file:${path}`;
}

function moduleNodeId(specifier: string): string {
  return `module:${specifier}`;
}

function buildLiteNodesAndEdges(packageRoot: string, patterns: string[]): { nodes: RepoGraphNode[]; edges: RepoGraphEdge[]; files: string[] } {
  const files = listRepositoryFiles(packageRoot)
    .filter((path) => pathInScope(path, patterns))
    .sort();
  const nodesById = new Map<string, RepoGraphNode>();
  const edges: RepoGraphEdge[] = [];
  for (const file of files) {
    const sourceId = fileNodeId(file);
    nodesById.set(sourceId, { id: sourceId, kind: "file", path: file });
    if (!isStaticSourceFile(file)) continue;
    const content = readFileSync(join(packageRoot, file), "utf8");
    for (const item of extractStaticImportEdges(file, content).edges) {
      const targetId = moduleNodeId(item.specifier);
      nodesById.set(targetId, { id: targetId, kind: "module", label: item.specifier });
      edges.push({
        id: sha256CanonicalJson({ kind: "imports", from: sourceId, to: targetId, evidence: `${file}:${item.line}` }),
        kind: "imports",
        from: sourceId,
        to: targetId,
        evidence: `${file}:${item.line}`,
      });
    }
  }
  return { nodes: [...nodesById.values()].sort((a, b) => a.id.localeCompare(b.id)), edges: edges.sort((a, b) => a.id.localeCompare(b.id)), files };
}

function graphGateFor(status: RepoGraphStatus, enabled: boolean, hasBlockingUnknowns: boolean): RepoGraphGate {
  if (!enabled) {
    return {
      enabled,
      status: "not_requested",
      exitCode: 0,
      reason: "pass --gate to make structural graph invariants affect the process exit code",
    };
  }
  if (hasBlockingUnknowns) {
    return {
      enabled,
      status: "blocked",
      exitCode: 1,
      reason: "blocking unknowns prevent a trustworthy repository graph gate decision",
    };
  }
  if (status === "fail") {
    return {
      enabled,
      status: "failed",
      exitCode: 1,
      reason: "gateable repository graph evidence gaps are present",
    };
  }
  return {
    enabled,
    status: "passed",
    exitCode: 0,
    reason: "no gateable repository graph evidence gaps or blocking unknowns",
  };
}

function graphIdentityPayload(graph: Omit<RepoGraphArtifact, "graphId">): unknown {
  return {
    schemaVersion: graph.schemaVersion,
    stability: graph.stability,
    type: graph.type,
    provider: graph.provider,
    scope: graph.scope,
    sourceWorkspaceFingerprint: graph.sourceWorkspaceFingerprint,
    source: graph.source,
    nodes: graph.nodes,
    edges: graph.edges,
    layers: graph.layers,
    tour: graph.tour,
    derivableFacts: graph.derivableFacts,
    heuristicClaims: graph.heuristicClaims,
  };
}

export function computeRepoGraphId(graph: Omit<RepoGraphArtifact, "graphId">): string {
  return sha256CanonicalJson(graphIdentityPayload(graph));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function graphStoragePath(packageRoot: string, graphId: string): string {
  return join(harnessRoot(packageRoot), "repo-graphs", graphId.replace(/^sha256:/, "sha256-"), "graph.json");
}

function resolveSafeSourcePath(packageRoot: string, source: string): { absolute: string; relative: string } {
  const absolute = resolve(packageRoot, source);
  if (!isPathInside(packageRoot, absolute)) throw new Error(`invalid_repo_graph_source:${source}`);
  const relativePath = normalizePath(relative(packageRoot, absolute));
  if (!isSafeRelativePath(relativePath)) throw new Error(`invalid_repo_graph_source:${source}`);
  if (!existsSync(absolute)) throw new Error(`repo_graph_source_missing:${source}`);
  const stat = statSync(absolute);
  if (!stat.isFile()) throw new Error(`invalid_repo_graph_source:${source}`);
  if (stat.size > MAX_IMPORTED_GRAPH_BYTES) throw new Error(`repo_graph_source_too_large:${source}`);
  return { absolute, relative: relativePath };
}

function stringField(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function externalNodes(raw: unknown): unknown[] {
  if (isRecord(raw) && Array.isArray(raw.nodes)) return raw.nodes;
  if (isRecord(raw) && isRecord(raw.graph) && Array.isArray(raw.graph.nodes)) return raw.graph.nodes;
  return [];
}

function externalEdges(raw: unknown): unknown[] {
  if (isRecord(raw) && Array.isArray(raw.edges)) return raw.edges;
  if (isRecord(raw) && isRecord(raw.graph) && Array.isArray(raw.graph.edges)) return raw.graph.edges;
  return [];
}

function normalizeImportedNodes(raw: unknown): RepoGraphNode[] {
  const nodes = new Map<string, RepoGraphNode>();
  for (const [index, item] of externalNodes(raw).entries()) {
    if (!isRecord(item)) continue;
    const id = stringField(item.id, `external-node:${index}`);
    const kind = stringField(item.kind, "external");
    const label = typeof item.label === "string" ? item.label : typeof item.name === "string" ? item.name : undefined;
    let path: string | undefined;
    if (typeof item.path === "string" && item.path.trim()) {
      const normalized = normalizePath(item.path);
      if (!isSafeRelativePath(normalized)) throw new Error(`invalid_repo_graph_import_path:${item.path}`);
      path = normalized;
    }
    nodes.set(id, {
      id,
      kind,
      ...(path ? { path } : {}),
      ...(label ? { label } : {}),
    });
  }
  return [...nodes.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function normalizeImportedEdges(raw: unknown): RepoGraphEdge[] {
  const edges: RepoGraphEdge[] = [];
  for (const [index, item] of externalEdges(raw).entries()) {
    if (!isRecord(item)) continue;
    const from = typeof item.from === "string" ? item.from : typeof item.source === "string" ? item.source : null;
    const to = typeof item.to === "string" ? item.to : typeof item.target === "string" ? item.target : null;
    if (!from || !to) continue;
    const kind = stringField(item.kind, typeof item.type === "string" ? item.type : "external");
    const evidence = typeof item.evidence === "string" ? item.evidence : typeof item.label === "string" ? item.label : undefined;
    edges.push({
      id: stringField(item.id, sha256CanonicalJson({ kind, from, to, evidence: evidence ?? null, index })),
      kind,
      from,
      to,
      ...(evidence ? { evidence } : {}),
    });
  }
  return edges.sort((left, right) => left.id.localeCompare(right.id));
}

export async function importRepoGraph(options: RepoGraphImportOptions): Promise<RepoGraphImportResult> {
  const packageRoot = findPackageRoot(options.cwd);
  if (!packageRoot) throw new Error("package_json_missing");
  const providerId = options.graphProvider ?? "understand-anything";
  if (providerId !== "understand-anything" && providerId !== "external-json") throw new Error(`unsupported_graph_provider:${providerId}`);
  const sourcePath = resolveSafeSourcePath(packageRoot, options.source);
  const rawBytes = readFileSync(sourcePath.absolute);
  const raw = JSON.parse(rawBytes.toString("utf8")) as unknown;
  const nodes = normalizeImportedNodes(raw);
  const edges = normalizeImportedEdges(raw);
  const patterns = normalizeScopes(options.scope);
  const fingerprint = computeScopedWorkspaceFingerprint(packageRoot, patterns);
  const sourceHash = sha256Bytes(rawBytes);
  const base: Omit<RepoGraphArtifact, "graphId"> = {
    schemaVersion: 1,
    stability: "experimental",
    type: "codexus.repo.graph",
    provider: externalJsonProvider(providerId),
    scope: { patterns, root: "." },
    sourceWorkspaceFingerprint: fingerprint,
    source: { kind: providerId, path: sourcePath.relative, hash: sourceHash, sanitized: true },
    nodes,
    edges,
    layers: [],
    tour: [],
    evidenceGaps: [],
    derivableFacts: [{
      kind: "source_provenance_recorded",
      gate: true,
      evidence: `${providerId}:${sourcePath.relative}`,
      count: nodes.length,
      files: [sourcePath.relative],
    }],
    heuristicClaims: [{
      kind: "semantic_graph_meaning_not_evaluated",
      confidence: "high",
      evidence: "External JSON graph import normalizes nodes and edges but does not evaluate semantic meaning.",
      recommendation: "Treat imported graph meaning as advisory until review evidence confirms it.",
    }],
    blockingUnknowns: [],
    informationalUnknowns: [],
    gate: graphGateFor("pass", false, false),
  };
  const graph: RepoGraphArtifact = { ...base, graphId: computeRepoGraphId(base) };
  const artifactPath = await writeGraphArtifact(packageRoot, graph);
  return {
    ...graph,
    command: "graph import",
    artifactPath,
    sourcePath: sourcePath.relative,
    sourceHash,
    imported: {
      nodeCount: nodes.length,
      edgeCount: edges.length,
      execution: "none",
      packageImported: false,
      completionAuthority: false,
    },
  };
}

async function writeGraphArtifact(packageRoot: string, graph: RepoGraphArtifact): Promise<string> {
  const path = graphStoragePath(packageRoot, graph.graphId);
  await ensureDir(dirname(path));
  await writeJsonAtomic(path, graph);
  return path;
}

export async function buildRepoGraph(options: RepoGraphBuildOptions): Promise<RepoGraphBuildResult> {
  const packageRoot = findPackageRoot(options.cwd);
  if (!packageRoot) throw new Error("package_json_missing");
  const providerId = options.graphProvider ?? "codexus-lite";
  if (providerId !== "codexus-lite") throw new Error(`unsupported_graph_provider:${providerId}`);
  const patterns = normalizeScopes(options.scope);
  const fingerprint = computeScopedWorkspaceFingerprint(packageRoot, patterns);
  const projection = buildLiteNodesAndEdges(packageRoot, patterns);
  const base: Omit<RepoGraphArtifact, "graphId"> = {
    schemaVersion: 1,
    stability: "experimental",
    type: "codexus.repo.graph",
    provider: codexusLiteProvider(),
    scope: { patterns, root: "." },
    sourceWorkspaceFingerprint: fingerprint,
    source: { kind: "codexus-lite", path: null, hash: null, sanitized: true },
    nodes: projection.nodes,
    edges: projection.edges,
    layers: [],
    tour: [],
    evidenceGaps: [],
    derivableFacts: [{
      kind: "graph_built",
      gate: false,
      evidence: `codexus-lite projected ${projection.nodes.length} nodes and ${projection.edges.length} edges from ${projection.files.length} scoped files`,
      count: projection.nodes.length,
      files: projection.files,
    }],
    heuristicClaims: [{
      kind: "semantic_graph_meaning_not_evaluated",
      confidence: "high",
      evidence: "codexus-lite records structural file/import facts only; semantic summaries are not evaluated.",
      recommendation: "Use review artifacts for semantic graph meaning before treating graph context as task guidance.",
    }],
    blockingUnknowns: [],
    informationalUnknowns: [],
    gate: graphGateFor("pass", false, false),
  };
  const graph: RepoGraphArtifact = { ...base, graphId: computeRepoGraphId(base) };
  const artifactPath = await writeGraphArtifact(packageRoot, graph);
  return { ...graph, command: "graph build", artifactPath };
}

function resolveGraphPath(packageRoot: string, graphRef: string): string {
  const direct = resolve(packageRoot, graphRef);
  if (existsSync(direct)) return direct;
  if (graphRef.startsWith("sha256:")) {
    const stored = graphStoragePath(packageRoot, graphRef);
    if (existsSync(stored)) return stored;
  }
  const relativePath = join(packageRoot, graphRef);
  if (existsSync(relativePath)) return relativePath;
  return direct;
}

function validateProvider(provider: unknown, evidenceGaps: RepoGraphEvidenceGap[], derivableFacts: RepoGraphDerivableFact[]): provider is RepoGraphProviderDescriptor {
  if (!isRecord(provider)) {
    evidenceGaps.push({
      kind: "provider_invalid",
      gate: true,
      evidence: null,
      policy: "repo-graph-provider-descriptor",
      recommendation: "Restore the graph provider descriptor object.",
    });
    return false;
  }
  const valid = provider.type === "codexus.repo.graph.provider"
    && typeof provider.id === "string"
    && typeof provider.external === "boolean"
    && typeof provider.runtimeDeps === "boolean"
    && typeof provider.accuracy === "string"
    && isRecord(provider.capabilities);
  if (!valid) {
    evidenceGaps.push({
      kind: "provider_invalid",
      gate: true,
      evidence: typeof provider.id === "string" ? provider.id : null,
      policy: "repo-graph-provider-descriptor",
      recommendation: "Fix required provider fields: id, type, external, runtimeDeps, accuracy, capabilities.",
    });
    return false;
  }
  derivableFacts.push({
    kind: "provider_descriptor_valid",
    gate: true,
    evidence: provider.id,
  });
  return true;
}

function validateScope(scope: unknown, evidenceGaps: RepoGraphEvidenceGap[], derivableFacts: RepoGraphDerivableFact[]): scope is RepoGraphArtifact["scope"] {
  if (!isRecord(scope) || scope.root !== "." || !Array.isArray(scope.patterns) || scope.patterns.some((item) => typeof item !== "string" || !item.trim())) {
    evidenceGaps.push({
      kind: "scope_invalid",
      gate: true,
      evidence: null,
      policy: "repo-graph-scope-declared",
      recommendation: "Declare a non-empty graph scope with root '.' and string glob patterns.",
    });
    return false;
  }
  derivableFacts.push({
    kind: "scope_declared",
    gate: true,
    evidence: scope.patterns.join(","),
    count: scope.patterns.length,
  });
  return true;
}

function validateSource(source: unknown, provider: RepoGraphProviderDescriptor | null, evidenceGaps: RepoGraphEvidenceGap[], derivableFacts: RepoGraphDerivableFact[]): void {
  if (!isRecord(source)) return;
  if (typeof source.path === "string" && (!isSafeRelativePath(source.path) || source.path.includes("\\"))) {
    evidenceGaps.push({
      kind: "source_path_unsafe",
      gate: true,
      evidence: source.path,
      policy: "repo-graph-source-path-sanitized",
      recommendation: "Use sanitized relative source paths only.",
      files: [source.path],
    });
  }
  if ((provider?.external || source.kind !== "codexus-lite") && typeof source.hash !== "string") {
    evidenceGaps.push({
      kind: "source_hash_missing",
      gate: true,
      evidence: typeof source.kind === "string" ? source.kind : null,
      policy: "repo-graph-external-source-hash",
      recommendation: "Imported graph artifacts must record a bounded source hash.",
    });
  } else {
    derivableFacts.push({
      kind: "source_provenance_recorded",
      gate: true,
      evidence: typeof source.kind === "string" ? source.kind : "unknown",
    });
  }
}

function validateEdgesAndNodes(graph: RepoGraphArtifact, evidenceGaps: RepoGraphEvidenceGap[], derivableFacts: RepoGraphDerivableFact[]): void {
  const nodeIds = new Set<string>();
  const invalidNodes: string[] = [];
  for (const node of graph.nodes) {
    if (!isRecord(node) || typeof node.id !== "string" || typeof node.kind !== "string") {
      invalidNodes.push(JSON.stringify(node));
      continue;
    }
    if (node.kind === "file" && typeof node.path !== "string") invalidNodes.push(node.id);
    nodeIds.add(node.id);
  }
  if (invalidNodes.length > 0) {
    evidenceGaps.push({
      kind: "node_invalid",
      gate: true,
      evidence: `${invalidNodes.length} invalid nodes`,
      policy: "repo-graph-node-shape",
      recommendation: "Every node needs an id and kind; file nodes also need a path.",
    });
  }
  const dangling = graph.edges.filter((edge) => typeof edge.from !== "string" || typeof edge.to !== "string" || !nodeIds.has(edge.from) || !nodeIds.has(edge.to));
  if (dangling.length > 0) {
    evidenceGaps.push({
      kind: "dangling_edge",
      gate: true,
      evidence: `${dangling.length} edges reference missing endpoints`,
      policy: "repo-graph-edge-endpoints-resolve",
      recommendation: "Remove dangling edges or add their endpoint nodes.",
      edges: dangling.map((edge) => edge.id ?? `${edge.from}->${edge.to}`).sort(),
    });
  } else {
    derivableFacts.push({
      kind: "edge_endpoints_resolved",
      gate: true,
      evidence: `${graph.edges.length} edges reference existing endpoint nodes`,
      count: graph.edges.length,
    });
  }
}

function validateGraphId(graph: RepoGraphArtifact, evidenceGaps: RepoGraphEvidenceGap[]): void {
  const { graphId: _graphId, ...withoutGraphId } = graph;
  const expected = computeRepoGraphId(withoutGraphId);
  if (graph.graphId !== expected) {
    evidenceGaps.push({
      kind: "graph_id_mismatch",
      gate: true,
      evidence: `${graph.graphId} != ${expected}`,
      policy: "repo-graph-canonical-identity",
      recommendation: "Rebuild or re-import the graph so graphId matches the canonical identity payload.",
    });
  }
}

function validateGraphShape(value: unknown, evidenceGaps: RepoGraphEvidenceGap[]): value is RepoGraphArtifact {
  const valid = isRecord(value)
    && value.schemaVersion === 1
    && value.stability === "experimental"
    && value.type === "codexus.repo.graph"
    && typeof value.graphId === "string"
    && Array.isArray(value.nodes)
    && Array.isArray(value.edges)
    && Array.isArray(value.layers)
    && Array.isArray(value.tour)
    && Array.isArray(value.evidenceGaps)
    && Array.isArray(value.derivableFacts)
    && Array.isArray(value.heuristicClaims)
    && Array.isArray(value.blockingUnknowns)
    && Array.isArray(value.informationalUnknowns)
    && isRecord(value.sourceWorkspaceFingerprint)
    && isRecord(value.source)
    && isRecord(value.gate);
  if (!valid) {
    evidenceGaps.push({
      kind: "graph_schema_invalid",
      gate: true,
      evidence: null,
      policy: "repo-graph-schema-version-1",
      recommendation: "Validate the graph with `cx schema validate --type repo-graph` and rebuild/import it.",
    });
    return false;
  }
  return true;
}

function graphWithCheck(baseGraph: RepoGraphArtifact, packageRoot: string, options: RepoGraphCheckOptions, graphPath: string | null): RepoGraphCheckResult {
  const evidenceGaps: RepoGraphEvidenceGap[] = [];
  const derivableFacts: RepoGraphDerivableFact[] = [{
    kind: "graph_loaded",
    gate: true,
    evidence: graphPath ?? options.graph,
  }];
  const heuristicClaims: RepoGraphHeuristicClaim[] = [{
    kind: "semantic_graph_meaning_not_evaluated",
    confidence: "high",
    evidence: "Graph check validates structural invariants only.",
    recommendation: "Treat graph semantic summaries as review input, not completion evidence.",
  }];
  const blockingUnknowns: RepoGraphUnknown[] = [];
  const informationalUnknowns: RepoGraphUnknown[] = [];
  derivableFacts.push({
    kind: "graph_schema_valid",
    gate: true,
    evidence: baseGraph.graphId,
  });
  const provider = validateProvider(baseGraph.provider, evidenceGaps, derivableFacts) ? baseGraph.provider : null;
  const scopeValid = validateScope(baseGraph.scope, evidenceGaps, derivableFacts);
  validateGraphId(baseGraph, evidenceGaps);
  validateSource(baseGraph.source, provider, evidenceGaps, derivableFacts);
  validateEdgesAndNodes(baseGraph, evidenceGaps, derivableFacts);

  let freshness: RepoGraphCheckResult["repoGraph"]["freshness"] = "unknown";
  if (scopeValid) {
    const current = computeScopedWorkspaceFingerprint(packageRoot, baseGraph.scope.patterns);
    if (current.degraded || baseGraph.sourceWorkspaceFingerprint.degraded) {
      blockingUnknowns.push({
        kind: "scoped_fingerprint_degraded",
        gate: true,
        evidence: current.degradedReason ?? baseGraph.sourceWorkspaceFingerprint.degradedReason,
        recommendation: "Rebuild/check the graph from a git workspace where scoped fingerprinting is available.",
      });
    } else if (current.untracked.partial || baseGraph.sourceWorkspaceFingerprint.untracked.partial) {
      blockingUnknowns.push({
        kind: "scoped_fingerprint_partial",
        gate: true,
        evidence: baseGraph.scope.patterns.join(","),
        recommendation: "Narrow the graph scope or reduce untracked files before trusting graph freshness.",
      });
    } else if (scopedFingerprintsEqual(baseGraph.sourceWorkspaceFingerprint, current)) {
      freshness = "fresh";
      derivableFacts.push({
        kind: "scoped_fingerprint_fresh",
        gate: true,
        evidence: baseGraph.sourceWorkspaceFingerprint.scopeHash,
      });
    } else {
      freshness = "stale";
      evidenceGaps.push({
        kind: "scoped_fingerprint_stale",
        gate: true,
        evidence: `${baseGraph.sourceWorkspaceFingerprint.scopeHash} != ${current.scopeHash}`,
        policy: "repo-graph-scoped-freshness",
        recommendation: "Rebuild or re-import the graph for the current scoped workspace content.",
      });
    }
  }

  const status: RepoGraphStatus = evidenceGaps.length > 0
    ? "fail"
    : blockingUnknowns.length > 0
      ? "unknown"
      : "pass";
  const gate = graphGateFor(status, options.gate === true, blockingUnknowns.length > 0);
  return {
    ...baseGraph,
    command: "graph check",
    graphRef: options.graph,
    graphPath,
    evidenceGaps,
    derivableFacts,
    heuristicClaims,
    blockingUnknowns,
    informationalUnknowns,
    gate,
    repoGraph: {
      status,
      nodeCount: baseGraph.nodes.length,
      edgeCount: baseGraph.edges.length,
      freshness,
    },
  };
}

export async function checkRepoGraph(options: RepoGraphCheckOptions): Promise<RepoGraphCheckResult> {
  const packageRoot = findPackageRoot(options.cwd);
  if (!packageRoot) {
    const base = degradedScopedFingerprint(resolve(options.cwd), DEFAULT_SCOPE, "package_json_missing");
    const placeholder: RepoGraphArtifact = {
      schemaVersion: 1,
      stability: "experimental",
      type: "codexus.repo.graph",
      graphId: "sha256:unknown",
      provider: codexusLiteProvider(),
      scope: { patterns: DEFAULT_SCOPE, root: "." },
      sourceWorkspaceFingerprint: base,
      source: { kind: "unknown", path: null, hash: null, sanitized: false },
      nodes: [],
      edges: [],
      layers: [],
      tour: [],
      evidenceGaps: [],
      derivableFacts: [],
      heuristicClaims: [],
      blockingUnknowns: [],
      informationalUnknowns: [],
      gate: graphGateFor("unknown", options.gate === true, true),
    };
    const result = graphWithCheck(placeholder, resolve(options.cwd), options, null);
    result.evidenceGaps.push({
      kind: "package_json_missing",
      gate: true,
      evidence: null,
      policy: "repo-graph-package-root",
      recommendation: "Run repo graph check from a package workspace containing package.json.",
    });
    result.gate = graphGateFor("fail", options.gate === true, true);
    result.repoGraph.status = "fail";
    return result;
  }
  const path = resolveGraphPath(packageRoot, options.graph);
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    const shapeGaps: RepoGraphEvidenceGap[] = [];
    if (!validateGraphShape(parsed, shapeGaps)) {
      const fingerprint = computeScopedWorkspaceFingerprint(packageRoot, DEFAULT_SCOPE);
      const placeholder: RepoGraphArtifact = {
        schemaVersion: 1,
        stability: "experimental",
        type: "codexus.repo.graph",
        graphId: "sha256:invalid",
        provider: codexusLiteProvider(),
        scope: { patterns: DEFAULT_SCOPE, root: "." },
        sourceWorkspaceFingerprint: fingerprint,
        source: { kind: "unknown", path: null, hash: null, sanitized: false },
        nodes: [],
        edges: [],
        layers: [],
        tour: [],
        evidenceGaps: [],
        derivableFacts: [],
        heuristicClaims: [],
        blockingUnknowns: [],
        informationalUnknowns: [],
        gate: graphGateFor("fail", options.gate === true, false),
      };
      const result = graphWithCheck(placeholder, packageRoot, options, path);
      result.evidenceGaps.unshift(...shapeGaps);
      result.gate = graphGateFor("fail", options.gate === true, result.blockingUnknowns.length > 0);
      result.repoGraph.status = "fail";
      return result;
    }
    return graphWithCheck(parsed, packageRoot, options, path);
  } catch (error) {
    const fingerprint = computeScopedWorkspaceFingerprint(packageRoot, DEFAULT_SCOPE);
    const placeholder: RepoGraphArtifact = {
      schemaVersion: 1,
      stability: "experimental",
      type: "codexus.repo.graph",
      graphId: "sha256:unreadable",
      provider: codexusLiteProvider(),
      scope: { patterns: DEFAULT_SCOPE, root: "." },
      sourceWorkspaceFingerprint: fingerprint,
      source: { kind: "unknown", path: null, hash: null, sanitized: false },
      nodes: [],
      edges: [],
      layers: [],
      tour: [],
      evidenceGaps: [],
      derivableFacts: [],
      heuristicClaims: [],
      blockingUnknowns: [],
      informationalUnknowns: [],
      gate: graphGateFor("unknown", options.gate === true, true),
    };
    const result = graphWithCheck(placeholder, packageRoot, options, path);
    result.blockingUnknowns.unshift({
      kind: "graph_unreadable",
      gate: true,
      evidence: path,
      recommendation: `Fix unreadable repository graph: ${error instanceof Error ? error.message : String(error)}`,
    });
    result.gate = graphGateFor("unknown", options.gate === true, true);
    result.repoGraph.status = "unknown";
    result.repoGraph.freshness = "unknown";
    return result;
  }
}

function graphCheckSummary(check: RepoGraphCheckResult): RepoGraphSearchResult["check"] {
  return {
    status: check.repoGraph.status,
    freshness: check.repoGraph.freshness,
    evidenceGaps: check.evidenceGaps.length,
    blockingUnknowns: check.blockingUnknowns.length,
  };
}

function searchableTextForNode(node: RepoGraphNode): string {
  return [node.id, node.kind, node.path, node.label].filter((item): item is string => typeof item === "string").join(" ");
}

function searchableTextForEdge(edge: RepoGraphEdge): string {
  return [edge.id, edge.kind, edge.from, edge.to, edge.evidence].filter((item): item is string => typeof item === "string").join(" ");
}

function scoreText(text: string, terms: string[]): number {
  const lower = text.toLowerCase();
  return terms.reduce((score, term) => score + (lower.includes(term) ? 1 : 0), 0);
}

export async function searchRepoGraph(options: RepoGraphSearchOptions): Promise<RepoGraphSearchResult> {
  const query = options.query.trim();
  if (!query) throw new Error("missing_repo_graph_query");
  const limit = Number.isFinite(options.limit) && options.limit && options.limit > 0 ? Math.min(Math.floor(options.limit), 50) : 10;
  const check = await checkRepoGraph({ cwd: options.cwd, graph: options.graph, gate: false });
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const nodeResults = check.nodes.map((node) => {
    const label = searchableTextForNode(node);
    return {
      id: node.id,
      kind: "node" as const,
      label,
      score: scoreText(label, terms),
      evidence: node.path ?? node.label ?? null,
    };
  });
  const edgeResults = check.edges.map((edge) => {
    const label = searchableTextForEdge(edge);
    return {
      id: edge.id,
      kind: "edge" as const,
      label,
      score: scoreText(label, terms),
      evidence: edge.evidence ?? `${edge.from}->${edge.to}`,
    };
  });
  const results = [...nodeResults, ...edgeResults]
    .filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
    .slice(0, limit);
  return {
    schemaVersion: 1,
    stability: "experimental",
    command: "graph search",
    cwd: findPackageRoot(options.cwd) ?? resolve(options.cwd),
    graphRef: options.graph,
    graphId: check.graphId,
    query,
    results,
    check: graphCheckSummary(check),
    eligibleForAutomaticInjection: false,
    completionAuthority: false,
  };
}

export async function explainRepoGraph(options: RepoGraphExplainOptions): Promise<RepoGraphExplainResult> {
  const id = options.id.trim();
  if (!id) throw new Error("missing_repo_graph_explain_id");
  const check = await checkRepoGraph({ cwd: options.cwd, graph: options.graph, gate: false });
  const node = check.nodes.find((candidate) => candidate.id === id) ?? null;
  const edge = node ? null : check.edges.find((candidate) => candidate.id === id) ?? null;
  const adjacentEdges = node
    ? check.edges.filter((candidate) => candidate.from === node.id || candidate.to === node.id)
    : edge ? [edge] : [];
  return {
    schemaVersion: 1,
    stability: "experimental",
    command: "graph explain",
    cwd: findPackageRoot(options.cwd) ?? resolve(options.cwd),
    graphRef: options.graph,
    graphId: check.graphId,
    id,
    found: Boolean(node || edge),
    kind: node ? "node" : edge ? "edge" : "missing",
    node,
    edge,
    adjacentEdges,
    check: graphCheckSummary(check),
    advisoryOnly: true,
    eligibleForAutomaticInjection: false,
    completionAuthority: false,
  };
}
