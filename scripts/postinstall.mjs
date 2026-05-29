#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const setting = String(process.env.CODEXUS_INSTALL_CODEX_SKILL ?? "").trim().toLowerCase();
if (["0", "false", "no", "off"].includes(setting)) {
  process.exit(0);
}

const force = ["1", "true", "yes", "on"].includes(setting);
const globalInstall = process.env.npm_config_global === "true"
  || process.env.npm_config_global === "1"
  || process.env.npm_config_location === "global";

if (!force && !globalInstall) {
  process.exit(0);
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const installer = join(scriptDir, "install-codex-skill.mjs");
const result = spawnSync(process.execPath, [installer, "--json"], {
  env: process.env,
  encoding: "utf8",
});

if (result.status === 0) {
  console.error("codexus postinstall: installed Codex skill adapter");
  process.exit(0);
}

const detail = result.stderr?.trim() || result.stdout?.trim() || result.error?.message || "unknown error";
console.error(`codexus postinstall: skipped Codex skill adapter install: ${detail}`);
console.error(`codexus postinstall: run manually with node ${installer} --json`);

if (process.env.CODEXUS_INSTALL_CODEX_SKILL_STRICT === "1") {
  process.exit(result.status ?? 1);
}
