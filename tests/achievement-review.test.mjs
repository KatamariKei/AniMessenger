import test from "node:test";
import assert from "node:assert/strict";
import { evaluateAchievementShadow } from "../server/achievements.mjs";
import { achievementReviewBatch, achievementReviewSchema, mergeAchievementReviews, achievementReviewMetrics, recoverVerifiedDestinationEvidence } from "../server/achievement-review.mjs";
import { extractIncrementalMemories } from "../server/ollama.mjs";

function candidate(thread = { id: "thread", character: { id: "erica", name: "Erica" } }, id = "u1", patch = {}) {
  const userText = "I appreciate our friendship and the trust we have built.";
  const characterText = "Your friendship means a lot to me, too.";
  return { ...thread, ...evaluateAchievementShadow(thread, { userMessageId: id, characterMessageId: `${id}-reply`, userText, characterText }, [{
    id: "heartfelt", event: "feelings", subject: null, occasion: null, actor: "shared", phase: "completed",
    evidence: [{ source: "user", quote: userText }, { source: "character", quote: characterText }], ...patch,
  }]) };
}
const supported = id => ({ id, verdict: "supported", confidence: 0.95, reason: "clear_shared_event" });

test("review packets have stable IDs, authoritative context, and a bounded schema", () => {
  const thread = candidate();
  const batch = achievementReviewBatch(thread);
  assert.equal(batch.length, 1);
  assert.match(batch[0].exchange.userText, /friendship/);
  assert.equal(batch[0].characterId, "erica");
  assert.deepEqual(achievementReviewBatch(JSON.parse(JSON.stringify(thread))), batch);
  assert.deepEqual(achievementReviewSchema(batch).items.properties.id.enum, [batch[0].id]);
});

test("destination recovery restores a capped-out verified visit once without rewriting history", () => {
  const original = { id: "thread", character: { id: "nova" }, messages: [{ text: "Unchanged conversation." }],
    achievementShadow: { verifiedTracking: { destinations: Array.from({ length: 10 }, (_, i) => ({ key: `old-venue-${i}`, userMessageId: `old-${i}` })) } } };
  const userText = "We arrive together at Moonlight Cafe.";
  const characterText = "She steps inside with you and takes a seat.";
  let thread = { ...original, ...evaluateAchievementShadow(original, { userMessageId: "visit", characterMessageId: "visit-reply",
    userText, characterText, scene: { presence: "together", location: "Moonlight Cafe" } }, []) };
  const batch = achievementReviewBatch(thread);
  thread = { ...thread, ...mergeAchievementReviews(thread, batch, [supported(batch[0].id)]) };
  // Simulate the old ten-record truncation after a successful semantic receipt.
  thread.achievementShadow.verifiedTracking.destinations = thread.achievementShadow.verifiedTracking.destinations.slice(0, 10);
  const snapshot = structuredClone(thread);
  const recovery = recoverVerifiedDestinationEvidence(thread);
  assert.equal(recovery.achievementShadow.verifiedTracking.destinations.length, 11);
  assert.equal(recovery.achievementShadow.verifiedTracking.destinations.at(-1).key, "moonlight cafe");
  assert.deepEqual(thread, snapshot);
  assert.deepEqual(recovery.achievementShadow.reviews, thread.achievementShadow.reviews);
  assert.deepEqual(recovery.achievementShadow.turns, thread.achievementShadow.turns);
  assert.deepEqual(recoverVerifiedDestinationEvidence({ ...thread, ...recovery }), recovery);
  for (const mutate of [
    copy => { copy.achievementShadow.reviews[0].status = "unconfirmed"; },
    copy => { copy.achievementShadow.turns[0].characterId = "other"; },
    copy => { copy.achievementShadow.turns[0].context.complete = false; },
    copy => { copy.achievementShadow.turns[0].signals[0].subject = "Invented Cafe"; },
  ]) {
    const copy = structuredClone(thread); mutate(copy);
    assert.equal(recoverVerifiedDestinationEvidence(copy).achievementShadow.verifiedTracking.destinations.length, 10);
  }
});

test("review chains use the same topic normalization as tracking", () => {
  let thread = { id: "thread", character: { id: "nova" } };
  const add = (id, event, userText, characterText) => {
    thread = { ...thread, ...evaluateAchievementShadow(thread, { userMessageId: id, characterMessageId: `${id}-reply`, userText, characterText }, [{
      id: "worked-through-it", event, subject: "Interrupting — dinner!", actor: "shared", phase: "completed",
      evidence: [{ source: "user", quote: userText }, { source: "character", quote: characterText }],
    }]) };
  };
  add("opened", "disagreement", "I disagree about interrupting dinner.", "I am upset about that.");
  add("repaired", "repair", "I am sorry about interrupting dinner.", "I understand and accept your apology.");
  assert.deepEqual(achievementReviewBatch(thread), []);
});

test("high-confidence support creates verified candidates but never points or unlocks", () => {
  const thread = candidate();
  const batch = achievementReviewBatch(thread);
  const merged = mergeAchievementReviews(thread, batch, [supported(batch[0].id)]);
  assert.equal(merged.achievementShadow.reviews[0].status, "verified-candidate");
  assert.equal(merged.achievementShadow.verifiedTracking.feelings.userMessageId, "u1");
  assert.equal(merged.achievementPoints, undefined);
  assert.equal(merged.achievements, undefined);
  assert.deepEqual(achievementReviewBatch({ ...thread, ...merged }), []);
});

