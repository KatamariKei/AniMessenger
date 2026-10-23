import test from "node:test";
import assert from "node:assert/strict";
import { journeyActivityFingerprint, updateJourneyActivity } from "../shared/journey-activity.mjs";

test("journey activity persists until viewed and establishes a quiet initial baseline", () => {
  const baseline = updateJourneyActivity(null, "first", false);
  assert.equal(baseline.unread, false);
  const changed = updateJourneyActivity(baseline, "second", false);
  assert.equal(changed.unread, true);
  assert.equal(updateJourneyActivity(JSON.parse(JSON.stringify(changed)), "second", false).unread, true);
  assert.equal(updateJourneyActivity(changed, "first", false).unread, true);
  assert.equal(updateJourneyActivity(changed, "second", true).unread, false);
});

test("discovery artwork and scan completion change activity, not polling progress", () => {
  const journey = { discoveries: { history: { status: "checking", checkedBatches: 1, totalBatches: 10 }, revealed: [{ id: "one", artwork: { status: "generating" } }] } };
  const before = journeyActivityFingerprint(journey);
  journey.discoveries.history.checkedBatches = 2;
  assert.equal(journeyActivityFingerprint(journey), before);
  journey.discoveries.history.status = "complete";
  assert.notEqual(journeyActivityFingerprint(journey), before);
  const completed = journeyActivityFingerprint(journey);
  journey.discoveries.revealed[0].artwork.status = "complete";
  assert.notEqual(journeyActivityFingerprint(journey), completed);
});

test("starting and advancing research, scans and regeneration do not flag new results", () => {
  const journey = { discoveries: { status: "ready", leadAvailability: { prepared: 3 },
    history: { status: "complete", confirmed: 1, completedAt: "first" },
    revealed: [{ id: "one", artwork: { status: "complete", imageUrl: "old.png" } }] } };
  const baseline = journeyActivityFingerprint(journey);
  journey.discoveries.status = "queued";
  journey.discoveries.history.status = "checking";
  journey.discoveries.history.completedAt = undefined;
  journey.discoveries.revealed[0].artwork.status = "generating";
  const running = journeyActivityFingerprint(journey, baseline);
  assert.equal(running, baseline);
  journey.discoveries.history.status = "complete";
  journey.discoveries.history.completedAt = "second";
  assert.notEqual(journeyActivityFingerprint(journey, running), baseline);
  journey.discoveries.history.status = "checking";
  journey.discoveries.history.completedAt = undefined;
  journey.discoveries.revealed[0].artwork.status = "error";
  assert.notEqual(journeyActivityFingerprint(journey, running), baseline);
});
