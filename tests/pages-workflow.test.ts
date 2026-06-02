import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

test("pages workflow uses repository-owned Node 24-compatible pinned actions", async () => {
  const workflow = await readFile(resolve(".github/workflows/pages.yml"), "utf8");

  assert.match(workflow, /^name:\s*Pages$/m);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /branches:\n\s+- main/);
  assert.match(workflow, /contents:\s*read/);
  assert.match(workflow, /pages:\s*write/);
  assert.match(workflow, /id-token:\s*write/);
  assert.match(workflow, /FORCE_JAVASCRIPT_ACTIONS_TO_NODE24:\s*"true"/);

  assert.match(workflow, /actions\/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd/);
  assert.match(workflow, /actions\/upload-pages-artifact@fc324d3547104276b827a68afc52ff2a11cc49c9/);
  assert.match(workflow, /actions\/deploy-pages@cd2ce8fcbc39b97be8ca5fce6e763baed58fa128/);
  assert.doesNotMatch(workflow, /actions\/(?:checkout|upload-pages-artifact|deploy-pages)@v\d/);
});

test("pages workflow stages only static site content before upload", async () => {
  const workflow = await readFile(resolve(".github/workflows/pages.yml"), "utf8");

  assert.match(workflow, /Prepare Pages content/);
  assert.match(workflow, /rsync -a --delete/);
  assert.match(workflow, /--exclude='\.git\/'/);
  assert.match(workflow, /--exclude='\.github\/'/);
  assert.match(workflow, /--exclude='\.codexus\/'/);
  assert.match(workflow, /--exclude='\.codex-harness\/'/);
  assert.match(workflow, /--exclude='node_modules\/'/);
  assert.match(workflow, /path:\s*\$\{\{ runner\.temp \}\}\/pages-site/);
});
