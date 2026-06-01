import { resolve } from "node:path";
import { buildRepoGraph, checkRepoGraph } from "../../repo-graph/graph.ts";
import { buildRepoKnowledgeReport } from "../../repo-knowledge/check.ts";
import { assertAllowedFlags, assertMaxPositionals, flagArray, flagBool, flagString, type ParsedArgs } from "../args.ts";

export async function repoCommand(args: ParsedArgs): Promise<void> {
  const subcommand = args.positionals[0] ?? "check";
  if (subcommand === "graph") {
    const action = args.positionals[1] ?? "check";
    if (action !== "build" && action !== "check") throw new Error(`unsupported_repo_graph_command:${action}`);
    assertMaxPositionals(args, 2);
    assertAllowedFlags(args, ["json", "cwd", "gate", "graph-provider", "scope", "graph"]);
    const cwd = resolve(flagString(args.flags, "cwd") ?? process.cwd());
    const json = flagBool(args.flags, "json");
    if (action === "build") {
      const result = await buildRepoGraph({
        cwd,
        graphProvider: flagString(args.flags, "graph-provider"),
        scope: flagArray(args.flags, "scope"),
      });
      if (json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      console.log(`Repo graph: built ${result.graphId}`);
      console.log(`Provider: ${result.provider.id}`);
      console.log(`Scope: ${result.scope.patterns.join(",")}`);
      console.log(`Nodes: ${result.nodes.length}`);
      console.log(`Edges: ${result.edges.length}`);
      console.log(`Artifact: ${result.artifactPath}`);
      return;
    }
    const graph = flagString(args.flags, "graph");
    if (!graph) throw new Error("missing_repo_graph");
    const result = await checkRepoGraph({ cwd, graph, gate: flagBool(args.flags, "gate") });
    if (json) {
      console.log(JSON.stringify(result, null, 2));
      process.exitCode = result.gate.exitCode;
      return;
    }
    console.log(`Repo graph: ${result.repoGraph.status}`);
    console.log(`Graph: ${result.graphId}`);
    console.log(`Freshness: ${result.repoGraph.freshness}`);
    console.log(`Nodes: ${result.repoGraph.nodeCount}`);
    console.log(`Edges: ${result.repoGraph.edgeCount}`);
    console.log(`Gate: ${result.gate.status}`);
    console.log(`Evidence gaps: ${result.evidenceGaps.length}`);
    console.log(`Blocking unknowns: ${result.blockingUnknowns.length}`);
    console.log(`Informational unknowns: ${result.informationalUnknowns.length}`);
    process.exitCode = result.gate.exitCode;
    return;
  }
  if (subcommand !== "check" && subcommand !== "map") throw new Error(`unsupported_repo_command:${subcommand}`);
  assertMaxPositionals(args, 1);
  assertAllowedFlags(args, ["json", "cwd", "gate"]);
  const cwd = resolve(flagString(args.flags, "cwd") ?? process.cwd());
  const json = flagBool(args.flags, "json");
  const report = buildRepoKnowledgeReport(cwd, {
    gate: subcommand === "check" ? flagBool(args.flags, "gate") : false,
  });
  if (json) {
    console.log(JSON.stringify({ ...report, command: subcommand }, null, 2));
    process.exitCode = subcommand === "check" ? report.gate.exitCode : 0;
    return;
  }
  console.log(`Repo knowledge: ${report.repoKnowledge.status}`);
  console.log(`Command: ${subcommand}`);
  console.log(`Scan: ${report.scanMode} accuracy=${report.scanAccuracy}`);
  console.log(`Documents: ${report.repoKnowledge.documentCount}`);
  console.log(`Index links: ${report.repoKnowledge.indexLinkCount}`);
  console.log(`Gate: ${subcommand === "check" ? report.gate.status : "not_requested"}`);
  console.log(`Evidence gaps: ${report.evidenceGaps.length}`);
  console.log(`Blocking unknowns: ${report.blockingUnknowns.length}`);
  console.log(`Informational unknowns: ${report.informationalUnknowns.length}`);
  console.log(`Derivable facts: ${report.derivableFacts.length}`);
  console.log(`Heuristic claims: ${report.heuristicClaims.length}`);
  process.exitCode = subcommand === "check" ? report.gate.exitCode : 0;
}
