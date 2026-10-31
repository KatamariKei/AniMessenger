import test from "node:test";
import assert from "node:assert/strict";
import { createSingleFlight } from "../server/single-flight.mjs";
import { createPerformanceMetrics } from "../server/performance-metrics.mjs";
import { resolveOllamaContextWindow } from "../server/context-builder.mjs";
import { chatAsCharacter } from "../server/ollama.mjs";
import { mergeMemories } from "../server/memory.mjs";
import { researchCharacter } from "../server/research.mjs";
import { researchCharacterDiscoveries } from "../server/revelation-research.mjs";

const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const bounded = promise => {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Concurrent work did not start")), 1500); })]).finally(() => clearTimeout(timer));
};

test("overlapping identical work is shared, distinct work stays separate, and failures can retry", async () => {
  const run = createSingleFlight();
  const gate = deferred();
  let calls = 0;
  const a = run("same", async () => { calls++; await gate.promise; return "shared"; });
  assert.equal(run("same", () => { throw new Error("duplicate work"); }), a);
  assert.equal(await run("different", async () => "independent"), "independent");
  gate.resolve();
  assert.equal(await a, "shared");
  assert.equal(calls, 1);
  await assert.rejects(run("same", async () => { throw new Error("synthetic failure"); }), /synthetic failure/);
  assert.equal(await run("same", async () => "retried"), "retried");
});

test("performance records are bounded, numeric and exclude content, identities and arbitrary labels", () => {
  const metrics = createPerformanceMetrics(2);
  metrics.record("chat", { totalMs: 12, prompt: "PRIVATE TEXT", characterId: "PRIVATE ID", label: "PRIVATE LABEL", stages: { recall: 3, "PRIVATE STAGE": 7 } });
  const first = metrics.snapshot();
  assert.equal(JSON.stringify(first).includes("PRIVATE"), false);
  assert.equal(first.recent[0].stages.recall, 3);
  first.recent[0].totalMs = 999;
  assert.equal(metrics.snapshot().recent[0].totalMs, 12);
  metrics.record("model", { wallMs: Infinity, outputTokens: -1, label: "chat" });
  metrics.record("research", { totalMs: 8 });
  assert.equal(metrics.snapshot().recent.length, 2);
  assert.equal(metrics.snapshot().recent[0].wallMs, 0);
});

test("simultaneous model context checks reuse one request and preserve the existing cache", async t => {
  const gate = deferred();
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => { calls++; await gate.promise; return Response.json({ models: [{ name: "shared:latest", context_length: 16384 }] }); });
  const config = { ollamaUrl: "http://metadata-single-flight.invalid" };
  const pending = Promise.all(Array.from({ length: 6 }, () => resolveOllamaContextWindow(config, "shared")));
  await Promise.resolve();
  assert.equal(calls, 1);
  gate.resolve();
  assert.deepEqual(await pending, Array(6).fill(16384));
  assert.equal(await resolveOllamaContextWindow(config, "shared"), 16384);
  assert.equal(calls, 1);
});

test("chat starts metadata lookup alongside semantic recall and retains the recalled evidence", async t => {
  const recall = deferred(), context = deferred(), recallStarted = deferred(), contextStarted = deferred();
  let generation;
  const memories = mergeMemories([], [{ id: "sunrise", kind: "shared_event", text: "The user and Mira watched the sunrise from a quiet rooftop.", keywords: ["sunrise", "rooftop"], importance: 4 }]);
  t.mock.method(globalThis, "fetch", async (url, options) => {
    if (String(url).endsWith("/api/ps")) { contextStarted.resolve(); await context.promise; return Response.json({ models: [{ name: "chat-overlap", context_length: 8192 }] }); }
    const body = JSON.parse(options.body);
    if (body.format.properties.memoryIds) { recallStarted.resolve(); await recall.promise; return Response.json({ message: { content: JSON.stringify({ memoryIds: [memories[0].id] }) } }); }
    generation = body;
    return Response.json({ message: { content: JSON.stringify({ reply: "We watched the sunrise from the rooftop.", narration: null, scene: {}, memoryCandidates: [], shouldSendPhoto: false }) } });
  });
  const profile = { id: "test", name: "Mira", series: "Synthetic", age: 25, summary: "Synthetic", status: "Ready", visual: { identity: [], signature: [], defaultWardrobe: "coat", wardrobePreferences: [] }, persona: { traits: [], mannerisms: [], speechStyle: "Plain", emotionalRules: [], exampleLines: [] }, canon: { overview: "Synthetic", history: [], relationships: [], knowledge: [], boundaries: [] }, sources: [] };
  const pending = chatAsCharacter({ ollamaUrl: "http://chat-overlap.invalid", chatModel: "chat-overlap" }, { id: "test", character: { id: "test", name: "Mira" }, profile, relationship: 8, messages: [], memories, scene: { location: "garden", activity: "talking", outfit: "coat", expression: "natural", lighting: "daylight", presence: "apart" } }, "Do you remember our dawn together?");
  await bounded(Promise.all([recallStarted.promise, contextStarted.promise]));
  assert.equal(generation, undefined);
  recall.resolve(); context.resolve();
  const result = await pending;
  assert.match(result.reply, /sunrise/);
  assert.match(generation.messages[0].content, /sunrise from a quiet rooftop/);
});

