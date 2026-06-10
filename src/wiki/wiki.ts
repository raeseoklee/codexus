import { existsSync, readFileSync } from "node:fs";
import { copyFile, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import { detectVerifyCandidates } from "../session/verify-detect.ts";
import { summarizeDecisions } from "../session/decisions.ts";
import { readSessionState, sessionPaths } from "../session/state.ts";
import { harnessRoot } from "../ledger/paths.ts";
import { ensureDir, writeJsonAtomic } from "../util/fs.ts";
import { sha256CanonicalJson, sha256Text } from "../util/hash.ts";

export type WikiFreshness = "fresh" | "stale" | "partial" | "unknown";
export type WikiBuildMode = "deterministic" | "advisory";

export interface WikiPageMetadata {
  schemaVersion: 1;
  stability: "experimental";
  type: "codexus.wiki.page";
  pageId: string;
  title: string;
  generatedAt: string;
  sourceRefs: string[];
  localLinks: string[];
  sourceFingerprint: string;
  freshness: WikiFreshness;
  claimClasses: {
    derivableFacts: number;
    advisoryClaims: number;
  };
}

export interface WikiManifestPageEntry extends WikiPageMetadata {
  path: string;
}

export interface WikiManifest {
  schemaVersion: 1;
  stability: "experimental";
  type: "codexus.wiki.manifest";
  generatedAt: string;
  cwd: string;
  mode: "deterministic";
  pages: WikiManifestPageEntry[];
}

export interface WikiMapSourceCandidate {
  kind: "file" | "artifact";
  category:
    | "package-metadata"
    | "readme"
    | "docs-index"
    | "command-registry"
    | "schema-registry"
    | "verification"
    | "decision"
    | "repo-graph"
    | "release-policy"
    | "json-contract"
    | "implementation-status"
    | "roadmap";
  path: string;
  exists: boolean;
  usedBy: string[];
}

export interface WikiMapPageCandidate {
  pageId: string;
  title: string;
  buildable: boolean;
  requiredSourcesPresent: boolean;
  sourceRefs: string[];
}

export interface WikiMapResult {
  schemaVersion: 1;
  stability: "experimental";
  command: "wiki map";
  cwd: string;
  candidates: WikiMapSourceCandidate[];
  pages: WikiMapPageCandidate[];
}

export interface WikiBuildResult {
  schemaVersion: 1;
  stability: "experimental";
  command: "wiki build";
  cwd: string;
  mode: "deterministic";
  manifest: WikiManifest;
  manifestPath: string;
  pagesDir: string;
}

export interface WikiAdvisoryBuildResult {
  schemaVersion: 1;
  stability: "experimental";
  command: "wiki build";
  cwd: string;
  mode: "advisory";
  advisoryManifestPath: string;
  sourceManifestPath: string;
  sourcePages: Array<{
    pageId: string;
    title: string;
    path: string;
    freshness: WikiFreshness;
    sourceFingerprint: string;
  }>;
  synthesis: {
    driver: {
      id: string;
      kind: "local-deterministic";
      model: string | null;
      modelInvoked: false;
    };
    sourceBundleHash: string;
    advisoryText: string;
    claimClasses: {
      derivableFacts: number;
      advisoryClaims: number;
    };
    eligibleForAutomaticInjection: false;
    sourceTruth: false;
    completionAuthority: false;
  };
  check: {
    status: "pass";
    gate: "not_requested" | "passed";
  };
  completionAuthority: false;
}

export interface WikiEvidenceGap {
  kind:
    | "manifest_missing"
    | "manifest_invalid"
    | "page_missing"
    | "page_frontmatter_invalid"
    | "page_entry_mismatch"
    | "source_ref_missing"
    | "source_ref_unsafe"
    | "local_link_missing"
    | "local_link_unregistered"
    | "absolute_private_path_present"
    | "page_stale";
  gate: true;
  evidence: string | null;
  recommendation: string;
  files?: string[];
}

export interface WikiDerivableFact {
  kind:
    | "manifest_present"
    | "manifest_valid"
    | "page_valid"
    | "source_refs_resolved"
    | "local_links_resolved"
    | "page_fresh";
  gate: boolean;
  evidence: string;
  files?: string[];
}

export interface WikiHeuristicClaim {
  kind: "semantic_page_quality_not_evaluated";
  confidence: "high";
  evidence: string;
  recommendation: string;
}

export interface WikiGate {
  enabled: boolean;
  status: "not_requested" | "passed" | "failed";
  exitCode: 0 | 1;
  reason: string;
}

export interface WikiCheckResult {
  schemaVersion: 1;
  stability: "experimental";
  command: "wiki check";
  cwd: string;
  manifestPath: string;
  wiki: {
    status: "pass" | "fail";
    pageCount: number;
    freshCount: number;
    staleCount: number;
  };
  evidenceGaps: WikiEvidenceGap[];
  derivableFacts: WikiDerivableFact[];
  heuristicClaims: WikiHeuristicClaim[];
  blockingUnknowns: [];
  informationalUnknowns: [];
  gate: WikiGate;
}

export interface WikiContextPageSelection {
  pageId: string;
  title: string;
  path: string;
  freshness: WikiFreshness;
  estimatedTokens: number;
  reason: string;
}

export interface WikiContextResult {
  schemaVersion: 1;
  stability: "stable";
  command: "wiki context";
  cwd: string;
  topic: string;
  budget: number;
  freshnessPolicy: {
    freshOnly: boolean;
    status: "pass" | "fail";
    selectedFresh: number;
    selectedStale: number;
  };
  selectedPages: WikiContextPageSelection[];
  tokenEstimate: number;
  eligibleForAutomaticInjection: boolean;
  evidenceGaps: WikiEvidenceGap[];
  derivableFacts: WikiDerivableFact[];
  gate: WikiGate;
  text: string;
}

export interface WikiContextApprovalArtifact {
  schemaVersion: 1;
  stability: "experimental";
  type: "codexus.wiki.context-approval";
  approvalId: string;
  status: "approved_not_injected";
  approvedAt: string;
  approvedBy: string;
  topic: string;
  budget: number;
  tokenEstimate: number;
  selectedPages: WikiContextPageSelection[];
  contextHash: string;
  sourceManifestPath: string;
  paths: {
    dir: string;
    markdown: string;
    json: string;
  };
  injection: {
    automatic: false;
    applied: false;
    reason: string;
  };
  authority: {
    sourceTruth: false;
    completionAuthority: false;
  };
}

export interface WikiContextApprovalResult {
  schemaVersion: 1;
  stability: "experimental";
  command: "wiki context approve";
  cwd: string;
  context: WikiContextResult;
  approval: WikiContextApprovalArtifact;
  eligibleForAutomaticInjection: false;
  completionAuthority: false;
}

export interface WikiContextApprovalSummary {
  schemaVersion: 1;
  stability: "experimental";
  status: "empty" | "observed";
  approvals: {
    total: number;
    latest: {
      approvalId: string;
      approvedAt: string;
      approvedBy: string;
      topic: string;
      tokenEstimate: number;
      path: string;
    } | null;
  };
  eligibleForAutomaticInjection: false;
  completionAuthority: false;
}

export interface WikiExportResult {
  schemaVersion: 1;
  stability: "experimental";
  command: "wiki export";
  cwd: string;
  target: string;
  sourceManifestPath: string;
  pageCount: number;
  exportedFiles: string[];
  check: {
    status: "pass" | "fail";
    gate: "passed" | "failed";
  };
  export: {
    status: "exported" | "blocked";
    autoCommitted: false;
    sourceTruth: false;
  };
  evidenceGaps: WikiEvidenceGap[];
  gate: WikiGate;
}

interface SourceDiscovery {
  packageJson: string;
  changelog: string;
  readme: string;
  docsReadme: string;
  docsKoReadme: string;
  jsonContract: string;
  releasePolicy: string;
  implementationStatus: string;
  remainingWork: string;
  roadmapKanban: string;
  appInstanceDesign: string;
  cliMain: string;
  schemaDir: string;
  latestVerification: string | null;
  latestDecision: string | null;
  latestRepoGraph: string | null;
}

interface PageDefinition {
  pageId:
    | "wiki.overview"
    | "wiki.commands"
    | "wiki.verification"
    | "wiki.release"
    | "wiki.runtime"
    | "wiki.graph"
    | "wiki.sessions";
  title: string;
  required: string[];
  sourceRefs: string[];
  localLinks: string[];
  body: string;
  claimClasses: {
    derivableFacts: number;
    advisoryClaims: number;
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function wikiRoot(cwd: string): string {
  return join(harnessRoot(cwd), "wiki");
}

function wikiPagesDir(cwd: string): string {
  return join(wikiRoot(cwd), "pages");
}

function wikiContextDir(cwd: string): string {
  return join(wikiRoot(cwd), "context");
}

function wikiContextApprovalDir(cwd: string, approvalId: string): string {
  return join(wikiContextDir(cwd), approvalId);
}

function wikiManifestPath(cwd: string): string {
  return join(wikiRoot(cwd), "manifest.json");
}

function wikiAdvisoryDir(cwd: string): string {
  return join(wikiRoot(cwd), "advisory");
}

function wikiAdvisoryManifestPath(cwd: string): string {
  return join(wikiAdvisoryDir(cwd), "advisory.json");
}

function repoRelative(cwd: string, path: string): string {
  return relative(resolve(cwd), resolve(path)).replace(/\\/g, "/") || ".";
}

function normalizeRelative(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\/+/, "");
}

function isSafeRelativePath(path: string): boolean {
  const normalized = normalizeRelative(path);
  return normalized.length > 0
    && !path.startsWith("/")
    && !/^[a-z]:/i.test(path)
    && normalized !== ".."
    && !normalized.startsWith("../")
    && !normalized.includes("/../")
    && !normalized.includes("\0");
}

function resolveRef(cwd: string, ref: string): string {
  return resolve(cwd, ref);
}

function resolveExportTarget(cwd: string, target: string): { absolute: string; relative: string } {
  const trimmed = target.trim();
  if (!isSafeRelativePath(trimmed)) throw new Error("unsafe_wiki_export_target");
  const absolute = resolve(cwd, trimmed);
  const relativeTarget = repoRelative(cwd, absolute);
  if (!isSafeRelativePath(relativeTarget)) throw new Error("unsafe_wiki_export_target");
  if (relativeTarget === "." || relativeTarget.startsWith(".codexus/") || relativeTarget === ".codexus") {
    throw new Error("unsafe_wiki_export_target");
  }
  if (relativeTarget.startsWith(".git/") || relativeTarget === ".git" || relativeTarget.startsWith("node_modules/") || relativeTarget === "node_modules") {
    throw new Error("unsafe_wiki_export_target");
  }
  return { absolute, relative: relativeTarget };
}

async function readJsonIfExists(path: string): Promise<unknown | null> {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch {
    return null;
  }
}

function readJsonIfExistsSync(path: string): unknown | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch {
    return null;
  }
}

function readPackageMeta(cwd: string): { name: string | null; version: string | null; scripts: Record<string, string> } {
  const parsed = readJsonIfExistsSync(join(cwd, "package.json"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { name: null, version: null, scripts: {} };
  const record = parsed as Record<string, unknown>;
  const scriptsRaw = typeof record.scripts === "object" && record.scripts !== null && !Array.isArray(record.scripts)
    ? record.scripts as Record<string, unknown>
    : {};
  const scripts: Record<string, string> = {};
  for (const [key, value] of Object.entries(scriptsRaw)) {
    if (typeof value === "string") scripts[key] = value;
  }
  return {
    name: typeof record.name === "string" ? record.name : null,
    version: typeof record.version === "string" ? record.version : null,
    scripts,
  };
}

async function newestArtifact(root: string, filename: string): Promise<string | null> {
  if (!existsSync(root)) return null;
  const entries = await readdir(root, { withFileTypes: true });
  let latest: { path: string; mtimeMs: number } | null = null;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const candidate = join(root, entry.name, filename);
    if (!existsSync(candidate)) continue;
    const info = await stat(candidate);
    if (!latest || info.mtimeMs > latest.mtimeMs) latest = { path: candidate, mtimeMs: info.mtimeMs };
  }
  return latest?.path ?? null;
}

async function discoverSources(cwd: string): Promise<SourceDiscovery> {
  const session = sessionPaths(cwd);
  return {
    packageJson: join(cwd, "package.json"),
    changelog: join(cwd, "CHANGELOG.md"),
    readme: join(cwd, "README.md"),
    docsReadme: join(cwd, "docs", "README.md"),
    docsKoReadme: join(cwd, "docs", "ko", "README.md"),
    jsonContract: join(cwd, "docs", "json-contract.md"),
    releasePolicy: join(cwd, "docs", "release-policy.md"),
    implementationStatus: join(cwd, "docs", "implementation-status.md"),
    remainingWork: join(cwd, "docs", "remaining-work.md"),
    roadmapKanban: join(cwd, "docs", "roadmap-kanban.html"),
    appInstanceDesign: join(cwd, "docs", "design", "19-worktree-app-instance-launcher.md"),
    cliMain: join(cwd, "src", "cli", "main.ts"),
    schemaDir: join(cwd, "schemas"),
    latestVerification: await newestArtifact(session.verificationDir, "verification.json"),
    latestDecision: await newestArtifact(join(session.sessionRoot, "decisions"), "decision.json"),
    latestRepoGraph: await newestArtifact(join(harnessRoot(cwd), "repo-graphs"), "graph.json"),
  };
}

function extractCodexusCommands(cliMainPath: string): string[] {
  if (!existsSync(cliMainPath)) return [];
  const raw = readFileSync(cliMainPath, "utf8");
  return [...new Set(Array.from(raw.matchAll(/^  cx .+$/gm)).map((match) => match[0].trim()))];
}

function renderFrontmatter(metadata: WikiPageMetadata): string {
  const lines = [
    "---",
    `schemaVersion: ${metadata.schemaVersion}`,
    `stability: ${metadata.stability}`,
    `type: ${metadata.type}`,
    `pageId: ${metadata.pageId}`,
    `title: ${metadata.title}`,
    `generatedAt: ${metadata.generatedAt}`,
    `sourceFingerprint: ${metadata.sourceFingerprint}`,
    `freshness: ${metadata.freshness}`,
    "sourceRefs:",
    ...metadata.sourceRefs.map((item) => `  - ${item}`),
    "localLinks:",
    ...metadata.localLinks.map((item) => `  - ${item}`),
    "claimClasses:",
    `  derivableFacts: ${metadata.claimClasses.derivableFacts}`,
    `  advisoryClaims: ${metadata.claimClasses.advisoryClaims}`,
    "---",
    "",
  ];
  return `${lines.join("\n")}`;
}

function parsePageFrontmatter(text: string): { metadata: WikiPageMetadata | null; body: string } {
  const lines = text.split(/\r?\n/);
  if (lines[0] !== "---") return { metadata: null, body: text };
  const end = lines.indexOf("---", 1);
  if (end === -1) return { metadata: null, body: text };
  const frontmatter = lines.slice(1, end);
  const body = lines.slice(end + 1).join("\n");
  const scalars = new Map<string, string>();
  const arrays = new Map<string, string[]>();
  const nested = new Map<string, Record<string, string>>();
  let currentArray: string | null = null;
  let currentObject: string | null = null;
  for (const rawLine of frontmatter) {
    const line = rawLine.replace(/\r$/, "");
    if (!line.trim()) continue;
    if (line.startsWith("  - ")) {
      if (currentArray) arrays.get(currentArray)?.push(line.slice(4).trim());
      continue;
    }
    if (line.startsWith("  ")) {
      if (currentObject) {
        const trimmed = line.trim();
        const separator = trimmed.indexOf(":");
        if (separator !== -1) {
          nested.get(currentObject)![trimmed.slice(0, separator).trim()] = trimmed.slice(separator + 1).trim();
        }
      }
      continue;
    }
    currentArray = null;
    currentObject = null;
    const separator = line.indexOf(":");
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (!value) {
      if (key === "sourceRefs" || key === "localLinks") {
        arrays.set(key, []);
        currentArray = key;
      } else if (key === "claimClasses") {
        nested.set(key, {});
        currentObject = key;
      }
      continue;
    }
    scalars.set(key, value);
  }
  const claimClasses = nested.get("claimClasses") ?? {};
  const metadata: WikiPageMetadata = {
    schemaVersion: Number(scalars.get("schemaVersion") ?? 0) === 1 ? 1 : 0 as never,
    stability: scalars.get("stability") === "experimental" ? "experimental" : "experimental",
    type: scalars.get("type") === "codexus.wiki.page" ? "codexus.wiki.page" : "codexus.wiki.page",
    pageId: scalars.get("pageId") ?? "",
    title: scalars.get("title") ?? "",
    generatedAt: scalars.get("generatedAt") ?? "",
    sourceFingerprint: scalars.get("sourceFingerprint") ?? "",
    freshness: (scalars.get("freshness") as WikiFreshness | undefined) ?? "unknown",
    sourceRefs: arrays.get("sourceRefs") ?? [],
    localLinks: arrays.get("localLinks") ?? [],
    claimClasses: {
      derivableFacts: Number(claimClasses.derivableFacts ?? 0),
      advisoryClaims: Number(claimClasses.advisoryClaims ?? 0),
    },
  };
  return { metadata, body };
}

export function validateWikiPageMetadata(value: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (typeof value !== "object" || value === null || Array.isArray(value)) return { valid: false, errors: ["page:expected_object"] };
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== 1) errors.push("schemaVersion:expected_1");
  if (record.stability !== "experimental") errors.push("stability:expected_experimental");
  if (record.type !== "codexus.wiki.page") errors.push("type:expected_codexus.wiki.page");
  if (typeof record.pageId !== "string" || !record.pageId.startsWith("wiki.")) errors.push("pageId:expected_wiki_id");
  if (typeof record.title !== "string" || record.title.trim().length === 0) errors.push("title:expected_non_empty_string");
  if (typeof record.generatedAt !== "string" || record.generatedAt.trim().length === 0) errors.push("generatedAt:expected_string");
  if (typeof record.sourceFingerprint !== "string" || !record.sourceFingerprint.startsWith("sha256:")) errors.push("sourceFingerprint:expected_sha256");
  if (!["fresh", "stale", "partial", "unknown"].includes(String(record.freshness))) errors.push("freshness:invalid");
  if (!Array.isArray(record.sourceRefs) || record.sourceRefs.length === 0 || !record.sourceRefs.every((item) => typeof item === "string")) {
    errors.push("sourceRefs:expected_non_empty_string_array");
  }
  if (!Array.isArray(record.localLinks) || !record.localLinks.every((item) => typeof item === "string")) {
    errors.push("localLinks:expected_string_array");
  }
  if (typeof record.claimClasses !== "object" || record.claimClasses === null || Array.isArray(record.claimClasses)) {
    errors.push("claimClasses:expected_object");
  } else {
    const classes = record.claimClasses as Record<string, unknown>;
    if (typeof classes.derivableFacts !== "number") errors.push("claimClasses.derivableFacts:expected_number");
    if (typeof classes.advisoryClaims !== "number") errors.push("claimClasses.advisoryClaims:expected_number");
  }
  return { valid: errors.length === 0, errors };
}

export function validateWikiManifest(value: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (typeof value !== "object" || value === null || Array.isArray(value)) return { valid: false, errors: ["manifest:expected_object"] };
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== 1) errors.push("schemaVersion:expected_1");
  if (record.stability !== "experimental") errors.push("stability:expected_experimental");
  if (record.type !== "codexus.wiki.manifest") errors.push("type:expected_codexus.wiki.manifest");
  if (typeof record.generatedAt !== "string" || record.generatedAt.trim().length === 0) errors.push("generatedAt:expected_string");
  if (typeof record.cwd !== "string" || record.cwd.trim().length === 0) errors.push("cwd:expected_string");
  if (record.mode !== "deterministic") errors.push("mode:expected_deterministic");
  if (!Array.isArray(record.pages) || record.pages.length === 0) {
    errors.push("pages:expected_non_empty_array");
  } else {
    for (const [index, page] of record.pages.entries()) {
      if (typeof page !== "object" || page === null || Array.isArray(page)) {
        errors.push(`pages[${index}]:expected_object`);
        continue;
      }
      const entry = page as Record<string, unknown>;
      if (typeof entry.path !== "string" || entry.path.trim().length === 0) errors.push(`pages[${index}].path:expected_string`);
      const pageValidation = validateWikiPageMetadata(page);
      errors.push(...pageValidation.errors.map((error) => `pages[${index}].${error}`));
    }
  }
  return { valid: errors.length === 0, errors };
}

