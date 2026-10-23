import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { focusedDiscoveryPacket, reviewFocusedDiscoveries } from "../server/discovery-review.mjs";
import { reviewHistoricalDiscoveries } from "../server/ollama.mjs";
import { validateHistoricalDiscoveries } from "../server/revelation-history.mjs";
import { exactDiscoveryQuoteParts } from "../server/revelation-history.mjs";

const character = { id: "nova", name: "Nova", series: "Fixture" };
const definition = { id: "craft", truth: "Her grandmother taught her clock repair during summer visits.", clue: "An old clock catches her attention." };
const thread = { id: "chat", character, messages: [
  { id: "u1", from: "user", text: "Where did you learn to fix clocks?" },
  { id: "c1", from: "character", text: "My grandmother showed me how to repair clocks." },
] };
const state = { definitions: [definition], historyReviews: { chat: { activeLeadId: "craft" } } };
const match = { discoveryId: "craft", userId: "u1", characterMessageId: "c1", userQuote: thread.messages[0].text,
  characterQuote: thread.messages[1].text, confidence: .86 };

test("focused discovery reviews are bounded, scoped, and skip confirmed or already reviewed replies", () => {
  assert.equal(focusedDiscoveryPacket(state, thread).definitions.length, 1);
  assert.equal(focusedDiscoveryPacket(state, thread).latestReplyId, "c1");
  assert.equal(focusedDiscoveryPacket({ ...state, historyReviews: { chat: { discoveries: [{ discoveryId: "craft" }] } } }, thread), null);
  assert.equal(focusedDiscoveryPacket({ ...state, historyReviews: { chat: { lastFocusedReviewMessageId: "c1" } } }, thread), null);
  assert.equal(focusedDiscoveryPacket(state, { ...thread, messages: [thread.messages[0], { ...thread.messages[1], speakerId: "another-character" }] }), null);
  assert.equal(focusedDiscoveryPacket({ definitions: [definition] }, { ...thread, messages: [
    { id: "u2", from: "user", text: "Let's walk along the beach." }, { id: "c2", from: "character", text: "She walks beside you in the sunshine." },
  ] }), null);
});

test("focused review preserves partial core meanings and stores only diagnostic counts", async () => {
  const result = await reviewFocusedDiscoveries({}, state, thread, async (_config, selected, definitions, exchanges, options) => {
    assert.equal(selected.id, character.id);
    assert.equal(definitions[0].id, "craft");
    assert.equal(options.live, true);
    options.onReviewResult({ proposed: { matches: [match] } });
    return validateHistoricalDiscoveries(definitions, exchanges, { matches: [match] }, options);
  });
  assert.equal(result.matches[0].origin, "live_chat");
  assert.equal(result.historyReview.focusedReview.outcome, "matched");
  assert.doesNotMatch(JSON.stringify(result.historyReview), /grandmother|userQuote|characterQuote/);
  assert.equal(validateHistoricalDiscoveries([definition], focusedDiscoveryPacket(state, thread).exchanges, { matches: [match] }).length, 0);
  for (const patch of [{ confidence: .84 }, { confidence: 1.1 }, { characterQuote: "A completely invented quotation." }, { userId: "invented" }]) {
    assert.equal(validateHistoricalDiscoveries([definition], focusedDiscoveryPacket(state, thread).exchanges, { matches: [{ ...match, ...patch }] }, { live: true }).length, 0);
  }
});

test("focused diagnostics distinguish an empty semantic result from invalid evidence", async () => {
  for (const proposed of [[], [match]]) {
    const result = await reviewFocusedDiscoveries({}, state, thread, async (_config, _character, _definitions, _window, options) => {
      options.onReviewResult({ proposed: { matches: proposed } }); return [];
    });
    assert.equal(result.historyReview.focusedReview.outcome, proposed.length ? "evidence-not-validated" : "no-semantic-match");
  }
});

test("ordered exact excerpts accept compact ellipses without relaxing source grounding", () => {
  const source = "My grandmother taught me clock repair. We spent summer mornings together in her workshop. She helped me rebuild my first clock.";
  for (const separator of ["...", "... ", " … ", "…"]) {
    assert.deepEqual(exactDiscoveryQuoteParts(`My grandmother taught me clock repair${separator}She helped me rebuild my first clock`, source),
      ["My grandmother taught me clock repair", "She helped me rebuild my first clock"]);
  }
  assert.equal(exactDiscoveryQuoteParts("She helped me rebuild my first clock...My grandmother taught me clock repair", source), null);
  assert.equal(exactDiscoveryQuoteParts("My grandfather taught me clock repair...She helped me rebuild my first clock", source), null);
});

test("live reviews reuse the chat model and ask for core meaning rather than every reference detail", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    assert.equal(body.model, "already-loaded-chat");
    assert.match(body.messages[0].content, /partial explanations|distinctive core/);
    assert.match(body.messages[0].content, /exact source quotes/);
    assert.equal(body.options.num_predict, 800);
    return new Response(JSON.stringify({ message: { content: JSON.stringify({ matches: [match] }) } }));
  };
  try {
    const results = await reviewHistoricalDiscoveries({ ollamaUrl: "http://fixture", chatModel: "already-loaded-chat", profileModel: "other-model" },
      character, [definition], focusedDiscoveryPacket(state, thread).exchanges, { live: true });
    assert.equal(results.length, 1);
  } finally { globalThis.fetch = original; }
});

test("reply delivery schedules focused discovery review independently of image-delayed memories", () => {
  const source = fs.readFileSync(new URL("../server/index.mjs", import.meta.url), "utf8");
  assert.match(source, /sendJson\(response, 200, \{ thread, reply,[\s\S]*?scheduleFocusedDiscoveryReview\(config, thread.id\)/);
  assert.match(source, /if \(relatedThread\) scheduleFocusedDiscoveryReview\(config, relatedThread.id\)/);
  assert.match(source, /focusedDiscoveryRunning \|\| focusedDiscoveryQueue.size/);
});
