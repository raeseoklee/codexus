import { resolve } from "node:path";
import { readMemoryEntries, searchMemoryEntries } from "../../evolution/memory.ts";
import { flagBool, flagString, type ParsedArgs } from "../args.ts";

export async function memoryCommand(args: ParsedArgs): Promise<void> {
  const subcommand = args.positionals[0] ?? "search";
  if (subcommand !== "search") {
    throw new Error(`unsupported_memory_command:${subcommand}`);
  }
  const query = args.positionals.slice(1).join(" ").trim();
  if (!query) throw new Error("missing_memory_query");
  const cwd = resolve(flagString(args.flags, "cwd") ?? process.cwd());
  const limitFlag = flagString(args.flags, "limit");
  const limit = limitFlag ? Number(limitFlag) : 5;
  if (!Number.isInteger(limit) || limit <= 0) throw new Error("invalid_memory_limit");
  const entries = await readMemoryEntries(cwd);
  const matches = searchMemoryEntries(entries, query, limit);
  if (flagBool(args.flags, "json")) {
    console.log(JSON.stringify({ query, matches }, null, 2));
    return;
  }
  for (const entry of matches) {
    console.log(`${entry.id} [${entry.kind}] ${entry.text}`);
  }
}