function sourceFingerprint(cwd: string, refs: string[]): string {
  const payload = refs.map((ref) => {
    if (!isSafeRelativePath(ref)) return { ref, status: "unsafe" as const };
    const absolute = resolveRef(cwd, ref);
    if (!existsSync(absolute)) return { ref, status: "missing" as const };
    return { ref, status: "present" as const, contentHash: sha256Text(readFileSync(absolute, "utf8")) };
  });
  return sha256CanonicalJson(payload);
}

function renderSourceRefs(sourceRefs: string[]): string {
  return sourceRefs.map((ref) => `- \`${ref}\``).join("\n");
}

function recordArrayLength(record: Record<string, unknown> | null, key: string): number | null {
  if (!record) return null;
  const value = record[key];
  return Array.isArray(value) ? value.length : null;
}

function recordString(record: Record<string, unknown> | null, key: string): string | null {
  if (!record) return null;
  const value = record[key];
  return typeof value === "string" ? value : null;
}

async function buildPageDefinitions(cwd: string): Promise<PageDefinition[]> {
  const discovered = await discoverSources(cwd);
  const pkg = readPackageMeta(cwd);
  const verify = detectVerifyCandidates(cwd);
  const sessionState = await readSessionState(cwd).catch(() => null);
  const decisionSummary = await summarizeDecisions(cwd).catch(() => ({ count: 0, lastDecision: null }));
  const latestVerification = discovered.latestVerification ? await readJsonIfExists(discovered.latestVerification) : null;
  const latestRepoGraph = discovered.latestRepoGraph ? await readJsonIfExists(discovered.latestRepoGraph) : null;
  const codexusCommands = extractCodexusCommands(discovered.cliMain).slice(0, 12);

  const overviewSources = [
    discovered.packageJson,
    discovered.readme,
    discovered.docsReadme,
    discovered.docsKoReadme,
    discovered.latestDecision,
    discovered.latestRepoGraph,
  ].filter((value): value is string => typeof value === "string" && existsSync(value))
    .map((path) => repoRelative(cwd, path));
  const commandsSources = [
    discovered.packageJson,
    discovered.cliMain,
  ].filter((path) => existsSync(path)).map((path) => repoRelative(cwd, path));
  const verificationSources = [
    discovered.packageJson,
    sessionPaths(cwd).state,
    discovered.latestVerification,
  ].filter((value): value is string => typeof value === "string" && existsSync(value))
    .map((path) => repoRelative(cwd, path));
  const releaseSources = [
    discovered.packageJson,
    discovered.changelog,
    discovered.jsonContract,
    discovered.releasePolicy,
  ].filter((path) => existsSync(path)).map((path) => repoRelative(cwd, path));
  const runtimeSources = [
    discovered.implementationStatus,
    discovered.remainingWork,
    discovered.roadmapKanban,
    discovered.appInstanceDesign,
  ].filter((path) => existsSync(path)).map((path) => repoRelative(cwd, path));
  const graphSources = [
    discovered.latestRepoGraph,
    discovered.implementationStatus,
  ].filter((value): value is string => typeof value === "string" && existsSync(value))
    .map((path) => repoRelative(cwd, path));
  const sessionSources = [
    sessionPaths(cwd).state,
    discovered.latestVerification,
    discovered.latestDecision,
  ].filter((value): value is string => typeof value === "string" && existsSync(value))
    .map((path) => repoRelative(cwd, path));

  const verificationRecord = latestVerification && typeof latestVerification === "object" && latestVerification !== null
    ? latestVerification as Record<string, unknown>
    : null;
  const repoGraphRecord = latestRepoGraph && typeof latestRepoGraph === "object" && latestRepoGraph !== null
    ? latestRepoGraph as Record<string, unknown>
    : null;

  const pages: PageDefinition[] = [
    {
      pageId: "wiki.overview",
      title: "Overview",
      required: [repoRelative(cwd, discovered.packageJson)],
      sourceRefs: overviewSources.length > 0 ? overviewSources : [repoRelative(cwd, discovered.packageJson)],
      localLinks: ["commands.md", "verification.md", "release.md", "runtime.md", "graph.md", "sessions.md"],
      claimClasses: { derivableFacts: 6, advisoryClaims: 0 },
      body: [
        "# Overview",
        "",
        `- Project: ${pkg.name ?? "(unknown)"}${pkg.version ? ` ${pkg.version}` : ""}`,
        `- README present: ${existsSync(discovered.readme) ? "yes" : "no"}`,
        `- Docs index present: ${existsSync(discovered.docsReadme) ? "yes" : "no"}`,
        `- Korean docs index present: ${existsSync(discovered.docsKoReadme) ? "yes" : "no"}`,
        `- Latest decision count: ${decisionSummary.count}`,
        `- Latest repo graph artifact: ${repoGraphRecord && typeof repoGraphRecord.graphId === "string" ? String(repoGraphRecord.graphId) : "none"}`,
        `- Session verification records: ${sessionState?.verifications.length ?? 0}`,
        "",
        "Related pages:",
        "- [Commands](commands.md)",
        "- [Verification](verification.md)",
        "- [Release And Contract](release.md)",
        "- [Runtime Boundaries](runtime.md)",
        "- [Repository Graph](graph.md)",
        "- [Sessions](sessions.md)",
        "",
        "Source refs:",
        renderSourceRefs(overviewSources.length > 0 ? overviewSources : [repoRelative(cwd, discovered.packageJson)]),
      ].join("\n"),
    },
    {
      pageId: "wiki.commands",
      title: "Commands",
      required: [repoRelative(cwd, discovered.packageJson)],
      sourceRefs: commandsSources.length > 0 ? commandsSources : [repoRelative(cwd, discovered.packageJson)],
      localLinks: ["overview.md", "verification.md", "release.md", "runtime.md", "graph.md", "sessions.md"],
      claimClasses: { derivableFacts: 8, advisoryClaims: 0 },
      body: [
        "# Commands",
        "",
        "## Project Scripts",
        "",
        ...Object.entries(pkg.scripts).length > 0
          ? Object.entries(pkg.scripts).map(([name, command]) => `- \`${name}\`: \`${command}\``)
          : ["- No package scripts detected."],
        "",
        "## Verification Candidates",
        "",
        `- Recommended: ${verify.recommended ?? "none"}`,
        ...verify.candidates.map((candidate) => `- Candidate: \`${candidate}\``),
        "",
        "## Codexus CLI Surface",
        "",
        ...codexusCommands.length > 0
          ? codexusCommands.map((command) => `- \`${command}\``)
          : ["- No local Codexus CLI command registry detected in this repository."],
        "",
        "Related pages:",
        "- [Overview](overview.md)",
        "- [Verification](verification.md)",
        "- [Release And Contract](release.md)",
        "- [Runtime Boundaries](runtime.md)",
        "- [Repository Graph](graph.md)",
        "- [Sessions](sessions.md)",
        "",
        "Source refs:",
        renderSourceRefs(commandsSources.length > 0 ? commandsSources : [repoRelative(cwd, discovered.packageJson)]),
      ].join("\n"),
    },
    {
      pageId: "wiki.verification",
      title: "Verification",
      required: [repoRelative(cwd, discovered.packageJson)],
      sourceRefs: verificationSources.length > 0 ? verificationSources : [repoRelative(cwd, discovered.packageJson)],
      localLinks: ["overview.md", "commands.md", "release.md", "runtime.md", "graph.md", "sessions.md"],
      claimClasses: { derivableFacts: 7, advisoryClaims: 0 },
      body: [
        "# Verification",
        "",
        `- Detection reason: ${verify.reason}`,
        `- Recommended verify command: ${verify.recommended ?? "none"}`,
        `- Candidate count: ${verify.candidates.length}`,
        `- Latest verification status: ${sessionState?.verifications.at(-1)?.status ?? "none"}`,
        `- Latest verification id: ${sessionState?.verifications.at(-1)?.id ?? "none"}`,
        `- Latest verification commands: ${(sessionState?.verifications.at(-1)?.commands ?? []).join(", ") || "none"}`,
        `- Latest verification artifact: ${verificationRecord && typeof verificationRecord.id === "string" ? String(verificationRecord.id) : "none"}`,
        "",
        "Related pages:",
        "- [Overview](overview.md)",
        "- [Commands](commands.md)",
        "- [Release And Contract](release.md)",
        "- [Runtime Boundaries](runtime.md)",
        "- [Repository Graph](graph.md)",
        "- [Sessions](sessions.md)",
        "",
        "Source refs:",
        renderSourceRefs(verificationSources.length > 0 ? verificationSources : [repoRelative(cwd, discovered.packageJson)]),
      ].join("\n"),
    },
    {
      pageId: "wiki.release",
      title: "Release And Contract",
      required: [repoRelative(cwd, discovered.packageJson)],
      sourceRefs: releaseSources.length > 0 ? releaseSources : [repoRelative(cwd, discovered.packageJson)],
      localLinks: ["overview.md", "commands.md", "verification.md", "runtime.md", "graph.md", "sessions.md"],
      claimClasses: { derivableFacts: 7, advisoryClaims: 0 },
      body: [
        "# Release And Contract",
        "",
        `- Package version: ${pkg.version ?? "unknown"}`,
        `- Changelog present: ${existsSync(discovered.changelog) ? "yes" : "no"}`,
        `- JSON contract present: ${existsSync(discovered.jsonContract) ? "yes" : "no"}`,
        `- Release policy present: ${existsSync(discovered.releasePolicy) ? "yes" : "no"}`,
        `- Package name: ${pkg.name ?? "unknown"}`,
        "",
        "This page is a deterministic projection over release metadata. It is not a release gate and does not replace the release policy or JSON contract documents.",
        "",
        "Related pages:",
        "- [Overview](overview.md)",
        "- [Commands](commands.md)",
        "- [Verification](verification.md)",
        "- [Runtime Boundaries](runtime.md)",
        "- [Repository Graph](graph.md)",
        "- [Sessions](sessions.md)",
        "",
        "Source refs:",
        renderSourceRefs(releaseSources.length > 0 ? releaseSources : [repoRelative(cwd, discovered.packageJson)]),
      ].join("\n"),
    },
    {
      pageId: "wiki.runtime",
      title: "Runtime Boundaries",
      required: [repoRelative(cwd, discovered.packageJson)],
      sourceRefs: runtimeSources.length > 0 ? runtimeSources : [repoRelative(cwd, discovered.packageJson)],
      localLinks: ["overview.md", "commands.md", "verification.md", "release.md", "graph.md", "sessions.md"],
      claimClasses: { derivableFacts: 6, advisoryClaims: 1 },
      body: [
        "# Runtime Boundaries",
        "",
        `- Implementation status doc present: ${existsSync(discovered.implementationStatus) ? "yes" : "no"}`,
        `- Remaining work doc present: ${existsSync(discovered.remainingWork) ? "yes" : "no"}`,
        `- Roadmap kanban present: ${existsSync(discovered.roadmapKanban) ? "yes" : "no"}`,
        `- Worktree app-instance design present: ${existsSync(discovered.appInstanceDesign) ? "yes" : "no"}`,
        "",
        "Use the source refs below for the authoritative runtime boundaries. This page summarizes where to look; it does not grant health, cleanup, control, injection, or completion authority.",
        "",
        "Related pages:",
        "- [Overview](overview.md)",
        "- [Commands](commands.md)",
        "- [Verification](verification.md)",
        "- [Release And Contract](release.md)",
        "- [Repository Graph](graph.md)",
        "- [Sessions](sessions.md)",
        "",
        "Source refs:",
        renderSourceRefs(runtimeSources.length > 0 ? runtimeSources : [repoRelative(cwd, discovered.packageJson)]),
      ].join("\n"),
    },
    {
      pageId: "wiki.graph",
      title: "Repository Graph",
      required: [repoRelative(cwd, discovered.packageJson)],
      sourceRefs: graphSources.length > 0 ? graphSources : [repoRelative(cwd, discovered.packageJson)],
      localLinks: ["overview.md", "commands.md", "verification.md", "release.md", "runtime.md", "sessions.md"],
      claimClasses: { derivableFacts: 7, advisoryClaims: 0 },
      body: [
        "# Repository Graph",
        "",
        `- Latest graph artifact present: ${discovered.latestRepoGraph ? "yes" : "no"}`,
        `- Latest graph id: ${recordString(repoGraphRecord, "graphId") ?? "none"}`,
        `- Provider: ${recordString(repoGraphRecord, "provider") ?? "none"}`,
        `- Node count: ${recordArrayLength(repoGraphRecord, "nodes") ?? "unknown"}`,
        `- Edge count: ${recordArrayLength(repoGraphRecord, "edges") ?? "unknown"}`,
        `- Evidence gap count: ${recordArrayLength(repoGraphRecord, "evidenceGaps") ?? "unknown"}`,
        "",
        "This page is a deterministic projection over graph artifacts. It is not an import-injection approval, code-intelligence authority, or completion gate.",
        "",
        "Related pages:",
        "- [Overview](overview.md)",
        "- [Commands](commands.md)",
        "- [Verification](verification.md)",
        "- [Release And Contract](release.md)",
        "- [Runtime Boundaries](runtime.md)",
        "- [Sessions](sessions.md)",
        "",
        "Source refs:",
        renderSourceRefs(graphSources.length > 0 ? graphSources : [repoRelative(cwd, discovered.packageJson)]),
      ].join("\n"),
    },
    {
      pageId: "wiki.sessions",
      title: "Sessions",
      required: [repoRelative(cwd, discovered.packageJson)],
      sourceRefs: sessionSources.length > 0 ? sessionSources : [repoRelative(cwd, discovered.packageJson)],
      localLinks: ["overview.md", "commands.md", "verification.md", "release.md", "runtime.md", "graph.md"],
      claimClasses: { derivableFacts: 8, advisoryClaims: 0 },
      body: [
        "# Sessions",
        "",
        `- Session state present: ${existsSync(sessionPaths(cwd).state) ? "yes" : "no"}`,
        `- Checkpoint count: ${sessionState?.checkpoints.length ?? 0}`,
        `- Verification count: ${sessionState?.verifications.length ?? 0}`,
        `- Latest verification status: ${sessionState?.verifications.at(-1)?.status ?? "none"}`,
        `- Decision count: ${decisionSummary.count}`,
        `- Latest decision id: ${decisionSummary.lastDecision?.decisionId ?? "none"}`,
        "",
        "This page is a deterministic projection over local session artifacts. It does not replace the session ledger, mark tasks complete, or make advisory decisions authoritative.",
        "",
        "Related pages:",
        "- [Overview](overview.md)",
        "- [Commands](commands.md)",
        "- [Verification](verification.md)",
        "- [Release And Contract](release.md)",
        "- [Runtime Boundaries](runtime.md)",
        "- [Repository Graph](graph.md)",
        "",
        "Source refs:",
        renderSourceRefs(sessionSources.length > 0 ? sessionSources : [repoRelative(cwd, discovered.packageJson)]),
      ].join("\n"),
    },
  ];
  return pages;
}

