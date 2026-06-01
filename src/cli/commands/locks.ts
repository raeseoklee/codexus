import { resolve } from "node:path";
import { clearLock, inspectLock, listLocks } from "../../util/lock.ts";
import { flagBool, flagString, type ParsedArgs } from "../args.ts";

export async function locksCommand(args: ParsedArgs): Promise<void> {
  const subcommand = args.positionals[0] ?? "list";
  const cwd = resolve(flagString(args.flags, "cwd") ?? process.cwd());
  const json = flagBool(args.flags, "json");

  if (subcommand === "list") {
    const locks = await listLocks(cwd);
    if (json) {
      console.log(JSON.stringify({ schemaVersion: 1, stability: "stable" as const, locks }, null, 2));
      return;
    }
    for (const lock of locks) console.log(`${lock.name}: ${lock.stale ? "stale" : "active"}`);
    return;
  }

  if (subcommand === "inspect") {
    const name = args.positionals[1];
    if (!name) throw new Error("missing_lock_name");
    const lock = await inspectLock(cwd, name);
    if (json) {
      console.log(JSON.stringify({ schemaVersion: 1, stability: "stable" as const, lock }, null, 2));
      return;
    }
    console.log(`${lock.name}: ${lock.exists ? (lock.stale ? "stale" : "active") : "missing"}`);
    return;
  }

  if (subcommand === "clear") {
    const name = args.positionals[1];
    if (!name) throw new Error("missing_lock_name");
    const lock = await clearLock(cwd, name, { staleOnly: flagBool(args.flags, "stale-only") });
    if (json) {
      console.log(JSON.stringify({ schemaVersion: 1, stability: "stable" as const, lock }, null, 2));
      return;
    }
    console.log(`${name}: cleared`);
    return;
  }

  throw new Error(`unsupported_locks_command:${subcommand}`);
}
