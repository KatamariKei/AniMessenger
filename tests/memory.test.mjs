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

test("a completed event replaces matching promises and open loops across memory kinds", () => {
  const beforeRace = mergeMemories([], [
    {
      kind: "open_loop",
      text: "Nagatoro and Alex still need to settle their swimming race at the gym.",
      keywords: ["swimming race", "gym"],
      importance: 3,
    },
    {
      kind: "promise",
      text: "Nagatoro and Alex agreed to a swimming race tonight at the gym.",
      keywords: ["swimming race", "gym", "tonight"],
      importance: 3,
    },
  ], "planning-turn", new Date("2026-08-19T17:41:00Z"));

  const afterRace = mergeMemories(beforeRace, [{
    kind: "shared_event",
    text: "Nagatoro won the swimming race at the gym after Alex got a leg cramp, so Alex owes her one week as her servant.",
    keywords: ["swimming race", "gym", "nagatoro won", "servant"],
    importance: 4,
  }], "race-finished", new Date("2026-08-20T01:45:00Z"));

  assert.equal(afterRace.length, 1);
  assert.equal(afterRace[0].kind, "shared_event");
  assert.match(afterRace[0].text, /Nagatoro won/i);
  assert.match(afterRace[0].text, /servant/i);
  assert.deepEqual(afterRace[0].sourceMessageIds, ["planning-turn", "race-finished"]);
});

test("same-topic promise and open-loop wording consolidate into one active plan", () => {
  const memories = mergeMemories([], [
    {
      kind: "open_loop",
      text: "Alex and Nova still want to visit the moonlight observatory.",
      keywords: ["moonlight observatory", "visit"],
      importance: 2,
    },
    {
      kind: "promise",
      text: "Nova promised Alex they would visit the moonlight observatory together.",
      keywords: ["moonlight observatory", "visit"],
      importance: 3,
    },
  ], "observatory-plan");

  assert.equal(memories.length, 1);
  assert.equal(memories[0].kind, "promise");
  assert.match(memories[0].text, /promised/i);
});

test("similar event and open-loop descriptions keep one active canonical plan", () => {
  const memories = mergeMemories([], [
    {
      kind: "shared_event",
      text: "Nagatoro mentioned a different cafe down the street that serves oversized parfaits.",
      keywords: ["parfait", "cafe"],
      importance: 2,
    },
    {
      kind: "open_loop",
      text: "Nagatoro suggested going to a new cafe with oversized parfaits.",
      keywords: ["cafe", "parfaits"],
      importance: 2,
    },
  ]);

  assert.equal(memories.length, 1);
  assert.equal(memories[0].kind, "open_loop");
  assert.match(memories[0].text, /suggested going/i);
});

test("memories involving the same people remain separate when their subjects differ", () => {
  const memories = mergeMemories([], [
    {
      kind: "promise",
      text: "Nova promised Alex they would visit the moonlight observatory.",
      keywords: ["moonlight observatory"],
      importance: 3,
    },
    {
      kind: "shared_event",
      text: "Nova and Alex baked cinnamon rolls together.",
      keywords: ["cinnamon rolls", "baking"],
      importance: 3,
    },
  ]);

  assert.equal(memories.length, 2);
});
