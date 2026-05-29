import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { redactSensitiveText } from "../src/policy/redaction.ts";
import { runPolicyPreflight } from "../src/policy/preflight.ts";

async function tempDir(): Promise<string> {
  return await mkdtemp(join(tmpdir(), "chx-policy-"));
}

test("policy preflight blocks destructive verification commands", async () => {
  const cwd = await tempDir();
  try {
    const result = runPolicyPreflight({
      cwd,
      prompt: "verify cleanup",
      verificationCommands: ["rm -rf /"],
    });
    assert.equal(result.status, "blocked");
    assert.ok(result.findings.some((finding) => finding.code === "dangerous_root_delete"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("redaction covers common stdout and env secret shapes", () => {
  const openAiKey = ["sk", "abcdefghijklmnopqrstuvwxyz123456"].join("-");
  const awsAccessKey = ["AKIA", "1234567890ABCDEF"].join("");
  const awsSecretKey = ["wJalrXUtnFEMI", "K7MDENG", "bPxRfiCYEXAMPLEKEY"].join("/");
  const password = "hunter2";
  const clientSecret = "client-secret-value";
  const jwt = [
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9",
    "aaaaaaaaaaaaaaaa",
    "bbbbbbbbbbbbbbbb",
  ].join(".");
  const privateKeyBody = "abc123";
  const beginPrivateKey = ["-----BEGIN OPENSSH", "PRIVATE KEY-----"].join(" ");
  const endPrivateKey = ["-----END OPENSSH", "PRIVATE KEY-----"].join(" ");
  const githubToken = ["github", "pat", "abcdefghijklmnopqrstuvwxyz", "1234567890"].join("_");
  const slackToken = ["xoxb", "123456789012", "abcdefghijklmnop"].join("-");
  const raw = [
    `OPENAI_API_KEY=${openAiKey}`,
    `AWS_ACCESS_KEY_ID=${awsAccessKey}`,
    `AWS_SECRET_ACCESS_KEY=${awsSecretKey}`,
    `password=${password}`,
    `"client_secret": "${clientSecret}"`,
    `jwt=${jwt}`,
    `${beginPrivateKey}\n${privateKeyBody}\n${endPrivateKey}`,
    githubToken,
    slackToken,
  ].join("\n");

  const redacted = redactSensitiveText(raw);

  for (const secret of [
    openAiKey,
    awsAccessKey,
    awsSecretKey,
    password,
    clientSecret,
    jwt,
    privateKeyBody,
    githubToken,
    slackToken,
  ]) {
    assert.equal(redacted.includes(secret), false, secret);
  }
  assert.match(redacted, /\[REDACTED:possible-secret\]/);
  assert.match(redacted, /\[REDACTED:possible-private-key-block\]/);
});
