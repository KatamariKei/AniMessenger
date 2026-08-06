import test from "node:test";
import assert from "node:assert/strict";
import { forgetMemory, mergeMemories, selectRelevantMemories } from "../server/memory.mjs";

test("durable memories normalize and merge duplicate facts", () => {
  const first = mergeMemories([], [{
    kind: "shared_creation",
    text: "The user and Nova created a band called Midnight Spoons and named its genre DESSERT-WAVE.",
    keywords: ["band", "midnight spoons", "dessert-wave"],
    importance: 5,
  }], "message-1", new Date("2026-07-15T12:00:00Z"));
  const merged = mergeMemories(first, [{
    kind: "shared_creation",
    text: "Nova and the user created the band Midnight Spoons, whose genre is DESSERT-WAVE.",
    keywords: ["music"],
    importance: 4,
  }], "message-2", new Date("2026-07-15T13:00:00Z"));
  assert.equal(merged.length, 1);
  assert.equal(merged[0].importance, 5);
  assert.deepEqual(merged[0].sourceMessageIds, ["message-1", "message-2"]);
});

test("a band-name question retrieves the specific shared creation", () => {
  const memories = mergeMemories([], [
    { kind: "preference", text: "The user prefers coffee without sugar.", keywords: ["coffee"], importance: 3 },
    { kind: "shared_creation", text: "The user and Nova created a band called Midnight Spoons and named its genre DESSERT-WAVE.", keywords: ["band", "band name", "midnight spoons", "dessert-wave", "genre"], importance: 5 },
  ]);
  const relevant = selectRelevantMemories(memories, "What was our band name and genre?", 2);
  assert.match(relevant[0].text, /Midnight Spoons/);
  assert.match(relevant[0].text, /DESSERT-WAVE/);
});

test("a memory can be explicitly forgotten", () => {
  const memories = mergeMemories([], [{ kind: "user_fact", text: "The user has a cat named Pixel.", keywords: ["cat", "pixel"], importance: 4 }]);
  assert.deepEqual(forgetMemory(memories, memories[0].id), []);
});

test("incomplete local-model fragments are not stored as memories", () => {
  const memories = mergeMemories([], [{
    kind: "shared_creation",
    text: "Nova describes their plan as a",
    keywords: ["relationship"],
    importance: 4,
  }]);
  assert.deepEqual(memories, []);
});
