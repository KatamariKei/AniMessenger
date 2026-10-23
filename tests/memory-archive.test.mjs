import test from "node:test";
import assert from "node:assert/strict";
import { mergeMemories, retainMemories, selectRelevantMemories } from "../server/memory.mjs";
import { extractHistoricalMemories } from "../server/ollama.mjs";

test("capacity archives without deleting; archived episodes remain recallable and retention is idempotent", () => {
  const memories = Array.from({ length: 245 }, (_, i) => ({ id: `episode-${i}`, kind: "shared_event",
    text: `We visited telescope observatory number ${i}.`, keywords: [`observatory ${i}`], importance: 3,
    updatedAt: new Date(1700000000000 + i * 1000).toISOString() }));
  const saved = retainMemories(memories);
  assert.equal(saved.length, 245);
  assert.equal(saved.filter(memory => memory.archived).length, 5);
  assert.deepEqual(retainMemories(saved), saved);
  assert.ok(selectRelevantMemories(saved, "telescope observatory").length);
  const archived = saved.find(memory => memory.archived);
  const recalled = selectRelevantMemories([archived], archived.text);
  assert.equal(recalled[0].id, archived.id);
  assert.ok(retainMemories([{ ...archived, userEdited: true }], 0).every(memory => !memory.archived));
});

const promise = { id: "breakfast", kind: "promise", text: "The user promised Nova breakfast and coffee, with pancakes and syrup.",
  importance: 2, sourceMessageIds: ["plan"], keywords: ["breakfast", "coffee"], eventAt: "2026-10-01T08:00:00Z" };
const source = { id: "served", from: "user", text: "I made blueberry pancakes with syrup and set them on the table with strong coffee. Order up!", time: "2026-10-01T08:20:00Z" };
const resolution = { action: "resolve", targetMemoryId: "breakfast", kind: "shared_event",
  text: "The user fulfilled their breakfast promise by serving Nova blueberry pancakes with syrup and strong coffee.", importance: 3,
  sourceMessageIds: [source.id], evidenceMessageId: source.id, evidenceQuote: source.text, eventAt: source.time };

test("rescan cannot recreate the old promise after resolution; earlier details stay saved", () => {
  const messages = [{ id: "plan", from: "user", text: promise.text, time: promise.eventAt }, source];
  const resolved = mergeMemories([promise], [resolution], undefined, new Date(), { messages });
  assert.equal(resolved[0].previousVersions[0].text, promise.text);
  const rescanned = mergeMemories(resolved, [{ ...promise, id: undefined }], undefined, new Date(), { messages });
  assert.equal(rescanned.length, 1);
  assert.equal(rescanned[0].kind, "shared_event");
  assert.ok(rescanned[0].resolution);
});

test("historical scans receive current saved references and use the same explicit resolution schema as live review", async t => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async (_, options) => {
    const packet = JSON.parse(options.body);
    const input = JSON.parse(packet.messages.at(-1).content);
    assert.equal(input.existingMemories[0].id, promise.id);
    assert.equal(input.memoryMessages[0].id, source.id);
    assert.deepEqual(packet.format.properties.memories.items.properties.action.enum, ["add", "update", "resolve"]);
    return new Response(JSON.stringify({ message: { content: JSON.stringify({ memories: [resolution] }) } }));
  };
  const recovered = await extractHistoricalMemories({ ollamaUrl: "http://fixture", profileModel: "fixture" },
    { profile: { name: "Nova" }, memories: [promise], messages: [source] });
  assert.equal(recovered[0].action, "resolve");
  const result = mergeMemories([promise], recovered, undefined, new Date(), { messages: [source] });
  assert.equal(result[0].kind, "shared_event");
});

test("an older explicit update cannot overwrite later evidence", () => {
  const old = { id: "old", from: "user", text: "I like thick pancakes.", time: "2026-10-01T08:00:00Z" };
  const newer = { id: "new", from: "user", text: "I like thick pancakes with blueberries.", time: "2026-10-02T08:00:00Z" };
  const memory = { id: "food", kind: "preference", text: "The user likes thick pancakes with blueberries.", importance: 3, sourceMessageIds: ["new"] };
  const replay = { action: "update", targetMemoryId: "food", kind: "preference", text: "The user likes thick pancakes.", importance: 3,
    evidenceMessageId: "old", evidenceQuote: old.text, sourceMessageIds: ["old"] };
  assert.equal(mergeMemories([memory], [replay], undefined, new Date(), { messages: [old, newer] })[0].text, memory.text);
});

test("later scan batches resolve the actual saved ID from an earlier batch without mutating the live thread", async t => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  const plan = { id: "plan", from: "user", text: "I promised Nova breakfast and coffee, with pancakes and syrup.", time: promise.eventAt };
  const messages = [plan, ...Array.from({ length: 59 }, (_, i) => ({ id: `filler-${i}`, from: "character", text: "An ordinary reply." })), source];
  let saved = { profile: { name: "Nova" }, memories: [], messages };
  let calls = 0;
  let additions = 0;
  globalThis.fetch = async (_, options) => {
    const packet = JSON.parse(options.body);
    const input = JSON.parse(packet.messages.at(-1).content);
    const candidate = calls++ === 0 ? { ...promise, id: undefined, action: "add", targetMemoryId: null,
      evidenceMessageId: plan.id, evidenceQuote: plan.text } : { ...resolution, targetMemoryId: saved.memories[0].id };
    if (calls === 2) assert.equal(input.existingMemories[0].id, saved.memories[0].id);
    return new Response(JSON.stringify({ message: { content: JSON.stringify({ memories: [candidate] }) } }));
  };
  await extractHistoricalMemories({ ollamaUrl: "http://fixture", profileModel: "fixture" }, saved, {
    referenceThread: () => saved,
    onBatch: candidates => {
      const before = saved.memories.length;
      saved = { ...saved, memories: mergeMemories(saved.memories, candidates, undefined, new Date(), { messages }) };
      additions += saved.memories.length - before;
      return saved;
    },
  });
  assert.equal(calls, 2);
  assert.equal(additions, 1);
  assert.equal(saved.memories.length, 1);
  assert.equal(saved.memories[0].kind, "shared_event");
  assert.ok(saved.memories[0].resolution);
});

test("refined episode details remain searchable for recall without reviving old plans", () => {
  const memory = { id: "outing", kind: "shared_event", text: "We completed our observatory outing.", importance: 3,
    previousVersions: [{ kind: "shared_event", text: "We found a brass astrolabe during our observatory outing." },
      { kind: "open_loop", text: "We planned to buy a brass astrolabe." }] };
  const recalled = selectRelevantMemories([memory], "What about the astrolabe?");
  assert.match(recalled[0].text, /found a brass astrolabe/);
  assert.doesNotMatch(recalled[0].text, /planned to buy/);
});