function pageFilename(pageId: string): string {
  return `${pageId.replace(/^wiki\./, "")}.md`;
}

export async function buildWikiMap(cwd: string): Promise<WikiMapResult> {
  const discovered = await discoverSources(cwd);
  const pages = await buildPageDefinitions(cwd);
  const categories: WikiMapSourceCandidate[] = [
    { kind: "file", category: "package-metadata", path: repoRelative(cwd, discovered.packageJson), exists: existsSync(discovered.packageJson), usedBy: pages.filter((page) => page.sourceRefs.includes(repoRelative(cwd, discovered.packageJson))).map((page) => page.pageId) },
    { kind: "file", category: "release-policy", path: repoRelative(cwd, discovered.changelog), exists: existsSync(discovered.changelog), usedBy: pages.filter((page) => page.sourceRefs.includes(repoRelative(cwd, discovered.changelog))).map((page) => page.pageId) },
    { kind: "file", category: "readme", path: repoRelative(cwd, discovered.readme), exists: existsSync(discovered.readme), usedBy: pages.filter((page) => page.sourceRefs.includes(repoRelative(cwd, discovered.readme))).map((page) => page.pageId) },
    { kind: "file", category: "docs-index", path: repoRelative(cwd, discovered.docsReadme), exists: existsSync(discovered.docsReadme), usedBy: pages.filter((page) => page.sourceRefs.includes(repoRelative(cwd, discovered.docsReadme))).map((page) => page.pageId) },
    { kind: "file", category: "docs-index", path: repoRelative(cwd, discovered.docsKoReadme), exists: existsSync(discovered.docsKoReadme), usedBy: pages.filter((page) => page.sourceRefs.includes(repoRelative(cwd, discovered.docsKoReadme))).map((page) => page.pageId) },
    { kind: "file", category: "json-contract", path: repoRelative(cwd, discovered.jsonContract), exists: existsSync(discovered.jsonContract), usedBy: pages.filter((page) => page.sourceRefs.includes(repoRelative(cwd, discovered.jsonContract))).map((page) => page.pageId) },
    { kind: "file", category: "release-policy", path: repoRelative(cwd, discovered.releasePolicy), exists: existsSync(discovered.releasePolicy), usedBy: pages.filter((page) => page.sourceRefs.includes(repoRelative(cwd, discovered.releasePolicy))).map((page) => page.pageId) },
    { kind: "file", category: "implementation-status", path: repoRelative(cwd, discovered.implementationStatus), exists: existsSync(discovered.implementationStatus), usedBy: pages.filter((page) => page.sourceRefs.includes(repoRelative(cwd, discovered.implementationStatus))).map((page) => page.pageId) },
    { kind: "file", category: "roadmap", path: repoRelative(cwd, discovered.remainingWork), exists: existsSync(discovered.remainingWork), usedBy: pages.filter((page) => page.sourceRefs.includes(repoRelative(cwd, discovered.remainingWork))).map((page) => page.pageId) },
    { kind: "file", category: "roadmap", path: repoRelative(cwd, discovered.roadmapKanban), exists: existsSync(discovered.roadmapKanban), usedBy: pages.filter((page) => page.sourceRefs.includes(repoRelative(cwd, discovered.roadmapKanban))).map((page) => page.pageId) },
    { kind: "file", category: "command-registry", path: repoRelative(cwd, discovered.cliMain), exists: existsSync(discovered.cliMain), usedBy: pages.filter((page) => page.sourceRefs.includes(repoRelative(cwd, discovered.cliMain))).map((page) => page.pageId) },
    { kind: "file", category: "schema-registry", path: repoRelative(cwd, discovered.schemaDir), exists: existsSync(discovered.schemaDir), usedBy: [] },
    { kind: "artifact", category: "verification", path: discovered.latestVerification ? repoRelative(cwd, discovered.latestVerification) : ".codexus/session/verification/<latest>/verification.json", exists: !!discovered.latestVerification, usedBy: pages.filter((page) => discovered.latestVerification && page.sourceRefs.includes(repoRelative(cwd, discovered.latestVerification))).map((page) => page.pageId) },
    { kind: "artifact", category: "decision", path: discovered.latestDecision ? repoRelative(cwd, discovered.latestDecision) : ".codexus/session/decisions/<latest>/decision.json", exists: !!discovered.latestDecision, usedBy: pages.filter((page) => discovered.latestDecision && page.sourceRefs.includes(repoRelative(cwd, discovered.latestDecision))).map((page) => page.pageId) },
    { kind: "artifact", category: "repo-graph", path: discovered.latestRepoGraph ? repoRelative(cwd, discovered.latestRepoGraph) : ".codexus/repo-graphs/<latest>/graph.json", exists: !!discovered.latestRepoGraph, usedBy: pages.filter((page) => discovered.latestRepoGraph && page.sourceRefs.includes(repoRelative(cwd, discovered.latestRepoGraph))).map((page) => page.pageId) },
  ];
  return {
    schemaVersion: 1,
    stability: "experimental",
    command: "wiki map",
    cwd,
    candidates: categories,
    pages: pages.map((page) => ({
      pageId: page.pageId,
      title: page.title,
      buildable: page.required.every((ref) => existsSync(resolveRef(cwd, ref))),
      requiredSourcesPresent: page.required.every((ref) => existsSync(resolveRef(cwd, ref))),
      sourceRefs: page.sourceRefs,
    })),
  };
}

