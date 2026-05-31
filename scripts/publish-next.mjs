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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function assertLatestAtLeastNext(tags) {
  if (!tags.latest || !tags.next) throw new Error("missing latest or next dist-tag");
  if (compareVersions(tags.latest, tags.next) < 0) {
    throw new Error(`npm dist-tag invariant failed: latest ${tags.latest} is older than next ${tags.next}`);
  }
}

export function publishPlanForArgs(args, pkg) {
  const dryRun = args.includes("--dry-run");
  const stable = args.includes("--stable");
  if (stable && !dryRun && String(pkg.version).includes("-")) {
    throw new Error("stable publish requires a non-prerelease package version; use publish:next for prereleases");
  }
  const publishArgs = ["publish", "--access", "public"];
  if (!stable) publishArgs.push("--tag", "next");
  if (dryRun) publishArgs.push("--dry-run");
  return {
    mode: stable ? "stable" : "next",
    dryRun,
    publishArgs,
    expectedTags: {
      latest: pkg.version,
      next: pkg.version,
    },
  };
}

async function readDistTagsWithRetry(name, expectedTags, attempts = 6) {
  let latestTags = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const tags = readJson("npm", ["view", name, "dist-tags", "--json", "--prefer-online"]);
    latestTags = tags;
    if (tags.latest === expectedTags.latest && tags.next === expectedTags.next) return tags;
    if (attempt < attempts - 1) await sleep(2 ** attempt * 1000);
  }
  return latestTags;
}

async function main() {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  const plan = publishPlanForArgs(process.argv.slice(2), pkg);

  run("npm", plan.publishArgs);
  if (plan.dryRun) return;

  run("npm", ["dist-tag", "add", `${pkg.name}@${pkg.version}`, "latest"]);
  run("npm", ["dist-tag", "add", `${pkg.name}@${pkg.version}`, "next"]);
  const tags = await readDistTagsWithRetry(pkg.name, plan.expectedTags);
  if (!tags || tags.next !== pkg.version || tags.latest !== pkg.version) {
    throw new Error(`published ${pkg.version}, but dist-tags are ${JSON.stringify(tags)}`);
  }
  assertLatestAtLeastNext(tags);
  console.log(`Published ${pkg.name}@${pkg.version} (${plan.mode}); latest and next both point to ${pkg.version}.`);
}

const entrypoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === entrypoint) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
