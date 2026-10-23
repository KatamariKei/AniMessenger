import test from "node:test";
import assert from "node:assert/strict";
import { applyRelationshipDelta, relationshipGuidance, relationshipStage, relationshipTier, normalizeRelationshipProgress, progressRelationship, progressionResponseReplacer, preserveNewerRelationshipProgress } from "../server/relationship.mjs";

test("relationship stages distinguish deep closeness", () => {
  assert.equal(relationshipStage(8), "new acquaintance");
  assert.equal(relationshipStage(45), "trusted");
  assert.equal(relationshipStage(80), "close");
  assert.equal(relationshipStage(95), "deeply close");
});

test("close relationships bank meaningful moments instead of discarding them", () => {
  assert.deepEqual(applyRelationshipDelta(75, 1), { appliedDelta: 0, relationship: 75, relationshipMomentum: 1 });
  assert.deepEqual(applyRelationshipDelta(75, 1, 1), { appliedDelta: 1, relationship: 76, relationshipMomentum: 0 });
  assert.deepEqual(applyRelationshipDelta(75, 2), { appliedDelta: 1, relationship: 76, relationshipMomentum: 0 });
});

test("deep closeness progresses more slowly while major moments still count immediately", () => {
  assert.deepEqual(applyRelationshipDelta(95, 1), { appliedDelta: 0, relationship: 95, relationshipMomentum: 1 });
  assert.deepEqual(applyRelationshipDelta(95, 1, 1), { appliedDelta: 0, relationship: 95, relationshipMomentum: 2 });
  assert.deepEqual(applyRelationshipDelta(95, 1, 2), { appliedDelta: 1, relationship: 96, relationshipMomentum: 0 });
  assert.deepEqual(applyRelationshipDelta(95, 2, 1), { appliedDelta: 1, relationship: 96, relationshipMomentum: 1 });
  assert.deepEqual(applyRelationshipDelta(95, -2, 2), { appliedDelta: -2, relationship: 93, relationshipMomentum: 0 });
});

test("deep closeness changes behavior without requiring compliance", () => {
  const guidance = relationshipGuidance(95);
  assert.match(guidance, /inner circle/i);
  assert.match(guidance, /not obedience/i);
  assert.match(guidance, /recurring social emergency/i);
});

test("relationship closeness never invents a longer shared chronology", () => {
  const guidance = relationshipGuidance(57);
  assert.match(guidance, /not elapsed time/i);
  assert.match(guidance, /only factual source of shared chronology/i);
  assert.match(guidance, /feels like forever/i);
});

test("shared tiers use the opening range and ten-point milestones", () => {
  assert.equal(relationshipTier(8).label, "New acquaintance");
  assert.equal(relationshipTier(19).label, "New acquaintance");
  assert.equal(relationshipTier(20).label, "Familiar");
  assert.equal(relationshipTier(30).label, "Friend");
  assert.equal(relationshipTier(90).label, "Deep bond");
  assert.equal(relationshipTier(100).label, "Total bond");
});

test("migration preserves existing scores and does not invent old milestones", () => {
  for (const value of [0, 8, 45, 99, 100]) {
    const state = normalizeRelationshipProgress({ relationship: value });
    assert.equal(state.bondScore, value);
    assert.equal(state.relationship, value);
    assert.equal(state.progressionPeak, value);
    assert.deepEqual(state.relationshipMilestones, []);
  }
});

test("progress beyond 100 is hidden while momentum still advances it", () => {
  let state = { id: "erica", ...normalizeRelationshipProgress({ relationship: 100 }) };
  for (let i = 0; i < 3; i++) state = { id: "erica", ...progressRelationship(state, 1, `turn-${i}`) };
  assert.equal(state.bondScore, 101);
  assert.equal(state.relationship, 100);
  assert.equal(state.relationshipTier, "Total bond");
  const response = JSON.parse(JSON.stringify({ thread: state, relatedThreads: [state] }, progressionResponseReplacer));
  assert.equal(response.thread.bondScore, undefined);
  assert.equal(response.thread.progressionPeak, undefined);
  assert.equal(response.relatedThreads[0].progressionTurnIds, undefined);
  assert.equal(response.thread.relationship, 100);
});

test("tier milestones are durable and duplicate turns or recrossings cannot award twice", () => {
  const first = { id: "character", ...progressRelationship({ id: "character", relationship: 19 }, 1, "first") };
  assert.equal(first.relationshipMilestones.length, 1);
  assert.equal(first.relationshipMilestones[0].label, "Familiar");
  assert.deepEqual(progressRelationship(first, 1, "first"), normalizeRelationshipProgress(first));
  const down = { id: "character", ...progressRelationship(first, -1, "second") };
  const back = progressRelationship(down, 1, "third");
  assert.equal(back.relationshipMilestones.length, 1);
});

test("Soulbound unlocks once at 200 without preventing trust loss", () => {
  const unlocked = { id: "character", ...progressRelationship({ id: "character", bondScore: 199, relationship: 100 }, 2, "discovery") };
  assert.equal(unlocked.bondScore, 200);
  assert.equal(unlocked.relationship, 100);
  assert.equal(unlocked.relationshipTier, "Soulbound");
  assert.equal(unlocked.soulboundEarned, true);
  const down = { id: "character", ...progressRelationship(unlocked, -2, "disagreement") };
  assert.equal(down.bondScore, 198);
  assert.equal(down.soulboundEarned, true);
  assert.equal(down.relationshipTier, "Total bond");
  const back = progressRelationship(down, 2, "repair");
  assert.equal(back.relationshipMilestones.filter(event => event.kind === "soulbound").length, 1);
});

test("a stale background save cannot replace newer relationship progress", () => {
  const older = { id: "character", ...normalizeRelationshipProgress({ relationship: 19 }) };
  const newer = progressRelationship(older, 1, "turn");
  assert.equal(preserveNewerRelationshipProgress(newer, older).relationship, 20);
  assert.equal(preserveNewerRelationshipProgress(newer, older).relationshipMilestones.length, 1);
  assert.deepEqual(preserveNewerRelationshipProgress(older, newer), {});
});
