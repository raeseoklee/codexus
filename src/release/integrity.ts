import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

export type ReleaseIntegrityStatus = "pass" | "fail" | "unknown";

export interface ReleaseIntegrityEvidenceGap {
  kind:
    | "package_json_missing"
    | "install_script_missing"
    | "installer_default_channel_not_stable"
    | "installer_expected_version_guard_missing"
    | "release_workflow_missing"
    | "release_workflow_not_trusted_publishing"
    | "release_workflow_post_publish_dist_tag_mutation"
    | "release_workflow_unpinned_action"
    | "release_workflow_installer_asset_missing"
    | "release_evidence_missing"
    | "github_release_not_latest"
    | "github_release_asset_mismatch"
    | "npm_latest_mismatch"
    | "npm_next_older_than_latest";
  gate: true;
  evidence: string | null;
  policy: string;
  recommendation: string;
  files?: string[];
  actions?: string[];
}

export interface ReleaseIntegrityDerivableFact {
  kind:
    | "package_version"
    | "installer_sha256"
    | "installer_default_stable_channel"
    | "installer_expected_version_guard"
    | "release_workflow_trusted_publishing"
    | "release_workflow_trusted_publish_no_dist_tag_mutation"
    | "release_workflow_pinned_actions"
    | "release_workflow_installer_asset"
    | "release_evidence_present"
    | "github_release_latest"
    | "github_release_asset_matches_local"
    | "npm_latest_matches_version"
    | "npm_next_not_older_than_latest";
  gate: boolean;
  evidence: string;
  files?: string[];
  actions?: string[];
}

export interface ReleaseIntegrityUnknown {
  kind:
    | "package_json_unreadable"
    | "repository_unresolved"
    | "github_release_not_checked"
    | "npm_dist_tags_not_checked"
    | "github_release_unavailable"
    | "github_release_asset_unavailable"
    | "npm_dist_tags_unavailable";
  gate: boolean;
  evidence: string | null;
  recommendation: string;
}

export interface ReleaseIntegrityGate {
  enabled: boolean;
  status: "not_requested" | "passed" | "failed" | "blocked";
  exitCode: 0 | 1;
  reason: string;
}

export interface ReleaseIntegrityReport {
  schemaVersion: 1;
  stability: "stable" | "experimental";
  cwd: string;
  packageRoot: string | null;
  packageJsonPath: string | null;
  version: string | null;
  repository: string | null;
  live: boolean;
  releaseIntegrity: {
    status: ReleaseIntegrityStatus;
    installScript: {
      path: string | null;
      sha256: string | null;
      defaultChannel: "stable" | "next" | "custom" | "missing" | "unknown";
      expectedVersionGuard: boolean;
    };
    workflow: {
      path: string | null;
      trustedPublishing: boolean;
      stableDistTagSync: boolean;
      trustedPublishSkipsDistTagMutation: boolean;
      installerAssetAttached: boolean;
      pinnedActions: string[];
      unpinnedActions: string[];
    };
    githubRelease: {
      checked: boolean;
      tagName: string | null;
      isLatest: boolean | null;
      url: string | null;
      installScriptSha256: string | null;
    };
    npm: {
      checked: boolean;
      latest: string | null;
      next: string | null;
    };
  };
  evidenceGaps: ReleaseIntegrityEvidenceGap[];
  derivableFacts: ReleaseIntegrityDerivableFact[];
  heuristicClaims: [];
  blockingUnknowns: ReleaseIntegrityUnknown[];
  informationalUnknowns: ReleaseIntegrityUnknown[];
  gate: ReleaseIntegrityGate;
}

interface ReleaseIntegrityOptions {
  gate?: boolean;
  live?: boolean;
  version?: string;
  commandRunner?: CommandRunner;
}

interface CommandResult {
  status: number | null;
  stdout: string;
  stderr: string;
  error?: Error;
}

type CommandRunner = (command: string, args: string[], options?: { cwd?: string }) => CommandResult;

