import test from "node:test";
import assert from "node:assert/strict";
import { buildTokenAwareMessages, compactSystemContext, estimateTokens } from "../server/context-builder.mjs";

test("token estimation is deterministic and punctuation aware", () => {
  assert.equal(estimateTokens("hello"), estimateTokens("hello"));
  assert.ok(estimateTokens("A long sentence with punctuation, JSON: {\"ok\":true}.") > estimateTokens("hello"));
});

test("context builder preserves the newest exchanges and omits old history within a small window", () => {
  const history = Array.from({ length: 20 }, (_, index) => ({
    role: index % 2 ? "assistant" : "user",
    content: `turn-${index} ` + "detail ".repeat(90),
  }));
  const result = buildTokenAwareMessages({
    systemContext: "You are a character.\nReturn JSON only.",
    history,
    current: { role: "user", content: "latest request" },
    contextWindow: 4096,
  });
  const transcript = result.messages.map((message) => message.content).join("\n");
  assert.match(transcript, /turn-19/);
  assert.doesNotMatch(transcript, /turn-0 /);
  assert.match(transcript, /latest request/);
  assert.ok(result.diagnostic.historyItemsOmitted > 0);
  assert.ok(result.diagnostic.estimatedInputTokens <= result.diagnostic.contextWindow);
});

test("context builder never fills around an omitted newer passage with older fragments", () => {
  const result = buildTokenAwareMessages({
    systemContext: "Current scene is the beach.\n" + "rule ".repeat(1000),
    history: [
      { role: "assistant", content: "old-restaurant-fragment" },
      { role: "user", content: "new-beach-action " + "detail ".repeat(1600) },
    ],
    controls: [{ role: "system", content: "The beach is authoritative." }],
    current: { role: "user", content: "latest request" },
    contextWindow: 4096,
    responseReserve: 1600,
  });
  const transcript = result.messages.map((message) => message.content).join("\n");
  assert.doesNotMatch(transcript, /old-restaurant-fragment/);
  assert.doesNotMatch(transcript, /new-beach-action/);
  assert.match(transcript, /The beach is authoritative/);
});

test("profile compaction drops examples before core identity and response rules", () => {
  const source = [
    "You are Misato.",
    "CORE: confident and warm",
    "VOICE RANGE EXAMPLES: " + "example ".repeat(700),
    "RETURN JSON ONLY: reply is required",
  ].join("\n");
  const compacted = compactSystemContext(source, 180);
  assert.match(compacted, /You are Misato/);
  assert.match(compacted, /RETURN JSON ONLY/);
  assert.doesNotMatch(compacted, /VOICE RANGE EXAMPLES/);
});

test("vision turns reserve extra context space", () => {
  const common = {
    systemContext: "Character profile",
    history: [],
    current: { role: "user", content: "Look at this", images: ["pixels"] },
    contextWindow: 8192,
  };
  const text = buildTokenAwareMessages({ ...common, imageInput: false });
  const vision = buildTokenAwareMessages({ ...common, imageInput: true });
  assert.ok(vision.diagnostic.inputBudget < text.diagnostic.inputBudget);
});
