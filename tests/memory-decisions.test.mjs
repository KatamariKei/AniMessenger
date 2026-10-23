import test from "node:test";
import assert from "node:assert/strict";
import { mergeMemories, validateMemoryDecision } from "../server/memory.mjs";
import { extractIncrementalMemories } from "../server/ollama.mjs";

const promise = { id: "breakfast", kind: "promise", text: "The user promised Nova breakfast and coffee, with pancakes and syrup.", importance: 2, sourceMessageIds: ["plan"], keywords: ["breakfast", "coffee"], eventAt: "2026-10-01T08:00:00Z" };
const source = { id: "served", from: "user", text: "I made blueberry pancakes with syrup and set them on the table with strong coffee. Order up!", time: "2026-10-01T08:20:00Z" };
const resolution = { action: "resolve", targetMemoryId: "breakfast", kind: "shared_event", text: "The user fulfilled their breakfast promise by serving Nova blueberry pancakes with syrup and strong coffee.", importance: 3, sourceMessageIds: [source.id], evidenceMessageId: source.id, evidenceQuote: source.text, eventAt: source.time };

test("sourced fulfillment resolves the existing promise in place and preserves its evidence", () => {
  const result = mergeMemories([promise], [resolution], undefined, new Date(), { messages: [source] });
  assert.equal(result.length, 1);
  assert.equal(result[0].id, promise.id);
  assert.equal(result[0].kind, "shared_event");
  assert.deepEqual(result[0].sourceMessageIds, ["plan", "served"]);
  assert.equal(result[0].resolution.evidenceMessageId, "served");
  assert.equal(mergeMemories(result, [resolution], undefined, new Date(), { messages: [source] }).length, 1);
});

test("resolution rejects unsupported evidence, manual records, future plans and unrelated outcomes", () => {
  assert.equal(validateMemoryDecision({ ...promise, userEdited: true }, resolution, [source]), false);
  assert.equal(validateMemoryDecision(promise, { ...resolution, evidenceQuote: "I finished everything as promised." }, [source]), false);
  assert.equal(validateMemoryDecision(promise, resolution, [{ ...source, from: "character" }]), false);
  assert.equal(validateMemoryDecision(promise, { ...resolution, targetMemoryId: "unknown" }, [source]), false);
  const future = { ...source, text: "I will make pancakes and coffee tomorrow." };
  assert.equal(validateMemoryDecision(promise, { ...resolution, evidenceQuote: future.text }, [future]), false);
  const unrelated = { ...source, text: "I made sandwiches and served tea." };
  assert.equal(validateMemoryDecision(promise, { ...resolution, evidenceQuote: unrelated.text }, [unrelated]), false);
  assert.equal(validateMemoryDecision(promise, resolution, [{ ...source, time: "2026-09-01T08:20:00Z" }]), false);
});

test("explicit updates refine one fact and reject unknown targets instead of creating a new record", () => {
  const memory = { id: "food", kind: "preference", text: "The user likes thick pancakes.", importance: 3, keywords: [], sourceMessageIds: ["old"] };
  const message = { id: "new", from: "user", text: "I like thick pancakes made with buttermilk." };
  const decision = { action: "update", targetMemoryId: "food", kind: "preference", text: "The user likes thick pancakes made with buttermilk.", importance: 3, sourceMessageIds: ["new"], evidenceMessageId: "new", evidenceQuote: message.text };
  const result = mergeMemories([memory], [decision], undefined, new Date(), { messages: [message] });
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "food");
  assert.match(result[0].text, /buttermilk/);
  assert.equal(mergeMemories([memory], [{ ...decision, targetMemoryId: "missing" }], undefined, new Date(), { messages: [message] }).length, 1);
  const opposite = { ...message, text: "I hate thick pancakes." };
  assert.equal(validateMemoryDecision(memory, { ...decision, text: "The user hates thick pancakes.", evidenceQuote: opposite.text }, [opposite]), false);
});

test("background review receives existing reference memories and emits explicit decisions in one request", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (_, options) => {
    const packet = JSON.parse(options.body);
    const input = JSON.parse(packet.messages.at(-1).content);
    assert.equal(input.existingMemories[0].id, "breakfast");
    assert.equal(input.memoryMessages[0].id, "served");
    assert.deepEqual(packet.format.properties.memories.items.properties.action.enum, ["add", "update", "resolve"]);
    return new Response(JSON.stringify({ message: { content: JSON.stringify({ memories: [resolution] }) } }));
  };
  try {
    const result = await extractIncrementalMemories({ ollamaUrl: "http://fixture", chatModel: "fixture" }, { profile: { name: "Nova" }, memories: [promise] }, { messages: [source] });
    assert.equal(result[0].action, "resolve");
    assert.equal(result[0].targetMemoryId, "breakfast");
  } finally { globalThis.fetch = original; }
});
