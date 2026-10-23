import test from "node:test";
import assert from "node:assert/strict";
import { mergeMemories, recentMemoryEpisodes, validateMemoryDecision } from "../server/memory.mjs";
import { extractIncrementalMemories } from "../server/ollama.mjs";

const initial = { id: "outing", kind: "shared_event", text: "The user and Nova visited a botanical garden and admired its rose terrace.", keywords: ["botanical garden", "rose terrace"], importance: 3, sourceMessageIds: ["arrived"], eventAt: "2026-10-01T12:00:00Z" };
const arrived = { id: "arrived", from: "user", text: "We visit the botanical garden and admire the rose terrace.", time: initial.eventAt };
const continued = { id: "continued", from: "user", text: "We sit beside the garden's rose terrace and sketch the flowers together.", time: "2026-10-06T12:00:00Z" };
const update = { action: "update", targetMemoryId: "outing", kind: "shared_event", text: "The user and Nova visited a botanical garden, admired its rose terrace, and sketched the flowers together.", keywords: ["botanical garden", "rose terrace", "sketching"], importance: 3, sourceMessageIds: ["continued"], evidenceMessageId: "continued", evidenceQuote: continued.text, eventAt: continued.time };

test("explicit ongoing episode update survives a real-world pause and preserves ID and sources", () => {
  const messages = [arrived, continued];
  assert.equal(validateMemoryDecision(initial, update, messages), true);
  const result = mergeMemories([initial], [update], undefined, new Date(), { messages });
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "outing");
  assert.deepEqual(result[0].sourceMessageIds, ["arrived", "continued"]);
  assert.match(result[0].text, /rose terrace.*sketched/);
});

test("new story days and repeat visits cannot overwrite an older episode", () => {
  for (const text of ["The next morning, we return to the garden's rose terrace.", "On our next visit, we sketch the garden's flowers."]) {
    const next = { ...continued, text };
    assert.equal(validateMemoryDecision(initial, { ...update, evidenceQuote: text }, [arrived, next]), false);
    assert.equal(recentMemoryEpisodes([initial], [arrived, next], [next]).length, 0);
  }
});

test("same-topic remote episodes and manual edits are not update targets", () => {
  const gap = Array.from({ length: 25 }, (_, index) => ({ id: `gap-${index}`, from: "user", text: "An unrelated exchange." }));
  assert.equal(validateMemoryDecision(initial, update, [arrived, ...gap, continued]), false);
  assert.equal(recentMemoryEpisodes([{ ...initial, userEdited: true }], [arrived, continued], [continued]).length, 0);
  assert.equal(validateMemoryDecision(initial, { ...update, kind: "preference" }, [arrived, continued]), false);
});

test("background extraction prioritizes ongoing source-linked episodes without extra model requests", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (_, options) => {
    calls++;
    const packet = JSON.parse(options.body);
    const input = JSON.parse(packet.messages.at(-1).content);
    assert.equal(input.existingMemories[0].id, "outing");
    assert.equal(input.existingMemories[0].recentEpisodeCandidate, true);
    assert.match(packet.messages[0].content, /real-world pause/i);
    return new Response(JSON.stringify({ message: { content: JSON.stringify({ memories: [update] }) } }));
  };
  try {
    const result = await extractIncrementalMemories({ ollamaUrl: "http://fixture", chatModel: "fixture" }, { profile: { name: "Nova" }, memories: [initial], messages: [arrived, continued] }, { messages: [continued] });
    assert.equal(result[0].action, "update");
    assert.equal(calls, 1);
  } finally { globalThis.fetch = original; }
});