async function writePage(cwd: string, definition: PageDefinition, generatedAt: string): Promise<WikiManifestPageEntry> {
  const sourceRefs = definition.sourceRefs.filter((ref) => isSafeRelativePath(ref));
  const metadata: WikiPageMetadata = {
    schemaVersion: 1,
    stability: "experimental",
    type: "codexus.wiki.page",
    pageId: definition.pageId,
    title: definition.title,
    generatedAt,
    sourceRefs,
    localLinks: definition.localLinks,
    sourceFingerprint: sourceFingerprint(cwd, sourceRefs),
    freshness: "fresh",
    claimClasses: definition.claimClasses,
  };
  const pagePath = join(wikiPagesDir(cwd), pageFilename(definition.pageId));
  await ensureDir(dirname(pagePath));
  await writeFile(pagePath, `${renderFrontmatter(metadata)}${definition.body}\n`);
  return {
    ...metadata,
    path: repoRelative(cwd, pagePath),
  };
}

export async function buildWiki(cwd: string, mode: WikiBuildMode): Promise<WikiBuildResult> {
  if (mode !== "deterministic") throw new Error(`unsupported_wiki_build_mode:${mode}`);
  const pages = await buildPageDefinitions(cwd);
  const generatedAt = nowIso();
  await ensureDir(wikiPagesDir(cwd));
  await ensureDir(wikiContextDir(cwd));
  const entries: WikiManifestPageEntry[] = [];
  for (const page of pages) {
    entries.push(await writePage(cwd, page, generatedAt));
  }
  const manifest: WikiManifest = {
    schemaVersion: 1,
    stability: "experimental",
    type: "codexus.wiki.manifest",
    generatedAt,
    cwd,
    mode: "deterministic",
    pages: entries,
  };
  const manifestPath = wikiManifestPath(cwd);
  await writeJsonAtomic(manifestPath, manifest);
  return {
    schemaVersion: 1,
    stability: "experimental",
    command: "wiki build",
    cwd,
    mode: "deterministic",
    manifest,
    manifestPath,
    pagesDir: repoRelative(cwd, wikiPagesDir(cwd)),
  };
}

