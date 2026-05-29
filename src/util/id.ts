import { randomBytes } from "node:crypto";

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function createRunId(now = new Date()): string {
  const stamp = [
    now.getUTCFullYear(),
    pad(now.getUTCMonth() + 1),
    pad(now.getUTCDate()),
    "_",
    pad(now.getUTCHours()),
    pad(now.getUTCMinutes()),
    pad(now.getUTCSeconds()),
  ].join("");
  return `run_${stamp}_${randomBytes(3).toString("hex")}`;
}

export function createEventId(): string {
  return `evt_${Date.now().toString(36)}_${randomBytes(4).toString("hex")}`;
}
