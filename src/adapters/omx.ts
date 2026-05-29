import { spawnSync } from "node:child_process";
import { trimmedProcessOutput } from "../util/process-output.ts";

export interface OmxFeatureStatus {
  explore: boolean;
  sparkshell: boolean;
  team: boolean;
  agents: boolean;
}

export interface OmxStatus {
  available: boolean;
  version: string | null;
  rawVersion: string;
  features: OmxFeatureStatus;
  warnings: Array<{ code: string; message: string }>;
}

function runOmx(args: string[]): { ok: boolean; stdout: string; stderr: string } {
  const result = spawnSync("omx", args, { encoding: "utf8" });
  return {
    ok: result.status === 0,
    stdout: trimmedProcessOutput(result.stdout),
    stderr: trimmedProcessOutput(result.stderr),
  };
}

function parseVersion(raw: string): string | null {
  const match = raw.match(/oh-my-codex v([0-9]+\.[0-9]+\.[0-9]+)/);
  return match?.[1] ?? null;
}

function semverParts(version: string | null): [number, number, number] | null {
  if (!version) return null;
  const parts = version.split(".").map((part) => Number(part));
  if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part))) return null;
  return parts as [number, number, number];
}

function lessThan(left: string | null, right: string): boolean {
  const l = semverParts(left);
  const r = semverParts(right);
  if (!l || !r) return false;
  for (let index = 0; index < 3; index += 1) {
    if (l[index] < r[index]) return true;
    if (l[index] > r[index]) return false;
  }
  return false;
}

export function detectFeature(help: string, command: string): boolean {
  return new RegExp(`(^|\\n)\\s*omx ${command}(\\s|$)`).test(help)
    || new RegExp(`(^|\\n)\\s*${command}(\\s|$)`).test(help);
}

export function buildOmxStatus(rawVersion: string, help: string): OmxStatus {
  const version = parseVersion(rawVersion);
  const warnings: OmxStatus["warnings"] = [];
  if (lessThan(version, "0.18.6")) {
    warnings.push({
      code: "omx_older_than_research_baseline",
      message: "Local OMX is older than the researched upstream baseline 0.18.6; use capability probes instead of assuming newer features.",
    });
  }
  return {
    available: true,
    version,
    rawVersion,
    features: {
      explore: detectFeature(help, "explore"),
      sparkshell: detectFeature(help, "sparkshell"),
      team: detectFeature(help, "team"),
      agents: detectFeature(help, "agents"),
    },
    warnings,
  };
}

export function readOmxStatus(): OmxStatus {
  const version = runOmx(["--version"]);
  if (!version.ok) {
    return {
      available: false,
      version: null,
      rawVersion: version.stderr || version.stdout,
      features: { explore: false, sparkshell: false, team: false, agents: false },
      warnings: [{ code: "omx_unavailable", message: version.stderr || "omx command unavailable" }],
    };
  }
  const help = runOmx(["--help"]);
  return buildOmxStatus(version.stdout, help.stdout);
}
