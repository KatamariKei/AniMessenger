import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { evaluateAchievementShadow } from "../server/achievements.mjs";
import { achievementReviewBatch, mergeAchievementReviews } from "../server/achievement-review.mjs";
import { verifiedAchievementProgress } from "../server/achievement-ledger.mjs";

function exchange(id, characterText, presence = "together") {
  return { userMessageId: id, characterMessageId: `${id}-reply`, userText: "I settle in beside you and enjoy this together.", characterText, scene: { presence, location: "home" } };
}
function approve(thread) {
  const batch = achievementReviewBatch(thread);
  return { ...thread, ...mergeAchievementReviews(thread, batch, batch.map(item => ({ id: item.id, verdict: "supported", confidence: 0.98, reason: "clear_shared_event" }))) };
}
test("shared activities are captured naturally, independently verified, and deduplicated by type", () => {
  let thread = { id: "chat", character: { id: "fixture" } };
  for (const [id, text] of [["one", "We are watching the movie together, laughing at the opening scene."], ["two", "We are cooking dinner together, chopping vegetables at the counter."], ["three", "She hands you the controller as we start playing the game together."]]) {
    thread = { ...thread, ...evaluateAchievementShadow(thread, exchange(id, text)) };
    const before = verifiedAchievementProgress(thread)["time-well-spent"];
    thread = approve(thread);
    assert.equal(verifiedAchievementProgress(thread)["time-well-spent"], before + 1);
  }
  thread = { ...thread, ...evaluateAchievementShadow(thread, exchange("four", "We are watching another movie together.")) };
  thread = approve(thread);
  assert.equal(verifiedAchievementProgress(thread)["time-well-spent"], 3);
});
test("plans and solo activities do not become verified shared progress", () => {
  for (const turn of [exchange("plan", "Maybe we will watch a movie tomorrow."), exchange("solo", "She is watching a movie alone.", "apart")]) {
    let thread = { id: "chat", character: { id: "fixture" } };
    thread = { ...thread, ...evaluateAchievementShadow(thread, turn) };
    const batch = achievementReviewBatch(thread);
    thread = { ...thread, ...mergeAchievementReviews(thread, batch, batch.map(item => ({ id: item.id, verdict: "rejected", confidence: 0.99, reason: "planned_or_negated" }))) };
    assert.equal(verifiedAchievementProgress(thread)["time-well-spent"], 0);
  }
});
test("past or future words do not veto an activity currently happening in the same exchange", () => {
  const turn = exchange("current", "I've never cooked this before, but we are cooking the meal together now.");
  const thread = { id: "chat", character: { id: "fixture" } };
  const proposed = { ...thread, ...evaluateAchievementShadow(thread, turn) };
  assert.equal(verifiedAchievementProgress(approve(proposed))["time-well-spent"], 1);
});
test("replacement icons have editable SVG counterparts matching the app paths", async () => {
  const source = await fs.readFile(new URL("../src/CharacterJourney.tsx", import.meta.url), "utf8");
  for (const id of ["time-well-spent", "getting-to-know-you"]) {
    const svg = await fs.readFile(new URL(`../public/icons/${id}.svg`, import.meta.url), "utf8");
    const path = svg.match(/<path d="([^"]+)"/)?.[1];
    assert.ok(path && source.includes(path));
    assert.match(svg, /stroke-width="1.6"/);
  }
});
