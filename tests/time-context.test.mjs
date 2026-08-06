import assert from "node:assert/strict";
import test from "node:test";
import { localDayPart, userLocalTimeContext } from "../server/time-context.mjs";

test("local clock divides the day into useful conversation periods", () => {
  assert.equal(localDayPart(new Date(2026, 6, 14, 2, 0)), "overnight");
  assert.equal(localDayPart(new Date(2026, 6, 14, 8, 0)), "morning");
  assert.equal(localDayPart(new Date(2026, 6, 14, 14, 0)), "afternoon");
  assert.equal(localDayPart(new Date(2026, 6, 14, 19, 0)), "evening");
  assert.equal(localDayPart(new Date(2026, 6, 14, 22, 0)), "late evening");
});

test("morning context explicitly prevents casual bedtime mismatches", () => {
  const context = userLocalTimeContext(new Date(2026, 6, 14, 8, 0));
  assert.equal(context.dayPart, "morning");
  assert.match(context.prompt, /USER LOCAL TIME:/);
  assert.match(context.prompt, /heading to bed/);
  assert.match(context.prompt, /unusual schedule/);
});
