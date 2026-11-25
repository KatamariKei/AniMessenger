import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { discoveryRecognitionRules, exactDiscoveryQuoteParts, revelationHistoryWindows, validateHistoricalDiscoveries, publicDiscoveryHistory } from "../server/revelation-history.mjs";
import { createRevelationStore } from "../server/revelations.mjs";
import { reviewHistoricalDiscoveries } from "../server/ollama.mjs";

const character = { id: "fixture", name: "Fixture", series: "Selected", tags: [] };
const definition = { id: "craft", truth: "Her grandmother taught her clock repair.", revealCondition: "She shares who taught her." };
const thread = { id: "thread-one", character, messages: [
  { id: "user", from: "user", text: "Who taught you to repair clocks?" },
  { id: "guest", from: "character", speakerId: "other", text: "My grandmother taught me to repair clocks." },
  { id: "reply", from: "character", narration: "She smiles.", text: "My grandmother taught me to repair clocks." },
] };
const match = { discoveryId: "craft", userId: "user", characterMessageId: "reply",
  userQuote: "Who taught you to repair clocks?", characterQuote: "My grandmother taught me to repair clocks.", confidence: 0.99 };

test("flattened paragraph breaks and literal speech ellipses preserve exact discovery evidence", () => {
  const source = "I'm close with my grandmother.\n\nShe's the one who raised me.\n\nShe smiles.\n\nSometimes...\n\nwhen I'm away, I feel guilty.";
  const quote = "I'm close with my grandmother. She's the one who raised me. ... Sometimes... when I'm away, I feel guilty.";
  const parts = exactDiscoveryQuoteParts(quote, source);
  assert.equal(parts.length, 2);
  assert.ok(parts.every(part => source.includes(part)));
  assert.equal(exactDiscoveryQuoteParts(quote.replace("grandmother", "mother"), source), null);
});

test("history windows preserve exchanges, exclude guests and unpaired messages, and stay bounded", () => {
  const windows = revelationHistoryWindows(thread);
  assert.equal(windows.length, 1);
  assert.deepEqual(windows[0][0].messages.map(item => item.id), ["user", "reply"]);
  assert.deepEqual(revelationHistoryWindows({ ...thread, messages: [thread.messages[1], thread.messages[0]] }), []);
  const huge = revelationHistoryWindows({ ...thread, messages: [
    { ...thread.messages[0], text: "u".repeat(30000) },
    ...Array.from({ length: 20 }, (_, i) => ({ ...thread.messages[2], id: `reply-${i}`, text: "c".repeat(30000) })),
  ] });
  assert.equal(huge.length, 20);
  assert.ok(huge.every(window => JSON.stringify(window).length < 9000));
});

test("Story discovery evidence excludes hidden reply text and never borrows a guest's disclosure", () => {
  const storyThread = { ...thread, conversationMode: "story", messages: [
    ...thread.messages,
    { id: "guest-enters", from: "user", text: "[action: A visitor enters the workshop]" },
    { id: "guest-arrives", from: "character", speakerId: "other", narration: "The guest waves. My grandmother taught me to repair clocks.", text: "" },
  ] };
  const exchanges = revelationHistoryWindows(storyThread).flat();
  assert.equal(exchanges.length, 1);
  assert.equal(exchanges[0].messages[1].text, "She smiles.");
  assert.deepEqual(validateHistoricalDiscoveries([definition], exchanges, { matches: [match] }, { live: true }), []);
  assert.deepEqual(validateHistoricalDiscoveries([definition], exchanges, { matches: [{ ...match, userId: "guest-enters", characterMessageId: "guest-arrives" }] }, { live: true }), []);
  // The same words qualify when the host actually says them on screen.
  const visible = { ...storyThread, messages: storyThread.messages.map(message => message.id === "reply"
    ? { ...message, narration: 'She smiles. "My grandmother taught me to repair clocks."' } : message) };
  assert.equal(validateHistoricalDiscoveries([definition], revelationHistoryWindows(visible).flat(), { matches: [match] }, { live: true }).length, 1);
  // Legacy Story messages without narration still display their text.
  const legacy = { ...thread, conversationMode: "story", messages: thread.messages.map(message => ({ ...message, narration: "" })) };
  assert.equal(validateHistoricalDiscoveries([definition], revelationHistoryWindows(legacy).flat(), { matches: [match] }).length, 1);
});

test("confirmed history requires exact same-exchange user and correct-character evidence", () => {
  const window = revelationHistoryWindows(thread)[0];
  assert.equal(validateHistoricalDiscoveries([definition], window, { matches: [match] }).length, 1);
  for (const patch of [{ confidence: 0.89 }, { discoveryId: "unknown" }, { userQuote: "An invented question" },
    { characterMessageId: "guest" }, { characterQuote: "An invented confirmation." }, { userId: "another-user" }]) {
    assert.deepEqual(validateHistoricalDiscoveries([definition], window, { matches: [{ ...match, ...patch }] }), []);
  }
  assert.deepEqual(validateHistoricalDiscoveries([definition], window, { matches: {} }), []);
  assert.equal(validateHistoricalDiscoveries([definition], window, { matches: [match, match] }).length, 1);
});