function defaultCommandRunner(command: string, args: string[], options: { cwd?: string } = {}): CommandResult {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: "utf8",
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function findPackageRoot(cwd: string): string | null {
  let current = resolve(cwd);
  while (true) {
    if (existsSync(join(current, "package.json"))) return current;
    const next = dirname(current);
    if (next === current) return null;
    current = next;
  }
}

function readJsonFile(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function parseRepository(packageJson: Record<string, unknown>): string | null {
  const rawRepository = packageJson.repository;
  const url =
    typeof rawRepository === "string"
      ? rawRepository
      : isRecord(rawRepository) && typeof rawRepository.url === "string"
        ? rawRepository.url
        : null;
  if (!url) return null;
  const match = /github\.com[:/]([^/\s]+\/[^/\s.#]+)(?:\.git)?/.exec(url);
  return match?.[1] ?? null;
}

function appendGap(
  gaps: ReleaseIntegrityEvidenceGap[],
  gap: Omit<ReleaseIntegrityEvidenceGap, "gate">
): void {
  gaps.push({ ...gap, gate: true });
}

function appendFact(
  facts: ReleaseIntegrityDerivableFact[],
  fact: Omit<ReleaseIntegrityDerivableFact, "gate"> & { gate?: boolean }
): void {
  facts.push({ ...fact, gate: fact.gate ?? false });
}

function actionRefs(workflowText: string): { pinned: string[]; unpinned: string[] } {
  const pinned: string[] = [];
  const unpinned: string[] = [];
  const matcher = /^\s*-?\s*uses:\s*([^@\s]+)@([^\s#]+)/gm;
  let match: RegExpExecArray | null;
  while ((match = matcher.exec(workflowText))) {
    const full = `${match[1]}@${match[2]}`;
    if (/^[a-f0-9]{40}$/i.test(match[2])) pinned.push(full);
    else unpinned.push(full);
  }
  return { pinned, unpinned };
}

function detectInstallDefaultChannel(installText: string): "stable" | "next" | "custom" | "unknown" {
  if (/CODEXUS_NPM_SPEC:-codexus}/.test(installText)) return "stable";
  if (/CODEXUS_NPM_SPEC:-codexus@next}/.test(installText)) return "next";
  if (/CODEXUS_NPM_SPEC:-[^}]+}/.test(installText)) return "custom";
  return "unknown";
}

function trustedPublishingConfigured(workflowText: string): boolean {
  return (
    /id-token:\s*write/.test(workflowText) &&
    /registry-url:\s*"https:\/\/registry\.npmjs\.org"/.test(workflowText) &&
    /npm run publish:stable/.test(workflowText) &&
    /Prerelease tags must publish via workflow_dispatch mode=next/.test(workflowText)
  );
}

function stableDistTagSyncConfigured(workflowText: string): boolean {
  return stablePublishCommands(workflowText)
    .filter((command) => !command.includes("--dry-run"))
    .some((command) => !command.includes("--no-dist-tag-sync"));
}

function trustedPublishSkipsDistTagMutationConfigured(workflowText: string): boolean {
  const stableCommands = stablePublishCommands(workflowText).filter((command) => !command.includes("--dry-run"));
  return stableCommands.length > 0 && stableCommands.every((command) => command.includes("--no-dist-tag-sync"));
}

function stablePublishCommands(workflowText: string): string[] {
  return Array.from(workflowText.matchAll(/run:\s*(npm run publish:stable[^\n]*)/g), (match) => match[1]?.trim() ?? "");
}

function installerAssetAttached(workflowText: string): boolean {
  return (
    /gh release edit "\$GITHUB_REF_NAME"[\s\S]*?--latest[\s\S]*?gh release upload "\$GITHUB_REF_NAME" install\.sh --clobber/.test(
      workflowText
    ) &&
    /gh release create "\$GITHUB_REF_NAME" install\.sh[\s\S]*?--verify-tag[\s\S]*?--latest/.test(workflowText)
  );
}

function makeGate(
  requested: boolean,
  status: ReleaseIntegrityStatus,
  evidenceGaps: ReleaseIntegrityEvidenceGap[],
  blockingUnknowns: ReleaseIntegrityUnknown[]
): ReleaseIntegrityGate {
  if (!requested) {
    return {
      enabled: false,
      status: "not_requested",
      exitCode: 0,
      reason: `release_integrity_${status}`,
    };
  }
  if (evidenceGaps.length > 0) {
    return {
      enabled: true,
      status: "failed",
      exitCode: 1,
      reason: `evidence_gaps:${evidenceGaps.length}`,
    };
  }
  if (blockingUnknowns.length > 0) {
    return {
      enabled: true,
      status: "blocked",
      exitCode: 1,
      reason: `blocking_unknowns:${blockingUnknowns.length}`,
    };
  }
  return {
    enabled: true,
    status: "passed",
    exitCode: 0,
    reason: "release_integrity_passed",
  };
}

function commandError(result: CommandResult): string {
  if (result.error) return result.error.message;
  return (result.stderr || result.stdout || `exit ${result.status ?? "unknown"}`).trim();
}

function compareSemverish(left: string, right: string): number {
  const parse = (value: string) => {
    const [core, prereleaseRaw = ""] = value.split("-", 2);
    const [major = 0, minor = 0, patch = 0] = core.split(".").map((part) => Number.parseInt(part, 10));
    const prerelease = prereleaseRaw
      ? prereleaseRaw.split(".").map((part) => (/^\d+$/.test(part) ? Number.parseInt(part, 10) : part))
      : [];
    return { major, minor, patch, prerelease };
  };
  const a = parse(left);
  const b = parse(right);
  for (const key of ["major", "minor", "patch"] as const) {
    const delta = a[key] - b[key];
    if (delta !== 0) return delta;
  }
  if (a.prerelease.length === 0 && b.prerelease.length === 0) return 0;
  if (a.prerelease.length === 0) return 1;
  if (b.prerelease.length === 0) return -1;
  const length = Math.max(a.prerelease.length, b.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const leftPart = a.prerelease[index];
    const rightPart = b.prerelease[index];
    if (leftPart === undefined) return -1;
    if (rightPart === undefined) return 1;
    if (leftPart === rightPart) continue;
    if (typeof leftPart === "number" && typeof rightPart === "number") return leftPart - rightPart;
    if (typeof leftPart === "number") return -1;
    if (typeof rightPart === "number") return 1;
    return leftPart.localeCompare(rightPart);
  }
  return 0;
}

function readJsonCommand(command: string, args: string[], runner: CommandRunner, cwd: string): { value: unknown; error: string | null } {
  const result = runner(command, args, { cwd });
  if (result.status !== 0) return { value: null, error: commandError(result) };
  try {
    return { value: JSON.parse(result.stdout) as unknown, error: null };
  } catch (error) {
    return { value: null, error: error instanceof Error ? error.message : String(error) };
  }
}

export function buildReleaseIntegrityReport(
  cwd: string,
  options: ReleaseIntegrityOptions = {}
): ReleaseIntegrityReport {
  const root = findPackageRoot(cwd);
  const evidenceGaps: ReleaseIntegrityEvidenceGap[] = [];
  const derivableFacts: ReleaseIntegrityDerivableFact[] = [];
  const blockingUnknowns: ReleaseIntegrityUnknown[] = [];
  const informationalUnknowns: ReleaseIntegrityUnknown[] = [];
  const live = options.live === true;
  const runner = options.commandRunner ?? defaultCommandRunner;

  let packageJson: Record<string, unknown> | null = null;
  let packageJsonPath: string | null = null;
  let version: string | null = options.version ?? null;
  let repository: string | null = null;
  let installScriptPath: string | null = null;
  let installScriptHash: string | null = null;
  let defaultChannel: ReleaseIntegrityReport["releaseIntegrity"]["installScript"]["defaultChannel"] = "missing";
  let expectedVersionGuard = false;
  let workflowPath: string | null = null;
  let trustedPublishing = false;
  let stableDistTagSync = false;
  let trustedPublishSkipsDistTagMutation = false;
  let releaseInstallerAsset = false;
  let pinnedActions: string[] = [];
  let unpinnedActions: string[] = [];
  let githubRelease: ReleaseIntegrityReport["releaseIntegrity"]["githubRelease"] = {
    checked: false,
    tagName: null,
    isLatest: null,
    url: null,
    installScriptSha256: null,
  };
  let npm: ReleaseIntegrityReport["releaseIntegrity"]["npm"] = {
    checked: false,
    latest: null,
    next: null,
  };

  if (!root) {
    appendGap(evidenceGaps, {
      kind: "package_json_missing",
      evidence: null,
      policy: "release integrity requires a package root",
      recommendation: "Run this command from a Codexus source checkout.",
    });
  } else {
    packageJsonPath = join(root, "package.json");
    try {
      const parsed = readJsonFile(packageJsonPath);
      if (isRecord(parsed)) {
        packageJson = parsed;
        if (!version && typeof packageJson.version === "string") version = packageJson.version;
        repository = parseRepository(packageJson);
      }
    } catch (error) {
      blockingUnknowns.push({
        kind: "package_json_unreadable",
        gate: true,
        evidence: error instanceof Error ? error.message : String(error),
        recommendation: "Fix package.json before checking release integrity.",
      });
    }

    if (version) {
      appendFact(derivableFacts, {
        kind: "package_version",
        evidence: `package version ${version}`,
      });
    }
    if (!repository) {
      blockingUnknowns.push({
        kind: "repository_unresolved",
        gate: live,
        evidence: packageJsonPath,
        recommendation: "Set package.json repository to a GitHub repository before live release checks.",
      });
    }

    installScriptPath = join(root, "install.sh");
    if (!existsSync(installScriptPath)) {
      installScriptPath = null;
      appendGap(evidenceGaps, {
        kind: "install_script_missing",
        evidence: "install.sh",
        policy: "curl installer must exist at repository root",
        recommendation: "Restore install.sh before publishing a stable release.",
        files: ["install.sh"],
      });
    } else {
      const installText = readFileSync(installScriptPath, "utf8");
      installScriptHash = sha256File(installScriptPath);
      defaultChannel = detectInstallDefaultChannel(installText);
      expectedVersionGuard = /CODEXUS_EXPECTED_VERSION/.test(installText);
      appendFact(derivableFacts, {
        kind: "installer_sha256",
        evidence: `install.sh sha256 ${installScriptHash}`,
        files: ["install.sh"],
      });
      if (defaultChannel === "stable") {
        appendFact(derivableFacts, {
          kind: "installer_default_stable_channel",
          evidence: "CODEXUS_NPM_SPEC defaults to codexus",
          files: ["install.sh"],
        });
      } else {
        appendGap(evidenceGaps, {
          kind: "installer_default_channel_not_stable",
          evidence: `default channel: ${defaultChannel}`,
          policy: "public installer must default to the stable npm channel",
          recommendation: "Default CODEXUS_NPM_SPEC to codexus, not a prerelease channel.",
          files: ["install.sh"],
        });
      }
      if (expectedVersionGuard) {
        appendFact(derivableFacts, {
          kind: "installer_expected_version_guard",
          evidence: "CODEXUS_EXPECTED_VERSION is supported",
          files: ["install.sh"],
        });
      } else {
        appendGap(evidenceGaps, {
          kind: "installer_expected_version_guard_missing",
          evidence: "CODEXUS_EXPECTED_VERSION not found",
          policy: "release smoke must be able to assert an expected installed version",
          recommendation: "Keep CODEXUS_EXPECTED_VERSION support in install.sh.",
          files: ["install.sh"],
        });
      }
    }

    workflowPath = join(root, ".github/workflows/release.yml");
    if (!existsSync(workflowPath)) {
      workflowPath = null;
      appendGap(evidenceGaps, {
        kind: "release_workflow_missing",
        evidence: ".github/workflows/release.yml",
        policy: "stable release must be performed by the trusted-publishing workflow",
        recommendation: "Restore the release workflow before stable publishing.",
        files: [".github/workflows/release.yml"],
      });
    } else {
      const workflowText = readFileSync(workflowPath, "utf8");
      trustedPublishing = trustedPublishingConfigured(workflowText);
      stableDistTagSync = stableDistTagSyncConfigured(workflowText);
      trustedPublishSkipsDistTagMutation = trustedPublishSkipsDistTagMutationConfigured(workflowText);
      releaseInstallerAsset = installerAssetAttached(workflowText);
      const refs = actionRefs(workflowText);
      pinnedActions = refs.pinned;
      unpinnedActions = refs.unpinned;
      if (trustedPublishing) {
        appendFact(derivableFacts, {
          kind: "release_workflow_trusted_publishing",
          evidence: "release workflow uses OIDC trusted publishing with stable tag guard",
          files: [".github/workflows/release.yml"],
        });
      } else {
        appendGap(evidenceGaps, {
          kind: "release_workflow_not_trusted_publishing",
          evidence: ".github/workflows/release.yml",
          policy: "stable publish must use GitHub Actions trusted publishing",
          recommendation: "Keep id-token: write, npm registry-url, stable publish helper, and prerelease tag rejection wired.",
          files: [".github/workflows/release.yml"],
        });
      }
      if (trustedPublishSkipsDistTagMutation) {
        appendFact(derivableFacts, {
          kind: "release_workflow_trusted_publish_no_dist_tag_mutation",
          evidence: "trusted-publishing stable publish avoids post-publish npm dist-tag mutation",
          files: [".github/workflows/release.yml"],
        });
      } else {
        appendGap(evidenceGaps, {
          kind: "release_workflow_post_publish_dist_tag_mutation",
          evidence: ".github/workflows/release.yml",
          policy: "trusted-publishing workflow must not require post-publish npm dist-tag add permission",
          recommendation: "Run trusted-publishing stable publish through npm run publish:stable -- --no-dist-tag-sync; enforce next >= latest in live release sign-off.",
          files: [".github/workflows/release.yml"],
        });
      }
      if (unpinnedActions.length === 0 && pinnedActions.length > 0) {
        appendFact(derivableFacts, {
          kind: "release_workflow_pinned_actions",
          evidence: `pinned actions: ${pinnedActions.join(", ")}`,
          files: [".github/workflows/release.yml"],
          actions: pinnedActions,
        });
      } else {
        appendGap(evidenceGaps, {
          kind: "release_workflow_unpinned_action",
          evidence: unpinnedActions.length > 0 ? unpinnedActions.join(", ") : "no pinned actions found",
          policy: "publish workflows with OIDC must pin GitHub Actions by commit SHA",
          recommendation: "Pin every action used by the publish workflow to a commit SHA.",
          files: [".github/workflows/release.yml"],
          actions: unpinnedActions,
        });
      }
      if (releaseInstallerAsset) {
        appendFact(derivableFacts, {
          kind: "release_workflow_installer_asset",
          evidence: "GitHub Release job uploads install.sh and marks the release latest",
          files: [".github/workflows/release.yml", "install.sh"],
        });
      } else {
        appendGap(evidenceGaps, {
          kind: "release_workflow_installer_asset_missing",
          evidence: ".github/workflows/release.yml",
          policy: "stable GitHub Releases must attach install.sh",
          recommendation: "Ensure gh release create/upload includes install.sh and --latest.",
          files: [".github/workflows/release.yml", "install.sh"],
        });
      }
    }

    if (version) {
      const evidenceFiles = [`docs/release-evidence/${version}.md`, `docs/ko/release-evidence/${version}.md`];
      const missing = evidenceFiles.filter((file) => !existsSync(join(root, file)));
      if (missing.length === 0) {
        appendFact(derivableFacts, {
          kind: "release_evidence_present",
          evidence: `release evidence exists for ${version}`,
          files: evidenceFiles,
        });
      } else {
        appendGap(evidenceGaps, {
          kind: "release_evidence_missing",
          evidence: missing.join(", "),
          policy: "stable releases need redacted release evidence in English and Korean docs",
          recommendation: "Add release evidence summaries before pushing the stable tag.",
          files: missing,
        });
      }
    }
  }

  if (!live) {
    informationalUnknowns.push({
      kind: "github_release_not_checked",
      gate: false,
      evidence: null,
      recommendation: "Run with --live after publishing to verify GitHub latest and installer asset identity.",
    });
    informationalUnknowns.push({
      kind: "npm_dist_tags_not_checked",
      gate: false,
      evidence: null,
      recommendation: "Run with --live after publishing to verify npm latest matches the checked version.",
    });
  }

  if (live && root && version && repository) {
    const tagName = `v${version}`;
    const view = readJsonCommand("gh", ["release", "view", tagName, "--repo", repository, "--json", "tagName,url"], runner, root);
    const latestView = readJsonCommand("gh", ["release", "view", "--repo", repository, "--json", "tagName,url"], runner, root);
    if (view.error || !isRecord(view.value)) {
      blockingUnknowns.push({
        kind: "github_release_unavailable",
        gate: true,
        evidence: view.error,
        recommendation: "Authenticate gh and ensure the GitHub Release exists before live release sign-off.",
      });
    } else if (latestView.error || !isRecord(latestView.value)) {
      blockingUnknowns.push({
        kind: "github_release_unavailable",
        gate: true,
        evidence: latestView.error,
        recommendation: "Authenticate gh and ensure the GitHub latest release can be resolved before live release sign-off.",
      });
    } else {
      const viewedTagName = typeof view.value.tagName === "string" ? view.value.tagName : null;
      const latestTagName = typeof latestView.value.tagName === "string" ? latestView.value.tagName : null;
      githubRelease = {
        checked: true,
        tagName: viewedTagName,
        isLatest: viewedTagName === tagName && latestTagName === tagName,
        url: typeof view.value.url === "string" ? view.value.url : null,
        installScriptSha256: null,
      };
      if (githubRelease.tagName === tagName && githubRelease.isLatest === true) {
        appendFact(derivableFacts, {
          kind: "github_release_latest",
          evidence: `${repository} ${tagName} is latest`,
        });
      } else {
        appendGap(evidenceGaps, {
          kind: "github_release_not_latest",
          evidence: JSON.stringify({ tagName: githubRelease.tagName, isLatest: githubRelease.isLatest }),
          policy: "GitHub releases/latest must point at the stable npm latest version",
          recommendation: "Mark the release as latest after publishing.",
        });
      }

      const dir = mkdtempSync(join(tmpdir(), "codexus-release-"));
      try {
        const download = runner("gh", ["release", "download", tagName, "--repo", repository, "--pattern", "install.sh", "--dir", dir], {
          cwd: root,
        });
        const downloaded = join(dir, "install.sh");
        if (download.status !== 0 || !existsSync(downloaded) || !installScriptHash) {
          blockingUnknowns.push({
            kind: "github_release_asset_unavailable",
            gate: true,
            evidence: download.status !== 0 ? commandError(download) : "install.sh asset missing",
            recommendation: "Upload install.sh to the GitHub Release and rerun the live check.",
          });
        } else {
          const releaseAssetHash = sha256File(downloaded);
          githubRelease.installScriptSha256 = releaseAssetHash;
          if (releaseAssetHash === installScriptHash) {
            appendFact(derivableFacts, {
              kind: "github_release_asset_matches_local",
              evidence: `release install.sh sha256 ${releaseAssetHash}`,
              files: ["install.sh"],
            });
          } else {
            appendGap(evidenceGaps, {
              kind: "github_release_asset_mismatch",
              evidence: `release=${releaseAssetHash} local=${installScriptHash}`,
              policy: "GitHub Release installer asset must match the checked-in installer",
              recommendation: "Refresh the GitHub Release install.sh asset from this commit.",
              files: ["install.sh"],
            });
          }
        }
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }

    const tags = readJsonCommand("npm", ["view", "codexus", "dist-tags", "--json", "--prefer-online"], runner, root);
    if (tags.error || !isRecord(tags.value)) {
      blockingUnknowns.push({
        kind: "npm_dist_tags_unavailable",
        gate: true,
        evidence: tags.error,
        recommendation: "Ensure npm is reachable and the package exists before live release sign-off.",
      });
    } else {
      npm = {
        checked: true,
        latest: typeof tags.value.latest === "string" ? tags.value.latest : null,
        next: typeof tags.value.next === "string" ? tags.value.next : null,
      };
      if (npm.latest === version) {
        appendFact(derivableFacts, {
          kind: "npm_latest_matches_version",
          evidence: `npm latest is ${version}`,
        });
      } else {
        appendGap(evidenceGaps, {
          kind: "npm_latest_mismatch",
          evidence: `npm latest is ${npm.latest ?? "unknown"}, expected ${version}`,
          policy: "npm latest must match the stable release being signed off",
          recommendation: "Wait for npm propagation or fix the dist-tag before declaring release completion.",
        });
      }
      if (npm.latest && npm.next && compareSemverish(npm.next, npm.latest) >= 0) {
        appendFact(derivableFacts, {
          kind: "npm_next_not_older_than_latest",
          evidence: `npm next ${npm.next} is not older than latest ${npm.latest}`,
        });
      } else {
        appendGap(evidenceGaps, {
          kind: "npm_next_older_than_latest",
          evidence: `npm next is ${npm.next ?? "unknown"}, latest is ${npm.latest ?? "unknown"}`,
          policy: "npm next must not point at a version older than npm latest",
          recommendation: "Move next to the current stable release or a newer prerelease before declaring release completion.",
        });
      }
    }
  }

  const status: ReleaseIntegrityStatus =
    evidenceGaps.length > 0 ? "fail" : blockingUnknowns.some((item) => item.gate) ? "unknown" : "pass";
  const gate = makeGate(options.gate === true, status, evidenceGaps, blockingUnknowns.filter((item) => item.gate));

  return {
    schemaVersion: 1,
    stability: live ? "experimental" : "stable",
    cwd: resolve(cwd),
    packageRoot: root,
    packageJsonPath,
    version,
    repository,
    live,
    releaseIntegrity: {
      status,
      installScript: {
        path: installScriptPath,
        sha256: installScriptHash,
        defaultChannel,
        expectedVersionGuard,
      },
      workflow: {
        path: workflowPath,
        trustedPublishing,
        stableDistTagSync,
        trustedPublishSkipsDistTagMutation,
        installerAssetAttached: releaseInstallerAsset,
        pinnedActions,
        unpinnedActions,
      },
      githubRelease,
      npm,
    },
    evidenceGaps,
    derivableFacts,
    heuristicClaims: [],
    blockingUnknowns,
    informationalUnknowns,
    gate,
  };
}
