import { readFileSync } from "node:fs";
import { join } from "node:path";
import { findCodexusPackageRoot } from "../../util/package-root.ts";
import { flagBool, type ParsedArgs } from "../args.ts";
import { buildUpdateSummary, type UpdateSummary } from "../../update/check.ts";

export interface CodexusVersionInfo {
  schemaVersion: 1;
  stability: "stable";
  name: string;
  version: string;
  node: string;
  packageRoot: string;
  update?: UpdateSummary;
}

function isPackageMetadata(value: unknown): value is { name: string; version: string } {
  return typeof value === "object"
    && value !== null
    && !Array.isArray(value)
    && typeof (value as { name?: unknown }).name === "string"
    && typeof (value as { version?: unknown }).version === "string";
}

export function readCodexusVersionInfo(): CodexusVersionInfo {
  const packageRoot = findCodexusPackageRoot();
  const parsed = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")) as unknown;
  if (!isPackageMetadata(parsed)) throw new Error("codexus_package_metadata_invalid");
  return {
    schemaVersion: 1,
    stability: "stable",
    name: parsed.name,
    version: parsed.version,
    node: process.version,
    packageRoot,
  };
}

export async function versionCommand(args: ParsedArgs, options: { short?: boolean } = {}): Promise<void> {
  const info = readCodexusVersionInfo();
  if (options.short) {
    console.log(info.version);
    return;
  }
  const update = buildUpdateSummary({ currentVersion: info.version, cacheOnly: true });
  if (flagBool(args.flags, "json")) {
    console.log(JSON.stringify({
      ...info,
      update,
    }, null, 2));
    return;
  }
  console.log(`${info.name} ${info.version}`);
  console.log(`Node ${info.node}`);
  console.log(`Package ${info.packageRoot}`);
  if (update.notification.shouldNotify && update.notification.message) {
    console.log(`Update: ${update.notification.message}`);
  }
}
