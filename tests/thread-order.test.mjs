import test from "node:test";
import assert from "node:assert/strict";
import { sortThreads } from "../server/store.mjs";

test("pinned chats stay above newer unpinned chats while preserving recency within each group", () => {
  const sorted = sortThreads([
    { id: "new", updatedAt: "2026-08-24T12:00:00.000Z" },
    { id: "old-pin", pinned: true, updatedAt: "2026-08-20T12:00:00.000Z" },
    { id: "new-pin", pinned: true, updatedAt: "2026-08-23T12:00:00.000Z" },
    { id: "old", updatedAt: "2026-08-19T12:00:00.000Z" },
  ]);
  assert.deepEqual(sorted.map((thread) => thread.id), ["new-pin", "old-pin", "new", "old"]);
});
