import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  buildSchemaDrift,
  buildObserverProbeEvidence,
  buildStageAManifest,
  extractSchemaMethods,
  selectRelevantEventMethods,
  STAGE_A_PREVIEW_BYTES,
  type ObserverProbeEvidence,
} from "../src/experiments/app-server-stage-a.ts";

const cli = resolve("src/cli/main.ts");

async function tempDir(): Promise<string> {
  return await mkdtemp(join(tmpdir(), "codexus-stagea-test-"));
}

const FIXTURE_METHODS = ["thread/start", "turn/start", "turn/steer", "thread/turns/items/list", "skills/list"];

/**
 * Write a fake codex .mjs that emulates the app-server subcommands Stage A uses.
 * It NEVER touches a real daemon/socket/config. It only writes a schema file and
 * emulates the direct app-server/proxy paths Stage A supervises.
 */
async function writeFakeCodex(dir: string, options: { schemaMethods?: string[] } = {}): Promise<string> {
  const fakeCodex = join(dir, "fake-codex.mjs");
  const methods = options.schemaMethods ?? FIXTURE_METHODS;
  await writeFile(fakeCodex, `#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { join } from "node:path";
const args = process.argv.slice(2);
if (args[0] === "app-server" && args[1] === "generate-json-schema") {
  const outIndex = args.indexOf("--out");
  const outDir = args[outIndex + 1];
  const schema = {
    schemaVersion: 1,
    protocol: "codex-app-server",
    status: "experimental",
    methods: ${JSON.stringify(methods)},
  };
  writeFileSync(join(outDir, "codex_app_server_protocol.v2.schemas.json"), JSON.stringify(schema));
  process.exit(0);
}
else if (args[0] === "app-server" && args.includes("--listen")) {
  const listen = args[args.indexOf("--listen") + 1] || "";
  if (listen.startsWith("unix://")) writeFileSync(listen.slice("unix://".length), "");
  console.log("codexus-fake-server-ready");
  setInterval(() => {}, 1000);
}
else if (args[0] === "app-server" && args[1] === "daemon" && args[2] === "stop") {
  console.log("codexus-fake-daemon-stopped");
  process.exit(0);
}
else if (args[0] === "app-server" && args[1] === "proxy") {
  // A fake proxy can spawn and exit, but it cannot prove a genuine concurrent
  // read-only observation. It intentionally does NOT emit the observer-read
  // token, so Stage A must conservatively report "unobserved", never fabricate
  // "observed".
  console.log("fake-proxy exited without a real observation");
  process.exit(0);
}
else {
  console.error("unexpected fake-codex args", args.join(" "));
  process.exit(2);
}
`);
  await chmod(fakeCodex, 0o755);
  return fakeCodex;
}