test("uncertainty, rejection, low confidence, and conflicting duplicate decisions do not confirm", () => {
  const thread = candidate();
  const batch = achievementReviewBatch(thread);
  for (const patch of [{ verdict: "uncertain" }, { verdict: "rejected" }, { confidence: 0.89 }, { confidence: 2 }, { reason: "incidental_or_generic" }]) {
    const merged = mergeAchievementReviews(thread, batch, [{ ...supported(batch[0].id), ...patch }]);
    assert.equal(merged.achievementShadow.verifiedTracking.feelings, null);
    assert.equal(merged.achievementShadow.reviews[0].status, "unconfirmed");
  }
  assert.equal(mergeAchievementReviews(thread, batch, [supported(batch[0].id), { ...supported(batch[0].id), verdict: "rejected" }]).achievementShadow.reviews.length, 0);
});

test("unknown IDs, changed evidence, and repeated reviews cannot create progress", () => {
  const thread = candidate();
  const batch = achievementReviewBatch(thread);
  assert.equal(mergeAchievementReviews(thread, batch, [supported("invented")]).achievementShadow.reviews.length, 0);
  const edited = structuredClone(thread);
  edited.achievementShadow.turns[0].signals[0].subject = "changed";
  assert.equal(mergeAchievementReviews(edited, batch, [supported(batch[0].id)]).achievementShadow.reviews.length, 0);
  const merged = { ...thread, ...mergeAchievementReviews(thread, batch, [supported(batch[0].id)]) };
  assert.deepEqual(mergeAchievementReviews(merged, batch, [supported(batch[0].id)]).achievementShadow, merged.achievementShadow);
});

test("another guest's records and incomplete context are not reviewable", () => {
  const thread = candidate();
  const other = structuredClone(thread);
  other.achievementShadow.turns[0].characterId = "catherine";
  assert.deepEqual(achievementReviewBatch(other), []);
  const incomplete = structuredClone(thread);
  incomplete.achievementShadow.turns[0].context.userText = "Different text.";
  assert.deepEqual(achievementReviewBatch(incomplete), []);
  incomplete.achievementShadow.turns[0].context.complete = false;
  assert.deepEqual(achievementReviewBatch(incomplete), []);
});

test("repair cannot use an unverified disagreement as its foundation", () => {
  let thread = { id: "thread", character: { id: "erica" } };
  function add(id, event, userText, characterText) {
    thread = { ...thread, ...evaluateAchievementShadow(thread, { userMessageId: id, characterMessageId: `${id}-reply`, userText, characterText }, [{ id: "worked-through-it", event, subject: "interrupting", actor: "shared", phase: "completed", evidence: [{ source: "user", quote: userText }, { source: "character", quote: characterText }] }]) };
  }
  add("u1", "disagreement", "I disagree about interrupting.", "I am upset about that.");
  add("u2", "repair", "I am sorry about interrupting.", "I understand and accept your apology.");
  const batch = achievementReviewBatch(thread);
  assert.deepEqual(batch, []);
  const confirmed = mergeAchievementReviews(thread, batch, []);
  assert.equal(confirmed.achievementShadow.verifiedTracking.disagreements.length, 0);
});

test("review batches are limited to four candidates", () => {
  let thread;
  for (let i = 0; i < 8; i++) thread = candidate(thread, `u${i}`);
  assert.equal(achievementReviewBatch(thread).length, 4);
});

test("semantic review piggybacks on one background memory request", async () => {
  const thread = candidate();
  const batch = achievementReviewBatch(thread);
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (_url, options) => {
    calls++;
    const body = JSON.parse(options.body);
    assert.ok(body.format.properties.memories);
    assert.ok(body.format.properties.achievementReviews);
    assert.equal(body.options.num_predict, 1600);
    return new Response(JSON.stringify({ message: { content: JSON.stringify({ memories: [], achievementReviews: [supported(batch[0].id)] }) } }), { status: 200 });
  };
  try {
    const result = await extractIncrementalMemories({ ollamaUrl: "http://local-test", chatModel: "test-model" }, { ...thread, profile: { name: "Erica" } }, { messages: [{ id: "u1", from: "user", text: "Hello." }] }, { achievementReviewBatch: batch });
    assert.equal(calls, 1);
    assert.deepEqual(result.memories, []);
    assert.equal(result.achievementReviews.length, 1);
  } finally { globalThis.fetch = originalFetch; }
});

test("empty extraction remains backward-compatible and never calls the model", async () => {
  assert.deepEqual(await extractIncrementalMemories({}, {}, { messages: [] }), []);
  assert.deepEqual(await extractIncrementalMemories({}, {}, { messages: [] }, { achievementReviewBatch: [] }), { memories: [], achievementReviews: [] });
});

test("aggregate diagnostics contain counts only, never character or conversation content", () => {
  const metrics = achievementReviewMetrics([candidate()]);
  assert.equal(metrics.proposedSignals, 1);
  assert.equal(metrics.pendingNextBatch, 1);
  assert.equal(metrics.rewardsEnabled, true);
  assert.doesNotMatch(JSON.stringify(metrics), /Erica|friendship|u1|"thread"/);
});
