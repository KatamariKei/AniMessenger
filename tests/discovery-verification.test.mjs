import test from "node:test";
import assert from "node:assert/strict";
import { extractIncrementalMemories, reviewHistoricalDiscoveries, verifyDiscoveryMatches } from "../server/ollama.mjs";

const config = { ollamaUrl: "http://fixture", chatModel: "loaded-chat" };
const character = { id: "fixture", name: "Fixture" };
const evidence = [
  { truth: "She grew up on an offshore island.", quote: "The lift is out of service, so the delivery will have to wait until morning." },
  { truth: "Her aunt taught her to restore old violins.", quote: "The clerk placed the receipt beside a stack of folded maps." },
];
const packet = item => {
  const definition = { id: "fact", truth: item.truth };
  const messages = [{ id: "u", from: "user", text: "What is happening here?" }, { id: "c", from: "character", text: item.quote }];
  const exchanges = [{ userId: "u", messages: messages.map(message => ({ id: message.id, role: message.from, text: message.text })) }];
  const match = { discoveryId: "fact", userId: "u", characterMessageId: "c", userQuote: messages[0].text, characterQuote: item.quote, confidence: .99 };
  return { definition, messages, exchanges, match };
};

test("unrelated real quotes cannot bypass verification through focused or memory review", async () => {
  const original = globalThis.fetch;
  try {
    for (const item of evidence) for (const path of ["focused", "memory"]) {
      const { definition, messages, exchanges, match } = packet(item);
      let checks = 0;
      globalThis.fetch = async (_url, options) => {
        const request = JSON.parse(options.body);
        if (request.format.properties.checks) {
          checks++;
          const claim = JSON.parse(request.messages.at(-1).content).claims[0];
          assert.equal(claim.characterText, item.quote);
          assert.equal(claim.fact, item.truth);
          assert.doesNotMatch(request.messages.at(-1).content, /profile|series|sources/);
          return Response.json({ message: { content: JSON.stringify({ checks: [{ index: 0, supported: false, confidence: 0, characterQuote: null }] }) } });
        }
        return Response.json({ message: { content: JSON.stringify({ matches: [match], memories: [], discoveryMatches: [match] }) } });
      };
      const result = path === "focused"
        ? await reviewHistoricalDiscoveries(config, character, [definition], exchanges, { live: true })
        : (await extractIncrementalMemories(config, { character, profile: { name: "Fixture" }, memories: [] }, { messages },
          { achievementReviewBatch: [], discoveryDefinitions: [definition], discoveryExchanges: exchanges })).discoveryMatches;
      assert.deepEqual(result, [], path);
      assert.equal(checks, 1);
    }
  } finally { globalThis.fetch = original; }
});

test("verification requires a single confident supported verdict and a real quote, and fails closed", async () => {
  const original = globalThis.fetch;
  const { definition, exchanges, match } = packet({ truth: "Her grandmother taught her clock repair.", quote: "My grandmother showed me how to repair clocks." });
  const approved = { index: 0, supported: true, confidence: .99, characterQuote: match.characterQuote };
  try {
    for (const checks of [[], [{ ...approved, supported: false }], [{ ...approved, confidence: .94 }],
      [{ ...approved, characterQuote: "An entirely invented statement." }], [approved, approved]]) {
      globalThis.fetch = async () => Response.json({ message: { content: JSON.stringify({ checks }) } });
      assert.deepEqual(await verifyDiscoveryMatches(config, [definition], exchanges, [match]), []);
    }
    globalThis.fetch = async () => { throw new Error("Model unavailable"); };
    assert.deepEqual(await verifyDiscoveryMatches(config, [definition], exchanges, [match]), []);
    globalThis.fetch = async () => Response.json({ message: { content: JSON.stringify({ checks: [approved] }) } });
    const result = await verifyDiscoveryMatches(config, [definition], exchanges, [match]);
    assert.equal(result.length, 1);
    assert.equal(result[0].evidenceVerificationVersion, 1);
    assert.equal(result[0].characterQuote, match.characterQuote);
  } finally { globalThis.fetch = original; }
});
