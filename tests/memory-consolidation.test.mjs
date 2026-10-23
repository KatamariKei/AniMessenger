import test from "node:test";
import assert from "node:assert/strict";
import { automaticMemoryCandidates, previewMemoryConsolidation } from "../server/memory.mjs";

test("temporary work and mood reports cannot become durable facts by scoring highly", () => {
  const candidates = [
    { kind: "user_fact", importance: 4, text: "The user just finished a 14-hour workday consisting of boring meetings." },
    { kind: "user_fact", importance: 4, text: "The user is currently tired and hungry." },
    { kind: "user_fact", importance: 3, text: "The user works night shifts as a nurse." },
    { kind: "preference", importance: 3, text: "The user adds a pinch of salt to coffee grounds, a trick learned from a cooking show." },
  ];
  assert.deepEqual(automaticMemoryCandidates(candidates), candidates.slice(2));
});

test("consolidation preview is read-only and separates certain matches from guesses", () => {
  const memories = [
    { id: "a", kind: "user_fact", text: "The user has a queen size bed." },
    { id: "b", kind: "user_fact", text: "The user has a queen bed at home." },
    { id: "c", kind: "user_fact", text: "The user has a king size bed." },
    { id: "d", kind: "user_fact", text: "The user has a queen size bed.", userEdited: true },
    { id: "e", kind: "user_fact", text: "The user just finished a long workday." },
  ];
  const before = JSON.stringify(memories);
  const result = previewMemoryConsolidation(memories);
  assert.equal(JSON.stringify(memories), before);
  assert.equal(result.clearDuplicates.length, 1);
  assert.deepEqual(result.clearDuplicates[0].memoryIds, ["a", "b"]);
  assert.ok(result.reviewPairs.some(pair => pair.reason === "manual_memory_protected"));
  assert.equal(result.temporaryCandidates.length, 1);
  assert.ok(!result.clearDuplicates.some(pair => pair.memoryIds.includes("c")));
});

test("preview preserves the same activity on clearly different dates", () => {
  const result = previewMemoryConsolidation([
    { id: "a", kind: "shared_event", text: "They visited the lake together.", eventAt: "2026-09-01T12:00:00Z" },
    { id: "b", kind: "shared_event", text: "They visited the lake together.", eventAt: "2026-09-05T12:00:00Z" },
  ]);
  assert.equal(result.clearDuplicates.length, 0);
  assert.equal(result.reviewPairs.length, 0);
});

test("preview uses original source dates without backfilling or modifying memories", () => {
  const memories = [
    { id: "a", kind: "shared_event", text: "They visited the lake together.", sourceMessageIds: ["first"] },
    { id: "b", kind: "shared_event", text: "They visited the lake together.", sourceMessageIds: ["second"] },
  ];
  const before = JSON.stringify(memories);
  const result = previewMemoryConsolidation(memories, [
    { id: "first", time: "2026-09-01T12:00:00Z" },
    { id: "second", time: "2026-09-05T12:00:00Z" },
  ]);
  assert.equal(result.clearDuplicates.length, 0);
  assert.equal(result.reviewPairs.length, 0);
  assert.equal(JSON.stringify(memories), before);
});
