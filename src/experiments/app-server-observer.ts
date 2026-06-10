import { existsSync } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { harnessRoot } from "../ledger/paths.ts";

export type ObserverBridgeStatus =
  | "desktop_turn_boundary_observed"
  | "candidate_socket_found"
  | "stdio_mapping_proof_only"
  | "discovery_only"
  | "no_evidence"
  | "inconclusive";

export interface AppServerEvidenceSummary {
  path: string;
  recordedAt: string | null;
  kind: "discovery" | "stage-b" | "stdio-proof";
  status: string;
  runtimeSurface: "unknown" | "desktop-app-server";
  turnBoundaryObserved: boolean | null;
  recommendation: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readJsonIfPresent(path: string): Promise<unknown | null> {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch {
    return null;
  }
}

function sortLatestFirst<T extends { recordedAt: string | null; path: string }>(items: T[]): T[] {
  return [...items].sort((left, right) => {
    const leftTime = left.recordedAt ? Date.parse(left.recordedAt) : 0;
    const rightTime = right.recordedAt ? Date.parse(right.recordedAt) : 0;
    return rightTime - leftTime || right.path.localeCompare(left.path);
  });
}

async function appServerEvidenceModifiedAt(path: string): Promise<string | null> {
  try {
    return (await stat(path)).mtime.toISOString();
  } catch {
    return null;
  }
}

export async function collectAppServerObserverEvidence(cwd: string): Promise<{
  discovery: AppServerEvidenceSummary[];
  stageB: AppServerEvidenceSummary[];
  stdioProof: AppServerEvidenceSummary[];
}> {
  const root = resolve(harnessRoot(cwd), "experiments", "app-server");
  const discovery: AppServerEvidenceSummary[] = [];
  const stageB: AppServerEvidenceSummary[] = [];
  const stdioProof: AppServerEvidenceSummary[] = [];
  if (!existsSync(root)) return { discovery, stageB, stdioProof };
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = resolve(root, entry.name);
    const discoveryPath = resolve(dir, "discovery.json");
    const discoveryValue = await readJsonIfPresent(discoveryPath);
    if (isRecord(discoveryValue) && discoveryValue.command === "app-server discover") {
      const readiness = isRecord(discoveryValue.stageBReadiness) ? discoveryValue.stageBReadiness : {};
      discovery.push({
        path: discoveryPath,
        recordedAt: typeof discoveryValue.generatedAt === "string" ? discoveryValue.generatedAt : await appServerEvidenceModifiedAt(discoveryPath),
        kind: "discovery",
        status: typeof readiness.status === "string" ? readiness.status : "unknown",
        runtimeSurface: "unknown",
        turnBoundaryObserved: null,
        recommendation: typeof readiness.promotionRecommendation === "string" ? readiness.promotionRecommendation : null,
      });
    }

    const manifestPath = resolve(dir, "manifest.json");
    const manifestValue = await readJsonIfPresent(manifestPath);
    if (isRecord(manifestValue) && manifestValue.mode === "live-read-only") {
      const observation = isRecord(manifestValue.eventObservation) ? manifestValue.eventObservation : {};
      stageB.push({
        path: manifestPath,
        recordedAt: await appServerEvidenceModifiedAt(manifestPath),
        kind: "stage-b",
        status: typeof observation.status === "string" ? observation.status : "unknown",
        runtimeSurface: observation.runtimeSurface === "desktop-app-server" ? "desktop-app-server" : "unknown",
        turnBoundaryObserved: typeof observation.turnBoundaryObserved === "boolean" ? observation.turnBoundaryObserved : null,
        recommendation: typeof manifestValue.promotionRecommendation === "string" ? manifestValue.promotionRecommendation : null,
      });
    }

    const stdioPath = resolve(dir, "stdio-proof.json");
    const stdioValue = await readJsonIfPresent(stdioPath);
    if (isRecord(stdioValue) && stdioValue.mode === "stdio-proof") {
      const observation = isRecord(stdioValue.observation) ? stdioValue.observation : {};
      stdioProof.push({
        path: stdioPath,
        recordedAt: await appServerEvidenceModifiedAt(stdioPath),
        kind: "stdio-proof",
        status: typeof observation.status === "string" ? observation.status : "unknown",
        runtimeSurface: observation.runtimeSurface === "desktop-app-server" ? "desktop-app-server" : "unknown",
        turnBoundaryObserved: typeof observation.turnBoundaryObserved === "boolean" ? observation.turnBoundaryObserved : null,
        recommendation: typeof stdioValue.promotionRecommendation === "string" ? stdioValue.promotionRecommendation : null,
      });
    }
  }
  return {
    discovery: sortLatestFirst(discovery),
    stageB: sortLatestFirst(stageB),
    stdioProof: sortLatestFirst(stdioProof),
  };
}

export async function appServerObserverStatus(cwd: string) {
  const evidence = await collectAppServerObserverEvidence(cwd);
  const latestStageB = evidence.stageB[0] ?? null;
  const latestDiscovery = evidence.discovery[0] ?? null;
  const latestStdioProof = evidence.stdioProof[0] ?? null;
  const liveStageBObserved = latestStageB?.runtimeSurface === "desktop-app-server" && latestStageB.turnBoundaryObserved === true;
  const status: ObserverBridgeStatus = liveStageBObserved
    ? "desktop_turn_boundary_observed"
    : latestDiscovery?.status === "candidate_socket_found"
      ? "candidate_socket_found"
      : latestStdioProof?.runtimeSurface === "desktop-app-server" && latestStdioProof.turnBoundaryObserved === true
        ? "stdio_mapping_proof_only"
        : latestDiscovery
          ? "discovery_only"
          : latestStageB || latestStdioProof
            ? "inconclusive"
            : "no_evidence";
  return {
    schemaVersion: 1,
    stability: "experimental" as const,
    command: "app-server observer status" as const,
    cwd,
    observerBridge: {
      status,
      runtimeSurface: liveStageBObserved ? "desktop-app-server" as const : "unknown" as const,
      sessionMappingAuthority: liveStageBObserved ? "stage_b_turn_boundary" as const : "none" as const,
      connectsToLiveSocket: false,
      startsDesktopTurn: false,
      transcriptValuesStored: false,
      completionAuthority: false,
      caveat: "This command reads recorded app-server evidence only. It never connects to a live socket, starts a Desktop turn, or treats fake stdio proof as live Desktop attachment.",
    },
    latest: {
      discovery: latestDiscovery,
      stageB: latestStageB,
      stdioProof: latestStdioProof,
    },
    counts: {
      discovery: evidence.discovery.length,
      stageB: evidence.stageB.length,
      stdioProof: evidence.stdioProof.length,
    },
  };
}