test("experiment --isolated-real without env yields structured unsupported error", async () => {
  const cwd = await tempDir();
  try {
    const result = spawnSync(process.execPath, [cli, "app-server", "experiment", "--isolated-real", "--cwd", cwd, "--json"], {
      encoding: "utf8",
      env: { ...process.env, CODEXUS_ENABLE_APP_SERVER_ISOLATED: "" },
    });
    assert.equal(result.status, 1, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.type, "error");
    assert.equal(output.code, "unsupported_feature");
    assert.equal(output.details.target, "codex-app-server-isolated-real");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("extractSchemaMethods and selectRelevantEventMethods are conservative", () => {
  assert.deepEqual(extractSchemaMethods({ methods: ["turn/start", 1, "skills/list"] }), ["skills/list", "turn/start"]);
  assert.deepEqual(
    extractSchemaMethods({
      definitions: {
        ClientRequest: {
          oneOf: [
            { properties: { method: { enum: ["thread/start"] } } },
            { properties: { method: { enum: ["turn/start"] } } },
          ],
        },
        NotAMethod: { enum: ["chatgpt", "api"] },
      },
    }),
    ["thread/start", "turn/start"],
  );
  assert.deepEqual(extractSchemaMethods({}), []);
  assert.deepEqual(extractSchemaMethods(null), []);
  assert.deepEqual(
    selectRelevantEventMethods(["turn/start", "skills/list", "thread/turns/items/list", "auth/login"]),
    ["turn/start", "thread/turns/items/list"],
  );
  assert.deepEqual(selectRelevantEventMethods([]), []);
});

test("buildSchemaDrift bounds output and detects fixture match/mismatch", () => {
  const matching = buildSchemaDrift({
    generated: "ok",
    generatedRaw: JSON.stringify({ methods: FIXTURE_METHODS }),
    generatedParsed: { methods: FIXTURE_METHODS },
    fixtureMethods: FIXTURE_METHODS,
  });
  assert.equal(matching.generated, "ok");
  assert.equal(matching.matchesFixture, true);
  assert.deepEqual(matching.missingFixtureMethods, []);

  const drifted = buildSchemaDrift({
    generated: "ok",
    generatedRaw: "{}",
    generatedParsed: { methods: ["turn/start"] },
    fixtureMethods: FIXTURE_METHODS,
  });
  assert.equal(drifted.matchesFixture, false);
  assert.deepEqual(drifted.missingFixtureMethods, ["thread/start", "turn/steer", "thread/turns/items/list", "skills/list"]);

  const unavailable = buildSchemaDrift({
    generated: "unavailable:ENOENT",
    generatedRaw: "",
    generatedParsed: null,
    fixtureMethods: FIXTURE_METHODS,
  });
  assert.equal(unavailable.matchesFixture, "unknown");
  assert.equal(unavailable.boundedSummary, "schema generation unavailable:ENOENT");

  const huge = "x".repeat(STAGE_A_PREVIEW_BYTES + 500);
  const bounded = buildSchemaDrift({
    generated: "ok",
    generatedRaw: huge,
    generatedParsed: { methods: [] },
    fixtureMethods: FIXTURE_METHODS,
  });
  assert.ok(bounded.boundedSummary.length < huge.length);
  assert.match(bounded.boundedSummary, /\.\.\.\[\+\d+b\]$/);
  // no methods generated -> unknown match
  assert.equal(bounded.matchesFixture, "unknown");
});

test("buildStageAManifest enforces conservative capability invariant", () => {
  const base = {
    experimentId: "exp_1",
    cwd: "/tmp/cwd",
    experimentDir: "/tmp/cwd/.codexus/experiments/app-server/exp_1",
    timeoutMs: 1000,
    isolation: { codexHome: "/tmp/home", workspace: "/tmp/ws", socketPath: "/tmp/sock/app.sock" },
    schemaDrift: buildSchemaDrift({ generated: "ok" as const, generatedRaw: "{}", generatedParsed: { methods: [] }, fixtureMethods: [] }),
    appServerLifecycle: { attempted: true, transport: "direct-listen" as const, socketReady: true, supervised: null, environmentUnsupported: null, reason: "test" },
    cleanup: {
      appServerStopRequested: true,
      appServerStopCompleted: true,
      appServerStopSignal: null,
      daemonStopRequested: true,
      daemonStopCompleted: true,
      daemonStopSignal: null,
      daemonStopStatus: "passed" as const,
      daemonStopExitCode: 0,
      daemonStopError: null,
      noLingeringChild: true,
      tempDirsRemoved: true,
    },
    relevantEventMethods: [],
  };

  const unknownProbe: ObserverProbeEvidence = { observerAttach: "unknown", reason: "n/a", overlapObserved: false, firstClient: null, secondClient: null };
  const unknown = buildStageAManifest({ ...base, observerAttach: unknownProbe });
  assert.equal(unknown.mode, "isolated-real");
  assert.equal(unknown.conservativeCapability, "unobserved");

  const observedProbe: ObserverProbeEvidence = { observerAttach: "observed", reason: "two reads", overlapObserved: true, firstClient: null, secondClient: null };
  const observed = buildStageAManifest({ ...base, observerAttach: observedProbe });
  assert.equal(observed.conservativeCapability, "observed");

  const unsupportedProbe: ObserverProbeEvidence = { observerAttach: "unsupported", reason: "single client", overlapObserved: true, firstClient: null, secondClient: null };
  const unsupported = buildStageAManifest({ ...base, observerAttach: unsupportedProbe });
  assert.equal(unsupported.conservativeCapability, "unobserved");
});

test("observer probe requires overlapping attached proxy clients", () => {
  const base = {
    schemaVersion: 1 as const,
    command: "fake-codex",
    args: ["app-server", "proxy"],
    cwd: "/tmp/ws",
    pid: 1,
    durationMs: 100,
    timeoutMs: 1000,
    stopAfterMs: 300,
    status: "stopped" as const,
    exitCode: null,
    signal: "SIGTERM" as NodeJS.Signals,
    stdoutPreview: "",
    stderrPreview: "",
    error: null,
    cleanup: { requested: true, signal: "SIGTERM" as NodeJS.Signals, completed: true },
  };
  const overlapping = buildObserverProbeEvidence({
    firstClient: { ...base, startedAt: "2026-05-30T00:00:00.000Z", completedAt: "2026-05-30T00:00:01.000Z" },
    secondClient: { ...base, startedAt: "2026-05-30T00:00:00.100Z", completedAt: "2026-05-30T00:00:01.100Z" },
  });
  assert.equal(overlapping.overlapObserved, true);
  assert.equal(overlapping.observerAttach, "observed");

  const sequential = buildObserverProbeEvidence({
    firstClient: { ...base, status: "exited" as const, exitCode: 0, signal: null, startedAt: "2026-05-30T00:00:00.000Z", completedAt: "2026-05-30T00:00:00.050Z" },
    secondClient: { ...base, status: "exited" as const, exitCode: 0, signal: null, startedAt: "2026-05-30T00:00:00.100Z", completedAt: "2026-05-30T00:00:00.150Z" },
  });
  assert.equal(sequential.overlapObserved, false);
  assert.equal(sequential.observerAttach, "unknown");
});

test("isolated-real happy path with fake codex records truthful manifest", async () => {
  const cwd = await tempDir();
  try {
    await mkdir(join(cwd, ".codexus"), { recursive: true });
    const fakeCodex = await writeFakeCodex(cwd);
    await writeFile(join(cwd, ".codexus", "config.json"), JSON.stringify({
      codex: { command: fakeCodex },
    }));
    const result = spawnSync(process.execPath, [cli, "app-server", "experiment", "--isolated-real", "--record", "--timeout-ms", "8000", "--cwd", cwd, "--json"], {
      encoding: "utf8",
      env: { ...process.env, CODEXUS_ENABLE_APP_SERVER_ISOLATED: "1" },
    });
    assert.equal(result.status, 0, result.stderr);
    const manifest = JSON.parse(result.stdout);

    assert.equal(manifest.schemaVersion, 1);
    assert.equal(manifest.mode, "isolated-real");

    // Isolation temp paths recorded and outside cwd/.codexus.
    assert.equal(typeof manifest.isolation.codexHome, "string");
    assert.equal(typeof manifest.isolation.workspace, "string");
    assert.equal(typeof manifest.isolation.socketPath, "string");
    assert.ok(!manifest.isolation.codexHome.startsWith(cwd));
    assert.match(manifest.isolation.socketPath, /app-server\.sock$/);

    // Schema drift recorded; fake schema matches the committed fixture methods.
    assert.equal(manifest.schemaDrift.generated, "ok");
    assert.equal(manifest.schemaDrift.matchesFixture, true);
    assert.equal(manifest.schemaDrift.sourceFile, "codex_app_server_protocol.v2.schemas.json");

    // Observer probe value is one of the allowed outcomes.
    assert.ok(["observed", "unobserved", "unsupported", "unknown"].includes(manifest.observerAttach.observerAttach));
    // Honesty invariant: the fake proxy cannot prove a genuine concurrent read,
    // so the probe must NEVER fabricate "observed".
    assert.notEqual(manifest.observerAttach.observerAttach, "observed");

    // Cleanup completed and no lingering child.
    assert.equal(manifest.cleanup.noLingeringChild, true);
    assert.equal(manifest.cleanup.tempDirsRemoved, true);
    assert.equal(manifest.cleanup.appServerStopCompleted, true);
    assert.equal(manifest.cleanup.daemonStopStatus, "not_attempted");

    // Conservative capability default: fake proxy is not a true concurrent attachment,
    // so this must remain unobserved unless a real concurrent read is observed.
    assert.equal(manifest.conservativeCapability, "unobserved");

    // relevantEventMethods is a string[] (best-effort, may be non-empty here).
    assert.ok(Array.isArray(manifest.relevantEventMethods));

    // Manifest persisted under .codexus and temp dirs removed.
    const manifestPath = join(manifest.experimentDir, "manifest.json");
    assert.ok(existsSync(manifestPath), "manifest should be persisted");
    const persisted = JSON.parse(await readFile(manifestPath, "utf8"));
    assert.equal(persisted.mode, "isolated-real");
    const schema = spawnSync(process.execPath, [cli, "schema", "validate", "--type", "app-server-stage-a", "--file", manifestPath, "--json"], {
      encoding: "utf8",
    });
    assert.equal(schema.status, 0, schema.stderr);
    assert.equal(JSON.parse(schema.stdout).ok, true);
    assert.equal(existsSync(manifest.isolation.codexHome), false);
    assert.equal(existsSync(manifest.isolation.workspace), false);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("isolated-real records unavailable schema drift when generation fails", async () => {
  const cwd = await tempDir();
  try {
    await mkdir(join(cwd, ".codexus"), { recursive: true });
    // fake codex that fails generate-json-schema (exit 2) but handles daemon/proxy.
    const fakeCodex = join(cwd, "fake-codex-noschema.mjs");
    await writeFile(fakeCodex, `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] === "app-server" && args[1] === "generate-json-schema") {
  console.error("schema generation unavailable in this build");
  process.exit(2);
}
else if (args[0] === "app-server" && args.includes("--listen")) {
  const listen = args[args.indexOf("--listen") + 1] || "";
  if (listen.startsWith("unix://")) {
    const { writeFileSync } = await import("node:fs");
    writeFileSync(listen.slice("unix://".length), "");
  }
  setInterval(() => {}, 1000);
}
else if (args[0] === "app-server" && args[1] === "daemon") { process.exit(0); }
else if (args[0] === "app-server" && args[1] === "proxy") { process.exit(0); }
else { process.exit(2); }
`);
    await chmod(fakeCodex, 0o755);
    await writeFile(join(cwd, ".codexus", "config.json"), JSON.stringify({ codex: { command: fakeCodex } }));
    const result = spawnSync(process.execPath, [cli, "app-server", "experiment", "--isolated-real", "--timeout-ms", "8000", "--cwd", cwd, "--json"], {
      encoding: "utf8",
      env: { ...process.env, CODEXUS_ENABLE_APP_SERVER_ISOLATED: "1" },
    });
    assert.equal(result.status, 0, result.stderr);
    const manifest = JSON.parse(result.stdout);
    assert.match(manifest.schemaDrift.generated, /^unavailable:/);
    assert.equal(manifest.schemaDrift.matchesFixture, "unknown");
    // fixture fallback still yields relevant event methods.
    assert.ok(Array.isArray(manifest.relevantEventMethods));
    assert.equal(manifest.conservativeCapability, "unobserved");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
