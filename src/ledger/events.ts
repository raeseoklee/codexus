import { appendFile } from "node:fs/promises";
import { dirname } from "node:path";
import { ensureDir } from "../util/fs.ts";
import { createEventId } from "../util/id.ts";
import type { HarnessEvent, HarnessPhase, JsonValue } from "../types.ts";

export interface AppendEventInput {
  runId: string;
  phase: HarnessPhase;
  type: string;
  source: string;
  payload?: JsonValue;
}

export async function appendEvent(path: string, input: AppendEventInput): Promise<HarnessEvent> {
  await ensureDir(dirname(path));
  const event: HarnessEvent = {
    schemaVersion: 1,
    eventId: createEventId(),
    runId: input.runId,
    timestamp: new Date().toISOString(),
    phase: input.phase,
    type: input.type,
    source: input.source,
    payload: input.payload ?? {},
  };
  await appendFile(path, `${JSON.stringify(event)}\n`);
  return event;
}
