import assert from "node:assert/strict";
import test from "node:test";
import { preserveNewerMemoryState, summarizeThread } from "../server/store.mjs";

test("thread summaries retain list metadata without sending full histories", () => {
  const thread = {
    id: "character-1",
    character: { id: "character-1", name: "Character" },
    messages: [
      { id: "first", from: "user", text: "Earlier", time: "2026-01-01T00:00:00.000Z" },
      { id: "latest", from: "character", text: "Latest", time: "2026-01-01T00:01:00.000Z" },
    ],
    memories: [{ id: "memory-1", text: "A remembered detail" }],
    memoryRevision: 4,
    relationship: 42,
    unreadCount: 1,
    updatedAt: "2026-01-01T00:01:00.000Z",
  };

  const summary = summarizeThread(thread);

  assert.equal(summary.summary, true);
  assert.equal(summary.messageCount, 2);
  assert.equal(summary.memoryCount, 1);
  assert.equal(summary.memoryRevision, 4);
  assert.deepEqual(summary.messages, [thread.messages[1]]);
  assert.equal(summary.memories, undefined);
  assert.equal(summary.forgottenMemories, undefined);
  assert.equal(summary.relationship, 42);
  assert.equal(summary.unreadCount, 1);
});

test("thread summaries keep display essentials without shipping research dossiers", () => {
  const summary = summarizeThread({
    id: "character-2",
    character: { id: "character-2", name: "Character" },
    messages: [],
    profile: {
      profileVersion: 4,
      id: "character-2",
      name: "Character",
      series: "Series",
      age: 22,
      status: "reading",
      summary: "A concise summary.",
      openingLine: "Hello.",
      socialIdentity: { pronouns: "she/her" },
      visual: { identity: ["black hair"], defaultWardrobe: "red dress" },
      persona: { speechStyle: "Warm and direct.", competencies: ["A large performance guide"] },
      researchDossier: { facts: [{ quote: "A large quoted source packet" }] },
      researchEvidence: { passages: [{ text: "A large source passage" }] },
    },
  });

  assert.equal(summary.profile.persona.speechStyle, "Warm and direct.");
  assert.equal(summary.profile.visual.defaultWardrobe, "red dress");
  assert.equal(summary.profile.researchDossier, undefined);
  assert.equal(summary.profile.researchEvidence, undefined);
  assert.equal(summary.profile.persona.competencies, undefined);
});

test("an older chat save preserves a newer background memory checkpoint", () => {
  const memory = { id: "memory-new", text: "A durable event" };
  const checkpoint = { lastReviewedMessageId: "message-8" };
  const forgottenMemories = [{ text: "A rejected memory", forgottenAt: "2026-01-01T00:00:00.000Z" }];
  const preserved = preserveNewerMemoryState({
    memories: [memory],
    forgottenMemories,
    memoryCheckpoint: checkpoint,
    memoryRevision: 3,
  }, {
    memories: [],
    memoryRevision: 2,
  });

  assert.deepEqual(preserved.memories, [memory]);
  assert.deepEqual(preserved.forgottenMemories, forgottenMemories);
  assert.deepEqual(preserved.memoryCheckpoint, checkpoint);
  assert.equal(preserved.memoryRevision, 3);
  assert.deepEqual(preserveNewerMemoryState({ memoryRevision: 3 }, { memoryRevision: 3 }), {});
});
