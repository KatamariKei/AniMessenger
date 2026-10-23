import test from "node:test";
import assert from "node:assert/strict";
import { mergeMemories } from "../server/memory.mjs";

test("repeated preferences update one record and retain all source evidence", () => {
  let memories = mergeMemories([], [{ kind: "preference", text: "The user enjoys jasmine tea.", importance: 3 }], "first");
  const id = memories[0].id;
  for (let index = 0; index < 12; index++) memories = mergeMemories(memories, [{ kind: "preference", text: "The user loves jasmine tea.", importance: 3 }], `repeat-${index}`);
  assert.equal(memories.length, 1);
  assert.equal(memories[0].id, id);
  assert.equal(memories[0].sourceMessageIds.length, 13);
});

test("cohabitation paraphrases update the same fact rather than add a slot", () => {
  const initial = mergeMemories([], [{ kind: "user_fact", text: "The user and Nova share a townhouse.", importance: 3 }], "first");
  const result = mergeMemories(initial, [{ kind: "user_fact", text: "Nova and the user live together in a townhouse.", importance: 3 }], "second");
  assert.equal(result.length, 1);
  assert.equal(result[0].id, initial[0].id);
});

test("source timestamps preserve recurring events when legacy memories lack dates", () => {
  const initial = mergeMemories([], [{ kind: "shared_event", text: "They visited the lakeside cafe together.", importance: 3 }], "first");
  const result = mergeMemories(initial, [{ kind: "shared_event", text: "They visited the lakeside cafe together.", importance: 3 }], "second", new Date(), { messages: [
    { id: "first", time: "2026-09-01T12:00:00Z" },
    { id: "second", time: "2026-09-05T12:00:00Z" },
  ] });
  assert.equal(result.length, 2);
  assert.equal(mergeMemories(result, []).length, 2);
});

test("same sourced episode refines while manual wording and conflicting facts remain protected", () => {
  const initial = mergeMemories([], [{ kind: "shared_event", text: "They explored the old botanical garden together.", importance: 3 }], "first");
  const result = mergeMemories(initial, [{ kind: "shared_event", text: "They explored the old botanical garden and found a quiet rose terrace together.", importance: 3 }], "second", new Date(), { messages: [
    { id: "first", time: "2026-09-01T12:00:00Z" },
    { id: "second", time: "2026-09-01T12:15:00Z" },
  ] });
  assert.equal(result.length, 1);
  assert.match(result[0].text, /rose terrace/);
  const manual = { id: "manual", kind: "preference", text: "The user enjoys jasmine tea.", userEdited: true, importance: 3, keywords: [], sourceMessageIds: ["manual-source"] };
  const protectedResult = mergeMemories([manual], [{ kind: "preference", text: "The user loves jasmine tea.", importance: 4 }], "new-source");
  assert.equal(protectedResult[0].text, manual.text);
  const facts = mergeMemories([], [{ kind: "user_fact", text: "The user has a queen size bed." }], "old");
  assert.equal(mergeMemories(facts, [{ kind: "user_fact", text: "The user has a king size bed." }], "new").length, 2);
});

test("opposite preferences are not silently overwritten during capture", () => {
  const initial = mergeMemories([], [{ kind: "preference", text: "The user loves jasmine tea." }], "old");
  const result = mergeMemories(initial, [{ kind: "preference", text: "The user hates jasmine tea." }], "new");
  assert.equal(result.length, 2);
  assert.equal(mergeMemories(result, []).length, 2);
});