test("natural discovery recognition shares one rule set and keeps exact evidence checks", () => {
  assert.match(discoveryRecognitionRules, /without making the user provoke actual anger/);
  assert.match(discoveryRecognitionRules, /merely liking ice cream does not establish/);
  const window = revelationHistoryWindows(thread)[0];
  assert.equal(validateHistoricalDiscoveries([definition], window, { matches: [{ ...match, confidence: 0.9 }] }).length, 1);
  assert.equal(validateHistoricalDiscoveries([definition], window, { matches: [{ ...match, confidence: 0.9, characterQuote: "Invented direct statement." }] }).length, 0);
});

test("multiple exact discovery excerpts count only in source order without invented words", () => {
  const source = '"Pistachio is my favorite flavor!" She smiled and continued. "I object to calling it grassy!"';
  const quote = '"Pistachio is my favorite flavor!" ... "I object to calling it grassy!"';
  assert.equal(exactDiscoveryQuoteParts(quote, source).length, 2);
  assert.equal(exactDiscoveryQuoteParts(quote.replace("grassy", "bitter"), source), null);
  assert.equal(exactDiscoveryQuoteParts('"I object to calling it grassy!" ... "Pistachio is my favorite flavor!"', source), null);
  const window = [{ userId: "u", messages: [{ id: "u", role: "user", text: "Which flavor do you like?" }, { id: "c", role: "character", text: source }] }];
  const result = validateHistoricalDiscoveries([{ id: "taste" }], window, { matches: [{ discoveryId: "taste", userId: "u", characterMessageId: "c", userQuote: "Which flavor do you like?", characterQuote: quote, confidence: 0.95 }] });
  assert.equal(result.length, 1);
  assert.equal(result[0].characterQuoteParts.length, 2);
});

test("history progress is spoiler-free and interrupted jobs are not reported as active", () => {
  const state = { definitions: [definition], historyReviews: { "thread-one": { status: "checking", checkedBatches: 2, totalBatches: 9, discoveries: [match] } } };
  assert.deepEqual(publicDiscoveryHistory(state, "thread-one", true), { status: "checking", checkedBatches: 2, totalBatches: 9, confirmed: 1 });
  assert.equal(publicDiscoveryHistory(state, "thread-one").status, "interrupted");
  assert.doesNotMatch(JSON.stringify(publicDiscoveryHistory(state, "thread-one")), /grandmother|repair|Quote|userId|discoveryId/);
  assert.equal(publicDiscoveryHistory(state, "other").confirmed, 0);
});

test("private history records are per-chat, append-only, retry-safe, and preserve definitions", async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ani-history-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const store = createRevelationStore(dir);
  await store.save(character, { status: "ready", definitions: [definition] });
  await Promise.all([1, 2].map(() => store.save(character, { historyReview: { status: "complete", discoveries: [match] } }, { historyThreadId: thread.id })));
  await store.save(character, { historyReview: { status: "failed", discoveries: [] } }, { historyThreadId: thread.id });
  const saved = await createRevelationStore(dir).load(character);
  assert.deepEqual(saved.definitions, [definition]);
  assert.equal(saved.status, "ready");
  assert.equal(saved.historyReviews[thread.id].discoveries.length, 1);
  assert.equal(saved.historyReviews.other, undefined);
});

test("semantic history review uses only local transcript and handles no-match uncertainty", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    calls++;
    assert.equal(url, "http://local-test/api/chat");
    const packet = JSON.parse(options.body);
    if (packet.format.properties.checks) return Response.json({ message: { content: JSON.stringify({ checks: [
      { index: 0, supported: true, confidence: .99, characterQuote: match.characterQuote },
    ] }) } });
    assert.match(packet.messages[0].content, /user guesses alone/i);
    assert.match(packet.messages[0].content, /uncertain guesses still mean no match/);
    assert.doesNotMatch(packet.messages.at(-1).content, /"guest"/);
    return new Response(JSON.stringify({ message: { content: JSON.stringify({ matches: calls === 1 ? [match] : [] }) } }));
  };
  try {
    const config = { ollamaUrl: "http://local-test", profileModel: "test" };
    const window = revelationHistoryWindows(thread)[0];
    assert.equal((await reviewHistoricalDiscoveries(config, character, [definition], window)).length, 1);
    assert.deepEqual(await reviewHistoricalDiscoveries(config, character, [definition], window), []);
    assert.deepEqual(await reviewHistoricalDiscoveries(config, character, [], window), []);
    assert.equal(calls, 3);
  } finally { globalThis.fetch = original; }
});
