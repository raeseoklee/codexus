import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { sessionPaths } from "./state.ts";
import { writeJsonAtomic } from "../util/fs.ts";
import { withFileLock } from "../util/lock.ts";

export const taskStatuses = ["pending", "in_progress", "completed", "blocked", "skipped"] as const;
export const taskKinds = ["planning", "implementation", "verification", "review", "release", "other"] as const;
export const taskSources = ["manual", "autopilot", "relay", "subagent", "codexus"] as const;

export type SessionTaskStatus = typeof taskStatuses[number];
export type SessionTaskKind = typeof taskKinds[number];
export type SessionTaskSource = typeof taskSources[number];

export interface SessionTaskRelated {
  acceptanceCriteria: string[];
  verificationRows: string[];
  relayStage: string | null;
  subagentTaskId: string | null;
}

export interface SessionTask {
  taskId: string;
  order: number;
  title: string;
  status: SessionTaskStatus;
  kind: SessionTaskKind;
  source: SessionTaskSource;
  createdAt: string;
  updatedAt: string;
  evidenceLinks: string[];
  blockedReason: string | null;
  related: SessionTaskRelated;
  completionAuthority: false;
}

export interface SessionTasksArtifact {
  schemaVersion: 1;
  stability: "experimental";
  type: "codexus.session.tasks";
  sessionId: string | null;
  cwd: string;
  updatedAt: string;
  tasks: SessionTask[];
  projection: {
    sourceOfTruth: "codexus-session-tasks";
    lastProjectedAt: string | null;
    surface: string | null;
    adapter: string | null;
    completionAuthority: false;
  };
  completionAuthority: false;
}

export interface SessionTasksSummary {
  schemaVersion: 1;
  stability: "experimental";
  status: "empty" | "active" | "blocked" | "complete" | "mixed";
  path: string;
  sourceOfTruth: "codexus-session-tasks";
  completionAuthority: false;
  counts: {
    total: number;
    pending: number;
    inProgress: number;
    completed: number;
    blocked: number;
    skipped: number;
  };
  currentTaskId: string | null;
  blockedTaskIds: string[];
  evidenceLinkedTaskIds: string[];
}

export interface SessionTaskCommandResult {
  schemaVersion: 1;
  stability: "experimental";
  cwd: string;
  artifactPath: string;
  task: SessionTask | null;
  artifact: SessionTasksArtifact;
  summary: SessionTasksSummary;
  completionAuthority: false;
}

function nowIso(): string {
  return new Date().toISOString();
}

function createTaskId(): string {
  const date = new Date();
  const stamp = [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
    "_",
    String(date.getUTCHours()).padStart(2, "0"),
    String(date.getUTCMinutes()).padStart(2, "0"),
    String(date.getUTCSeconds()).padStart(2, "0"),
  ].join("");
  return `task_${stamp}_${randomBytes(3).toString("hex")}`;
}