export async function buildWikiAdvisory(cwd: string, driver = "local-deterministic"): Promise<WikiAdvisoryBuildResult> {
  if (!existsSync(wikiManifestPath(cwd))) throw new Error("wiki_manifest_missing");
  const check = await checkWiki(cwd, false);
  if (check.wiki.status !== "pass") throw new Error("wiki_advisory_source_not_fresh");
  const manifestRaw = await readJsonIfExists(wikiManifestPath(cwd));
  const manifest = manifestRaw as WikiManifest;
  const sourcePages = manifest.pages.map((page) => ({
    pageId: page.pageId,
    title: page.title,
    path: page.path,
    freshness: computePageFreshness(cwd, page),
    sourceFingerprint: page.sourceFingerprint,
  }));
  const sourceBundleHash = sha256CanonicalJson(sourcePages);
  const pageLines = sourcePages.map((page) => `- ${page.title} (${page.pageId}) from ${page.path}`);
  const advisoryText = [
    "This advisory synthesis summarizes the deterministic Codexus wiki page set.",
    "It is generated from already-built page metadata and does not invoke a model.",
    "It is not source truth and is not eligible for automatic prompt injection.",
    "",
    ...pageLines,
  ].join("\n");
  const result: WikiAdvisoryBuildResult = {
    schemaVersion: 1,
    stability: "experimental",
    command: "wiki build",
    cwd,
    mode: "advisory",
    advisoryManifestPath: repoRelative(cwd, wikiAdvisoryManifestPath(cwd)),
    sourceManifestPath: repoRelative(cwd, wikiManifestPath(cwd)),
    sourcePages,
    synthesis: {
      driver: {
        id: driver.trim() || "local-deterministic",
        kind: "local-deterministic",
        model: null,
        modelInvoked: false,
      },
      sourceBundleHash,
      advisoryText,
      claimClasses: {
        derivableFacts: sourcePages.length,
        advisoryClaims: 1,
      },
      eligibleForAutomaticInjection: false,
      sourceTruth: false,
      completionAuthority: false,
    },
    check: {
      status: "pass",
      gate: check.gate.status === "passed" ? "passed" : "not_requested",
    },
    completionAuthority: false,
  };
  await ensureDir(wikiAdvisoryDir(cwd));
  await writeJsonAtomic(wikiAdvisoryManifestPath(cwd), result);
  return result;
}

