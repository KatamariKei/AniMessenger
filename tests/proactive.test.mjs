import assert from "node:assert/strict";
import test from "node:test";
import {
  canProactivelyReachOut,
  globalProactiveNextAt,
  hasEligibleFollowUp,
  isWithinProactiveDeliveryWindow,
  normalizeProactiveState,
  proactiveCadenceRange,
  proactiveCandidateScore,
  proactiveGlobalGapRange,
  proactiveImageChance,
  recordProactiveAttempt,
  scheduleNextProactive,
  shouldAttachProactiveImage,
  updatePendingFollowUp,
} from "../server/proactive.mjs";

test("proactive outreach begins at trusted and accelerates with closeness without rapid-fire messages", () => {
  assert.equal(proactiveCadenceRange(40), null);
  assert.deepEqual(proactiveCadenceRange(50), [180, 420]);
  assert.deepEqual(proactiveCadenceRange(80), [120, 330]);
  assert.deepEqual(proactiveCadenceRange(95), [90, 270]);
  assert.deepEqual(proactiveCadenceRange(95, "lively"), [59, 176]);
  assert.deepEqual(proactiveGlobalGapRange("normal"), [120, 240]);
});

test("proactive delivery respects active hours, including a window across midnight", () => {
  assert.equal(isWithinProactiveDeliveryWindow(new Date(2026, 6, 14, 7, 59), "08:00", "23:00"), false);
  assert.equal(isWithinProactiveDeliveryWindow(new Date(2026, 6, 14, 8, 0), "08:00", "23:00"), true);
  assert.equal(isWithinProactiveDeliveryWindow(new Date(2026, 6, 14, 23, 0), "08:00", "23:00"), false);
  assert.equal(isWithinProactiveDeliveryWindow(new Date(2026, 6, 14, 23, 30), "22:00", "06:00"), true);
  assert.equal(isWithinProactiveDeliveryWindow(new Date(2026, 6, 14, 12, 0), "22:00", "06:00"), false);
});

test("proactive image chances preserve the fun relationship-weighted cadence", () => {
  assert.equal(proactiveImageChance(50), 0.2);
  assert.equal(proactiveImageChance(80), 0.35);
  assert.equal(proactiveImageChance(95), 0.5);
  assert.equal(shouldAttachProactiveImage(95, true, () => 0.49), true);
  assert.equal(shouldAttachProactiveImage(95, true, () => 0.5), false);
  assert.equal(shouldAttachProactiveImage(95, false, () => 0), false);
});

test("old proactive state migrates without keeping midnight quotas", () => {
  const migrated = normalizeProactiveState({
    nextAt: "2026-07-14T18:00:00.000Z",
    dailyDate: "2026-07-14",
    dailyCount: 4,
  });
  assert.equal(migrated.version, 2);
  assert.equal(migrated.nextAt, "2026-07-14T18:00:00.000Z");
  assert.equal("dailyCount" in migrated, false);
  assert.equal("dailyDate" in migrated, false);
});

test("a due character is blocked by quiet hours, unread messages, a pending image, global unread, and global spacing", () => {
  const now = new Date(2026, 6, 14, 18, 0);
  const base = {
    profile: { name: "Example" },
    relationship: 95,
    unreadCount: 0,
    proactive: { nextAt: new Date(now.getTime() - 60_000).toISOString(), pending: false },
  };
  const context = { pace: "normal", globalUnreadCount: 0, deliveryStart: "08:00", deliveryEnd: "23:00" };
  assert.equal(canProactivelyReachOut(base, context, now), true);
  assert.equal(canProactivelyReachOut({ ...base, unreadCount: 1 }, context, now), false);
  assert.equal(canProactivelyReachOut({ ...base, proactive: { ...base.proactive, pending: true } }, context, now), false);
  assert.equal(canProactivelyReachOut(base, { ...context, globalUnreadCount: 1 }, now), false);
  assert.equal(canProactivelyReachOut(base, { ...context, globalNextAt: new Date(now.getTime() + 60_000).toISOString() }, now), false);
  assert.equal(canProactivelyReachOut(base, { ...context, deliveryStart: "20:00" }, now), false);
});

test("soft follow-ups have an earliest opportunity, can resolve, and win candidate selection", () => {
  const now = new Date("2026-07-14T18:00:00.000Z");
  const pending = updatePendingFollowUp({}, { subject: "the results of Motoko's scan", earliestMinutes: 30 }, false, now);
  const thread = { relationship: 50, proactive: pending };
  assert.equal(hasEligibleFollowUp(thread, new Date(now.getTime() + 29 * 60_000)), false);
  assert.equal(hasEligibleFollowUp(thread, new Date(now.getTime() + 30 * 60_000)), true);
  assert.ok(proactiveCandidateScore(thread, new Date(now.getTime() + 30 * 60_000)) > proactiveCandidateScore({ relationship: 100, proactive: {} }, new Date(now.getTime() + 30 * 60_000)));
  assert.equal(updatePendingFollowUp(pending, null, true, now).pendingFollowUp, null);
});

test("scheduling and global spacing are deterministic with an injected random source", () => {
  const now = new Date("2026-07-14T18:00:00.000Z");
  const scheduled = scheduleNextProactive({}, 95, "normal", now, () => 0);
  assert.equal(new Date(scheduled.nextAt).getTime() - now.getTime(), 90 * 60_000);
  const attempted = recordProactiveAttempt(scheduled, 95, "normal", now, true, () => 0, { topicKey: "Morning coffee" });
  assert.equal(attempted.pending, true);
  assert.equal(attempted.lastAt, now.toISOString());
  assert.equal(new Date(attempted.globalNextAt).getTime() - now.getTime(), 120 * 60_000);
  assert.deepEqual(attempted.recentTopics, ["morning-coffee"]);
  assert.equal(globalProactiveNextAt([{ proactive: attempted }, { proactive: { globalNextAt: new Date(now.getTime() + 60_000).toISOString() } }]), attempted.globalNextAt);
});

test("a three-day polling simulation cannot send overnight or stack unread outreach", () => {
  let state = scheduleNextProactive({}, 95, "normal", new Date(2026, 6, 14, 8, 0), () => 0);
  let unreadCount = 0;
  const sends = [];
  for (let minute = 0; minute < 72 * 60; minute += 5) {
    const now = new Date(2026, 6, 14, 8, minute);
    const thread = { profile: { name: "Example" }, relationship: 95, unreadCount, proactive: state };
    const context = { pace: "normal", globalUnreadCount: unreadCount, globalNextAt: state.globalNextAt, deliveryStart: "08:00", deliveryEnd: "23:00" };
    if (!canProactivelyReachOut(thread, context, now)) continue;
    sends.push(now);
    unreadCount = 1;
    state = recordProactiveAttempt(state, 95, "normal", now, false, () => 0, { topicKey: "topic-" + sends.length });
  }
  assert.equal(sends.length, 1);
  assert.ok(sends.every((date) => date.getHours() >= 8 && date.getHours() < 23));
});
