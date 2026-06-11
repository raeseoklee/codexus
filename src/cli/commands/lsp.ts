import { resolve } from "node:path";
import { buildLspAdapterReport, buildLspCheckReport, buildLspStatusReport } from "../../lsp/project.ts";
import { assertAllowedFlags, assertMaxPositionals, flagBool, flagString, type ParsedArgs } from "../args.ts";

function parseTimeoutMs(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error("invalid_timeout_ms");
  return parsed;
}

export async function lspCommand(args: ParsedArgs): Promise<void> {
  const subcommand = args.positionals[0] ?? "status";
  if (subcommand !== "status" && subcommand !== "check" && subcommand !== "adapters") throw new Error(`unsupported_lsp_command:${subcommand}`);
  assertMaxPositionals(args, 1);
  assertAllowedFlags(args, subcommand === "check" ? ["json", "cwd", "gate", "timeout-ms"] : ["json", "cwd"]);
  const cwd = resolve(flagString(args.flags, "cwd") ?? process.cwd());
  const json = flagBool(args.flags, "json");
  if (subcommand === "adapters") {
    const result = buildLspAdapterReport(cwd);
    if (json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    console.log(`LSP adapters: ${result.summary.implemented}/${result.summary.total} implemented`);
    console.log(`Protocol server lifecycle: ${result.summary.protocolServerImplemented ? "implemented" : "unavailable"}`);
    return;
  }
  const result = subcommand === "status"
    ? buildLspStatusReport(cwd)
    : buildLspCheckReport(cwd, {
      gate: flagBool(args.flags, "gate"),
      timeoutMs: parseTimeoutMs(flagString(args.flags, "timeout-ms")),
    });

  if (json) {
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.gate.exitCode;
    return;
  }

  console.log(`LSP: ${result.lsp.status}`);
  console.log(`Project: ${result.projectRoot ?? "not_detected"}`);
  console.log(`Providers: ${result.lsp.providerCount}`);
  console.log(`Executable diagnostics: ${result.lsp.executableProviderCount}`);
  console.log(`Starts language server: ${result.autoApply.startsLanguageServer ? "yes" : "no"}`);
  if (result.result) {
    console.log(`Diagnostic command: ${result.providers.find((provider) => provider.id === result.result?.providerId)?.diagnostics.displayCommand ?? result.result.providerId}`);
    console.log(`Diagnostic status: ${result.result.status}`);
  }
  console.log(`Gate: ${result.gate.status}`);
  process.exitCode = result.gate.exitCode;
}
