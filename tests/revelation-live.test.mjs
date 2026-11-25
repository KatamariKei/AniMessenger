import test from "node:test";
import assert from "node:assert/strict";
import { availableDiscoveryLeads, discoveryChatContext, discoveryTurnMessages, publicDiscoveries } from "../server/revelation-live.mjs";
import { discoveryBondBonus, normalizeRelationshipProgress, preserveNewerRelationshipProgress, progressionResponseReplacer } from "../server/relationship.mjs";
import { extractIncrementalMemories, normalizeOllamaMessages } from "../server/ollama.mjs";
import { revelationHistoryWindows } from "../server/revelation-history.mjs";
import { buildTokenAwareMessages } from "../server/context-builder.mjs";
import { validateHistoricalDiscoveries } from "../server/revelation-history.mjs";

const definition = { id: "clock", title: "A familiar craft", truth: "Her grandmother taught her clock repair.", minimumTrust: 20,
  clue: "An old clock catches her attention.", directQuestion: "Who taught you clock repair?", revealCondition: "She shares who taught her." };
const character = { id: "fixture", name: "Fixture", series: "Selected" };
const thread = { id: "chat", character, relationship: 30, profile: { name: "Fixture" }, messages: [
  { id: "u", from: "user", text: "Who taught you clock repair?" },
  { id: "c", from: "character", text: "My grandmother taught me clock repair when I was young." },
] };
const state = { definitions: [definition], historyReviews: {} };

test("leads expose only encountered clues; readiness never exposes unseen truths", () => {
  assert.deepEqual(availableDiscoveryLeads(state, thread), ["clock"]);
  assert.deepEqual(availableDiscoveryLeads(state, { ...thread, relationship: 8 }), []);
  assert.deepEqual(publicDiscoveries(state, thread), { leadAvailability: { prepared: 1, newAvailable: 1, locked: 0, nextTrust: null }, leads: [], revealed: [] });
  const encountered = { ...state, historyReviews: { chat: { encounteredLeadIds: ["clock"], activeLeadId: "clock" } } };
  const projection = publicDiscoveries(encountered, thread);
  assert.equal(projection.leads[0].active, true);
  assert.doesNotMatch(JSON.stringify(projection), /grandmother|revealCondition|minimumTrust|directQuestion/);
});

test("lead availability distinguishes missing research, encountered clues and trust gates without spoilers", () => {
  const extra = { ...definition, id: "second", minimumTrust: 80 };
  const partial = { ...state, definitions: [definition, extra], historyReviews: { chat: { encounteredLeadIds: ["clock"] } } };
  assert.deepEqual(publicDiscoveries(partial, thread).leadAvailability, { prepared: 2, newAvailable: 0, locked: 1, nextTrust: 80 });
  assert.deepEqual(publicDiscoveries(partial, { ...thread, relationship: 100 }).leadAvailability, { prepared: 2, newAvailable: 1, locked: 0, nextTrust: null });
});

test("chat knowledge is scoped to a pursued lead or relevant direct question", () => {
  assert.equal(discoveryChatContext(state, thread, "Let's head to the beach."), "");
  assert.match(discoveryChatContext(state, thread, "Who taught you clock repair?"), /grandmother/);
  const active = { ...state, historyReviews: { chat: { encounteredLeadIds: ["clock"], activeLeadId: "clock" } } };
  assert.match(discoveryChatContext(active, thread, "Tell me about that."), /grandmother/);
  assert.equal(discoveryChatContext({ ...state, historyReviews: { chat: { activeLeadId: "clock" } } }, thread, "Tell me about that."), "");
});

test("confirmed knowledge stays known and is public only for its own conversation", () => {
  const discovered = { ...state, historyReviews: { chat: { discoveries: [{ discoveryId: "clock", origin: "live_chat" }] } } };
  assert.deepEqual(availableDiscoveryLeads(discovered, thread), []);
  assert.match(discoveryChatContext(discovered, thread, "What happened?"), /alreadySharedWithUser.*grandmother/);
  assert.equal(publicDiscoveries(discovered, { ...thread, discoveryAwardIds: ["clock"] }).revealed[0].bondReward, 5);
  assert.deepEqual(publicDiscoveries(discovered, { ...thread, id: "other-chat" }).revealed, []);
});

