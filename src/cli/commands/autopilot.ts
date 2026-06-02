import { resolve } from "node:path";
import {
  approveAutopilotContract,
  buildAutopilotPlan,
  scopeCheckAutopilotContract,
  validateAutopilotContractFile,
} from "../../autopilot/contract.ts";
import { DEFAULT_AUTONOMY_PRESET, listAutonomyPresets } from "../../control/autonomy.ts";
import {
  checkConvergenceAgreement,
  readRelaySession,
  recordRelayRound,
  recordStageGateEvidence,
} from "../../relay/artifacts.ts";
import { assertAllowedFlags, assertMaxPositionals, flagArray, flagBool, flagString, type ParsedArgs } from "../args.ts";

export async function autopilotCommand(args: ParsedArgs): Promise<void> {
  const namespace = args.positionals[0];
  if (namespace === "presets") {
    const action = args.positionals[1] ?? "list";
    if (action !== "list") throw new Error(`unsupported_autopilot_command:presets ${action}`);
    assertMaxPositionals(args, 2);
    assertAllowedFlags(args, ["json"]);
    const json = flagBool(args.flags, "json");
    const result = {
      schemaVersion: 1 as const,
      stability: "experimental" as const,
      command: "autopilot presets list" as const,
      defaultPreset: DEFAULT_AUTONOMY_PRESET,
      presets: listAutonomyPresets(),
    };
    if (json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    console.log(`Autopilot presets: ${result.presets.length}`);
    console.log(`Default: ${result.defaultPreset}`);
    return;
  }
  if (namespace === "plan") {
    assertMaxPositionals(args, 1);
    assertAllowedFlags(args, ["json", "cwd", "from", "preset"]);
    const cwd = resolve(flagString(args.flags, "cwd") ?? process.cwd());
    const json = flagBool(args.flags, "json");
    const result = await buildAutopilotPlan(cwd, flagArray(args.flags, "from"), (flagString(args.flags, "preset") ?? DEFAULT_AUTONOMY_PRESET) as never);
    if (json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    console.log(`Autopilot draft: ${result.artifactPath}`);
    console.log(`Preset: ${result.contract.autonomyPreset}`);
    console.log(`Scope: ${result.contract.autopilot.scope.allow.join(", ")}`);
    console.log(`Verification: ${result.contract.autopilot.verificationRequired.join(", ") || "none inferred"}`);
    return;
  }

  if (namespace === "contract") {
    const action = args.positionals[1] ?? "validate";
    const contractPath = args.positionals[2] ?? flagString(args.flags, "file");
    const cwd = resolve(flagString(args.flags, "cwd") ?? process.cwd());
    const json = flagBool(args.flags, "json");
    if (action === "validate") {
      assertMaxPositionals(args, 3);
      assertAllowedFlags(args, ["json", "cwd", "file"]);
      if (!contractPath) throw new Error("missing_autopilot_contract_file");
      const result = await validateAutopilotContractFile(cwd, contractPath);
      if (json) {
        console.log(JSON.stringify(result, null, 2));
        process.exitCode = result.ok ? 0 : 1;
        return;
      }
      console.log(`Autopilot contract: ${result.ok ? "OK" : "FAIL"}`);
      console.log(`Status: ${result.validation.contract?.status ?? "invalid"}`);
      console.log(`File: ${result.file}`);
      process.exitCode = result.ok ? 0 : 1;
      return;
    }
    if (action === "approve") {
      assertMaxPositionals(args, 3);
      assertAllowedFlags(args, ["json", "cwd", "file", "approved-by", "output"]);
      if (!contractPath) throw new Error("missing_autopilot_contract_file");
      const approvedBy = flagString(args.flags, "approved-by");
      if (!approvedBy) throw new Error("missing_autopilot_approved_by");
      const result = await approveAutopilotContract(cwd, contractPath, approvedBy, flagString(args.flags, "output"));
      if (json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      console.log(`Approved contract: ${result.artifactPath}`);
      console.log(`Approval record: ${result.approvalRecordPath}`);
      return;
    }
    if (action === "scope-check") {
      assertMaxPositionals(args, 3);
      assertAllowedFlags(args, ["json", "cwd", "file", "gate", "since"]);
      if (!contractPath) throw new Error("missing_autopilot_contract_file");
      const result = await scopeCheckAutopilotContract(cwd, contractPath, {
        gate: flagBool(args.flags, "gate"),
        since: flagString(args.flags, "since"),
      });
      if (json) {
        console.log(JSON.stringify(result, null, 2));
        process.exitCode = result.gate.exitCode;
        return;
      }
      console.log(`Autopilot scope: ${result.contractStatus}`);
      console.log(`Gate: ${result.gate.status}`);
      console.log(`Evidence gaps: ${result.evidenceGaps.length}`);
      console.log(`Blocking unknowns: ${result.blockingUnknowns.length}`);
      process.exitCode = result.gate.exitCode;
      return;
    }
    throw new Error(`unsupported_autopilot_contract_command:${action}`);
  }

  if (namespace === "run") throw new Error("autopilot_run_deferred");
  if (namespace !== "relay") throw new Error(`unsupported_autopilot_command:${namespace ?? "missing"}`);
  const action = args.positionals[1] ?? "status";
  const cwd = resolve(flagString(args.flags, "cwd") ?? process.cwd());
  const json = flagBool(args.flags, "json");

  if (action === "record") {
    assertMaxPositionals(args, 2);
    assertAllowedFlags(args, [
      "json",
      "cwd",
      "stage",
      "artifact",
      "author-file",
      "review-file",
      "author-engine",
      "review-engine",
      "contract-subject-hash",
    ]);
    const result = await recordRelayRound(cwd, {
      stage: flagString(args.flags, "stage"),
      artifact: flagString(args.flags, "artifact"),
      authorFile: flagString(args.flags, "author-file"),
      reviewFile: flagString(args.flags, "review-file"),
      authorEngine: flagString(args.flags, "author-engine"),
      reviewEngine: flagString(args.flags, "review-engine"),
      contractSubjectHash: flagString(args.flags, "contract-subject-hash"),
    });
    if (json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    console.log(`Relay: recorded ${result.relayId}`);
    console.log(`Stage: ${result.stage}`);
    console.log(`Artifact: ${result.artifactPath}`);
    return;
  }

  if (action === "stage-gate") {
    assertMaxPositionals(args, 2);
    assertAllowedFlags(args, [
      "json",
      "cwd",
      "stage",
      "scope",
      "role",
      "artifact",
      "artifact-hash",
      "acceptance-criteria",
      "acceptance-criterion",
      "verification-matrix",
      "residual-high-findings",
      "verification-status",
    ]);
    const result = await recordStageGateEvidence(cwd, {
      stage: flagString(args.flags, "stage"),
      scope: flagString(args.flags, "scope"),
      role: flagString(args.flags, "role"),
      artifact: flagString(args.flags, "artifact"),
      artifactHash: flagString(args.flags, "artifact-hash"),
      acceptanceCriteriaFile: flagString(args.flags, "acceptance-criteria"),
      acceptanceCriteria: flagArray(args.flags, "acceptance-criterion"),
      verificationMatrixFile: flagString(args.flags, "verification-matrix"),
      residualHighFindings: flagString(args.flags, "residual-high-findings"),
      verificationStatus: flagString(args.flags, "verification-status"),
    });
    if (json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    console.log(`Stage gate: ${result.evidenceId}`);
    console.log(`Scope: ${result.scope}`);
    console.log(`Artifact: ${result.artifactPath}`);
    return;
  }

  if (action === "check-agreement") {
    assertMaxPositionals(args, 2);
    assertAllowedFlags(args, [
      "json",
      "cwd",
      "agreement",
      "stage-gate",
      "required-role",
      "verification-status",
      "gate",
    ]);
    const result = await checkConvergenceAgreement(cwd, {
      agreement: flagString(args.flags, "agreement"),
      stageGate: flagString(args.flags, "stage-gate"),
      requiredRoles: flagArray(args.flags, "required-role"),
      verificationStatus: flagString(args.flags, "verification-status"),
      gate: flagBool(args.flags, "gate"),
    });
    if (json) {
      console.log(JSON.stringify(result, null, 2));
      process.exitCode = result.gate.exitCode;
      return;
    }
    console.log(`Relay convergence: ${result.relay.convergence}`);
    console.log(`Can complete: ${result.relay.canComplete ? "yes" : "no"}`);
    console.log(`Gate: ${result.gate.status}`);
    console.log(`Evidence gaps: ${result.evidenceGaps.length}`);
    console.log(`Blocking unknowns: ${result.blockingUnknowns.length}`);
    process.exitCode = result.gate.exitCode;
    return;
  }

  if (action === "status") {
    const relayId = args.positionals[2];
    if (!relayId) throw new Error("missing_relay_id");
    assertMaxPositionals(args, 3);
    assertAllowedFlags(args, ["json", "cwd"]);
    const result = {
      schemaVersion: 1 as const,
      stability: "experimental" as const,
      command: "relay status" as const,
      relay: await readRelaySession(cwd, relayId),
    };
    if (json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    console.log(`Relay: ${result.relay.relayId}`);
    console.log(`Stage: ${result.relay.stage}`);
    console.log(`Status: ${result.relay.status}`);
    return;
  }

  throw new Error(`unsupported_autopilot_relay_command:${action}`);
}
