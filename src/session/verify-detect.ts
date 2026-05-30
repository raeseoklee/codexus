import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

export const VERIFY_DETECT_SCHEMA_VERSION = 1 as const;

export interface VerifyDetection {
  schemaVersion: typeof VERIFY_DETECT_SCHEMA_VERSION;
  recommended: string | null;
  candidates: string[];
  reason: string;
  signals: string[];
}

// package.json scripts that are meaningful verification entry points, in
// recommendation priority order. `test` is the strongest signal.
const PACKAGE_SCRIPT_PRIORITY = ["test", "typecheck", "lint", "ci"] as const;

function readPackageScripts(cwd: string): { scripts: string[]; present: boolean } {
  const path = join(cwd, "package.json");
  if (!existsSync(path)) return { scripts: [], present: false };
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    if (typeof parsed !== "object" || parsed === null) return { scripts: [], present: true };
    const scripts = (parsed as { scripts?: unknown }).scripts;
    if (typeof scripts !== "object" || scripts === null) return { scripts: [], present: true };
    return { scripts: Object.keys(scripts as Record<string, unknown>), present: true };
  } catch {
    // A malformed package.json is still a Node signal, but we cannot read its
    // scripts; surface it as present-but-unparsed so the reason is honest.
    return { scripts: [], present: true };
  }
}

function packageScriptCommand(script: string): string {
  return script === "test" ? "npm test" : `npm run ${script}`;
}

// Pure detection from project signals. Never executes anything. One strong
// candidate becomes `recommended`; multiple candidates are all listed in
// `candidates` with `recommended` left null so the caller must choose.
export function detectVerifyCandidates(cwd: string): VerifyDetection {
  const resolvedCwd = resolve(cwd);
  const candidates: string[] = [];
  const signals: string[] = [];

  const pkg = readPackageScripts(resolvedCwd);
  if (pkg.present) {
    signals.push("package.json");
    for (const script of PACKAGE_SCRIPT_PRIORITY) {
      if (pkg.scripts.includes(script)) candidates.push(packageScriptCommand(script));
    }
  }
  if (existsSync(join(resolvedCwd, "Cargo.toml"))) {
    signals.push("Cargo.toml");
    candidates.push("cargo test");
  }
  if (existsSync(join(resolvedCwd, "go.mod"))) {
    signals.push("go.mod");
    candidates.push("go test ./...");
  }
  if (existsSync(join(resolvedCwd, "pyproject.toml"))) {
    signals.push("pyproject.toml");
    candidates.push("pytest");
  } else if (existsSync(join(resolvedCwd, "pytest.ini"))) {
    signals.push("pytest.ini");
    candidates.push("pytest");
  }

  // De-duplicate while preserving priority order (pyproject.toml/pytest.ini both
  // map to pytest).
  const uniqueCandidates = [...new Set(candidates)];

  if (uniqueCandidates.length === 0) {
    return {
      schemaVersion: VERIFY_DETECT_SCHEMA_VERSION,
      recommended: null,
      candidates: [],
      reason: signals.length > 0
        ? `Project signals (${signals.join(", ")}) found, but no recognized verification command could be inferred.`
        : "No recognized project signals (package.json, Cargo.toml, go.mod, pyproject.toml, pytest.ini) were found.",
      signals,
    };
  }

  if (uniqueCandidates.length === 1) {
    return {
      schemaVersion: VERIFY_DETECT_SCHEMA_VERSION,
      recommended: uniqueCandidates[0],
      candidates: uniqueCandidates,
      reason: `One strong verification candidate inferred from ${signals.join(", ")}.`,
      signals,
    };
  }

  return {
    schemaVersion: VERIFY_DETECT_SCHEMA_VERSION,
    recommended: null,
    candidates: uniqueCandidates,
    reason: `Multiple verification candidates inferred from ${signals.join(", ")}; choose one explicitly with --verify "<cmd>".`,
    signals,
  };
}
