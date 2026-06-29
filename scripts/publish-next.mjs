#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

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

function tagsMatch(tags, expectedTags) {
  return Object.entries(expectedTags).every(([key, value]) => tags[key] === value);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function publishPlanForArgs(args, pkg) {
  const dryRun = args.includes("--dry-run");
  const stable = args.includes("--stable");
  const syncDistTags = stable && !args.includes("--no-dist-tag-sync");
  if (stable && !dryRun && String(pkg.version).includes("-")) {
    throw new Error("stable publish requires a non-prerelease package version; use publish:next for prereleases");
  }
  const publishArgs = ["publish", "--access", "public"];
  if (!stable) publishArgs.push("--tag", "next");
  if (dryRun) publishArgs.push("--dry-run");
  const expectedTags = stable
    ? { latest: pkg.version }
    : { next: pkg.version };
  return {
    mode: stable ? "stable" : "next",
    dryRun,
    syncDistTags,
    publishArgs,
    expectedTags,
  };
}

async function readDistTagsWithRetry(name, expectedTags, attempts = 6) {
  let latestTags = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const tags = readJson("npm", ["view", name, "dist-tags", "--json", "--prefer-online"]);
    latestTags = tags;
    if (tagsMatch(tags, expectedTags)) return tags;
    if (attempt < attempts - 1) await sleep(2 ** attempt * 1000);
  }
  return latestTags;
}

async function main() {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  const plan = publishPlanForArgs(process.argv.slice(2), pkg);

  run("npm", plan.publishArgs);
  if (plan.dryRun) return;

  if (plan.syncDistTags) {
    run("npm", ["dist-tag", "add", `${pkg.name}@${pkg.version}`, "latest"]);
  }
  const tags = await readDistTagsWithRetry(pkg.name, plan.expectedTags);
  if (!tags || !tagsMatch(tags, plan.expectedTags)) {
    throw new Error(`published ${pkg.version}, but dist-tags are ${JSON.stringify(tags)}`);
  }
  const expected = Object.entries(plan.expectedTags).map(([key, value]) => `${key}=${value}`).join(", ");
  console.log(`Published ${pkg.name}@${pkg.version} (${plan.mode}); verified ${expected}.`);
}

const entrypoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === entrypoint) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
