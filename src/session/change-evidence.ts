import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { deriveEvidenceModel, type EvidenceModel } from "./evidence.ts";
import type { CodexusSessionState } from "./state.ts";
import { computeWorkspaceFingerprint } from "./workspace-fingerprint.ts";
import { detectVerifyCandidates } from "./verify-detect.ts";
import { matchesPattern, normalizeGlobPath } from "../util/glob.ts";

export type ChangeEvidenceStatus = "pass" | "fail" | "unknown";

export interface EvidenceGap {
  kind: "unverified_change" | "stale_verification" | "failed_verification" | "out_of_declared_scope" | "missing_review_artifact";
  gate: true;
  verification: EvidenceModel["verification"] | "unknown";
  evidence: string | null;
  recommendation: string;
  files?: string[];
}

export interface DerivableFact {
  kind:
    | "source_without_test_diff"
    | "test_diff_present"
    | "new_dependency_added"
    | "explicit_review_linked"
    | "declared_scope_respected"
    | "verification_artifact_linked"
    | "diff_surface_area";
  gate: boolean;
  evidence: string;
  files?: string[];
  dependencies?: string[];
  areas?: string[];
  addedLines?: number;
  deletedLines?: number;
  fileCount?: number;
}

export interface HeuristicClaim {
  kind:
    | "behavior_change_likely_needs_test"
    | "suspicious_abstraction"
    | "multi_area_change_without_scope"
    | "simplicity_review_suggested"
    | "unresolved_assumption_marker";
  confidence: "low" | "medium" | "high";
  evidence: string;
  recommendation: string;
  files?: string[];
}

export interface ChangeEvidenceSummary {
  status: ChangeEvidenceStatus;
  verification: EvidenceModel["verification"] | "unknown";
  unverifiedChange: boolean;
  coverage: "unknown";
  diffBase: string;
  includesStaged: boolean;
  includesUntracked: boolean;
  scope: string | null;
}

export interface ChangeEvidenceGate {
  enabled: boolean;
  status: "not_requested" | "passed" | "failed" | "blocked";
  exitCode: 0 | 1;
  reason: string;
}

export interface ChangeEvidenceReport {
  schemaVersion: 1;
  stability: "stable";
  cwd: string;
  diff: {
    diffBase: string;
    since: string | null;
    includesStaged: boolean;
    includesUntracked: boolean;
    files: string[];
    error: string | null;
  };
  evidence: EvidenceModel | null;
  evidenceGaps: EvidenceGap[];
  derivableFacts: DerivableFact[];
  heuristicClaims: HeuristicClaim[];
  changeEvidence: ChangeEvidenceSummary;
  gate: ChangeEvidenceGate;
}

interface GitResult {
  ok: boolean;
  stdout: string;
  stderr: string;
}

function git(cwd: string, args: string[]): GitResult {
  const result = spawnSync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return {
    ok: result.status === 0,
    stdout: typeof result.stdout === "string" ? result.stdout : "",
    stderr: typeof result.stderr === "string" ? result.stderr : "",
  };
}

function gitTopLevel(cwd: string): string | null {
  const result = git(cwd, ["rev-parse", "--show-toplevel"]);
  return result.ok ? result.stdout.trim() : null;
}

