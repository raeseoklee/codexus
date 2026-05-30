import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile, utimes } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  computeWorkspaceFingerprint,
  fingerprintsEqual,
} from "../src/session/workspace-fingerprint.ts";

async function tempDir(prefix: string): Promise<string> {
  return await mkdtemp(join(tmpdir(), prefix));
}

function git(cwd: string, args: string[]): void {
  const result = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8" });
  assert.equal(result.status, 0, `git ${args.join(" ")} failed: ${result.stderr}`);
}

async function makeRepo(): Promise<string> {
  const cwd = await tempDir("codexus-fp-repo-");
  git(cwd, ["init", "--quiet"]);
  git(cwd, ["config", "user.email", "test@codexus.local"]);
  git(cwd, ["config", "user.name", "Codexus Test"]);
  git(cwd, ["config", "commit.gpgsign", "false"]);
  await writeFile(join(cwd, "tracked.txt"), "initial content\n");
  git(cwd, ["add", "tracked.txt"]);
  git(cwd, ["commit", "--quiet", "-m", "initial"]);
  return cwd;
}

test("(a) same workspace recomputed yields an equal fingerprint", async () => {
  const cwd = await makeRepo();
  try {
    const first = computeWorkspaceFingerprint(cwd);
    const second = computeWorkspaceFingerprint(cwd);
    assert.equal(first.degraded, false);
    assert.equal(first.isGit, true);
    assert.ok(first.head, "expected a HEAD commit");
    assert.equal(fingerprintsEqual(first, second), true);
    // Content hashes are stable; only metadata may differ.
    assert.equal(first.stagedDiffHash, second.stagedDiffHash);
    assert.equal(first.unstagedDiffHash, second.unstagedDiffHash);
    assert.equal(first.untracked.hash, second.untracked.hash);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("(b) real content change yields a different fingerprint", async () => {
  const cwd = await makeRepo();
  try {
    const before = computeWorkspaceFingerprint(cwd);
    await writeFile(join(cwd, "tracked.txt"), "initial content\nplus a real change\n");
    const after = computeWorkspaceFingerprint(cwd);
    assert.equal(after.degraded, false);
    assert.equal(fingerprintsEqual(before, after), false);
    assert.notEqual(before.unstagedDiffHash, after.unstagedDiffHash);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("(b2) a new untracked file changes the fingerprint", async () => {
  const cwd = await makeRepo();
  try {
    const before = computeWorkspaceFingerprint(cwd);
    await writeFile(join(cwd, "untracked.txt"), "brand new file\n");
    const after = computeWorkspaceFingerprint(cwd);
    assert.equal(fingerprintsEqual(before, after), false);
    assert.equal(after.untracked.count, 1);
    assert.notEqual(before.untracked.hash, after.untracked.hash);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("(b2b) untracked filenames with leading/trailing spaces are hashed by exact path", async () => {
  const cwd = await makeRepo();
  try {
    const oddPath = join(cwd, " spaced name .txt");
    await writeFile(oddPath, "first content\n");
    const before = computeWorkspaceFingerprint(cwd);
    assert.equal(before.untracked.count, 1);

    await writeFile(oddPath, "second content\n");
    const after = computeWorkspaceFingerprint(cwd);
    assert.equal(after.untracked.count, 1);
    assert.notEqual(before.untracked.hash, after.untracked.hash);
    assert.equal(fingerprintsEqual(before, after), false);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("(b4) a one-byte binary change is detected even when utf8 decode would collide", async () => {
  const cwd = await makeRepo();
  try {
    // Two distinct byte sequences that are BOTH invalid UTF-8 and decode to the
    // same replacement-character string under readFileSync(..., "utf8"). A
    // utf8-based hash would map them to the same value and MISS the change; a
    // raw-byte hash must distinguish them.
    const original = Buffer.from([0xff, 0xfe, 0x00, 0x01, 0x80]);
    const changed = Buffer.from([0xff, 0xfd, 0x00, 0x01, 0x80]); // one byte differs

    // Sanity: the two buffers really do collapse to the same utf8 string, so
    // this test would FAIL against the old utf8 implementation.
    assert.equal(
      original.toString("utf8"),
      changed.toString("utf8"),
      "expected the two byte sequences to collide under utf8 decode",
    );
    assert.notDeepEqual(original, changed);

    const binPath = join(cwd, "blob.bin");
    await writeFile(binPath, original);
    const before = computeWorkspaceFingerprint(cwd);
    assert.equal(before.degraded, false);
    assert.equal(before.untracked.count, 1);

    await writeFile(binPath, changed);
    const after = computeWorkspaceFingerprint(cwd);
    assert.equal(after.degraded, false);
    assert.equal(after.untracked.count, 1);

    // The binary change must move the untracked hash and break equality.
    assert.notEqual(before.untracked.hash, after.untracked.hash);
    assert.equal(fingerprintsEqual(before, after), false);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("(b5) tracked binary dirty content changes move the diff fingerprint", async () => {
  const cwd = await makeRepo();
  try {
    const binPath = join(cwd, "tracked.bin");
    await writeFile(binPath, Buffer.from([0x00, 0xff, 0x01, 0x02]));
    git(cwd, ["add", "tracked.bin"]);
    git(cwd, ["commit", "--quiet", "-m", "add binary"]);

    await writeFile(binPath, Buffer.from([0x00, 0xff, 0x01, 0x03]));
    const before = computeWorkspaceFingerprint(cwd);
    assert.equal(before.degraded, false);

    await writeFile(binPath, Buffer.from([0x00, 0xff, 0x01, 0x04]));
    const after = computeWorkspaceFingerprint(cwd);
    assert.equal(after.degraded, false);
    assert.notEqual(before.unstagedDiffHash, after.unstagedDiffHash);
    assert.equal(fingerprintsEqual(before, after), false);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("(b3) a gitignored file is never hashed into the fingerprint", async () => {
  const cwd = await makeRepo();
  try {
    await writeFile(join(cwd, ".gitignore"), "ignored.log\n");
    git(cwd, ["add", ".gitignore"]);
    git(cwd, ["commit", "--quiet", "-m", "add gitignore"]);
    const before = computeWorkspaceFingerprint(cwd);
    await writeFile(join(cwd, "ignored.log"), "should be ignored\n");
    const after = computeWorkspaceFingerprint(cwd);
    // The ignored file must not move the fingerprint at all.
    assert.equal(fingerprintsEqual(before, after), true);
    assert.equal(after.untracked.count, 0);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("(c) mtime-only touch with no content change yields an EQUAL fingerprint", async () => {
  const cwd = await makeRepo();
  try {
    await writeFile(join(cwd, "untracked.txt"), "stable content\n");
    const before = computeWorkspaceFingerprint(cwd);
    // Bump mtime/atime far into the future WITHOUT changing content.
    const future = new Date(Date.now() + 60 * 60 * 1000);
    await utimes(join(cwd, "tracked.txt"), future, future);
    await utimes(join(cwd, "untracked.txt"), future, future);
    const after = computeWorkspaceFingerprint(cwd);
    // This is the make-or-break honesty case: content is identical, so the
    // fingerprint must be equal despite the mtime bump.
    assert.equal(fingerprintsEqual(before, after), true);
    assert.equal(before.stagedDiffHash, after.stagedDiffHash);
    assert.equal(before.unstagedDiffHash, after.unstagedDiffHash);
    assert.equal(before.untracked.hash, after.untracked.hash);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("(d) non-git dir yields degraded:true and fingerprintsEqual is always false", async () => {
  const cwd = await tempDir("codexus-fp-nongit-");
  try {
    await writeFile(join(cwd, "loose.txt"), "no repo here\n");
    const degraded = computeWorkspaceFingerprint(cwd);
    assert.equal(degraded.degraded, true);
    assert.equal(degraded.isGit, false);
    assert.equal(degraded.head, null);
    assert.equal(degraded.stagedDiffHash, null);
    assert.equal(degraded.unstagedDiffHash, null);
    assert.ok(degraded.degradedReason, "expected a degraded reason");

    // A degraded fingerprint can never assert equality, even against itself.
    assert.equal(fingerprintsEqual(degraded, degraded), false);

    const repo = await makeRepo();
    try {
      const confident = computeWorkspaceFingerprint(repo);
      assert.equal(fingerprintsEqual(degraded, confident), false);
      assert.equal(fingerprintsEqual(confident, degraded), false);
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("harness-internal .codexus mutations never move the fingerprint", async () => {
  const cwd = await makeRepo();
  try {
    await mkdir(join(cwd, ".codexus", "session"), { recursive: true });
    await writeFile(join(cwd, ".codexus", "session", "state.json"), "{\"updatedAt\":\"a\"}\n");
    const before = computeWorkspaceFingerprint(cwd);
    // Simulate a harness command mutating its own state directory.
    await writeFile(join(cwd, ".codexus", "session", "state.json"), "{\"updatedAt\":\"b-different\"}\n");
    await writeFile(join(cwd, ".codexus", "extra.json"), "{}\n");
    const after = computeWorkspaceFingerprint(cwd);
    assert.equal(fingerprintsEqual(before, after), true);
    assert.equal(before.untracked.count, 0);
    assert.equal(after.untracked.count, 0);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("fingerprintsEqual rejects null/undefined operands", () => {
  assert.equal(fingerprintsEqual(null, null), false);
  assert.equal(fingerprintsEqual(undefined, undefined), false);
});

test("(e) subdirectory invocation uses repo top-level scope and catches root-level untracked", async () => {
  const cwd = await makeRepo();
  const sub = join(cwd, "nested", "deep");
  await mkdir(sub, { recursive: true });
  try {
    // Computed from a subdirectory must equal computed from the repo root:
    // both normalize to the top level, so scope is consistent.
    const fromRoot = computeWorkspaceFingerprint(cwd);
    const fromSub = computeWorkspaceFingerprint(sub);
    assert.equal(fromRoot.degraded, false);
    assert.equal(fromSub.degraded, false);
    assert.equal(fingerprintsEqual(fromRoot, fromSub), true, "subdir and root fingerprints must match");

    // An untracked file at the REPO ROOT (outside the subdir) must register as a
    // change even when the fingerprint is computed from the subdir. The old
    // cwd-scoped untracked listing would have missed this -> a false-fresh bug.
    await writeFile(join(cwd, "root-untracked.txt"), "new root file\n");
    const afterFromSub = computeWorkspaceFingerprint(sub);
    assert.equal(
      fingerprintsEqual(fromSub, afterFromSub),
      false,
      "root-level untracked file must be detected from a subdir computation",
    );
    assert.equal(afterFromSub.untracked.count, 1);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
