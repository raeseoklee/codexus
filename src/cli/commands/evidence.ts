import { resolve } from "node:path";
import { buildEvidenceCheck, buildEvidenceStatus, exportEvidenceBundle } from "../../evidence/status.ts";
import { assertAllowedFlags, assertMaxPositionals, flagBool, flagString, type ParsedArgs } from "../args.ts";

function parseTimeoutMs(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error("invalid_timeout_ms");
  return parsed;
}

export async function evidenceCommand(args: ParsedArgs): Promise<void> {
  const subcommand = args.positionals[0] ?? "status";
  if (subcommand !== "status" && subcommand !== "check" && subcommand !== "export") throw new Error(`unsupported_evidence_command:${subcommand}`);
  assertMaxPositionals(args, 1);
  const allowedFlags = subcommand === "status"
    ? ["cwd", "json"]
    : subcommand === "check"
      ? ["cwd", "json", "gate", "timeout-ms"]
      : ["cwd", "json", "gate", "target", "timeout-ms"];
  assertAllowedFlags(args, allowedFlags);
  const cwd = resolve(flagString(args.flags, "cwd") ?? process.cwd());
  const timeoutMs = parseTimeoutMs(flagString(args.flags, "timeout-ms"));
  const target = flagString(args.flags, "target");
  if (subcommand === "export" && !target) throw new Error("missing_evidence_export_target");
  const result = subcommand === "status"
    ? await buildEvidenceStatus(cwd)
    : subcommand === "check"
      ? await buildEvidenceCheck(cwd, { gate: flagBool(args.flags, "gate"), timeoutMs })
      : await exportEvidenceBundle(cwd, {
        target: target ?? "",
        gate: flagBool(args.flags, "gate"),
        timeoutMs,
      });
  if (flagBool(args.flags, "json")) {
    console.log(JSON.stringify(result, null, 2));
    if ("gate" in result) process.exitCode = result.gate.exitCode;
    return;
  }
  if (result.command === "evidence status") {
    console.log(`Evidence: ${result.status}`);
    console.log(`App observations: ${result.surfaces.appInstances.observations.total}`);
    console.log(`Wiki: ${result.surfaces.wiki.status}`);
    console.log(`LSP: ${result.surfaces.lsp.status}`);
    return;
  }
  if (result.command === "evidence check") {
    console.log(`Evidence check: ${result.status}`);
    console.log(`Gate: ${result.gate.status}`);
    console.log(`Evidence gaps: ${result.counts.evidenceGaps}`);
    console.log(`Blocking unknowns: ${result.counts.blockingUnknowns}`);
    process.exitCode = result.gate.exitCode;
    return;
  }
  console.log(`Evidence export: ${result.bundle.status}`);
  console.log(`Target: ${result.target}`);
  console.log(`Gate: ${result.gate.status}`);
  process.exitCode = result.gate.exitCode;
}
