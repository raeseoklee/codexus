import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { matchesPattern, normalizeGlobPath } from "./glob.ts";

export type StaticImportKind = "import" | "export" | "dynamic_literal";

export interface StaticImportEdge {
  file: string;
  line: number;
  specifier: string;
  kind: StaticImportKind;
}

export interface ComputedDynamicImport {
  file: string;
  line: number;
}

export interface StaticImportScanResult {
  filesScanned: number;
  edges: StaticImportEdge[];
  computedDynamicImports: ComputedDynamicImport[];
}

export const staticSourceExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);

export function isStaticSourceFile(path: string): boolean {
  return staticSourceExtensions.has(extname(path).toLowerCase());
}

export function listRepositoryFiles(root: string, relative = ""): string[] {
  const path = join(root, relative);
  if (!existsSync(path)) return [];
  const stat = statSync(path);
  if (stat.isFile()) return [normalizeGlobPath(relative)];
  if (!stat.isDirectory()) return [];
  const files: string[] = [];
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git" || entry.name === ".codexus" || entry.name === ".codex-harness") continue;
    const child = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...listRepositoryFiles(root, child));
    else if (entry.isFile()) files.push(normalizeGlobPath(child));
  }
  return files;
}

export function lineForIndex(content: string, index: number): number {
  let line = 1;
  for (let cursor = 0; cursor < index; cursor += 1) {
    if (content.charCodeAt(cursor) === 10) line += 1;
  }
  return line;
}

export function extractStaticImportEdges(file: string, content: string): {
  edges: StaticImportEdge[];
  computedDynamicImports: ComputedDynamicImport[];
} {
  const edges: StaticImportEdge[] = [];
  const computedDynamicImports: ComputedDynamicImport[] = [];
  const staticImport = /(?:^|\n)\s*import\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?["']([^"']+)["']/gms;
  const staticExport = /(?:^|\n)\s*export\s+(?:type\s+)?[^'"]*?\s+from\s+["']([^"']+)["']/gms;
  const dynamicLiteral = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/gm;
  const dynamicComputed = /\bimport\s*\(\s*(?!\s*["'])/gm;

  for (const match of content.matchAll(staticImport)) {
    edges.push({ file, line: lineForIndex(content, match.index ?? 0), specifier: match[1], kind: "import" });
  }
  for (const match of content.matchAll(staticExport)) {
    edges.push({ file, line: lineForIndex(content, match.index ?? 0), specifier: match[1], kind: "export" });
  }
  for (const match of content.matchAll(dynamicLiteral)) {
    edges.push({ file, line: lineForIndex(content, match.index ?? 0), specifier: match[1], kind: "dynamic_literal" });
  }
  for (const match of content.matchAll(dynamicComputed)) {
    computedDynamicImports.push({ file, line: lineForIndex(content, match.index ?? 0) });
  }

  return { edges, computedDynamicImports };
}

export function scanStaticImports(packageRoot: string, scopePatterns: string[] | null): StaticImportScanResult {
  const files = listRepositoryFiles(packageRoot)
    .filter(isStaticSourceFile)
    .filter((file) => scopePatterns === null || scopePatterns.some((pattern) => matchesPattern(file, pattern)))
    .sort();
  const edges: StaticImportEdge[] = [];
  const computedDynamicImports: ComputedDynamicImport[] = [];
  for (const file of files) {
    const content = readFileSync(join(packageRoot, file), "utf8");
    const scan = extractStaticImportEdges(file, content);
    edges.push(...scan.edges);
    computedDynamicImports.push(...scan.computedDynamicImports);
  }
  return { filesScanned: files.length, edges, computedDynamicImports };
}
