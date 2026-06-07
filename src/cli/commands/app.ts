import { resolve } from "node:path";
import {
  appInstanceLogs,
  appInstanceStatus,
  listAppInstanceObservations,
  listAppInstanceProfiles,
  probeAppInstanceHttpObservation,
  recordAppInstanceLogObservation,
  recordAppInstanceMetricObservation,
  recordAppInstanceObservation,
  startAppInstance,
  stopAppInstance,
} from "../../app-instance/launcher.ts";
import { flagBool, flagString, type ParsedArgs } from "../args.ts";

export async function appCommand(args: ParsedArgs): Promise<void> {
  const area = args.positionals[0];
  if (area !== "instance") throw new Error(`unsupported_app_command:${area ?? "missing"}`);
  const action = args.positionals[1] ?? "status";
  const json = flagBool(args.flags, "json");
  const cwd = resolve(flagString(args.flags, "cwd") ?? process.cwd());
  const descriptorPath = flagString(args.flags, "descriptor");

  if (action === "profile") {
    const subaction = args.positionals[2];
    if (subaction !== "list") throw new Error(`unsupported_app_instance_command:profile-${subaction ?? "missing"}`);
    const result = await listAppInstanceProfiles(cwd, { descriptorPath });
    if (json) {
      console.log(JSON.stringify(result, null, 2));
      process.exitCode = result.descriptor.valid ? 0 : 1;
      return;
    }
    console.log(`app instance profiles: ${result.profiles.length}`);
    process.exitCode = result.descriptor.valid ? 0 : 1;
    return;
  }

  if (action === "status") {
    const result = await appInstanceStatus(cwd, {
      instanceId: flagString(args.flags, "instance-id"),
      worktree: flagString(args.flags, "worktree"),
    });
    if (json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    console.log(`app instances: ${result.instances.length}`);
    return;
  }

  if (action === "logs") {
    const result = await appInstanceLogs(cwd, {
      instanceId: flagString(args.flags, "instance-id"),
      tail: flagString(args.flags, "tail"),
    });
    if (json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    console.log(`app instance logs: ${result.instanceId}`);
    return;
  }

  if (action === "evidence") {
    const subaction = args.positionals[2];
    if (subaction === "record") {
      const result = await recordAppInstanceObservation(cwd, {
        instanceId: flagString(args.flags, "instance-id"),
        kind: flagString(args.flags, "kind"),
        source: flagString(args.flags, "source"),
        status: flagString(args.flags, "status"),
        url: flagString(args.flags, "url"),
        evidencePath: flagString(args.flags, "evidence-path"),
        summary: flagString(args.flags, "summary"),
      });
      if (json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      console.log(`app instance evidence recorded: ${result.observation.observationId}`);
      return;
    }
    if (subaction === "list") {
      const result = await listAppInstanceObservations(cwd, {
        instanceId: flagString(args.flags, "instance-id"),
      });
      if (json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      console.log(`app instance evidence: ${result.observations.length}`);
      return;
    }
    if (subaction === "probe") {
      const result = await probeAppInstanceHttpObservation(cwd, {
        instanceId: flagString(args.flags, "instance-id"),
        url: flagString(args.flags, "url"),
        timeoutMs: flagString(args.flags, "timeout-ms"),
      });
      if (json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      console.log(`app instance evidence probe: ${result.probe.status}`);
      return;
    }
    if (subaction === "logs") {
      const result = await recordAppInstanceLogObservation(cwd, {
        instanceId: flagString(args.flags, "instance-id"),
        tail: flagString(args.flags, "tail"),
      });
      if (json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      console.log(`app instance evidence logs: ${result.logSnapshot.status}`);
      return;
    }
    if (subaction === "metrics") {
      const result = await recordAppInstanceMetricObservation(cwd, {
        instanceId: flagString(args.flags, "instance-id"),
      });
      if (json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      console.log(`app instance evidence metrics: ${result.metricSnapshot.status}`);
      return;
    }
    throw new Error(`unsupported_app_instance_command:evidence-${subaction ?? "missing"}`);
  }

  if (action === "start") {
    const result = await startAppInstance(cwd, {
      descriptorPath,
      profile: flagString(args.flags, "profile"),
      worktree: flagString(args.flags, "worktree"),
      port: flagString(args.flags, "port"),
      dryRun: flagBool(args.flags, "dry-run"),
    });
    if (json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    console.log(`app instance start ${result.mode}: ${result.status}`);
    return;
  }

  if (action === "stop") {
    const result = await stopAppInstance(cwd, {
      instanceId: flagString(args.flags, "instance-id"),
    });
    if (json) {
      console.log(JSON.stringify(result, null, 2));
      process.exitCode = result.status === "unavailable" ? 1 : 0;
      return;
    }
    console.log(`app instance stop: ${result.status}`);
    process.exitCode = result.status === "unavailable" ? 1 : 0;
    return;
  }

  throw new Error(`unsupported_app_instance_command:${action}`);
}
