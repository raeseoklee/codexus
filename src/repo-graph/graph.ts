import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { harnessRoot } from "../ledger/paths.ts";
import { ensureDir, writeJsonAtomic } from "../util/fs.ts";
import { matchesPattern, normalizeGlobPath } from "../util/glob.ts";
import { sha256Bytes, sha256CanonicalJson, sha256Text } from "../util/hash.ts";

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

const sourceExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const DEFAULT_SCOPE = ["src/**"];
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

function listFiles(root: string, relativePath = ""): string[] {
  const path = join(root, relativePath);
  if (!existsSync(path)) return [];
  const stat = statSync(path);
  if (stat.isFile()) return [normalizePath(relativePath)];
  if (!stat.isDirectory()) return [];
  const files: string[] = [];
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git" || entry.name === ".codexus" || entry.name === ".codex-harness") continue;
    const child = relativePath ? `${relativePath}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...listFiles(root, child));
    else if (entry.isFile()) files.push(normalizePath(child));
  }
  return files;
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

function lineForIndex(content: string, index: number): number {
  let line = 1;
  for (let cursor = 0; cursor < index; cursor += 1) {
    if (content.charCodeAt(cursor) === 10) line += 1;
  }
  return line;
}

function fileNodeId(path: string): string {
  return `file:${path}`;
}

function moduleNodeId(specifier: string): string {
  return `module:${specifier}`;
}

function extractImportSpecifiers(path: string, content: string): Array<{ line: number; specifier: string }> {
  const specifiers: Array<{ line: number; specifier: string }> = [];
  const patterns = [
    /(?:^|\n)\s*import\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?["']([^"']+)["']/gms,
    /(?:^|\n)\s*export\s+(?:type\s+)?[^'"]*?\s+from\s+["']([^"']+)["']/gms,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/gm,
  ];
  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) {
      specifiers.push({ line: lineForIndex(content, match.index ?? 0), specifier: match[1] });
    }
  }
  return specifiers;
}

function buildLiteNodesAndEdges(packageRoot: string, patterns: string[]): { nodes: RepoGraphNode[]; edges: RepoGraphEdge[]; files: string[] } {
  const files = listFiles(packageRoot)
    .filter((path) => pathInScope(path, patterns))
    .sort();
  const nodesById = new Map<string, RepoGraphNode>();
  const edges: RepoGraphEdge[] = [];
  for (const file of files) {
    const sourceId = fileNodeId(file);
    nodesById.set(sourceId, { id: sourceId, kind: "file", path: file });
    if (!sourceExtensions.has(extname(file).toLowerCase())) continue;
    const content = readFileSync(join(packageRoot, file), "utf8");
    for (const item of extractImportSpecifiers(file, content)) {
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
