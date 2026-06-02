import { resolve } from "node:path";
import { assertAllowedFlags, assertMaxPositionals, flagBool, flagString, type ParsedArgs } from "../args.ts";
import { readSessionStateWithMigration, refreshSessionState } from "../../session/state.ts";
import { buildPolicyCatalogCheck } from "../../control/policy-catalog.ts";

export async function policyCommand(args: ParsedArgs): Promise<void> {
  const namespace = args.positionals[0] ?? "catalog";
  const action = args.positionals[1] ?? "check";
  if (namespace !== "catalog" || action !== "check") {
    throw new Error(`unsupported_policy_command:${[namespace, action].filter(Boolean).join(" ")}`);
  }
  assertMaxPositionals(args, 2);
  assertAllowedFlags(args, ["json", "cwd", "since", "scope"]);
  const cwd = resolve(flagString(args.flags, "cwd") ?? process.cwd());
  const json = flagBool(args.flags, "json");
  const stateRead = await readSessionStateWithMigration(cwd);
  const state = stateRead.state ? await refreshSessionState(cwd, stateRead.state) : null;
  const result = buildPolicyCatalogCheck(cwd, state, {
    since: flagString(args.flags, "since"),
    scope: flagString(args.flags, "scope"),
  });
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`Policy catalog: ${result.policyCatalog.status}`);
  console.log(`Observed: ${result.policyCatalog.counts.observed}`);
  console.log(`Advisory: ${result.policyCatalog.counts.advisory}`);
  console.log(`Unavailable: ${result.policyCatalog.counts.unavailable}`);
}