export function sessionTasksPath(cwd: string): string {
  return join(sessionPaths(cwd).sessionRoot, "tasks.json");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOneOf<T extends readonly string[]>(value: unknown, values: T): value is T[number] {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}

export function normalizeTaskStatus(value: string | undefined): SessionTaskStatus {
  if (!value) return "pending";
  if (!isOneOf(value, taskStatuses)) throw new Error(`invalid_session_task_status:${value}`);
  return value;
}

export function normalizeTaskKind(value: string | undefined): SessionTaskKind {
  if (!value) return "other";
  if (!isOneOf(value, taskKinds)) throw new Error(`invalid_session_task_kind:${value}`);
  return value;
}

export function normalizeTaskSource(value: string | undefined): SessionTaskSource {
  if (!value) return "manual";
  if (!isOneOf(value, taskSources)) throw new Error(`invalid_session_task_source:${value}`);
  return value;
}

function isTask(value: unknown): value is SessionTask {
  if (!isRecord(value)) return false;
  return typeof value.taskId === "string"
    && Number.isInteger(value.order)
    && typeof value.title === "string"
    && isOneOf(value.status, taskStatuses)
    && isOneOf(value.kind, taskKinds)
    && isOneOf(value.source, taskSources)
    && typeof value.createdAt === "string"
    && typeof value.updatedAt === "string"
    && Array.isArray(value.evidenceLinks)
    && value.evidenceLinks.every((item) => typeof item === "string")
    && (value.blockedReason === null || typeof value.blockedReason === "string")
    && isRecord(value.related)
    && Array.isArray(value.related.acceptanceCriteria)
    && value.related.acceptanceCriteria.every((item) => typeof item === "string")
    && Array.isArray(value.related.verificationRows)
    && value.related.verificationRows.every((item) => typeof item === "string")
    && (value.related.relayStage === null || typeof value.related.relayStage === "string")
    && (value.related.subagentTaskId === null || typeof value.related.subagentTaskId === "string")
    && value.completionAuthority === false;
}

function isTaskArtifact(value: unknown): value is SessionTasksArtifact {
  if (!isRecord(value)) return false;
  return value.schemaVersion === 1
    && value.stability === "experimental"
    && value.type === "codexus.session.tasks"
    && (value.sessionId === null || typeof value.sessionId === "string")
    && typeof value.cwd === "string"
    && typeof value.updatedAt === "string"
    && Array.isArray(value.tasks)
    && value.tasks.every(isTask)
    && isRecord(value.projection)
    && value.projection.sourceOfTruth === "codexus-session-tasks"
    && (value.projection.lastProjectedAt === null || typeof value.projection.lastProjectedAt === "string")
    && (value.projection.surface === null || typeof value.projection.surface === "string")
    && (value.projection.adapter === null || typeof value.projection.adapter === "string")
    && value.projection.completionAuthority === false
    && value.completionAuthority === false;
}

function emptyTaskArtifact(cwd: string): SessionTasksArtifact {
  return {
    schemaVersion: 1,
    stability: "experimental",
    type: "codexus.session.tasks",
    sessionId: null,
    cwd,
    updatedAt: nowIso(),
    tasks: [],
    projection: {
      sourceOfTruth: "codexus-session-tasks",
      lastProjectedAt: null,
      surface: null,
      adapter: null,
      completionAuthority: false,
    },
    completionAuthority: false,
  };
}

export async function readSessionTasks(cwd: string): Promise<SessionTasksArtifact> {
  const path = sessionTasksPath(cwd);
  if (!existsSync(path)) return emptyTaskArtifact(cwd);
  const parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
  if (!isTaskArtifact(parsed)) throw new Error("session_tasks_artifact_invalid");
  return parsed;
}

function statusSummary(tasks: SessionTask[]): SessionTasksSummary["status"] {
  if (tasks.length === 0) return "empty";
  if (tasks.some((task) => task.status === "in_progress")) return "active";
  if (tasks.every((task) => task.status === "completed" || task.status === "skipped")) return "complete";
  if (tasks.every((task) => task.status === "blocked")) return "blocked";
  return "mixed";
}

export function summarizeSessionTasks(cwd: string, artifact: SessionTasksArtifact): SessionTasksSummary {
  const tasks = artifact.tasks;
  const byStatus = (status: SessionTaskStatus) => tasks.filter((task) => task.status === status);
  const inProgress = byStatus("in_progress");
  return {
    schemaVersion: 1,
    stability: "experimental",
    status: statusSummary(tasks),
    path: sessionTasksPath(cwd),
    sourceOfTruth: "codexus-session-tasks",
    completionAuthority: false,
    counts: {
      total: tasks.length,
      pending: byStatus("pending").length,
      inProgress: inProgress.length,
      completed: byStatus("completed").length,
      blocked: byStatus("blocked").length,
      skipped: byStatus("skipped").length,
    },
    currentTaskId: inProgress[0]?.taskId ?? null,
    blockedTaskIds: byStatus("blocked").map((task) => task.taskId),
    evidenceLinkedTaskIds: tasks.filter((task) => task.evidenceLinks.length > 0).map((task) => task.taskId),
  };
}

async function mutateTasks(cwd: string, mutate: (artifact: SessionTasksArtifact) => SessionTasksArtifact): Promise<SessionTasksArtifact> {
  return await withFileLock(cwd, "session-tasks", async () => {
    const current = await readSessionTasks(cwd);
    const next = mutate(current);
    if (!isTaskArtifact(next)) throw new Error("session_tasks_artifact_invalid");
    const inProgress = next.tasks.filter((task) => task.status === "in_progress");
    if (inProgress.length > 1) throw new Error("session_task_in_progress_conflict");
    await writeJsonAtomic(sessionTasksPath(cwd), next);
    return next;
  }, { operation: "session tasks" });
}

function findTask(artifact: SessionTasksArtifact, taskId: string): SessionTask {
  const task = artifact.tasks.find((candidate) => candidate.taskId === taskId);
  if (!task) throw new Error(`session_task_not_found:${taskId}`);
  return task;
}

function normalizeEvidenceLink(cwd: string, input: string): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(input)) throw new Error(`invalid_session_task_evidence:${input}`);
  if (isAbsolute(input)) throw new Error(`invalid_session_task_evidence:${input}`);
  const resolvedCwd = resolve(cwd);
  const resolved = resolve(resolvedCwd, input);
  const rel = relative(resolvedCwd, resolved);
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) throw new Error(`invalid_session_task_evidence:${input}`);
  if (!existsSync(resolved)) throw new Error(`session_task_evidence_missing:${input}`);
  return rel;
}

export async function listSessionTasks(cwd: string): Promise<SessionTaskCommandResult> {
  const artifact = await readSessionTasks(cwd);
  return {
    schemaVersion: 1,
    stability: "experimental",
    cwd,
    artifactPath: sessionTasksPath(cwd),
    task: null,
    artifact,
    summary: summarizeSessionTasks(cwd, artifact),
    completionAuthority: false,
  };
}

