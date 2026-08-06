import assert from "node:assert/strict";
import test from "node:test";
import { summarizeThread } from "../server/store.mjs";

test("thread summaries retain list metadata without sending full histories", () => {
  const thread = {
    id: "character-1",
    character: { id: "character-1", name: "Character" },
    messages: [
      { id: "first", from: "user", text: "Earlier", time: "2026-01-01T00:00:00.000Z" },
      { id: "latest", from: "character", text: "Latest", time: "2026-01-01T00:01:00.000Z" },
    ],
    memories: [{ id: "memory-1", text: "A remembered detail" }],
    relationship: 42,
    unreadCount: 1,
    updatedAt: "2026-01-01T00:01:00.000Z",
  };

  const summary = summarizeThread(thread);

  assert.equal(summary.summary, true);
  assert.equal(summary.messageCount, 2);
  assert.equal(summary.memoryCount, 1);
  assert.deepEqual(summary.messages, [thread.messages[1]]);
  assert.equal(summary.memories, undefined);
  assert.equal(summary.relationship, 42);
  assert.equal(summary.unreadCount, 1);
});
