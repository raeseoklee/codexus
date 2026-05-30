import type {
  LastVerifiedFingerprint,
  SessionCheckpointRecord,
  SessionVerificationRecord,
} from "./state.ts";
import { fingerprintsEqual, type WorkspaceFingerprint } from "./workspace-fingerprint.ts";

export type EvidenceVerification = "passed" | "failed" | "missing" | "stale";

export interface EvidenceModelInput {
  checkpoints: SessionCheckpointRecord[];
  verifications: SessionVerificationRecord[];
  lastVerifiedFingerprint: LastVerifiedFingerprint | null;
}

export interface EvidenceModel {
  verification: EvidenceVerification;
  evidenceFresh: boolean;
  dirtySinceLastVerify: boolean;
  recommendedVerify: string | null;
  lastCheckpoint: { id: string; label: string; createdAt: string; path: string } | null;
  lastVerification: { id: string; status: string; createdAt: string; path: string } | null;
  currentFingerprint: WorkspaceFingerprint;
  fingerprintReliable: boolean;
}

// Derive the always-on evidence model purely from saved verification state and a
// freshly computed workspace fingerprint. This never trusts agent self-report:
// dirty/fresh come from fingerprint comparison, and degraded fingerprints can
// never report evidenceFresh:true.
export function deriveEvidenceModel(
  state: EvidenceModelInput,
  currentFingerprint: WorkspaceFingerprint,
  recommendedVerify: string | null,
): EvidenceModel {
  const lastCheckpointRecord = state.checkpoints.at(-1) ?? null;
  const lastVerificationRecord = state.verifications.at(-1) ?? null;
  const lastVerifiedFingerprint = state.lastVerifiedFingerprint;

  const lastCheckpoint = lastCheckpointRecord
    ? { id: lastCheckpointRecord.id, label: lastCheckpointRecord.label, createdAt: lastCheckpointRecord.createdAt, path: lastCheckpointRecord.path }
    : null;
  const lastVerification = lastVerificationRecord
    ? { id: lastVerificationRecord.id, status: lastVerificationRecord.status, createdAt: lastVerificationRecord.createdAt, path: lastVerificationRecord.path }
    : null;

  if (!lastVerifiedFingerprint) {
    return {
      verification: "missing",
      evidenceFresh: false,
      dirtySinceLastVerify: true,
      recommendedVerify,
      lastCheckpoint,
      lastVerification,
      currentFingerprint,
      fingerprintReliable: !currentFingerprint.degraded,
    };
  }

  const storedFingerprint = lastVerifiedFingerprint.fingerprint;
  const fingerprintReliable = !currentFingerprint.degraded && !storedFingerprint.degraded;
  const dirtySinceLastVerify = !fingerprintsEqual(currentFingerprint, storedFingerprint);
  const lastStatusPassed = lastVerifiedFingerprint.status === "passed";
  const evidenceFresh = lastStatusPassed && !dirtySinceLastVerify && fingerprintReliable;

  let verification: EvidenceVerification;
  if (evidenceFresh) {
    verification = "passed";
  } else if (!fingerprintReliable || dirtySinceLastVerify) {
    verification = "stale";
  } else {
    verification = "failed";
  }

  return {
    verification,
    evidenceFresh,
    dirtySinceLastVerify,
    recommendedVerify,
    lastCheckpoint,
    lastVerification,
    currentFingerprint,
    fingerprintReliable,
  };
}