function splitLines(value: string): string[] {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function excludedPath(path: string): boolean {
  const normalized = path.replace(/\\/g, "/");
  return normalized.startsWith(".codexus/") || normalized.startsWith(".codex-harness/");
}

function isTestFile(path: string): boolean {
  const normalized = path.replace(/\\/g, "/");
  const base = basename(normalized).toLowerCase();
  return normalized.startsWith("tests/")
    || normalized.includes("/tests/")
    || normalized.includes("__tests__/")
    || /\.(test|spec)\.[cm]?[jt]sx?$/.test(base)
    || base.endsWith("_test.go")
    || base.endsWith("_test.py")
    || base.endsWith("_spec.rb");
}

function isSourceFile(path: string): boolean {
  const normalized = path.replace(/\\/g, "/");
  if (isTestFile(normalized)) return false;
  if (normalized.startsWith("docs/") || normalized.startsWith(".github/")) return false;
  const ext = extname(normalized).toLowerCase();
  return [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".rs", ".go", ".rb", ".java", ".kt", ".swift", ".c", ".cc", ".cpp", ".h", ".hpp", ".cs", ".php"].includes(ext);
}

function splitScopes(scope: string | undefined): string[] {
  return (scope ?? "")
    .split(",")
    .map((part) => normalizeGlobPath(part.trim()))
    .filter(Boolean);
}

function inScope(path: string, scopes: string[]): boolean {
  if (scopes.length === 0) return true;
  return scopes.some((scope) => matchesPattern(path, scope));
}

function readDiffFiles(cwd: string, since?: string): ChangeEvidenceReport["diff"] {
  const root = gitTopLevel(cwd);
  if (!root) {
    return {
      diffBase: since ? `since:${since}` : "working-tree",
      since: since ?? null,
      includesStaged: false,
      includesUntracked: false,
      files: [],
      error: "not_a_git_repository",
    };
  }
  if (since) {
    const diff = git(root, ["diff", "--name-only", since, "HEAD"]);
    return {
      diffBase: `since:${since}`,
      since,
      includesStaged: false,
      includesUntracked: false,
      files: diff.ok ? splitLines(diff.stdout).filter((file) => !excludedPath(file)).sort() : [],
      error: diff.ok ? null : diff.stderr.trim() || "git_diff_failed",
    };
  }

  const staged = git(root, ["diff", "--name-only", "--cached"]);
  const unstaged = git(root, ["diff", "--name-only"]);
  const untracked = git(root, ["ls-files", "--others", "--exclude-standard"]);
  const files = new Set<string>();
  for (const result of [staged, unstaged, untracked]) {
    if (!result.ok) continue;
    for (const file of splitLines(result.stdout)) {
      if (!excludedPath(file)) files.add(file);
    }
  }
  const error = [staged, unstaged, untracked].find((result) => !result.ok);
  return {
    diffBase: "working-tree",
    since: null,
    includesStaged: staged.ok && splitLines(staged.stdout).length > 0,
    includesUntracked: untracked.ok && splitLines(untracked.stdout).some((file) => !excludedPath(file)),
    files: [...files].sort(),
    error: error ? error.stderr.trim() || "git_diff_failed" : null,
  };
}

function readPackageAt(root: string, ref: string | null): Record<string, unknown> | null {
  try {
    const text = ref === null
      ? readFileSync(join(root, "package.json"), "utf8")
      : git(root, ["show", `${ref}:package.json`]).stdout;
    if (!text) return null;
    const parsed = JSON.parse(text) as unknown;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function dependencyNames(pkg: Record<string, unknown> | null): Set<string> {
  const names = new Set<string>();
  for (const field of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
    const value = pkg?.[field];
    if (typeof value !== "object" || value === null || Array.isArray(value)) continue;
    for (const name of Object.keys(value)) names.add(name);
  }
  return names;
}

function newDependencies(cwd: string, since: string | null): string[] {
  const root = gitTopLevel(cwd);
  if (!root || !existsSync(join(root, "package.json"))) return [];
  const baseRef = since ?? "HEAD";
  const before = dependencyNames(readPackageAt(root, baseRef));
  const after = dependencyNames(readPackageAt(root, since ? "HEAD" : null));
  return [...after].filter((name) => !before.has(name)).sort();
}

function patchText(cwd: string, since: string | null): string {
  const root = gitTopLevel(cwd);
  if (!root) return "";
  if (since) return git(root, ["diff", since, "HEAD"]).stdout;
  return `${git(root, ["diff", "--cached"]).stdout}\n${git(root, ["diff"]).stdout}\n${untrackedPatchText(root)}`;
}

function untrackedPatchText(root: string): string {
  const untracked = git(root, ["ls-files", "--others", "--exclude-standard"]);
  if (!untracked.ok) return "";
  const chunks: string[] = [];
  for (const file of splitLines(untracked.stdout).filter((item) => !excludedPath(item)).slice(0, 100)) {
    try {
      const text = readFileSync(join(root, file), "utf8");
      if (text.includes("\0")) continue;
      chunks.push(`+++ ${file}`);
      for (const line of text.split(/\r?\n/).slice(0, 1000)) {
        chunks.push(`+${line}`);
      }
    } catch {
      // Advisory analysis should stay quiet when an untracked file cannot be read.
    }
  }
  return chunks.join("\n");
}

interface PatchStats {
  addedLines: number;
  deletedLines: number;
  addedMeaningfulLines: string[];
}

function patchStats(patch: string): PatchStats {
  const addedMeaningfulLines: string[] = [];
  let addedLines = 0;
  let deletedLines = 0;
  for (const line of patch.split(/\r?\n/)) {
    if (line.startsWith("+++") || line.startsWith("---")) continue;
    if (line.startsWith("+")) {
      addedLines += 1;
      const content = line.slice(1).trim();
      if (content && !content.startsWith("//") && !content.startsWith("*")) {
        addedMeaningfulLines.push(content);
      }
    } else if (line.startsWith("-")) {
      deletedLines += 1;
    }
  }
  return { addedLines, deletedLines, addedMeaningfulLines };
}

function diffAreas(files: string[]): string[] {
  return [...new Set(files.map((file) => {
    const normalized = file.replace(/\\/g, "/");
    const [first, second] = normalized.split("/");
    if (!second) return first;
    return first === "src" || first === "tests" || first === "docs" ? `${first}/${second}` : first;
  }))].sort();
}

function evidenceGapsFor(evidence: EvidenceModel | null): EvidenceGap[] {
  if (!evidence) return [];
  if (evidence.verification === "passed") return [];
  const path = evidence.lastVerification?.path ?? null;
  if (evidence.verification === "missing") {
    return [{
      kind: "unverified_change",
      gate: true,
      verification: "missing",
      evidence: path,
      recommendation: evidence.recommendedVerify
        ? `run session verify with ${evidence.recommendedVerify}`
        : "run session verify to cover this change",
    }];
  }
  if (evidence.verification === "stale") {
    return [{
      kind: "stale_verification",
      gate: true,
      verification: "stale",
      evidence: path,
      recommendation: "rerun session verify for the current workspace fingerprint",
    }];
  }
  return [{
    kind: "failed_verification",
    gate: true,
    verification: "failed",
    evidence: path,
    recommendation: "fix the failing verification or rerun after repair",
  }];
}

function scopeEvidenceGaps(diff: ChangeEvidenceReport["diff"], scope: string | undefined): EvidenceGap[] {
  const scopes = splitScopes(scope);
  if (scopes.length === 0) return [];
  const outside = diff.files.filter((file) => !inScope(file, scopes));
  if (outside.length === 0) return [];
  return [{
    kind: "out_of_declared_scope",
    gate: true,
    verification: "unknown",
    evidence: scope,
    recommendation: "review or narrow the declared scope before claiming this change is complete",
    files: outside.slice(0, 50),
  }];
}

function gateFor(status: ChangeEvidenceStatus, enabled: boolean): ChangeEvidenceGate {
  if (!enabled) {
    return {
      enabled: false,
      status: "not_requested",
      exitCode: 0,
      reason: "pass --gate to make changeEvidence.status affect the process exit code",
    };
  }
  if (status === "pass") {
    return {
      enabled: true,
      status: "passed",
      exitCode: 0,
      reason: "fresh passing verification covers the current workspace fingerprint",
    };
  }
  if (status === "fail") {
    return {
      enabled: true,
      status: "failed",
      exitCode: 1,
      reason: "derivable evidence gaps are present",
    };
  }
  return {
    enabled: true,
    status: "blocked",
    exitCode: 1,
    reason: "insufficient evidence to prove the current change is covered",
  };
}

export function buildChangeEvidenceReport(
  cwd: string,
  state: CodexusSessionState | null,
  options: { since?: string; scope?: string; reviews?: string[]; gate?: boolean; includeHeuristics?: boolean } = {},
): ChangeEvidenceReport {
  const resolvedCwd = resolve(cwd);
  const diff = readDiffFiles(resolvedCwd, options.since);
  const detection = detectVerifyCandidates(resolvedCwd);
  const evidence = state
    ? deriveEvidenceModel(state, computeWorkspaceFingerprint(resolvedCwd), detection.recommended)
    : null;
  const evidenceGaps = [
    ...evidenceGapsFor(evidence),
    ...scopeEvidenceGaps(diff, options.scope),
  ];
  const sourceFiles = diff.files.filter(isSourceFile);
  const testFiles = diff.files.filter(isTestFile);
  const derivableFacts: DerivableFact[] = [];
  const patch = patchText(resolvedCwd, options.since ?? null);
  const stats = patchStats(patch);
  const areas = diffAreas(diff.files);
  if (diff.files.length > 0) {
    derivableFacts.push({
      kind: "diff_surface_area",
      gate: false,
      evidence: diff.diffBase,
      files: diff.files.slice(0, 50),
      areas: areas.slice(0, 20),
      addedLines: stats.addedLines,
      deletedLines: stats.deletedLines,
      fileCount: diff.files.length,
    });
  }
  if (options.scope && diff.files.length > 0 && scopeEvidenceGaps(diff, options.scope).length === 0) {
    derivableFacts.push({
      kind: "declared_scope_respected",
      gate: false,
      evidence: options.scope,
      files: diff.files.slice(0, 50),
    });
  }
  if (sourceFiles.length > 0 && testFiles.length === 0) {
    derivableFacts.push({
      kind: "source_without_test_diff",
      gate: false,
      evidence: "working-tree diff",
      files: sourceFiles.slice(0, 50),
    });
  }
  if (testFiles.length > 0) {
    derivableFacts.push({
      kind: "test_diff_present",
      gate: false,
      evidence: "working-tree diff",
      files: testFiles.slice(0, 50),
    });
  }
  if (evidence?.lastVerification?.path) {
    derivableFacts.push({
      kind: "verification_artifact_linked",
      gate: false,
      evidence: evidence.lastVerification.path,
      files: [evidence.lastVerification.path],
    });
  }
  const deps = newDependencies(resolvedCwd, options.since ?? null);
  if (deps.length > 0) {
    derivableFacts.push({
      kind: "new_dependency_added",
      gate: false,
      evidence: "package.json dependency diff",
      dependencies: deps,
    });
  }
  for (const review of options.reviews ?? []) {
    const reviewPath = resolve(resolvedCwd, review);
    if (existsSync(reviewPath)) {
      derivableFacts.push({
        kind: "explicit_review_linked",
        gate: false,
        evidence: reviewPath,
        files: [reviewPath],
      });
    } else {
      evidenceGaps.push({
        kind: "missing_review_artifact",
        gate: true,
        verification: "unknown",
        evidence: reviewPath,
        recommendation: "create the declared review artifact or rerun without the review link",
        files: [reviewPath],
      });
    }
  }

  const heuristicClaims: HeuristicClaim[] = [];
  if (options.includeHeuristics !== false) {
    const sourceWithoutTests = derivableFacts.find((fact) => fact.kind === "source_without_test_diff");
    if (sourceWithoutTests?.files && sourceWithoutTests.files.length > 0) {
      heuristicClaims.push({
        kind: "behavior_change_likely_needs_test",
        confidence: "low",
        evidence: "source files changed without a test-file change in the same diff",
        recommendation: "add or run a verification that covers the change",
        files: sourceWithoutTests.files,
      });
    }
    if (!options.scope && areas.length >= 3) {
      heuristicClaims.push({
        kind: "multi_area_change_without_scope",
        confidence: "low",
        evidence: `changed areas without a declared scope: ${areas.slice(0, 10).join(", ")}`,
        recommendation: "declare a scope when evaluating whether the change stayed surgical",
        files: diff.files.slice(0, 50),
      });
    }
    if (sourceFiles.length >= 5 || stats.addedMeaningfulLines.length >= 200) {
      heuristicClaims.push({
        kind: "simplicity_review_suggested",
        confidence: "low",
        evidence: `${sourceFiles.length} source files and ${stats.addedMeaningfulLines.length} added non-comment lines changed`,
        recommendation: "review whether the change can be split, deleted, or simplified before completion",
        files: sourceFiles.slice(0, 50),
      });
    }
    const assumptionLines = stats.addedMeaningfulLines
      .filter((line) => /\b(?:TODO|FIXME|HACK|assume|assuming|temporary|workaround|placeholder)\b/i.test(line))
      .slice(0, 5);
    if (assumptionLines.length > 0) {
      heuristicClaims.push({
        kind: "unresolved_assumption_marker",
        confidence: "low",
        evidence: "added assumption markers: " + assumptionLines.join(" | "),
        recommendation: "resolve the assumption or link a review artifact before relying on this change",
      });
    }
    const abstractionLines = patch
      .split(/\r?\n/)
      .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
      .filter((line) => /\b(?:Manager|Coordinator|Factory|Orchestrator)\b/.test(line))
      .slice(0, 5);
    if (abstractionLines.length > 0) {
      heuristicClaims.push({
        kind: "suspicious_abstraction",
        confidence: "low",
        evidence: "added abstraction-like names: " + abstractionLines.map((line) => line.slice(1).trim()).join(" | "),
        recommendation: "keep only if the abstraction removes real duplication or complexity",
      });
    }
  }

  const status: ChangeEvidenceStatus = evidenceGaps.length > 0
    ? "fail"
    : !state
      ? "unknown"
      : "pass";
  const gate = gateFor(status, options.gate === true);
  return {
    schemaVersion: 1,
    stability: "stable",
    cwd: resolvedCwd,
    diff,
    evidence,
    evidenceGaps,
    derivableFacts,
    heuristicClaims,
    changeEvidence: {
      status,
      verification: evidence?.verification ?? "unknown",
      unverifiedChange: evidenceGaps.length > 0,
      coverage: "unknown",
      diffBase: diff.diffBase,
      includesStaged: diff.includesStaged,
      includesUntracked: diff.includesUntracked,
      scope: options.scope ?? null,
    },
    gate,
  };
}
