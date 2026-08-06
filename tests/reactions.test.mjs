import assert from "node:assert/strict";
import test from "node:test";
import {
  appendReactionResponse,
  applyMessageReaction,
  canTriggerReactionResponse,
  normalizeMessageReaction,
  reactionResponseChance,
  shouldRespondToReaction,
} from "../server/reactions.mjs";

const thread = {
  messages: [
    { id: "character-1", from: "character", text: "Hello" },
    { id: "user-1", from: "user", text: "Hi" },
  ],
};

test("a reaction is stored on a character message and can be replaced", () => {
  const liked = applyMessageReaction(thread, "character-1", "❤️");
  assert.equal(liked.messages[0].reaction, "❤️");
  const laughed = applyMessageReaction(liked, "character-1", "😂");
  assert.equal(laughed.messages[0].reaction, "😂");
});

test("sending the empty reaction removes the current reaction", () => {
  const liked = applyMessageReaction(thread, "character-1", "👍");
  const cleared = applyMessageReaction(liked, "character-1", null);
  assert.equal("reaction" in cleared.messages[0], false);
});

test("unsupported reactions and reactions to user messages are rejected", () => {
  assert.throws(() => normalizeMessageReaction("🔥"), /available message reactions/);
  assert.throws(() => applyMessageReaction(thread, "user-1", "👍"), /character messages/);
});

test("reaction response chances favor explicit clarification and emphasis", () => {
  assert.equal(reactionResponseChance("❓"), 0.85);
  assert.equal(reactionResponseChance("‼️"), 0.65);
  assert.equal(reactionResponseChance("👎"), 0.50);
  assert.equal(reactionResponseChance("❤️"), 0.25);
  assert.equal(reactionResponseChance("😂"), 0.20);
  assert.equal(reactionResponseChance("👍"), 0.10);
  assert.equal(reactionResponseChance(null), 0);
});

test("reaction response rolls are deterministic at their probability boundaries", () => {
  assert.equal(shouldRespondToReaction("❓", () => 0.849), true);
  assert.equal(shouldRespondToReaction("❓", () => 0.85), false);
  assert.equal(shouldRespondToReaction("👍", () => 0.099), true);
  assert.equal(shouldRespondToReaction("👍", () => 0.10), false);
});

test("only a newly selected reaction can trigger one follow-up for a message", () => {
  const target = thread.messages[0];
  assert.equal(canTriggerReactionResponse(target, "❓"), true);
  assert.equal(canTriggerReactionResponse({ ...target, reaction: "❓" }, "❓"), false);
  assert.equal(canTriggerReactionResponse({ ...target, reactionResponseId: "reply-1" }, "‼️"), false);
  assert.equal(canTriggerReactionResponse(target, null), false);
});

test("a reaction follow-up is linked once without changing conversation state", () => {
  const reacted = applyMessageReaction({ ...thread, relationship: 42, scene: { location: "cafe" } }, "character-1", "❓");
  const response = { id: "reply-1", from: "character", text: "I meant the coffee, not the meeting.", time: "2026-07-28T12:00:00.000Z" };
  const followed = appendReactionResponse(reacted, "character-1", "❓", response);
  assert.equal(followed.messages[0].reactionResponseId, "reply-1");
  assert.equal(followed.messages[0].reactionResponseReaction, "❓");
  assert.equal(followed.messages[2].reactionResponse, true);
  assert.equal(followed.messages[2].reactionResponseTo, "character-1");
  assert.equal(followed.relationship, 42);
  assert.deepEqual(followed.scene, { location: "cafe" });

  const duplicate = appendReactionResponse(followed, "character-1", "‼️", {
    id: "reply-2",
    from: "character",
    text: "A second reply",
    time: "2026-07-28T12:01:00.000Z",
  });
  assert.equal(duplicate.messages.length, followed.messages.length);
});
