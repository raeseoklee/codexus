import { resolve } from "node:path";
import { assertMaxPositionals, flagBool, flagString, type ParsedArgs } from "../args.ts";
import { installOverlay, loadOrCreateSessionState, overlayStatus, sessionPaths, type OverlayProfile, type OverlayScope } from "../../session/state.ts";
import { disableNotifyHookConfig, installNotifyHookConfig, inspectNotifyHookConfig } from "../../session/hook-config.ts";

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
  const enableNotifyHook = flagBool(args.flags, "enable-notify-hook");
  const disableNotifyHook = flagBool(args.flags, "disable-notify-hook");
  const alwaysOn = flagBool(args.flags, "always-on");
  if (enableNotifyHook && disableNotifyHook) throw new Error("conflicting_notify_hook_flags");
  if (alwaysOn && disableNotifyHook) throw new Error("conflicting_always_on_disable_notify_hook");
  const overlayProfile: OverlayProfile = alwaysOn ? "always-on" : "default";
  const overlay = disableNotifyHook
    ? { ...(await overlayStatus(cwd, scope)), changed: false }
    : await installOverlay(cwd, scope, overlayProfile);
  const notifyHook = enableNotifyHook
    ? await installNotifyHookConfig(cwd)
    : disableNotifyHook
      ? await disableNotifyHookConfig(cwd)
      : await inspectNotifyHookConfig(cwd);
  const state = await loadOrCreateSessionState(cwd);
  const result = {
    schemaVersion: 1,
    setup: "codex-session",
    scope,
    alwaysOn,
    overlay,
    notifyHook,
    statePath: sessionPaths(cwd).state,
    state,
  };

  if (json) {
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = (enableNotifyHook || disableNotifyHook) && notifyHook.status === "blocked" ? 1 : 0;
    return;
  }
  console.log(`Codexus Codex-session setup complete (${scope})`);
  console.log(`Overlay: ${overlay.path}`);
  console.log(`Notify hook: ${notifyHook.status}`);
  console.log(`Session state: ${result.statePath}`);
  process.exitCode = (enableNotifyHook || disableNotifyHook) && notifyHook.status === "blocked" ? 1 : 0;
}
