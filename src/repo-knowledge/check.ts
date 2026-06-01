import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";

export type RepoKnowledgeStatus = "pass" | "fail" | "unknown";

export interface RepoKnowledgeEvidenceGap {
  kind: "required_doc_missing" | "index_link_broken" | "counterpart_missing";
  gate: true;
  evidence: string | null;
  policy: string;
  recommendation: string;
  files?: string[];
  links?: string[];
}

export interface RepoKnowledgeDerivableFact {
  kind: "required_doc_present" | "index_link_resolved" | "counterpart_present" | "external_link_recorded";
  gate: boolean;
  evidence: string;
  files?: string[];
  links?: string[];
  count?: number;
}

export interface RepoKnowledgeHeuristicClaim {
  kind: "semantic_freshness_not_evaluated";
  confidence: "low" | "medium" | "high";
  evidence: string;
  recommendation: string;
}

export interface RepoKnowledgeUnknown {
  kind: "index_unreadable" | "anchor_unresolved";
  gate: boolean;
  evidence: string | null;
  recommendation: string;
  files?: string[];
  links?: string[];
}

export interface RepoKnowledgeGate {
  enabled: boolean;
  status: "not_requested" | "passed" | "failed" | "blocked";
  exitCode: 0 | 1;
  reason: string;
}

export interface RepoLink {
  source: string;
  line: number;
  label: string;
  target: string;
  kind: "local" | "external" | "anchor";
  resolved: boolean | "unknown";
  targetPath: string | null;
  anchor: string | null;
  error: string | null;
}

export interface RepoDocument {
  path: string;
  language: "en" | "ko" | "unknown";
  counterpartPath: string | null;
  counterpartExists: boolean | null;
  linkCount: number;
}

export interface RepoKnowledgeReport {
  schemaVersion: 1;
  stability: "experimental";
  cwd: string;
  packageRoot: string | null;
  scanMode: "static";
  scanAccuracy: "best_effort";
  policy: {
    source: "built-in:codexus-repo-knowledge";
    requiredIndexes: string[];
    englishKoreanCounterparts: boolean;
    checkedCounterpartRoots: string[];
  };
  indexes: Array<{
    path: string;
    exists: boolean;
    readable: boolean;
    links: RepoLink[];
    error: string | null;
  }>;
  documents: RepoDocument[];
  evidenceGaps: RepoKnowledgeEvidenceGap[];
  derivableFacts: RepoKnowledgeDerivableFact[];
  heuristicClaims: RepoKnowledgeHeuristicClaim[];
  blockingUnknowns: RepoKnowledgeUnknown[];
  informationalUnknowns: RepoKnowledgeUnknown[];
  repoKnowledge: {
    status: RepoKnowledgeStatus;
    documentCount: number;
    indexLinkCount: number;
  };
  gate: RepoKnowledgeGate;
}

export interface RepoKnowledgeOptions {
  gate?: boolean;
}

const requiredIndexes = ["docs/README.md", "docs/ko/README.md"] as const;
const counterpartRoots = ["docs", "docs/design", "docs/plans", "docs/references", "docs/release-evidence"] as const;

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
  return value.replace(/\\/g, "/").replace(/^\.\/+/, "");
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

function lineForIndex(content: string, index: number): number {
  let line = 1;
  for (let cursor = 0; cursor < index; cursor += 1) {
    if (content.charCodeAt(cursor) === 10) line += 1;
  }
  return line;
}

function splitTarget(target: string): { pathPart: string; anchor: string | null } {
  const hash = target.indexOf("#");
  if (hash === -1) return { pathPart: target, anchor: null };
  return { pathPart: target.slice(0, hash), anchor: target.slice(hash + 1) || null };
}