test("independent discovery detail pages run together but retain source order", async () => {
  const history = deferred(), relationships = deferred(), started = deferred();
  let active = 0;
  const pending = researchCharacterDiscoveries({ name: "Character" }, { evidence: { passages: [{ id: "cached", provider: "franchise_wiki", url: "https://fixture.fandom.com/wiki/Character", text: "Cached evidence" }] } }, {
    fetchPage: async (_host, title) => {
      if (title !== "Character") { active++; if (active === 2) started.resolve(); await (title.endsWith("History") ? history.promise : relationships.promise); }
      return { pageid: title, title, wikitext: { "*": (title === "Character" ? "[[Character/History]] [[Character/Relationships]] " : "") + "Grounded history and relationships. ".repeat(8) } };
    }, searchPages: async () => { throw new Error("Linked pages should avoid search"); },
  });
  await bounded(started.promise);
  relationships.resolve(); history.resolve();
  const result = await pending;
  assert.deepEqual(result.evidence.passages.slice(0, 3).map(item => item.title), ["Character", "Character/History", "Character/Relationships"]);
});

test("wiki fallback checks are bounded and keep source priority despite reverse completion", async t => {
  const first = deferred(), second = deferred(), started = deferred();
  let active = 0, maximum = 0;
  t.mock.method(globalThis, "fetch", async url => {
    const target = new URL(String(url));
    if (target.host === "en.wikipedia.org") return Response.json({ query: { pages: {} } });
    if (target.host === "graphql.anilist.co") return Response.json({ data: { Character: null } });
    if (target.searchParams.get("action") === "query") return Response.json({ query: { search: [{ title: "Preferred Android" }, { title: "Later Android" }, { title: "Wrong Android" }] } });
    const title = target.searchParams.get("page");
    if (title === "2B") return Response.json({ parse: null });
    active++; maximum = Math.max(maximum, active); if (active === 3) started.resolve();
    await (title === "Preferred Android" ? first.promise : second.promise);
    active--;
    if (title === "Wrong Android") throw new Error("One unavailable page must not discard verified alternatives");
    return Response.json({ parse: { title, pageid: title, wikitext: { "*": "Also known as 2B in NieR Automata, she is a YoRHa android with a carefully guarded mission." } } });
  });
  const pending = researchCharacter({ id: "2b", name: "2B", series: "NieR" });
  await bounded(started.promise);
  second.resolve(); first.resolve();
  const result = await pending;
  assert.equal(maximum, 3);
  assert.equal(result.evidence.passages.find(item => item.provider === "franchise_wiki").title, "Preferred Android");
});

test("a verified preferred fallback page does not wait for slower lower-priority pages", async t => {
  const slower = deferred();
  t.mock.method(globalThis, "fetch", async url => {
    const target = new URL(String(url));
    if (target.host === "en.wikipedia.org") return Response.json({ query: { pages: {} } });
    if (target.host === "graphql.anilist.co") return Response.json({ data: { Character: null } });
    if (target.searchParams.get("action") === "query") return Response.json({ query: { search: [{ title: "Preferred Android" }, { title: "Slower Android" }] } });
    const title = target.searchParams.get("page");
    if (title === "2B") return Response.json({ parse: null });
    if (title === "Slower Android") await slower.promise;
    return Response.json({ parse: { title, pageid: title, wikitext: { "*": "Also known as 2B in NieR Automata, she is a YoRHa android with a carefully guarded mission." } } });
  });
  try {
    const result = await bounded(researchCharacter({ id: "2b", name: "2B", series: "NieR" }));
    assert.equal(result.evidence.passages.find(item => item.provider === "franchise_wiki").title, "Preferred Android");
  } finally { slower.resolve(); }
});
