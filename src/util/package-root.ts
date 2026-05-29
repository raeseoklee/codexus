import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

function isCodexusPackageRoot(path: string): boolean {
  const packagePath = resolve(path, "package.json");
  if (!existsSync(packagePath)) return false;
  try {
    const parsed = JSON.parse(readFileSync(packagePath, "utf8")) as unknown;
    return typeof parsed === "object"
      && parsed !== null
      && !Array.isArray(parsed)
      && (parsed as { name?: unknown }).name === "codexus";
  } catch {
    return false;
  }
}

export function findCodexusPackageRoot(start = dirname(fileURLToPath(import.meta.url))): string {
  let current = resolve(start);
  while (true) {
    if (isCodexusPackageRoot(current)) return current;
    const next = dirname(current);
    if (next === current) {
      throw new Error(`codexus_package_root_not_found from ${start}`);
    }
    current = next;
  }
}
