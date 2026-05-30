#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

export function compareVersions(left, right) {
  const parse = (value) => {
    const [core, pre = ""] = value.split("-", 2);
    const [major, minor, patch] = core.split(".").map((part) => Number(part));
    const prerelease = pre ? pre.split(".").map((part) => (/^\d+$/.test(part) ? Number(part) : part)) : [];
    return { major, minor, patch, prerelease };
  };
  const a = parse(left);
  const b = parse(right);
  for (const key of ["major", "minor", "patch"]) {
    if (a[key] !== b[key]) return a[key] - b[key];
  }
  if (a.prerelease.length === 0 && b.prerelease.length === 0) return 0;
  if (a.prerelease.length === 0) return 1;
  if (b.prerelease.length === 0) return -1;
  const length = Math.max(a.prerelease.length, b.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const leftPart = a.prerelease[index];
    const rightPart = b.prerelease[index];
    if (leftPart === undefined) return -1;
    if (rightPart === undefined) return 1;
    if (leftPart === rightPart) continue;
    if (typeof leftPart === "number" && typeof rightPart === "number") return leftPart - rightPart;
    if (typeof leftPart === "number") return -1;
    if (typeof rightPart === "number") return 1;
    return leftPart.localeCompare(rightPart);
  }
  return 0;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", ...options });
  if (result.status !== 0) {
    const detail = result.error ? `: ${result.error.message}` : "";
    throw new Error(`${command} ${args.join(" ")} failed${detail}`);
  }
}

function readJson(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed: ${result.stderr}`);
  }
  return JSON.parse(result.stdout);
}

export function assertLatestAtLeastNext(tags) {
  if (!tags.latest || !tags.next) throw new Error("missing latest or next dist-tag");
  if (compareVersions(tags.latest, tags.next) < 0) {
    throw new Error(`npm dist-tag invariant failed: latest ${tags.latest} is older than next ${tags.next}`);
  }
}

async function main() {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  const dryRun = process.argv.includes("--dry-run");
  const publishArgs = ["publish", "--tag", "next", "--access", "public"];
  if (dryRun) publishArgs.push("--dry-run");

  run("npm", publishArgs);
  if (dryRun) return;

  run("npm", ["dist-tag", "add", `${pkg.name}@${pkg.version}`, "latest"]);
  const tags = readJson("npm", ["view", pkg.name, "dist-tags", "--json", "--prefer-online"]);
  if (tags.next !== pkg.version || tags.latest !== pkg.version) {
    throw new Error(`published ${pkg.version}, but dist-tags are ${JSON.stringify(tags)}`);
  }
  assertLatestAtLeastNext(tags);
  console.log(`Published ${pkg.name}@${pkg.version}; latest and next both point to ${pkg.version}.`);
}

const entrypoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === entrypoint) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
