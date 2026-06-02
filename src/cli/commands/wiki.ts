import { resolve } from "node:path";
import { assertAllowedFlags, assertMaxPositionals, flagBool, flagString, type ParsedArgs } from "../args.ts";
import { buildWiki, buildWikiContext, buildWikiMap, checkWiki } from "../../wiki/wiki.ts";

export async function wikiCommand(args: ParsedArgs): Promise<void> {
  const subcommand = args.positionals[0] ?? "check";
  assertMaxPositionals(args, 1);
  const cwd = resolve(flagString(args.flags, "cwd") ?? process.cwd());
  const json = flagBool(args.flags, "json");

  if (subcommand === "map") {
    assertAllowedFlags(args, ["cwd", "json"]);
    const result = await buildWikiMap(cwd);
    if (json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    console.log(`Wiki map: ${result.pages.length} page candidates`);
    console.log(`Sources: ${result.candidates.filter((candidate) => candidate.exists).length}/${result.candidates.length}`);
    return;
  }

  if (subcommand === "build") {
    assertAllowedFlags(args, ["cwd", "json", "mode", "driver"]);
    const mode = (flagString(args.flags, "mode") ?? "deterministic") as "deterministic" | "advisory";
    const result = await buildWiki(cwd, mode);
    if (json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    console.log(`Wiki build: ${result.manifest.pages.length} pages`);
    console.log(`Manifest: ${result.manifestPath}`);
    return;
  }

  if (subcommand === "check") {
    assertAllowedFlags(args, ["cwd", "json", "gate"]);
    const result = await checkWiki(cwd, flagBool(args.flags, "gate"));
    if (json) {
      console.log(JSON.stringify(result, null, 2));
      process.exitCode = result.gate.exitCode;
      return;
    }
    console.log(`Wiki: ${result.wiki.status}`);
    console.log(`Pages: ${result.wiki.pageCount}`);
    console.log(`Fresh: ${result.wiki.freshCount}`);
    console.log(`Stale: ${result.wiki.staleCount}`);
    console.log(`Gate: ${result.gate.status}`);
    process.exitCode = result.gate.exitCode;
    return;
  }

  if (subcommand === "context") {
    assertAllowedFlags(args, ["cwd", "json", "topic", "budget"]);
    const topic = flagString(args.flags, "topic");
    const budgetRaw = flagString(args.flags, "budget") ?? "1200";
    const budget = Number.parseInt(budgetRaw, 10);
    const result = await buildWikiContext(cwd, topic ?? "", budget);
    if (json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    console.log(`Wiki context: ${result.selectedPages.length} pages, ${result.tokenEstimate} tokens`);
    return;
  }

  throw new Error(`unsupported_wiki_command:${subcommand}`);
}