export async function addSessionTask(cwd: string, options: {
  title: string;
  status?: string;
  kind?: string;
  source?: string;
}): Promise<SessionTaskCommandResult> {
  const title = options.title.trim();
  if (!title) throw new Error("missing_session_task_title");
  let createdTask: SessionTask | null = null;
  const artifact = await mutateTasks(cwd, (current) => {
    const timestamp = nowIso();
    const task: SessionTask = {
      taskId: createTaskId(),
      order: current.tasks.length + 1,
      title,
      status: normalizeTaskStatus(options.status),
      kind: normalizeTaskKind(options.kind),
      source: normalizeTaskSource(options.source),
      createdAt: timestamp,
      updatedAt: timestamp,
      evidenceLinks: [],
      blockedReason: null,
      related: {
        acceptanceCriteria: [],
        verificationRows: [],
        relayStage: null,
        subagentTaskId: null,
      },
      completionAuthority: false,
    };
    if (task.status === "in_progress" && current.tasks.some((item) => item.status === "in_progress")) {
      throw new Error("session_task_in_progress_conflict");
    }
    createdTask = task;
    return { ...current, updatedAt: timestamp, tasks: [...current.tasks, task] };
  });
  return {
    schemaVersion: 1,
    stability: "experimental",
    cwd,
    artifactPath: sessionTasksPath(cwd),
    task: createdTask,
    artifact,
    summary: summarizeSessionTasks(cwd, artifact),
    completionAuthority: false,
  };
}

export async function updateSessionTask(cwd: string, taskId: string, options: {
  title?: string;
  status?: string;
  kind?: string;
  source?: string;
}): Promise<SessionTaskCommandResult> {
  if (!taskId) throw new Error("missing_session_task_id");
  let updatedTask: SessionTask | null = null;
  const artifact = await mutateTasks(cwd, (current) => {
    findTask(current, taskId);
    const timestamp = nowIso();
    const status = options.status ? normalizeTaskStatus(options.status) : undefined;
    if (status === "in_progress" && current.tasks.some((task) => task.taskId !== taskId && task.status === "in_progress")) {
      throw new Error("session_task_in_progress_conflict");
    }
    const tasks = current.tasks.map((task) => {
      if (task.taskId !== taskId) return task;
      const next: SessionTask = {
        ...task,
        title: options.title !== undefined ? options.title.trim() : task.title,
        status: status ?? task.status,
        kind: options.kind ? normalizeTaskKind(options.kind) : task.kind,
        source: options.source ? normalizeTaskSource(options.source) : task.source,
        updatedAt: timestamp,
      };
      if (!next.title) throw new Error("missing_session_task_title");
      updatedTask = next;
      return next;
    });
    return { ...current, updatedAt: timestamp, tasks };
  });
  return {
    schemaVersion: 1,
    stability: "experimental",
    cwd,
    artifactPath: sessionTasksPath(cwd),
    task: updatedTask,
    artifact,
    summary: summarizeSessionTasks(cwd, artifact),
    completionAuthority: false,
  };
}

export async function completeSessionTask(cwd: string, taskId: string, options: {
  evidence?: string;
}): Promise<SessionTaskCommandResult> {
  if (!taskId) throw new Error("missing_session_task_id");
  const evidenceLink = options.evidence ? normalizeEvidenceLink(cwd, options.evidence) : null;
  let completedTask: SessionTask | null = null;
  const artifact = await mutateTasks(cwd, (current) => {
    findTask(current, taskId);
    const timestamp = nowIso();
    const tasks = current.tasks.map((task) => {
      if (task.taskId !== taskId) return task;
      const evidenceLinks = evidenceLink && !task.evidenceLinks.includes(evidenceLink)
        ? [...task.evidenceLinks, evidenceLink]
        : task.evidenceLinks;
      const next: SessionTask = {
        ...task,
        status: "completed",
        blockedReason: null,
        evidenceLinks,
        updatedAt: timestamp,
      };
      completedTask = next;
      return next;
    });
    return { ...current, updatedAt: timestamp, tasks };
  });
  return {
    schemaVersion: 1,
    stability: "experimental",
    cwd,
    artifactPath: sessionTasksPath(cwd),
    task: completedTask,
    artifact,
    summary: summarizeSessionTasks(cwd, artifact),
    completionAuthority: false,
  };
}

export async function blockSessionTask(cwd: string, taskId: string, reason: string): Promise<SessionTaskCommandResult> {
  if (!taskId) throw new Error("missing_session_task_id");
  const blockedReason = reason.trim();
  if (!blockedReason) throw new Error("missing_session_task_block_reason");
  let blockedTask: SessionTask | null = null;
  const artifact = await mutateTasks(cwd, (current) => {
    findTask(current, taskId);
    const timestamp = nowIso();
    const tasks = current.tasks.map((task) => {
      if (task.taskId !== taskId) return task;
      const next: SessionTask = {
        ...task,
        status: "blocked",
        blockedReason,
        updatedAt: timestamp,
      };
      blockedTask = next;
      return next;
    });
    return { ...current, updatedAt: timestamp, tasks };
  });
  return {
    schemaVersion: 1,
    stability: "experimental",
    cwd,
    artifactPath: sessionTasksPath(cwd),
    task: blockedTask,
    artifact,
    summary: summarizeSessionTasks(cwd, artifact),
    completionAuthority: false,
  };
}
