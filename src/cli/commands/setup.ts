import { resolve } from "node:path";
import { assertMaxPositionals, flagBool, flagString, type ParsedArgs } from "../args.ts";
import { installOverlay, loadOrCreateSessionState, sessionPaths, type OverlayScope } from "../../session/state.ts";

function parseScope(value: string | undefined): OverlayScope {
  if (value === undefined || value === "project") return "project";
  if (value === "user") return "user";
  throw new Error(`invalid_session_setup_scope:${value}`);
}

export async function setupCommand(args: ParsedArgs): Promise<void> {
  const target = args.positionals[0] ?? "missing";
  if (target !== "codex-session") throw new Error(`unsupported_setup_command:${target}`);
  assertMaxPositionals(args, 1);

  const cwd = resolve(flagString(args.flags, "cwd") ?? process.cwd());
  const json = flagBool(args.flags, "json");
  const scope = parseScope(flagString(args.flags, "scope"));
  const overlay = await installOverlay(cwd, scope);
  const state = await loadOrCreateSessionState(cwd);
  const result = {
    schemaVersion: 1,
    setup: "codex-session",
    scope,
    overlay,
    statePath: sessionPaths(cwd).state,
    state,
  };

  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`Codexus Codex-session setup complete (${scope})`);
  console.log(`Overlay: ${overlay.path}`);
  console.log(`Session state: ${result.statePath}`);
}