function buildGate(enabled: boolean, evidenceGaps: WikiEvidenceGap[]): WikiGate {
  if (!enabled) return { enabled: false, status: "not_requested", exitCode: 0, reason: "gate not requested" };
  if (evidenceGaps.length > 0) return { enabled: true, status: "failed", exitCode: 1, reason: "gateable wiki evidence gaps are present" };
  return { enabled: true, status: "passed", exitCode: 0, reason: "no gateable wiki evidence gaps" };
}

function computePageFreshness(cwd: string, page: Pick<WikiManifestPageEntry, "sourceRefs" | "sourceFingerprint">): WikiFreshness {
  const refs = page.sourceRefs.filter((ref) => isSafeRelativePath(ref));
  if (refs.length !== page.sourceRefs.length) return "unknown";
  if (refs.some((ref) => !existsSync(resolveRef(cwd, ref)))) return "partial";
  return sourceFingerprint(cwd, refs) === page.sourceFingerprint ? "fresh" : "stale";
}

export async function checkWiki(cwd: string, gate: boolean): Promise<WikiCheckResult> {
  const manifestPath = wikiManifestPath(cwd);
  const evidenceGaps: WikiEvidenceGap[] = [];
  const derivableFacts: WikiDerivableFact[] = [];
  const heuristicClaims: WikiHeuristicClaim[] = [{
    kind: "semantic_page_quality_not_evaluated",
    confidence: "high",
    evidence: "Wiki check validates structure, links, refs, and freshness, not summary quality.",
    recommendation: "Review generated prose separately if humans need editorial polish.",
  }];
  if (!existsSync(manifestPath)) {
    evidenceGaps.push({
      kind: "manifest_missing",
      gate: true,
      evidence: null,
      recommendation: "Run `cx wiki build --mode deterministic --json` first.",
      files: [repoRelative(cwd, manifestPath)],
    });
    return {
      schemaVersion: 1,
      stability: "experimental",
      command: "wiki check",
      cwd,
      manifestPath: repoRelative(cwd, manifestPath),
      wiki: { status: "fail", pageCount: 0, freshCount: 0, staleCount: 0 },
      evidenceGaps,
      derivableFacts,
      heuristicClaims,
      blockingUnknowns: [],
      informationalUnknowns: [],
      gate: buildGate(gate, evidenceGaps),
    };
  }
  derivableFacts.push({
    kind: "manifest_present",
    gate: true,
    evidence: repoRelative(cwd, manifestPath),
    files: [repoRelative(cwd, manifestPath)],
  });
  const manifestRaw = await readJsonIfExists(manifestPath);
  const manifestValidation = validateWikiManifest(manifestRaw);
  if (!manifestValidation.valid) {
    evidenceGaps.push({
      kind: "manifest_invalid",
      gate: true,
      evidence: manifestValidation.errors.join(","),
      recommendation: "Regenerate the wiki manifest with `cx wiki build --mode deterministic`.",
      files: [repoRelative(cwd, manifestPath)],
    });
    return {
      schemaVersion: 1,
      stability: "experimental",
      command: "wiki check",
      cwd,
      manifestPath: repoRelative(cwd, manifestPath),
      wiki: { status: "fail", pageCount: 0, freshCount: 0, staleCount: 0 },
      evidenceGaps,
      derivableFacts,
      heuristicClaims,
      blockingUnknowns: [],
      informationalUnknowns: [],
      gate: buildGate(gate, evidenceGaps),
    };
  }
  derivableFacts.push({
    kind: "manifest_valid",
    gate: true,
    evidence: "codexus.wiki.manifest shape valid",
    files: [repoRelative(cwd, manifestPath)],
  });
  const manifest = manifestRaw as WikiManifest;
  const registeredPages = new Set(manifest.pages.map((page) => resolveRef(cwd, page.path)));
  let freshCount = 0;
  let staleCount = 0;
  for (const entry of manifest.pages) {
    const absolutePage = resolveRef(cwd, entry.path);
    if (!existsSync(absolutePage)) {
      evidenceGaps.push({
        kind: "page_missing",
        gate: true,
        evidence: entry.path,
        recommendation: "Rebuild the wiki so every manifest page exists.",
        files: [entry.path],
      });
      continue;
    }
    const raw = await readFile(absolutePage, "utf8");
    const { metadata, body } = parsePageFrontmatter(raw);
    if (!metadata) {
      evidenceGaps.push({
        kind: "page_frontmatter_invalid",
        gate: true,
        evidence: entry.path,
        recommendation: "Regenerate the page so the frontmatter is parseable.",
        files: [entry.path],
      });
      continue;
    }
    const pageValidation = validateWikiPageMetadata(metadata);
    if (!pageValidation.valid) {
      evidenceGaps.push({
        kind: "page_frontmatter_invalid",
        gate: true,
        evidence: `${entry.path}: ${pageValidation.errors.join(",")}`,
        recommendation: "Regenerate the page so the frontmatter matches the schema.",
        files: [entry.path],
      });
      continue;
    }
    derivableFacts.push({
      kind: "page_valid",
      gate: true,
      evidence: `${metadata.pageId} frontmatter valid`,
      files: [entry.path],
    });
    if (metadata.pageId !== entry.pageId
      || metadata.title !== entry.title
      || metadata.sourceFingerprint !== entry.sourceFingerprint
      || metadata.sourceRefs.join("\n") !== entry.sourceRefs.join("\n")
      || metadata.localLinks.join("\n") !== entry.localLinks.join("\n")) {
      evidenceGaps.push({
        kind: "page_entry_mismatch",
        gate: true,
        evidence: entry.path,
        recommendation: "Rebuild the wiki so the page and manifest agree.",
        files: [entry.path, repoRelative(cwd, manifestPath)],
      });
    }
    for (const ref of metadata.sourceRefs) {
      if (!isSafeRelativePath(ref)) {
        evidenceGaps.push({
          kind: "source_ref_unsafe",
          gate: true,
          evidence: ref,
          recommendation: "Keep wiki source refs as safe relative workspace paths.",
          files: [entry.path],
        });
        continue;
      }
      if (!existsSync(resolveRef(cwd, ref))) {
        evidenceGaps.push({
          kind: "source_ref_missing",
          gate: true,
          evidence: ref,
          recommendation: "Rebuild the wiki or restore the missing source artifact.",
          files: [entry.path, ref],
        });
      }
    }
    if (!evidenceGaps.some((gap) => gap.kind === "source_ref_missing" || gap.kind === "source_ref_unsafe")) {
      derivableFacts.push({
        kind: "source_refs_resolved",
        gate: true,
        evidence: `${metadata.pageId} source refs resolved`,
        files: [entry.path, ...metadata.sourceRefs],
      });
    }
    for (const link of metadata.localLinks) {
      const resolved = resolve(dirname(absolutePage), link);
      if (!existsSync(resolved)) {
        evidenceGaps.push({
          kind: "local_link_missing",
          gate: true,
          evidence: `${entry.path} -> ${link}`,
          recommendation: "Keep generated local links aligned with existing wiki pages.",
          files: [entry.path],
        });
        continue;
      }
      if (!registeredPages.has(resolved)) {
        evidenceGaps.push({
          kind: "local_link_unregistered",
          gate: true,
          evidence: `${entry.path} -> ${link}`,
          recommendation: "Keep generated local links aligned with registered wiki pages only.",
          files: [entry.path],
        });
      }
    }
    if (!evidenceGaps.some((gap) => (gap.kind === "local_link_missing" || gap.kind === "local_link_unregistered") && gap.files?.includes(entry.path))) {
      derivableFacts.push({
        kind: "local_links_resolved",
        gate: true,
        evidence: `${metadata.pageId} local links resolved`,
        files: [entry.path, ...metadata.localLinks],
      });
    }
    if (raw.includes(resolve(cwd)) || raw.includes(harnessRoot(cwd)) || /(^|\s)\/Users\//.test(raw)) {
      evidenceGaps.push({
        kind: "absolute_private_path_present",
        gate: true,
        evidence: entry.path,
        recommendation: "Regenerate the page using relative paths only.",
        files: [entry.path],
      });
    }
    const currentFingerprint = sourceFingerprint(cwd, metadata.sourceRefs);
    if (currentFingerprint !== metadata.sourceFingerprint) {
      staleCount += 1;
      evidenceGaps.push({
        kind: "page_stale",
        gate: true,
        evidence: `${metadata.pageId}:${metadata.sourceFingerprint} -> ${currentFingerprint}`,
        recommendation: "Rebuild the wiki after source files or artifacts change.",
        files: [entry.path, ...metadata.sourceRefs],
      });
    } else {
      freshCount += 1;
      derivableFacts.push({
        kind: "page_fresh",
        gate: true,
        evidence: `${metadata.pageId} fingerprint matches current sources`,
        files: [entry.path, ...metadata.sourceRefs],
      });
    }
    if (!body.includes("Source refs:")) {
      evidenceGaps.push({
        kind: "page_entry_mismatch",
        gate: true,
        evidence: `${entry.path} missing Source refs section`,
        recommendation: "Regenerate the page so its readable body points back to its sources.",
        files: [entry.path],
      });
    }
  }
  const wikiStatus: "pass" | "fail" = evidenceGaps.length === 0 ? "pass" : "fail";
  return {
    schemaVersion: 1,
    stability: "experimental",
    command: "wiki check",
    cwd,
    manifestPath: repoRelative(cwd, manifestPath),
    wiki: {
      status: wikiStatus,
      pageCount: manifest.pages.length,
      freshCount,
      staleCount,
    },
    evidenceGaps,
    derivableFacts,
    heuristicClaims,
    blockingUnknowns: [],
    informationalUnknowns: [],
    gate: buildGate(gate, evidenceGaps),
  };
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function normalizeTopicText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function topicScore(topic: string, page: WikiManifestPageEntry, text: string, freshness: WikiFreshness): number {
  const pageKey = normalizeTopicText(`${page.pageId.replace(/^wiki\./, "")} ${page.title}`);
  const body = normalizeTopicText(text);
  const terms = normalizeTopicText(topic).split(/\s+/).filter(Boolean);
  const phrase = terms.join(" ");
  let score = 0;
  if (phrase && pageKey.includes(phrase)) score += 16;
  for (const term of terms) {
    if (page.pageId.toLowerCase().includes(term)) score += 10;
    if (page.title.toLowerCase().includes(term)) score += 8;
    if (body.includes(term)) score += 2;
  }
  if (page.pageId === "wiki.overview") score += 1;
  if (freshness === "fresh") score += 2;
  return score;
}

export async function buildWikiContext(cwd: string, topic: string, budget: number, options: {
  freshOnly?: boolean;
  gate?: boolean;
} = {}): Promise<WikiContextResult> {
  if (!topic.trim()) throw new Error("missing_wiki_topic");
  if (!Number.isFinite(budget) || budget <= 0) throw new Error("invalid_wiki_budget");
  const manifestPath = wikiManifestPath(cwd);
  if (!existsSync(manifestPath)) throw new Error("wiki_manifest_missing");
  const manifestRaw = await readJsonIfExists(manifestPath);
  const manifestValidation = validateWikiManifest(manifestRaw);
  if (!manifestValidation.valid) throw new Error("wiki_manifest_invalid");
  const manifest = manifestRaw as WikiManifest;
  const pages = await Promise.all(manifest.pages.map(async (page) => {
    const absolute = resolveRef(cwd, page.path);
    const raw = existsSync(absolute) ? await readFile(absolute, "utf8") : "";
    const freshness = computePageFreshness(cwd, page);
    return { page, raw, freshness, score: topicScore(topic, page, raw, freshness) };
  }));
  const sorted = pages
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.page.pageId.localeCompare(right.page.pageId));
  const fallback = sorted.length > 0 ? sorted : pages.filter((item) => item.page.pageId === "wiki.overview");
  const eligiblePages = options.freshOnly ? fallback.filter((item) => item.freshness === "fresh") : fallback;
  const selectedPages: WikiContextPageSelection[] = [];
  let text = "";
  let tokens = 0;
  for (const item of eligiblePages) {
    const nextText = text.length === 0
      ? item.raw
      : `${text}\n\n---\n\n${item.raw}`;
    const nextTokens = estimateTokens(nextText);
    if (selectedPages.length > 0 && nextTokens > budget) continue;
    text = nextText;
    tokens = nextTokens;
    selectedPages.push({
      pageId: item.page.pageId,
      title: item.page.title,
      path: item.page.path,
      freshness: item.freshness,
      estimatedTokens: estimateTokens(item.raw),
      reason: item.score > 0
        ? `matched topic "${topic}" with score ${item.score}`
        : "fallback overview page",
    });
    if (tokens >= budget) break;
  }
  const selectedFresh = selectedPages.filter((page) => page.freshness === "fresh").length;
  const selectedStale = selectedPages.filter((page) => page.freshness !== "fresh").length;
  const evidenceGaps: WikiEvidenceGap[] = [];
  if (options.freshOnly && selectedPages.length === 0) {
    evidenceGaps.push({
      kind: "page_stale",
      gate: true,
      evidence: "fresh-only context selected no fresh pages",
      recommendation: "Run `cx wiki build --mode deterministic --json` and `cx wiki check --gate --json` before requesting fresh-only context.",
      files: fallback.map((item) => item.page.path),
    });
  }
  const derivableFacts: WikiDerivableFact[] = selectedFresh > 0
    ? [{
      kind: "page_fresh",
      gate: true,
      evidence: `${selectedFresh} fresh context pages selected`,
      files: selectedPages.filter((page) => page.freshness === "fresh").map((page) => page.path),
    }]
    : [];
  return {
    schemaVersion: 1,
    stability: "stable",
    command: "wiki context",
    cwd,
    topic,
    budget,
    freshnessPolicy: {
      freshOnly: Boolean(options.freshOnly),
      status: evidenceGaps.length === 0 ? "pass" : "fail",
      selectedFresh,
      selectedStale,
    },
    selectedPages,
    tokenEstimate: tokens,
    // Context packs are readable bounded projections only in the first slice.
    eligibleForAutomaticInjection: false,
    evidenceGaps,
    derivableFacts,
    gate: buildGate(Boolean(options.gate), evidenceGaps),
    text,
  };
}

