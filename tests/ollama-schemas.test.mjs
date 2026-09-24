import assert from "node:assert/strict";
import test from "node:test";
import {
  characterChatSchema,
  characterProfileSchema,
  firstContactScenarioSchema,
  memoryExtractionSchema,
  proactiveOutreachSchema,
  profileGuideSchema,
  profileRepairSchema,
  replyOnlySchema,
  storyCharacterChatSchema,
} from "../server/ollama-schemas.mjs";

test("every structured Ollama contract is strict and requires all declared top-level fields", () => {
  for (const schema of [replyOnlySchema, profileGuideSchema, profileRepairSchema, characterProfileSchema, firstContactScenarioSchema, memoryExtractionSchema, characterChatSchema, storyCharacterChatSchema, proactiveOutreachSchema]) {
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