function isExternalLink(target: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(target);
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function slugHeading(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/`([^`]+)`/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function markdownAnchors(content: string): Set<string> {
  const anchors = new Set<string>();
  for (const line of content.split(/\r?\n/)) {
    const heading = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (heading) anchors.add(slugHeading(heading[2]));
  }
  return anchors;
}

function htmlAnchors(content: string): Set<string> {
  const anchors = new Set<string>();
  for (const match of content.matchAll(/\bid=["']([^"']+)["']/g)) anchors.add(match[1]);
  return anchors;
}

function anchorExists(path: string, anchor: string | null): boolean | "unknown" {
  if (!anchor) return true;
  if (!existsSync(path)) return false;
  const ext = extname(path).toLowerCase();
  if (ext !== ".md" && ext !== ".html" && ext !== ".htm") return "unknown";
  const content = readFileSync(path, "utf8");
  const anchors = ext === ".md" ? markdownAnchors(content) : htmlAnchors(content);
  return anchors.has(anchor);
}

function extractLinks(source: string, content: string, packageRoot: string): RepoLink[] {
  const links: RepoLink[] = [];
  const sourceDir = dirname(join(packageRoot, source));
  const seen = new Set<string>();
  const addLink = (label: string, target: string, index: number) => {
    if (!target || target.startsWith("mailto:")) return;
    const key = `${index}:${target}`;
    if (seen.has(key)) return;
    seen.add(key);

    if (isExternalLink(target)) {
      links.push({
        source,
        line: lineForIndex(content, index),
        label,
        target,
        kind: "external",
        resolved: true,
        targetPath: null,
        anchor: null,
        error: null,
      });
      return;
    }

    const { pathPart, anchor } = splitTarget(target);
    if (!pathPart) {
      links.push({
        source,
        line: lineForIndex(content, index),
        label,
        target,
        kind: "anchor",
        resolved: anchorExists(join(packageRoot, source), anchor),
        targetPath: source,
        anchor,
        error: anchorExists(join(packageRoot, source), anchor) === true ? null : "anchor_missing",
      });
      return;
    }

    const resolvedPath = resolve(sourceDir, safeDecode(pathPart));
    const relativePath = normalizePath(relative(packageRoot, resolvedPath));
    const fileExists = existsSync(resolvedPath);
    const anchorStatus = fileExists ? anchorExists(resolvedPath, anchor) : false;
    const resolved = fileExists && anchorStatus === true;
    links.push({
      source,
      line: lineForIndex(content, index),
      label,
      target,
      kind: "local",
      resolved: anchorStatus === "unknown" ? "unknown" : resolved,
      targetPath: relativePath,
      anchor,
      error: !fileExists ? "target_missing" : anchorStatus === "unknown" ? "anchor_unchecked" : anchorStatus === false ? "anchor_missing" : null,
    });
  };

  for (const match of content.matchAll(/(?<!!)\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    addLink(match[1], match[2], match.index ?? 0);
  }
  for (const match of content.matchAll(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gims)) {
    addLink(match[2].replace(/<[^>]+>/g, "").trim() || match[1], match[1], match.index ?? 0);
  }
  return links;
}

function counterpartFor(path: string): string | null {
  const normalized = normalizePath(path);
  if (normalized.startsWith("docs/ko/")) return null;
  if (!normalized.startsWith("docs/")) return null;
  if (![".md", ".html", ".htm"].includes(extname(normalized).toLowerCase())) return null;
  if (!counterpartRoots.some((root) => normalized === `${root}/README.md` || normalized.startsWith(`${root}/`))) return null;
  return `docs/ko/${normalized.slice("docs/".length)}`;
}

function repoKnowledgeGateFor(status: RepoKnowledgeStatus, enabled: boolean, hasBlockingUnknowns: boolean): RepoKnowledgeGate {
  if (!enabled) {
    return {
      enabled,
      status: "not_requested",
      exitCode: 0,
      reason: "pass --gate to make repoKnowledge.status affect the process exit code",
    };
  }
  if (hasBlockingUnknowns) {
    return {
      enabled,
      status: "blocked",
      exitCode: 1,
      reason: "blocking unknowns prevent a trustworthy repository knowledge gate decision",
    };
  }
  if (status === "fail") {
    return {
      enabled,
      status: "failed",
      exitCode: 1,
      reason: "gateable repository knowledge evidence gaps are present",
    };
  }
  return {
    enabled,
    status: "passed",
    exitCode: 0,
    reason: "no gateable repository knowledge evidence gaps or blocking unknowns",
  };
}

export function buildRepoKnowledgeReport(cwd: string, options: RepoKnowledgeOptions = {}): RepoKnowledgeReport {
  const packageRoot = findPackageRoot(cwd);
  const evidenceGaps: RepoKnowledgeEvidenceGap[] = [];
  const derivableFacts: RepoKnowledgeDerivableFact[] = [];
  const heuristicClaims: RepoKnowledgeHeuristicClaim[] = [{
    kind: "semantic_freshness_not_evaluated",
    confidence: "high",
    evidence: "Repo check validates mechanical documentation structure only.",
    recommendation: "Use human review or explicit review artifacts for semantic freshness claims.",
  }];
  const blockingUnknowns: RepoKnowledgeUnknown[] = [];
  const informationalUnknowns: RepoKnowledgeUnknown[] = [];

  if (!packageRoot) {
    const status: RepoKnowledgeStatus = "unknown";
    blockingUnknowns.push({
      kind: "index_unreadable",
      gate: true,
      evidence: null,
      recommendation: "Run repo check from a package workspace containing package.json.",
    });
    return {
      schemaVersion: 1,
      stability: "experimental",
      cwd,
      packageRoot: null,
      scanMode: "static",
      scanAccuracy: "best_effort",
      policy: {
        source: "built-in:codexus-repo-knowledge",
        requiredIndexes: [...requiredIndexes],
        englishKoreanCounterparts: true,
        checkedCounterpartRoots: [...counterpartRoots],
      },
      indexes: [],
      documents: [],
      evidenceGaps,
      derivableFacts,
      heuristicClaims,
      blockingUnknowns,
      informationalUnknowns,
      repoKnowledge: { status, documentCount: 0, indexLinkCount: 0 },
      gate: repoKnowledgeGateFor(status, options.gate === true, true),
    };
  }

  const indexes = requiredIndexes.map((indexPath) => {
    const absolutePath = join(packageRoot, indexPath);
    if (!existsSync(absolutePath)) {
      evidenceGaps.push({
        kind: "required_doc_missing",
        gate: true,
        evidence: indexPath,
        policy: "built-in:required-doc-index",
        recommendation: `Restore required documentation index ${indexPath}.`,
        files: [indexPath],
      });
      return { path: indexPath, exists: false, readable: false, links: [] as RepoLink[], error: "missing" };
    }
    try {
      const content = readFileSync(absolutePath, "utf8");
      const links = extractLinks(indexPath, content, packageRoot);
      derivableFacts.push({
        kind: "required_doc_present",
        gate: true,
        evidence: indexPath,
        files: [indexPath],
      });
      return { path: indexPath, exists: true, readable: true, links, error: null };
    } catch (error) {
      blockingUnknowns.push({
        kind: "index_unreadable",
        gate: true,
        evidence: indexPath,
        recommendation: `Fix unreadable documentation index ${indexPath}: ${error instanceof Error ? error.message : String(error)}`,
        files: [indexPath],
      });
      return { path: indexPath, exists: true, readable: false, links: [] as RepoLink[], error: error instanceof Error ? error.message : String(error) };
    }
  });

  const localBrokenLinks: RepoLink[] = [];
  const anchorUnknowns: RepoLink[] = [];
  const externalLinks: RepoLink[] = [];
  for (const index of indexes) {
    for (const link of index.links) {
      if (link.kind === "external") {
        externalLinks.push(link);
      } else if (link.resolved === true) {
        derivableFacts.push({
          kind: "index_link_resolved",
          gate: true,
          evidence: `${link.source}:${link.line} -> ${link.target}`,
          files: link.targetPath ? [link.targetPath] : [],
          links: [link.target],
        });
      } else if (link.resolved === "unknown") {
        anchorUnknowns.push(link);
      } else {
        localBrokenLinks.push(link);
      }
    }
  }
  if (externalLinks.length > 0) {
    derivableFacts.push({
      kind: "external_link_recorded",
      gate: false,
      evidence: `${externalLinks.length} external documentation links recorded but not fetched`,
      links: externalLinks.map((link) => link.target).sort(),
      count: externalLinks.length,
    });
  }
  if (anchorUnknowns.length > 0) {
    informationalUnknowns.push({
      kind: "anchor_unresolved",
      gate: false,
      evidence: `${anchorUnknowns.length} anchors could not be mechanically checked`,
      recommendation: "Review anchors in non-Markdown/HTML files manually if they matter.",
      files: [...new Set(anchorUnknowns.map((link) => link.targetPath).filter((item): item is string => item !== null))].sort(),
      links: anchorUnknowns.map((link) => link.target).sort(),
    });
  }
  if (localBrokenLinks.length > 0) {
    evidenceGaps.push({
      kind: "index_link_broken",
      gate: true,
      evidence: `${localBrokenLinks.length} local index links did not resolve`,
      policy: "built-in:docs-index-links-resolve",
      recommendation: "Fix or remove broken local links from documentation indexes.",
      files: [...new Set(localBrokenLinks.map((link) => link.targetPath).filter((item): item is string => item !== null))].sort(),
      links: localBrokenLinks.map((link) => `${link.source}:${link.line}:${link.target}`).sort(),
    });
  }

  const docs = listFiles(packageRoot, "docs")
    .filter((path) => [".md", ".html", ".htm"].includes(extname(path).toLowerCase()))
    .sort();
  const documents: RepoDocument[] = [];
  const missingCounterparts: string[] = [];
  for (const path of docs) {
    const counterpartPath = counterpartFor(path);
    const counterpartExists = counterpartPath ? existsSync(join(packageRoot, counterpartPath)) : null;
    if (counterpartPath && !counterpartExists) missingCounterparts.push(counterpartPath);
    if (counterpartPath && counterpartExists) {
      derivableFacts.push({
        kind: "counterpart_present",
        gate: true,
        evidence: `${path} -> ${counterpartPath}`,
        files: [path, counterpartPath],
      });
    }
    documents.push({
      path,
      language: path.startsWith("docs/ko/") ? "ko" : "en",
      counterpartPath,
      counterpartExists,
      linkCount: indexes.find((index) => index.path === path)?.links.length ?? 0,
    });
  }
  if (missingCounterparts.length > 0) {
    evidenceGaps.push({
      kind: "counterpart_missing",
      gate: true,
      evidence: `${missingCounterparts.length} English docs are missing Korean counterparts`,
      policy: "built-in:english-korean-counterparts",
      recommendation: "Add the missing Korean counterpart documents or narrow the counterpart policy.",
      files: missingCounterparts.sort(),
    });
  }

  const status: RepoKnowledgeStatus = evidenceGaps.length > 0
    ? "fail"
    : blockingUnknowns.length > 0
      ? "unknown"
      : "pass";

  return {
    schemaVersion: 1,
    stability: "experimental",
    cwd,
    packageRoot,
    scanMode: "static",
    scanAccuracy: "best_effort",
    policy: {
      source: "built-in:codexus-repo-knowledge",
      requiredIndexes: [...requiredIndexes],
      englishKoreanCounterparts: true,
      checkedCounterpartRoots: [...counterpartRoots],
    },
    indexes,
    documents,
    evidenceGaps,
    derivableFacts,
    heuristicClaims,
    blockingUnknowns,
    informationalUnknowns,
    repoKnowledge: {
      status,
      documentCount: documents.length,
      indexLinkCount: indexes.reduce((sum, index) => sum + index.links.length, 0),
    },
    gate: repoKnowledgeGateFor(status, options.gate === true, blockingUnknowns.length > 0),
  };
}
