#!/usr/bin/env node
import { chmod, rm } from "node:fs/promises";
import { build } from "esbuild";

const sourcemap = process.argv.includes("--sourcemap");

await rm("dist", { recursive: true, force: true });

await build({
  entryPoints: ["src/cli/main.ts"],
  outfile: "dist/cli/main.js",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  legalComments: "none",
  sourcemap: sourcemap ? "external" : false,
  sourcesContent: false,
});

await chmod("dist/cli/main.js", 0o755);