test("pursued self-knowledge survives a crowded profile and follows older denials", () => {
  const active = { ...state, historyReviews: { chat: { encounteredLeadIds: ["clock"], activeLeadId: "clock" } } };
  const knowledge = discoveryChatContext(active, thread, "Who taught you that skill?");
  assert.match(knowledge, /Do not replace a known answer with invented ignorance/);
  assert.match(knowledge, /memory loss do not erase/);
  assert.match(knowledge, /Preserve explicit user-established alternate story events/);
  const result = buildTokenAwareMessages({ systemContext: "CORE: " + "A long profile. ".repeat(3000),
    history: [{ role: "assistant", content: "I do not know who taught me." }],
    controls: discoveryTurnMessages(knowledge), current: { role: "user", content: "Who taught you that skill?" },
    contextWindow: 4096, responseReserve: 1600 });
  assert.equal(result.diagnostic.systemCompacted, true);
  assert.equal(result.messages.at(-2).role, "user");
  assert.match(result.messages.at(-2).content, /NOT A SPOKEN USER TURN/);
  assert.match(result.messages.at(-2).content, /grandmother/);
  const normalized = normalizeOllamaMessages(result.messages);
  assert.match(normalized.at(-2).content, /grandmother/);
  assert.equal(normalized.at(-1).content, "Who taught you that skill?");
  assert.deepEqual(discoveryTurnMessages(""), []);
});

test("a short natural follow-up can count when the character shares an unequivocal truth", () => {
  const short = { ...thread, messages: [{ ...thread.messages[0], text: "Why?" }, thread.messages[1]] };
  assert.equal(validateHistoricalDiscoveries([definition], revelationHistoryWindows(short).flat(), { matches: [{
    discoveryId: "clock", userId: "u", characterMessageId: "c", userQuote: "Why?", characterQuote: short.messages[1].text, confidence: 0.99,
  }] }).length, 1);
});

test("discovery bonuses grant exactly five once, bypass ordinary slowdown, and preserve hidden cap", () => {
  const first = discoveryBondBonus({ ...thread, relationship: 98 }, ["clock", "clock"]);
  assert.equal(first.bondScore, 103);
  assert.equal(first.relationship, 100);
  assert.equal(first.relationshipMilestones.at(-1).label, "Total bond");
  assert.deepEqual(discoveryBondBonus({ ...thread, ...first }, ["clock"]), first);
  const peak = discoveryBondBonus({ ...thread, bondScore: 198 }, ["clock"]);
  assert.equal(peak.bondScore, 200);
  assert.equal(peak.soulboundEarned, true);
  assert.deepEqual(normalizeRelationshipProgress(first).discoveryAwardIds, ["clock"]);
  assert.deepEqual(preserveNewerRelationshipProgress(first, { progressionRevision: 0 }).discoveryAwardIds, ["clock"]);
  assert.doesNotMatch(JSON.stringify(first, progressionResponseReplacer), /discoveryAwardIds|bondScore/);
});

test("memory discovery proposals require independent verification of their exact evidence", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  const exchange = revelationHistoryWindows(thread).flat();
  globalThis.fetch = async (_url, options) => {
    if (String(_url).endsWith("/api/ps")) return Response.json({ models: [] });
    calls++;
    const packet = JSON.parse(options.body);
    if (packet.format.properties.checks) return Response.json({ message: { content: JSON.stringify({ checks: [
      { index: 0, supported: true, confidence: .99, characterQuote: thread.messages[1].text },
    ] }) } });
    assert.ok(packet.format.properties.discoveryMatches);
    assert.match(packet.messages[0].content, /never outside knowledge|never outside|never outside knowledge/i);
    return new Response(JSON.stringify({ message: { content: JSON.stringify({ memories: [], discoveryMatches: [{
      discoveryId: "clock", userId: "u", characterMessageId: "c", userQuote: thread.messages[0].text,
      characterQuote: thread.messages[1].text, confidence: 0.99,
    }] }) } }));
  };
  try {
    const result = await extractIncrementalMemories({ ollamaUrl: "http://fixture", chatModel: "test" }, thread, { messages: thread.messages }, {
      achievementReviewBatch: [], discoveryDefinitions: [definition], discoveryExchanges: exchange,
    });
    assert.equal(calls, 2);
    assert.deepEqual(result.memories, []);
    assert.equal(result.discoveryMatches[0].origin, "live_chat");
  } finally { globalThis.fetch = original; }
});