export function validateWikiContextApproval(value: unknown) {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return { schemaVersion: 1 as const, valid: false, errors: ["approval:not_object"], artifact: null as WikiContextApprovalArtifact | null };
  }
  if (value.schemaVersion !== 1) errors.push("schemaVersion:not_1");
  if (value.stability !== "experimental") errors.push("stability:not_experimental");
  if (value.type !== "codexus.wiki.context-approval") errors.push("type:not_codexus_wiki_context_approval");
  if (value.status !== "approved_not_injected") errors.push("status:not_approved_not_injected");
  const requireText = (key: string) => {
    const next = value[key];
    if (typeof next !== "string" || next.trim().length === 0) {
      errors.push(`${key}:expected_non_empty_string`);
      return "";
    }
    return next;
  };
  const approvalId = requireText("approvalId");
  const approvedAt = requireText("approvedAt");
  const approvedBy = requireText("approvedBy");
  const topic = requireText("topic");
  const contextHash = requireText("contextHash");
  const sourceManifestPath = requireText("sourceManifestPath");
  if (!Number.isInteger(value.budget) || (value.budget as number) <= 0) errors.push("budget:expected_positive_integer");
  if (!Number.isInteger(value.tokenEstimate) || (value.tokenEstimate as number) < 0) errors.push("tokenEstimate:expected_non_negative_integer");
  if (!Array.isArray(value.selectedPages)) errors.push("selectedPages:expected_array");
  if (!isRecord(value.paths)) {
    errors.push("paths:expected_object");
  } else {
    for (const key of ["dir", "markdown", "json"]) {
      if (typeof value.paths[key] !== "string" || String(value.paths[key]).trim().length === 0) errors.push(`paths.${key}:expected_non_empty_string`);
    }
  }
  if (!isRecord(value.injection)) {
    errors.push("injection:expected_object");
  } else {
    if (value.injection.automatic !== false) errors.push("injection.automatic:not_false");
    if (value.injection.applied !== false) errors.push("injection.applied:not_false");
    if (typeof value.injection.reason !== "string" || value.injection.reason.trim().length === 0) errors.push("injection.reason:expected_non_empty_string");
  }
  if (!isRecord(value.authority)) {
    errors.push("authority:expected_object");
  } else {
    if (value.authority.sourceTruth !== false) errors.push("authority.sourceTruth:not_false");
    if (value.authority.completionAuthority !== false) errors.push("authority.completionAuthority:not_false");
  }
  return {
    schemaVersion: 1 as const,
    valid: errors.length === 0,
    errors,
    artifact: errors.length === 0
      ? value as unknown as WikiContextApprovalArtifact
      : null,
  };
}

