import test from "node:test";
import assert from "node:assert/strict";
import { auditMemoryHealth, recordMemoryReviewMetrics } from "../server/memory-health.mjs";
import { mergeMemories } from "../server/memory.mjs";

const now = new Date("2026-10-06T12:00:00Z");
const promise = { id: "plan", kind: "promise", text: "The user promised Nova breakfast with pancakes and coffee.", importance: 3, keywords: [], sourceMessageIds: ["planned"], createdAt: "2026-10-05T08:00:00Z", eventAt: "2026-10-05T08:00:00Z" };
const source = { id: "served", from: "user", text: "I made pancakes and served breakfast with coffee.", time: "2026-10-05T09:00:00Z" };
const outcome = { id: "meal", kind: "shared_event", text: "The user served Nova breakfast with pancakes and coffee.", importance: 3, keywords: [], sourceMessageIds: ["served"], createdAt: source.time, eventAt: source.time };

test("an episode never absorbs a durable preference through a shared keyword", () => {
  const preference = { ...outcome, id: "taste", kind: "preference", text: "Nova enjoys Aurora whisky.", keywords: ["Aurora whisky"] };
  const episode = { ...outcome, id: "evening", text: "The user and Nova shared Aurora whisky during a relaxing evening.", keywords: ["Aurora whisky"], userEdited: true };
  assert.equal(mergeMemories([episode, preference], []).length, 2);
  assert.equal(mergeMemories([preference, episode], []).length, 2);
});

test("memory audit is read-only and finds sourced possible fulfillment", () => {
  const thread = { memories: [promise, outcome], messages: [source] };
  const before = JSON.stringify(thread);
  const report = auditMemoryHealth(thread, now);
  assert.equal(report.counts.possible_resolution, 1);
  assert.equal(report.flags.find(flag => flag.type === "possible_resolution").evidence.messageId, "served");
  assert.equal(JSON.stringify(thread), before);
  assert.equal(report.metrics.startedAt, null);
  assert.equal(report.readOnly, true);
});

test("audit cannot resolve manual promises, future plans, or earlier outcomes", () => {
  assert.equal(auditMemoryHealth({ memories: [{ ...promise, userEdited: true }, outcome], messages: [source] }, now).counts.possible_resolution, 0);
  assert.equal(auditMemoryHealth({ memories: [promise, outcome], messages: [{ ...source, text: "I will make pancakes and coffee for breakfast." }] }, now).counts.possible_resolution, 0);
  assert.equal(auditMemoryHealth({ memories: [promise, outcome], messages: [{ ...source, time: "2026-10-01T09:00:00Z" }] }, now).counts.possible_resolution, 0);
});

test("review metrics distinguish additions, updates and resolutions without storing text", () => {
  const current = { memories: [promise, { ...outcome, id: "old" }] };
  const next = { memories: [{ ...outcome, id: "plan" }, { ...outcome, id: "old", text: "Refined breakfast detail." }, { ...outcome, id: "new" }] };
  const metrics = recordMemoryReviewMetrics(current, next, 3, now);
  assert.deepEqual([metrics.reviews[0].added, metrics.reviews[0].updated, metrics.reviews[0].resolved], [1, 1, 1]);
  assert.equal(JSON.stringify(metrics).includes("breakfast"), false);
  assert.equal(recordMemoryReviewMetrics({ ...current, memoryHealthMetrics: { startedAt: now.toISOString(), reviews: Array(100).fill(metrics.reviews[0]) } }, next, 0, now).reviews.length, 100);
});
