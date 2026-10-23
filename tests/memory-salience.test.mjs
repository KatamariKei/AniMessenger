import test from "node:test";
import assert from "node:assert/strict";
import { automaticMemoryCandidates, lowSalienceMemoryReason } from "../server/memory.mjs";

const routine = { kind: "shared_event", importance: 4, text: "The user woke Nova with a forehead kiss and a tactical tickle attack, leading to a playful struggle before she got out of bed." };
const label = { kind: "user_fact", importance: 5, text: "The user considers himself a nerd regarding accurate measurements." };

test("high scores do not admit routine playful episodes or casual self-labels", () => {
  assert.deepEqual(automaticMemoryCandidates([routine, label]), []);
  assert.equal(lowSalienceMemoryReason(label), "casual_self_label");
  assert.equal(lowSalienceMemoryReason(routine), "routine_playful_moment");
});

test("meaningful firsts, rituals, preferences and requested memories remain eligible", () => {
  const candidates = [
    { ...routine, text: "The user woke Nova with a birthday surprise and a playful tickle." },
    { ...routine, text: "The user and Nova established a morning tickling ritual." },
    { kind: "preference", importance: 3, text: "Nova dislikes being tickled." },
    { ...routine, text: "Nova revealed a boundary about being tickled while asleep." },
    { ...label, text: "The user has a lifelong interest in precise model building and calls himself a nerd." },
    { kind: "preference", importance: 3, text: "The user adds a pinch of salt to coffee grounds." },
    { kind: "shared_creation", importance: 4, text: "The user named their little turtle Donatello." },
  ];
  assert.deepEqual(automaticMemoryCandidates(candidates), candidates);
  assert.deepEqual(automaticMemoryCandidates([routine], { userText: "Please remember this morning's tickle attack." }), [routine]);
});

test("the salience pass does not reject an explicit episode update or fulfillment", () => {
  assert.equal(lowSalienceMemoryReason({ ...routine, action: "update" }), null);
  assert.equal(lowSalienceMemoryReason({ ...routine, action: "resolve" }), null);
  assert.equal(lowSalienceMemoryReason({ ...label, userEdited: true }), null);
});
