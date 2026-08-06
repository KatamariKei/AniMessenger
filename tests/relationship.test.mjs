import test from "node:test";
import assert from "node:assert/strict";
import { applyRelationshipDelta, relationshipGuidance, relationshipStage } from "../server/relationship.mjs";

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