export async function approveWikiContext(cwd: string, topic: string, budget: number, approvedBy?: string, options: {
  freshOnly?: boolean;
  gate?: boolean;
} = {}): Promise<WikiContextApprovalResult> {
  const context = await buildWikiContext(cwd, topic, budget, options);
  if (context.freshnessPolicy.status === "fail") throw new Error("wiki_context_freshness_gate_failed");
  const approvedAt = nowIso();
  const approvalId = `wiki_context_${Date.now().toString(36)}`;
  const dir = wikiContextApprovalDir(cwd, approvalId);
  const markdown = join(dir, "context.md");
  const json = join(dir, "approval.json");
  const contextHash = sha256Text(context.text);
  const approval: WikiContextApprovalArtifact = {
    schemaVersion: 1,
    stability: "experimental",
    type: "codexus.wiki.context-approval",
    approvalId,
    status: "approved_not_injected",
    approvedAt,
    approvedBy: approvedBy?.trim() || "codexus-wiki-context",
    topic: context.topic,
    budget: context.budget,
    tokenEstimate: context.tokenEstimate,
    selectedPages: context.selectedPages,
    contextHash,
    sourceManifestPath: repoRelative(cwd, wikiManifestPath(cwd)),
    paths: {
      dir,
      markdown,
      json,
    },
    injection: {
      automatic: false,
      applied: false,
      reason: "Codexus records approved wiki context as an artifact but does not inject it into the active Codex prompt automatically.",
    },
    authority: {
      sourceTruth: false,
      completionAuthority: false,
    },
  };
  await ensureDir(dir);
  await writeFile(markdown, [
    "# Codexus Wiki Context Approval",
    "",
    "Status: approved_not_injected",
    "",
    "This context is approved for explicit human/model reading. Codexus does not inject it automatically and it is not source truth.",
    "",
    `- approvalId: ${approvalId}`,
    `- approvedAt: ${approvedAt}`,
    `- approvedBy: ${approval.approvedBy}`,
    `- topic: ${context.topic}`,
    `- contextHash: ${contextHash}`,
    "",
    "## Context",
    "",
    context.text,
  ].join("\n"));
  await writeJsonAtomic(json, approval);
  return {
    schemaVersion: 1,
    stability: "experimental",
    command: "wiki context approve",
    cwd,
    context,
    approval,
    eligibleForAutomaticInjection: false,
    completionAuthority: false,
  };
}

async function readWikiContextApproval(path: string) {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
    return validateWikiContextApproval(parsed).artifact;
  } catch {
    return null;
  }
}

export async function summarizeWikiContextApprovals(cwd: string): Promise<WikiContextApprovalSummary> {
  const root = wikiContextDir(cwd);
  const approvals: Array<WikiContextApprovalArtifact & { path: string }> = [];
  if (existsSync(root)) {
    for (const entry of await readdir(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const path = join(root, entry.name, "approval.json");
      if (!existsSync(path)) continue;
      const approval = await readWikiContextApproval(path);
      if (approval) approvals.push({ ...approval, path });
    }
  }
  approvals.sort((left, right) => right.approvedAt.localeCompare(left.approvedAt));
  const latest = approvals[0] ?? null;
  return {
    schemaVersion: 1,
    stability: "experimental",
    status: approvals.length > 0 ? "observed" : "empty",
    approvals: {
      total: approvals.length,
      latest: latest
        ? {
          approvalId: latest.approvalId,
          approvedAt: latest.approvedAt,
          approvedBy: latest.approvedBy,
          topic: latest.topic,
          tokenEstimate: latest.tokenEstimate,
          path: latest.path,
        }
        : null,
    },
    eligibleForAutomaticInjection: false,
    completionAuthority: false,
  };
}

export async function exportWiki(cwd: string, target: string): Promise<WikiExportResult> {
  const resolved = resolveExportTarget(cwd, target);
  const check = await checkWiki(cwd, true);
  if (check.gate.status !== "passed") {
    return {
      schemaVersion: 1,
      stability: "experimental",
      command: "wiki export",
      cwd,
      target: resolved.relative,
      sourceManifestPath: check.manifestPath,
      pageCount: 0,
      exportedFiles: [],
      check: {
        status: check.wiki.status,
        gate: check.gate.status === "passed" ? "passed" : "failed",
      },
      export: {
        status: "blocked",
        autoCommitted: false,
        sourceTruth: false,
      },
      evidenceGaps: check.evidenceGaps,
      gate: {
        enabled: true,
        status: "failed",
        exitCode: 1,
        reason: "wiki export requires a fresh passing wiki check",
      },
    };
  }

  const manifestRaw = await readJsonIfExists(wikiManifestPath(cwd));
  const manifest = manifestRaw as WikiManifest;
  await ensureDir(resolved.absolute);
  const exportedFiles: string[] = [];
  for (const page of manifest.pages) {
    const source = resolveRef(cwd, page.path);
    const targetPath = join(resolved.absolute, basename(page.path));
    await copyFile(source, targetPath);
    exportedFiles.push(repoRelative(cwd, targetPath));
  }
  const indexPath = join(resolved.absolute, "index.md");
  const index = [
    "# Codexus Wiki Export",
    "",
    "This directory is an explicit export of `.codexus/wiki/`.",
    "It is a generated projection, not the source of truth.",
    "Codexus does not auto-commit exported wiki pages.",
    "",
    "Pages:",
    ...manifest.pages.map((page) => `- [${page.title}](${basename(page.path)})`),
    "",
    `Source manifest: \`${repoRelative(cwd, wikiManifestPath(cwd))}\``,
    "",
  ].join("\n");
  await writeFile(indexPath, index);
  exportedFiles.push(repoRelative(cwd, indexPath));

  return {
    schemaVersion: 1,
    stability: "experimental",
    command: "wiki export",
    cwd,
    target: resolved.relative,
    sourceManifestPath: repoRelative(cwd, wikiManifestPath(cwd)),
    pageCount: manifest.pages.length,
    exportedFiles: exportedFiles.sort(),
    check: {
      status: "pass",
      gate: "passed",
    },
    export: {
      status: "exported",
      autoCommitted: false,
      sourceTruth: false,
    },
    evidenceGaps: [],
    gate: {
      enabled: true,
      status: "passed",
      exitCode: 0,
      reason: "wiki export completed after a passing freshness check",
    },
  };
}
