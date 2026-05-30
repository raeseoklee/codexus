#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));

function resolveMain(root) {
  for (const candidate of [
    join(root, "src", "cli", "main.ts"),
    join(root, "dist", "cli", "main.js"),
  ]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function isCodexusRoot(dir) {
  const packagePath = join(dir, "package.json");
  if (!existsSync(packagePath) || !resolveMain(dir)) return false;
  try {
    const pkg = JSON.parse(readFileSync(packagePath, "utf8"));
    return pkg.name === "codexus";
  } catch {
    return false;
  }
}

function ascend(start) {
  let current = resolve(start);
  while (true) {
    if (isCodexusRoot(current)) return current;
    const next = dirname(current);
    if (next === current) return null;
    current = next;
  }
}

function parseArgs(argv) {
  let event = "turn-ended";
  let previousNotify = null;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--event" && argv[index + 1]) {
      event = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--previous-notify" && argv[index + 1]) {
      try {
        const parsed = JSON.parse(argv[index + 1]);
        if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) {
          previousNotify = parsed;
        }
      } catch {
        previousNotify = null;
      }
      index += 1;
    }
  }
  return { event, previousNotify };
}

function runPrevious(previousNotify) {
  if (!previousNotify || previousNotify.length === 0) return 0;
  const result = spawnSync(previousNotify[0], previousNotify.slice(1), {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });
  return result.status ?? 1;
}

const root = ascend(scriptDir);
const { event, previousNotify } = parseArgs(process.argv.slice(2));

if (root) {
  const main = resolveMain(root);
  const result = spawnSync(process.execPath, [main, "session", "notify", "--event", event, "--json"], {
    cwd: process.cwd(),
    env: { ...process.env, CODEXUS_NOTIFY_HOOK: "1" },
    encoding: "utf8",
  });
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || "unknown notify recording failure").trim();
    console.error(`codexus notify hook: session state update failed: ${detail}`);
  }
} else {
  console.error("codexus notify hook: codexus package root not found");
}

process.exit(runPrevious(previousNotify));
