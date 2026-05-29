import test from "node:test";
import assert from "node:assert/strict";
import { createRunId } from "../src/util/id.ts";

test("createRunId is sortable and filesystem safe", () => {
  const id = createRunId(new Date("2026-05-29T08:15:00.000Z"));
  assert.match(id, /^run_20260529_081500_[0-9a-f]{6}$/);
});
