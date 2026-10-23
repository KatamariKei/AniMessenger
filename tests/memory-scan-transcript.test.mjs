import test from "node:test";
import assert from "node:assert/strict";
import { fullMemoryScanBatches, fullMemoryScanTranscript } from "../server/memory-scan-transcript.mjs";
import { extractHistoricalMemories } from "../server/ollama.mjs";

test("full scans retain more than 480 messages even without any memory cue words", () => {
  const messages = Array.from({ length: 1001 }, (_, i) => ({ id: `m-${i}`, from: i % 2 ? "character" : "user", text: `Ordinary exchange ${i}.` }));
  const batches = fullMemoryScanBatches(messages);
  assert.ok(batches.length > 8);
  assert.deepEqual(batches.flatMap(batch => batch.messages).map(message => message.id), messages.map(message => message.id));
  for (const batch of batches) assert.ok(JSON.stringify(batch.messages).length <= 12000);
});

test("long message fragments preserve every character and the original source ID", () => {
  const text = "A long narrative. ".repeat(2500) + "A distinct important detail at the very end.";
  const batches = fullMemoryScanBatches([{ id: "long", from: "user", text }]);
  const fragments = batches.flatMap(batch => batch.messages);
  assert.equal(fragments.map(fragment => fragment.text).join(""), text);
  assert.ok(fragments.every(fragment => fragment.id === "long"));
  assert.ok(batches.length > 1);
});

test("full scan includes separate narration and dialogue but never duplicates identical narration", () => {
  const transcript = fullMemoryScanTranscript([{ id: "one", from: "character", narration: "A narrative action.", text: "A spoken line." },
    { id: "two", from: "character", narration: "Same content", text: "Same content" }, { from: "system", text: "Private instructions" }]);
  assert.equal(transcript[0].text, "A narrative action.\nA spoken line.");
  assert.equal(transcript[1].text, "Same content");
  assert.equal(transcript.length, 2);
});

test("successful batch receipts skip model work but changed batches are reviewed again", async t => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response(JSON.stringify({ message: { content: '{"memories":[]}' } })); };
  const thread = { profile: { name: "Fixture" }, messages: Array.from({ length: 61 }, (_, i) => ({ id: `m-${i}`, from: "user", text: "Ordinary exchange." })) };
  let checkpoint;
  const config = { ollamaUrl: "http://fixture", profileModel: "fixture" };
  await extractHistoricalMemories(config, thread, { onProgress: value => { checkpoint = value; } });
  assert.equal(calls, 2);
  await extractHistoricalMemories(config, thread, { completedBatchIds: checkpoint.completedBatchIds });
  assert.equal(calls, 2);
  thread.messages[60].text = "An edited exchange.";
  await extractHistoricalMemories(config, thread, { completedBatchIds: checkpoint.completedBatchIds });
  assert.equal(calls, 3);
});
