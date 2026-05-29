import { existsSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { hostname } from "node:os";
import type { RunPaths } from "../ledger/paths.ts";
import { redactSensitiveText } from "../policy/redaction.ts";
import { writeJsonAtomic } from "../util/fs.ts";
import { createEventId } from "../util/id.ts";

export interface RunOwner {
  schemaVersion: 1;
  runId: string;
  pid: number;
  hostname: string;
  createdAt: string;
  heartbeatAt: string;
  ttlMs: number;
}

export interface CancelRequest {
  schemaVersion: 1;
  requestId: string;
  runId: string;
  requestedAt: string;
  requestedBy: {
    pid: number;
    hostname: string;
  };
  reason: string;
}

export interface RunOwnerRead {
  owner: RunOwner | null;
  error: string | null;
}

export interface RunOwnerLiveness {
  live: boolean;
  reason: "live" | "missing" | "invalid" | "host_mismatch_stale" | "heartbeat_stale" | "pid_dead";
  owner: RunOwner | null;
  error: string | null;
}

export interface RunOwnerHeartbeat {
  stop(): Promise<void>;
}

export const runOwnerTtlMs = 5_000;
export const runOwnerHeartbeatIntervalMs = 500;

function isRunOwner(value: unknown): value is RunOwner {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return record.schemaVersion === 1
    && typeof record.runId === "string"
    && Number.isInteger(record.pid)
    && typeof record.hostname === "string"
    && typeof record.createdAt === "string"
    && typeof record.heartbeatAt === "string"
    && typeof record.ttlMs === "number";
}

function isCancelRequest(value: unknown): value is CancelRequest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const requestedBy = record.requestedBy;
  return record.schemaVersion === 1
    && typeof record.requestId === "string"
    && typeof record.runId === "string"
    && typeof record.requestedAt === "string"
    && typeof record.reason === "string"
    && typeof requestedBy === "object"
    && requestedBy !== null
    && !Array.isArray(requestedBy)
    && Number.isInteger((requestedBy as Record<string, unknown>).pid)
    && typeof (requestedBy as Record<string, unknown>).hostname === "string";
}

function nowIso(): string {
  return new Date().toISOString();
}

function heartbeatFresh(owner: RunOwner, now = Date.now()): boolean {
  const heartbeat = new Date(owner.heartbeatAt).getTime();
  return Number.isFinite(heartbeat) && Number.isFinite(owner.ttlMs) && owner.ttlMs > 0 && now - heartbeat <= owner.ttlMs;
}

function pidLive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error
      ? (error as { code?: unknown }).code
      : null;
    return code === "EPERM";
  }
}

function currentOwner(runId: string, previous?: RunOwner): RunOwner {
  const timestamp = nowIso();
  return {
    schemaVersion: 1,
    runId,
    pid: process.pid,
    hostname: hostname(),
    createdAt: previous?.createdAt ?? timestamp,
    heartbeatAt: timestamp,
    ttlMs: previous?.ttlMs ?? runOwnerTtlMs,
  };
}

export async function readRunOwner(paths: RunPaths): Promise<RunOwnerRead> {
  if (!existsSync(paths.owner)) return { owner: null, error: "missing" };
  try {
    const parsed = JSON.parse(await readFile(paths.owner, "utf8")) as unknown;
    if (!isRunOwner(parsed)) return { owner: null, error: "invalid" };
    return { owner: parsed, error: null };
  } catch (error) {
    return { owner: null, error: error instanceof SyntaxError ? "parse_failed" : "read_failed" };
  }
}

export async function writeRunOwner(paths: RunPaths, owner: RunOwner): Promise<void> {
  await writeJsonAtomic(paths.owner, owner);
}

export async function removeRunOwner(paths: RunPaths): Promise<void> {
  await rm(paths.owner, { force: true });
}

export async function inspectRunOwner(paths: RunPaths): Promise<RunOwnerLiveness> {
  const read = await readRunOwner(paths);
  if (!read.owner) return { live: false, reason: read.error === "invalid" || read.error === "parse_failed" ? "invalid" : "missing", owner: null, error: read.error };
  const owner = read.owner;
  if (!heartbeatFresh(owner)) {
    return {
      live: false,
      reason: owner.hostname === hostname() ? "heartbeat_stale" : "host_mismatch_stale",
      owner,
      error: null,
    };
  }
  if (owner.hostname === hostname() && !pidLive(owner.pid)) return { live: false, reason: "pid_dead", owner, error: null };
  return { live: true, reason: "live", owner, error: null };
}

export async function startRunOwnerHeartbeat(paths: RunPaths, runId: string): Promise<RunOwnerHeartbeat> {
  let owner = currentOwner(runId);
  let writing = false;
  let stopped = false;
  let lastWrite: Promise<void> = Promise.resolve();
  await writeRunOwner(paths, owner);
  const timer = setInterval(() => {
    if (writing || stopped) return;
    writing = true;
    owner = currentOwner(runId, owner);
    lastWrite = writeRunOwner(paths, owner)
      .catch(() => {})
      .finally(() => {
        writing = false;
      });
    void lastWrite;
  }, runOwnerHeartbeatIntervalMs);
  timer.unref?.();
  return {
    async stop(): Promise<void> {
      stopped = true;
      clearInterval(timer);
      await lastWrite.catch(() => {});
      await removeRunOwner(paths);
    },
  };
}

export async function readCancelRequest(paths: RunPaths): Promise<CancelRequest | null> {
  if (!existsSync(paths.cancelRequest)) return null;
  try {
    const parsed = JSON.parse(await readFile(paths.cancelRequest, "utf8")) as unknown;
    return isCancelRequest(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function writeCancelRequest(paths: RunPaths, runId: string, reason: string): Promise<CancelRequest> {
  const request: CancelRequest = {
    schemaVersion: 1,
    requestId: createEventId().replace(/^evt_/, "cancel_"),
    runId,
    requestedAt: nowIso(),
    requestedBy: {
      pid: process.pid,
      hostname: hostname(),
    },
    reason: redactSensitiveText(reason).slice(0, 500) || "external cancel requested",
  };
  await writeJsonAtomic(paths.cancelRequest, request);
  return request;
}
