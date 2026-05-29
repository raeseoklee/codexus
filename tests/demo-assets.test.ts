import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("README demo tape pins an explicit bash shell surface", async () => {
  const tape = await readFile("docs/assets/codexus-inside-codex.tape", "utf8");

  assert.match(tape, /Require bash/);
  assert.match(tape, /Set Shell "bash"/);
  assert.match(tape, /\$\{BASH_VERSION-\}:\$\{ZSH_VERSION-\}/);
  assert.match(tape, /export PS1='bash\$ '/);
  assert.match(tape, /CODEXUS_DEMO_CWD=\$\(mktemp -d\)/);
  assert.match(tape, /--cwd \$CODEXUS_DEMO_CWD/);
});
