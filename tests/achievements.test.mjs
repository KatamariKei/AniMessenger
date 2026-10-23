import test from "node:test";
import assert from "node:assert/strict";
import { achievementDefinitions, evaluateAchievementShadow, normalizeAchievementShadow, preserveNewerAchievementShadow } from "../server/achievements.mjs";
import { progressionResponseReplacer } from "../server/relationship.mjs";

const thread = { id: "host", character: { id: "erica" }, relationship: 8 };
const exchange = { userMessageId: "u1", characterMessageId: "c1", userText: "Your kindness means a lot to me.", characterText: "That means a lot to me, too." };
const proposal = { id: "heartfelt", actor: "shared", phase: "completed", evidence: [{ source: "user", quote: exchange.userText }] };

test("five stable definitions have inspectable non-romantic criteria", () => {
  assert.equal(achievementDefinitions.length, 5);
  assert.equal(new Set(achievementDefinitions.map(item => item.id)).size, 5);
  assert.ok(achievementDefinitions.every(item => item.version === 1 && item.points === 10));
  assert.match(achievementDefinitions.find(item => item.id === "heartfelt").criteria, /Romance is not required/);
});

test("supported moments remain unawarded shadow candidates", () => {
  const result = evaluateAchievementShadow(thread, exchange, [proposal]);
  assert.equal(result.achievementShadow.turns[0].signals[0].reason, "needs-semantic-review");
  assert.equal(result.achievementShadow.turns[0].characterId, "erica");
  assert.equal(result.relationship, undefined);
  assert.equal(result.points, undefined);
});

test("invented quotations and quotes from another character are rejected", () => {
  const result = evaluateAchievementShadow(thread, exchange, [{ ...proposal, evidence: [{ source: "character", quote: "Catherine laughs at your joke." }] }]);
  assert.equal(result.achievementShadow.turns[0].signals[0].reason, "unsupported-quotation");
  assert.deepEqual(result.achievementShadow.turns[0].signals[0].evidence, []);
});

test("plans, negated events, and wrong attribution cannot pass provenance screening", () => {
  for (const patch of [{ phase: "planned" }, { phase: "negated" }, { actor: "guest" }, { actor: "character" }]) {
    assert.equal(evaluateAchievementShadow(thread, exchange, [{ ...proposal, ...patch }]).achievementShadow.turns[0].signals[0].reason, "wrong-participant-or-not-completed");
  }
  const future = { ...exchange, userText: "Tomorrow we will visit the beach." };
  const result = evaluateAchievementShadow(thread, future, [{ ...proposal, id: "new-horizons", evidence: [{ source: "user", quote: future.userText }] }]);
  assert.equal(result.achievementShadow.turns[0].signals[0].reason, "ambiguous-or-planned");
});

test("duplicate turns and repeated candidate IDs do not add evaluation records", () => {
  const first = evaluateAchievementShadow(thread, exchange, [proposal, proposal]);
  assert.equal(first.achievementShadow.turns[0].signals.length, 1);
  assert.deepEqual(evaluateAchievementShadow({ ...thread, ...first }, exchange, [proposal]), first);
});

test("bounded samples survive restart and stale background saves", () => {
  let state = thread;
  for (let i = 0; i < 110; i++) state = { ...state, ...evaluateAchievementShadow(state, { ...exchange, userMessageId: `u${i}` }, []) };
  assert.equal(state.achievementShadow.turns.length, 100);
  assert.equal(state.achievementShadow.revision, 110);
  const reloaded = JSON.parse(JSON.stringify(state));
  assert.deepEqual(normalizeAchievementShadow(reloaded), normalizeAchievementShadow(state));
  assert.equal(preserveNewerAchievementShadow(state, thread).achievementShadow.revision, 110);
  assert.deepEqual(preserveNewerAchievementShadow(thread, state), {});
});

test("shadow quotations and diagnostics stay out of nested UI responses", () => {
  const state = { ...thread, ...evaluateAchievementShadow(thread, exchange, [proposal]) };
  const response = JSON.parse(JSON.stringify({ thread: state, guest: state }, progressionResponseReplacer));
  assert.equal(response.thread.achievementShadow, undefined);
  assert.equal(response.guest.achievementShadow, undefined);
});
