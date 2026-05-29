import { resolve } from "node:path";
import { appendMemoryEntry, curateMemoryEntries, listMemoryEntries, pruneMemoryEntries, readMemoryIndex, readMemoryEntries, searchMemoryEntries, type MemoryEntry } from "../../evolution/memory.ts";
import { flagBool, flagString, type ParsedArgs } from "../args.ts";

export async function memoryCommand(args: ParsedArgs): Promise<void> {
  const subcommand = args.positionals[0] ?? "search";
  const cwd = resolve(flagString(args.flags, "cwd") ?? process.cwd());
  const limitFlag = flagString(args.flags, "limit");
  const limit = limitFlag ? Number(limitFlag) : 5;
  if (!Number.isInteger(limit) || limit <= 0) throw new Error("invalid_memory_limit");

  if (subcommand === "search") {
    const query = args.positionals.slice(1).join(" ").trim();
    if (!query) throw new Error("missing_memory_query");
    const entries = await readMemoryEntries(cwd);
    const matches = searchMemoryEntries(entries, query, limit);
    if (flagBool(args.flags, "json")) {
      console.log(JSON.stringify({ query, matches }, null, 2));
      return;
    }
    for (const entry of matches) {
      console.log(`${entry.id} [${entry.kind}] ${entry.text}`);
    }
    return;
  }

  if (subcommand === "add") {
    const kind = flagString(args.flags, "kind") as MemoryEntry["kind"] | undefined;
    if (!kind) throw new Error("missing_memory_kind");
    const text = args.positionals.slice(1).join(" ").trim();
    if (!text) throw new Error("missing_memory_text");
    const tags = (flagString(args.flags, "tags") ?? "").split(",").map((tag) => tag.trim()).filter(Boolean);
    const entry = await appendMemoryEntry(cwd, {
      id: flagString(args.flags, "id") ?? `mem_manual_${Date.now()}`,
      sourceRunId: flagString(args.flags, "source-run-id") ?? "manual",
      kind,
      text,
      tags,
      confidence: (flagString(args.flags, "confidence") as MemoryEntry["confidence"] | undefined) ?? "medium",
    });
    if (flagBool(args.flags, "json")) {
      console.log(JSON.stringify({ entry }, null, 2));
      return;
    }
    console.log(`${entry.id} [${entry.kind}] ${entry.text}`);
    return;
  }

  if (subcommand === "list") {
    const entries = await listMemoryEntries(cwd, limit);
    if (flagBool(args.flags, "json")) {
      console.log(JSON.stringify({ entries }, null, 2));
      return;
    }
    for (const entry of entries) console.log(`${entry.id} [${entry.kind}] ${entry.text}`);
    return;
  }

  if (subcommand === "review") {
    const index = await readMemoryIndex(cwd);
    if (flagBool(args.flags, "json")) {
      console.log(JSON.stringify({ index }, null, 2));
      return;
    }
    console.log(`memory entries: ${index.total}`);
    return;
  }

  if (subcommand === "curate") {
    const staleDaysFlag = flagString(args.flags, "stale-days");
    const staleDays = staleDaysFlag ? Number(staleDaysFlag) : 60;
    if (!Number.isInteger(staleDays) || staleDays <= 0) throw new Error("invalid_memory_prune_window");
    const curation = await curateMemoryEntries(cwd, { staleDays });
    if (flagBool(args.flags, "json")) {
      console.log(JSON.stringify({ curation }, null, 2));
      return;
    }
    console.log(`memory entries: ${curation.total}`);
    console.log(`duplicates: ${curation.duplicateCandidates.length}`);
    console.log(`stale low-confidence: ${curation.staleLowConfidence.length}`);
    return;
  }

  if (subcommand === "prune") {
    const beforeFlag = flagString(args.flags, "before");
    const daysFlag = flagString(args.flags, "older-than-days");
    let before: Date | null = null;
    if (beforeFlag) before = new Date(beforeFlag);
    if (daysFlag) {
      const days = Number(daysFlag);
      if (!Number.isInteger(days) || days <= 0) throw new Error("invalid_memory_prune_window");
      before = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    }
    if (!before || Number.isNaN(before.getTime())) throw new Error("invalid_memory_prune_window");
    const result = await pruneMemoryEntries(cwd, before, flagBool(args.flags, "dry-run"));
    if (flagBool(args.flags, "json")) {
      console.log(JSON.stringify({ prune: result }, null, 2));
      return;
    }
    console.log(`removed ${result.removed}; remaining ${result.remaining}`);
    return;
  }

  throw new Error(`unsupported_memory_command:${subcommand}`);
}
