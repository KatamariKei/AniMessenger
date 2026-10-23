import assert from "node:assert/strict";
import test from "node:test";
import {
  characterChatSchema,
  characterProfileSchema,
  firstContactScenarioSchema,
  memoryExtractionSchema,
  memoryRecallSelectionSchema,
  proactiveOutreachSchema,
  profileGuideSchema,
  profileRepairSchema,
  replyOnlySchema,
  storyCharacterChatSchema,
} from "../server/ollama-schemas.mjs";

test("every structured Ollama contract is strict and requires all declared top-level fields", () => {
  for (const schema of [replyOnlySchema, profileGuideSchema, profileRepairSchema, characterProfileSchema, firstContactScenarioSchema, memoryExtractionSchema, memoryRecallSelectionSchema, characterChatSchema, storyCharacterChatSchema, proactiveOutreachSchema]) {
    assert.equal(schema.type, "object");
    assert.equal(schema.additionalProperties, false);
    assert.deepEqual(new Set(schema.required), new Set(Object.keys(schema.properties)));
  }
});

test("chat and proactive contracts carry soft follow-up and topic metadata", () => {
  assert.ok(characterChatSchema.required.includes("narration"));
  assert.ok(characterChatSchema.properties.followUp);
  assert.ok(characterChatSchema.required.includes("resolvesPendingFollowUp"));
  assert.ok(proactiveOutreachSchema.required.includes("topicKey"));
  assert.ok(proactiveOutreachSchema.required.includes("scenePatch"));
  assert.ok(proactiveOutreachSchema.required.includes("resolvesFollowUp"));
  assert.ok(characterChatSchema.required.includes("photoOutfit"));
  assert.ok(proactiveOutreachSchema.required.includes("photoOutfit"));
  assert.ok(storyCharacterChatSchema.required.includes("narration"));
  assert.equal("reply" in storyCharacterChatSchema.properties, false);
});

test("chat and narrative require a final pose and field-specific source evidence", () => {
  for (const schema of [characterChatSchema, storyCharacterChatSchema]) {
    assert.ok(schema.required.includes("sceneEvidence"));
    assert.ok(schema.properties.scene.required.includes("posture"));
    const evidence = schema.properties.sceneEvidence;
    assert.deepEqual(new Set(evidence.required), new Set(["location", "environment", "activity", "outfit", "expression", "lighting", "presence", "posture"]));
    const item = evidence.properties.location.anyOf.find((entry) => entry.type === "object");
    assert.deepEqual(item.required, ["quote", "source", "phase", "actor"]);
    assert.deepEqual(item.properties.phase.enum, ["current", "planned", "negated"]);
    assert.equal(item.additionalProperties, false);
  }
});

test("historical memory extraction requires source provenance and event time", () => {
  const item = memoryExtractionSchema.properties.memories.items;
  assert.ok(item.required.includes("sourceMessageIds"));
  assert.ok(item.required.includes("eventAt"));
  assert.ok(item.properties.sourceMessageIds);
  assert.ok(item.properties.eventAt);
});

test("semantic memory recall can return only a bounded list of supplied IDs", () => {
  assert.equal(memoryRecallSelectionSchema.properties.memoryIds.maxItems, 8);
  assert.equal(memoryRecallSelectionSchema.properties.memoryIds.items.type, "string");
});

test("achievement shadow arrays are bounded in both conversation modes", () => {
  for (const schema of [characterChatSchema, storyCharacterChatSchema]) {
    assert.equal(schema.required.includes("achievementSignals"), true);
    assert.equal(schema.properties.achievementSignals.maxItems, 5);
    assert.equal(schema.properties.achievementSignals.items.properties.evidence.maxItems, 3);
  }
});
