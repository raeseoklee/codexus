import { resolve } from "node:path";
import { assertAllowedFlags, assertMaxPositionals, flagBool, flagString, type ParsedArgs } from "../args.ts";
import { approveWikiContext, buildWiki, buildWikiAdvisory, buildWikiContext, buildWikiInjectionPolicy, buildWikiMap, checkWiki, exportWiki } from "../../wiki/wiki.ts";

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
    const result = mode === "advisory"
      ? await buildWikiAdvisory(cwd, flagString(args.flags, "driver") ?? "local-deterministic")
      : await buildWiki(cwd, mode);
    if (json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    if (result.mode === "advisory") {
      console.log(`Wiki advisory build: ${result.sourcePages.length} source pages`);
      console.log(`Advisory: ${result.advisoryManifestPath}`);
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
    assertAllowedFlags(args, ["cwd", "json", "topic", "budget", "approve", "approved-by", "fresh-only", "gate"]);
    const topic = flagString(args.flags, "topic");
    const budgetRaw = flagString(args.flags, "budget") ?? "1200";
    const budget = Number.parseInt(budgetRaw, 10);
    const contextOptions = {
      freshOnly: flagBool(args.flags, "fresh-only"),
      gate: flagBool(args.flags, "gate"),
    };
    const result = flagBool(args.flags, "approve")
      ? await approveWikiContext(cwd, topic ?? "", budget, flagString(args.flags, "approved-by"), contextOptions)
      : await buildWikiContext(cwd, topic ?? "", budget, contextOptions);
    if (json) {
      console.log(JSON.stringify(result, null, 2));
      process.exitCode = result.command === "wiki context" ? result.gate.exitCode : result.context.gate.exitCode;
      return;
    }
    if (result.command === "wiki context approve") {
      console.log(`Wiki context approved: ${result.approval.approvalId}`);
      console.log(`Context: ${result.approval.paths.markdown}`);
      process.exitCode = result.context.gate.exitCode;
      return;
    }
    console.log(`Wiki context: ${result.selectedPages.length} pages, ${result.tokenEstimate} tokens`);
    console.log(`Gate: ${result.gate.status}`);
    process.exitCode = result.gate.exitCode;
    return;
  }

  if (subcommand === "injection-policy") {
    assertAllowedFlags(args, ["cwd", "json", "gate"]);
    const result = await buildWikiInjectionPolicy(cwd, flagBool(args.flags, "gate"));
    if (json) {
      console.log(JSON.stringify(result, null, 2));
      process.exitCode = result.gate.exitCode;
      return;
    }
    console.log(`Wiki injection policy: ${result.policy.status}`);
    console.log(`Automatic injection: ${result.policy.automaticInjection.status}`);
    console.log(`Gate: ${result.gate.status}`);
    process.exitCode = result.gate.exitCode;
    return;
  }

  if (subcommand === "export") {
    assertAllowedFlags(args, ["cwd", "json", "target"]);
    const target = flagString(args.flags, "target");
    if (!target) throw new Error("missing_wiki_export_target");
    const result = await exportWiki(cwd, target);
    if (json) {
      console.log(JSON.stringify(result, null, 2));
      process.exitCode = result.gate.exitCode;
      return;
    }
    console.log(`Wiki export: ${result.export.status}`);
    console.log(`Target: ${result.target}`);
    console.log(`Pages: ${result.pageCount}`);
    console.log(`Gate: ${result.gate.status}`);
    process.exitCode = result.gate.exitCode;
    return;
  }

  throw new Error(`unsupported_wiki_command:${subcommand}`);
}
