import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

export type ReleasePolicyStatus = "pass" | "fail";

export interface ReleasePolicyEvidenceGap {
  kind: "release_policy_doc_missing" | "release_policy_korean_doc_missing";
  gate: true;
  evidence: string | null;
  policy: string;
  recommendation: string;
  files: string[];
}

export interface ReleasePolicyDerivableFact {
  kind:
    | "release_policy_doc_present"
    | "release_policy_korean_doc_present"
    | "thematic_release_bundle_required"
    | "hotfix_exception_allowed"
    | "stable_contract_boundary_preserved"
    | "release_evidence_required"
    | "small_commits_large_releases";
  gate: false;
  evidence: string;
  files?: string[];
}

export interface ReleasePolicyGate {
  enabled: boolean;
  status: "not_requested" | "passed" | "failed";
  exitCode: 0 | 1;
  reason: string;
}

export interface ReleasePolicyReport {
  schemaVersion: 1;
  stability: "experimental";
  command: "release policy";
  cwd: string;
  packageRoot: string;
  releasePolicy: {
    status: ReleasePolicyStatus;
    englishPath: string;
    koreanPath: string;
    cadence: "small_commits_large_releases";
    defaultBundle: {
      minimumSubstantiveSlices: 2;
      preferredSubstantiveSlices: [3, 5];
      requiresTheme: true;
      requiresChangelogNarrative: true;
    };
    exceptions: {
      hotfix: true;
      security: true;
      brokenInstallOrPublish: true;
      CIOrReleaseBlocker: true;
    };
    versioning: {
      patch: "stable-contract-additive-or-experimental-surface";
      minor: "stable-contract-promotion-or-breaking-change";
      prerelease: "opt-in-next-channel-only";
    };
  };
  evidenceGaps: ReleasePolicyEvidenceGap[];
  derivableFacts: ReleasePolicyDerivableFact[];
  heuristicClaims: [];
  blockingUnknowns: [];
  informationalUnknowns: [];
  gate: ReleasePolicyGate;
}

function appendGap(gaps: ReleasePolicyEvidenceGap[], gap: Omit<ReleasePolicyEvidenceGap, "gate">): void {
  gaps.push({ ...gap, gate: true });
}

function appendFact(facts: ReleasePolicyDerivableFact[], fact: Omit<ReleasePolicyDerivableFact, "gate">): void {
  facts.push({ ...fact, gate: false });
}

export function buildReleasePolicyReport(cwd: string, options: { gate?: boolean } = {}): ReleasePolicyReport {
  const packageRoot = resolve(cwd);
  const englishPath = join(packageRoot, "docs", "release-policy.md");
  const koreanPath = join(packageRoot, "docs", "ko", "release-policy.md");
  const evidenceGaps: ReleasePolicyEvidenceGap[] = [];
  const derivableFacts: ReleasePolicyDerivableFact[] = [];

  if (existsSync(englishPath)) {
    appendFact(derivableFacts, {
      kind: "release_policy_doc_present",
      evidence: "docs/release-policy.md exists",
      files: ["docs/release-policy.md"],
    });
  } else {
    appendGap(evidenceGaps, {
      kind: "release_policy_doc_missing",
      evidence: null,
      policy: "release cadence policy must be documented in the English docs",
      recommendation: "Add docs/release-policy.md before cutting stable releases.",
      files: ["docs/release-policy.md"],
    });
  }

  if (existsSync(koreanPath)) {
    appendFact(derivableFacts, {
      kind: "release_policy_korean_doc_present",
      evidence: "docs/ko/release-policy.md exists",
      files: ["docs/ko/release-policy.md"],
    });
  } else {
    appendGap(evidenceGaps, {
      kind: "release_policy_korean_doc_missing",
      evidence: null,
      policy: "release cadence policy must have a Korean translation",
      recommendation: "Add docs/ko/release-policy.md before cutting stable releases.",
      files: ["docs/ko/release-policy.md"],
    });
  }

  appendFact(derivableFacts, {
    kind: "small_commits_large_releases",
    evidence: "policy cadence is small commits, larger thematic releases",
  });
  appendFact(derivableFacts, {
    kind: "thematic_release_bundle_required",
    evidence: "normal releases require one coherent theme and at least two substantive slices, preferably three to five",
  });
  appendFact(derivableFacts, {
    kind: "hotfix_exception_allowed",
    evidence: "security, broken install/publish, CI/release blockers, and regression fixes may cut a small patch",
  });
  appendFact(derivableFacts, {
    kind: "stable_contract_boundary_preserved",
    evidence: "patch releases may add stable fields only additively; breaking or promoted stable contract changes wait for the next minor release",
  });
  appendFact(derivableFacts, {
    kind: "release_evidence_required",
    evidence: "stable releases require English and Korean release evidence before tag publish and post-publish evidence after publish",
  });

  const status: ReleasePolicyStatus = evidenceGaps.length > 0 ? "fail" : "pass";
  const gateEnabled = options.gate === true;
  const gate: ReleasePolicyGate = gateEnabled
    ? {
      enabled: true,
      status: status === "pass" ? "passed" : "failed",
      exitCode: status === "pass" ? 0 : 1,
      reason: status === "pass" ? "release_policy_present" : `evidence_gaps:${evidenceGaps.length}`,
    }
    : {
      enabled: false,
      status: "not_requested",
      exitCode: 0,
      reason: "pass --gate to make releasePolicy.status affect the process exit code",
    };

  return {
    schemaVersion: 1,
    stability: "experimental",
    command: "release policy",
    cwd: packageRoot,
    packageRoot,
    releasePolicy: {
      status,
      englishPath,
      koreanPath,
      cadence: "small_commits_large_releases",
      defaultBundle: {
        minimumSubstantiveSlices: 2,
        preferredSubstantiveSlices: [3, 5],
        requiresTheme: true,
        requiresChangelogNarrative: true,
      },
      exceptions: {
        hotfix: true,
        security: true,
        brokenInstallOrPublish: true,
        CIOrReleaseBlocker: true,
      },
      versioning: {
        patch: "stable-contract-additive-or-experimental-surface",
        minor: "stable-contract-promotion-or-breaking-change",
        prerelease: "opt-in-next-channel-only",
      },
    },
    evidenceGaps,
    derivableFacts,
    heuristicClaims: [],
    blockingUnknowns: [],
    informationalUnknowns: [],
    gate,
  };
}
