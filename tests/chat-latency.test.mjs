import test from "node:test";
import assert from "node:assert/strict";
import { chatKeepAlive, createModelContextPolicy } from "../server/model-runtime.mjs";
import { defaultConfig, normalizeConfigPaths } from "../server/config.mjs";
import { chatAsCharacter, reviewHistoricalDiscoveries } from "../server/ollama.mjs";
import { performanceMetrics } from "../server/performance-metrics.mjs";
import { promptDiagnostics } from "../server/prompt-diagnostics.mjs";
import { photoPolicyInstructions } from "../server/photo-prompt-policy.mjs";
import { discoveryChatContext } from "../server/revelation-live.mjs";
import { characterFidelityInstruction } from "../server/character-fidelity.mjs";
import { mergeMemories } from "../server/memory.mjs";
import { userLocalTimeContext } from "../server/time-context.mjs";
import { characterChatSchema, storyCharacterChatSchema, checkpointMemoryExtractionSchema } from "../server/ollama-schemas.mjs";

test("chat residency is bounded, configurable, and applies only to the selected chat model", () => {
  assert.equal(defaultConfig.chatKeepAliveMinutes, 15);
  for (const [input, expected] of [[undefined, 15], [null, 15], ["bad", 15], [-3, 0], [0, 0], [7.9, 7], [90, 60]]) {
    const config = normalizeConfigPaths({ chatModel: "synthetic", chatKeepAliveMinutes: input });
    assert.equal(config.chatKeepAliveMinutes, expected);
    assert.deepEqual(chatKeepAlive(config, "synthetic:latest"), expected ? { keep_alive: `${expected}m` } : {});
  }
  assert.deepEqual(chatKeepAlive({ chatModel: "synthetic" }, "synthetic"), { keep_alive: "15m" });
  assert.deepEqual(chatKeepAlive({ chatModel: "synthetic" }, "separate-research"), {});
  assert.deepEqual(chatKeepAlive({}, "synthetic"), {});
});

test("foreground replies omit memory extraction while background memory capture stays enabled", () => {
  assert.equal(characterChatSchema.properties.memoryCandidates.maxItems, 0);
  assert.equal(storyCharacterChatSchema.properties.memoryCandidates.maxItems, 0);
  assert.notEqual(checkpointMemoryExtractionSchema.properties.memories.maxItems, 0);
});

test("context policy inherits small Ollama defaults without turning 64K into a global requirement", async () => {
  for (const observed of [4096, 8192, 16384, 32768, 65536]) {
    const config = { ollamaUrl: "http://context.invalid", chatModel: "synthetic" };
    let inspected = 0;
    const policy = createModelContextPolicy(async () => { inspected++; return observed; });
    assert.equal(policy.requestContext(config, "synthetic"), undefined);
    assert.equal(policy.requestContext(config, "synthetic", 16384), 16384);
    await Promise.all(Array.from({ length: 4 }, () => policy.observeDefault(config, "synthetic:latest")));
    assert.equal(inspected, 1);
    assert.equal(policy.defaultContext(config, "synthetic"), observed);
    // Ordinary chat never receives a context override, including on a 4K setup.
    assert.equal(policy.requestContext(config, "synthetic"), undefined);
    assert.equal(policy.requestContext(config, "synthetic", 16384), observed >= 16384 ? undefined : 16384);
    assert.equal(policy.requestContext(config, "separate-research", 16384), 16384);
    assert.equal(policy.requestContext({ ...config, ollamaUrl: "http://another.invalid" }, "synthetic", 16384), 16384);
    assert.equal(policy.requestContext(config, "synthetic", 131072), 131072);
  }
});

test("missing runtime metadata preserves existing research allocations and cannot fail a reply", async () => {
  const config = { chatModel: "synthetic" };
  for (const inspect of [async () => 0, async () => { throw new Error("Metadata unavailable"); }]) {
    const policy = createModelContextPolicy(inspect);
    await assert.doesNotReject(policy.observeDefault(config, "synthetic"));
    assert.equal(policy.defaultContext(config, "synthetic"), 0);
    assert.equal(policy.requestContext(config, "synthetic"), undefined);
    assert.equal(policy.requestContext(config, "synthetic", 16384), 16384);
  }
});

const fixture = () => ({
  id: "latency-test", character: { id: "latency-test", name: "Mira", series: "Synthetic" },
  conversationMode: "chat", relationship: 8,
  memories: mergeMemories([], [{ id: "m1", kind: "shared_event", text: "The user and Mira planted a silver birch together.", keywords: ["planted", "tree"], importance: 4 }]),
  messages: [{ id: "old", from: "character", text: "The garden gate needs painting." }],
  scene: { location: "garden", environment: "a garden path", activity: "waiting", outfit: "blue coat", expression: "natural", lighting: "daylight", presence: "together" },
  profile: { id: "latency-test", name: "Mira", series: "Synthetic", age: 25, summary: "A patient botanist who loves practical projects.", status: "Ready", visual: { identity: ["brown eyes"], signature: [], defaultWardrobe: "blue coat", wardrobePreferences: [] }, persona: { traits: ["curious"], mannerisms: [], speechStyle: "Plain", emotionalRules: [], exampleLines: ["There is always something growing.", "Let us see what the soil tells us.", "A little patience helps.", "I have an idea."] }, canon: { overview: "Synthetic", history: [], relationships: [], knowledge: ["Botany"], boundaries: [] }, sources: [] },
});

test("chat, a discovery review, and the next reply all inherit a learned 64K default", async t => {
  const config = { ollamaUrl: "http://shared-64k.invalid", chatModel: "shared-64k", ollamaThinking: false };
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    if (String(url).endsWith("/api/ps")) return Response.json({ models: [{ name: config.chatModel, context_length: 65536 }] });
    const body = JSON.parse(options.body);
    calls.push(body);
    const output = body.format.properties.matches ? { matches: [] }
      : { reply: "The path looks clear; we can walk to the greenhouse.", relationshipDelta: 0, scene: {}, sceneEvidence: {}, memoryCandidates: [], shouldSendPhoto: false, achievementSignals: [] };
    return Response.json({ message: { content: JSON.stringify(output) } });
  });
  const original = fixture();
  await chatAsCharacter(config, original, "What next?");
  await reviewHistoricalDiscoveries(config, original.character, [{ id: "d1", truth: "Mira loves botany.", revealCondition: "Discuss interests." }], [{ userId: "u1", messages: [] }], { live: true });
  await chatAsCharacter(config, original, "What next?");
  assert.equal(calls.length, 3);
  for (const call of calls) assert.equal(Object.hasOwn(call.options, "num_ctx"), false);
  const records = performanceMetrics.snapshot().recent.filter(entry => entry.kind === "model");
  assert.equal(records.at(-2).label, "discovery_review");
  assert.deepEqual(records.slice(-3).map(entry => entry.contextTokens), [65536, 65536, 65536]);
  assert.equal(records.at(-1).cache.interveningRequests, 1);
  assert.equal(records.at(-1).cache.interveningKinds.discovery, 1);
  assert.equal(records.at(-1).cache.previousComplete, 1);
  assert.ok(records.at(-1).modelRequestNumber > records.at(-3).modelRequestNumber);
  for (const call of calls) {
    assert.equal(Object.hasOwn(call, "traceConversation"), false);
    assert.equal(Object.hasOwn(call, "cache"), false);
    assert.equal(Object.hasOwn(call, "metadata"), false);
  }
});

test("consecutive prompts reuse the character rules while updating time, memories, relationship, scene and history", async t => {
  const calls = [];
  const config = { ollamaUrl: "http://latency-test.invalid", chatModel: "latency-test", ollamaThinking: false };
  t.mock.method(globalThis, "fetch", async (url, options) => {
    if (String(url).endsWith("/api/ps")) return Response.json({ models: [{ name: config.chatModel, context_length: 16384 }] });
    assert.ok(String(url).endsWith("/api/chat"));
    calls.push(JSON.parse(options.body));
    return Response.json({ message: { content: JSON.stringify({ reply: "The path looks clear; we can walk to the greenhouse.", relationshipDelta: 0, scene: {}, sceneEvidence: {}, memoryCandidates: [], shouldSendPhoto: false, achievementSignals: [] }) }, prompt_eval_cached_count: calls.length === 1 ? 123 : null });
  });
  const original = fixture();
  await chatAsCharacter(config, original, "Let us check the tree we planted together.", undefined, { now: new Date(2026, 9, 26, 12, 0) });
  const changed = structuredClone(original);
  changed.relationship = 9;
  changed.scene.location = "greenhouse";
  changed.memories[0].text = "The user and Mira planted a copper beech together.";
  changed.messages.push({ id: "new", from: "user", text: "I finished painting the garden gate." });
  await chatAsCharacter({ ...config, chatKeepAliveMinutes: 0 }, changed, "Let us check the tree we planted together.", undefined, { now: new Date(2026, 9, 26, 12, 1) });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].keep_alive, "15m");
  assert.equal(Object.hasOwn(calls[1], "keep_alive"), false);
  const [first, second] = calls.map(call => call.messages[0].content);
  const firstTurn = JSON.parse(calls[0].messages.at(-1).content);
  const secondTurn = JSON.parse(calls[1].messages.at(-1).content);
  const firstContext = JSON.stringify(firstTurn.turnContext);
  const secondContext = JSON.stringify(secondTurn.turnContext);
  let shared = 0;
  while (first[shared] && first[shared] === second[shared]) shared++;
  assert.ok(shared > 10000, `Only ${shared} shared characters despite unchanged character rules`);
  assert.match(second.slice(0, shared), /patient botanist/);
  assert.equal(first, second);
  assert.equal(secondTurn.userMessage, "Let us check the tree we planted together.");
  assert.match(secondContext, /copper beech/);
  assert.doesNotMatch(secondContext, /silver birch/);
  assert.match(secondContext, /CURRENT RELATIONSHIP CLOSENESS: 9\/100/);
  assert.match(secondContext, /CURRENT SCENE: location=greenhouse/);
  assert.ok(firstContext.includes(userLocalTimeContext(new Date(2026, 9, 26, 12, 0)).state));
  assert.ok(secondContext.includes(userLocalTimeContext(new Date(2026, 9, 26, 12, 1)).state));
  assert.ok(second.includes(userLocalTimeContext(new Date(2026, 9, 26, 12, 1)).guidance));
  assert.match(calls[1].messages.map(message => message.content).join("\n"), /finished painting the garden gate/);
  assert.match(second, /MEMORY OWNERSHIP/);
  const records = performanceMetrics.snapshot().recent.filter(entry => entry.kind === "model" && entry.label === "chat");
  assert.equal(records.at(-2).cachedPromptTokens, 123);
  assert.equal(Object.hasOwn(records.at(-1), "cachedPromptTokens"), false);
  assert.equal(records.at(-1).cache.hasPrevious, 1);
  assert.equal(records.at(-1).cache.systemChanged, 0);
  for (const field of ["memories", "scene", "clock"]) assert.ok(records.at(-1).cache.changedTurnSections.includes(field));
});

test("live self-knowledge stays in current data as transcript grows without an extra user-shaped reference", async t => {
  const config = { ollamaUrl: "http://reference-layout.invalid", chatModel: "reference-layout" };
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    if (String(url).endsWith("/api/ps")) return Response.json({ models: [{ name: config.chatModel, context_length: 65536 }] });
    const body = JSON.parse(options.body);
    if (body.format?.properties?.memoryIds) return Response.json({ message: { content: '{"memoryIds":[]}' } });
    calls.push(body);
    return Response.json({ message: { content: JSON.stringify({ narration: 'Mira considers the question. "My grandmother taught me clock repair," she says.', relationshipDelta: 0, scene: {}, sceneEvidence: {}, memoryCandidates: [], shouldSendPhoto: false, achievementSignals: [] }) } });
  });
  const thread = fixture();
  thread.conversationMode = "story";
  const state = { definitions: [{ id: "clock", truth: "PRIVATE FACT: her grandmother taught her clock repair.", revealCondition: "Discuss clock repair." }],
    historyReviews: { [thread.id]: { activeLeadId: "clock", encounteredLeadIds: ["clock"] } } };
  const before = structuredClone(thread);
  const question = "Tell me about clock repair?";
  const options = { discoveryReferenceContext: discoveryChatContext(state, thread, question), now: new Date(2026, 9, 26, 16, 0) };
  // First request learns the configured context size; compare two warm requests.
  await chatAsCharacter(config, thread, question, undefined, options);
  await chatAsCharacter(config, thread, question, undefined, options);
  assert.deepEqual(thread, before);
  thread.messages.push({ id: "u-next", from: "user", text: question }, { id: "c-next", from: "character", text: "My grandmother taught me clock repair." });
  await chatAsCharacter(config, thread, question, undefined, options);
  assert.equal(calls.length, 3);
  for (const call of calls.slice(1)) {
    assert.doesNotMatch(call.messages[0].content, /PRIVATE FACT/);
    assert.ok(!call.messages.slice(1, -1).some(message => message.content.startsWith("APPLICATION REFERENCE")));
    assert.deepEqual(JSON.parse(call.messages.at(-1).content).turnContext.applicationReferences, [{ alreadySharedWithUser: [], pursuedTopic: [{ truth: state.definitions[0].truth, context: state.definitions[0].revealCondition }] }]);
  }
  assert.equal(calls[1].messages[0].content, calls[2].messages[0].content);
  assert.deepEqual(calls[1].messages.slice(1, -1), calls[2].messages.slice(1, -3));
  const diagnostic = performanceMetrics.snapshot().recent.filter(entry => entry.kind === "model" && entry.label === "chat").at(-1).cache;
  assert.equal(diagnostic.firstChangedPart, "previous_user_turn");
  assert.equal(diagnostic.systemChanged, 0);
  assert.doesNotMatch(JSON.stringify(diagnostic), /PRIVATE FACT/);
});

test("ordinary Chat streams only the reply field while preserving final metadata and uploaded images", async t => {
  const config = { ollamaUrl: "http://stream-chat.invalid", chatModel: "stream-chat" };
  const calls = [], drafts = [];
  const reply = "Yes, the garden gate is open and the path is clear.";
  const output = JSON.stringify({ scene: { activity: "PRIVATE SCENE" }, narration: "PRIVATE NARRATION", reply, relationshipDelta: 0, sceneEvidence: {}, memoryCandidates: [], shouldSendPhoto: false, achievementSignals: [] });
  t.mock.method(globalThis, "fetch", async (url, options) => {
    if (String(url).endsWith("/api/ps")) return Response.json({ models: [{ name: config.chatModel, context_length: 65536 }] });
    const body = JSON.parse(options.body); calls.push(body);
    assert.equal(body.stream, true);
    const events = [...output].map(content => ({ message: { content } }));
    events.push({ done: true, done_reason: "stop", eval_count: 100, prompt_eval_count: 1000 });
    return new Response(events.map(event => JSON.stringify(event)).join("\n"), { headers: { "content-type": "application/x-ndjson" } });
  });
  const generated = await chatAsCharacter(config, fixture(), "Is the garden gate open?", "synthetic-image", { onDraft: text => drafts.push(text) });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].messages.at(-1).images, ["synthetic-image"]);
  assert.equal(generated.reply, reply);
  assert.equal(drafts.at(-1), reply);
  assert.ok(drafts.every(text => reply.startsWith(text)));
  assert.doesNotMatch(JSON.stringify(drafts), /PRIVATE SCENE|PRIVATE NARRATION/);
});

test("Chat and Story keep one complete character-fidelity instruction after prompt trimming", async t => {
  const config = { ollamaUrl: "http://fidelity-trim.invalid", chatModel: "fidelity-trim" };
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    if (String(url).endsWith("/api/ps")) return Response.json({ models: [{ name: config.chatModel, context_length: 65536 }] });
    calls.push(JSON.parse(options.body));
    return Response.json({ message: { content: JSON.stringify({ reply: "Yes, the garden gate is open and the path is clear.", narration: 'Mira looks toward the garden. "The path is clear," she says.', scene: {}, sceneEvidence: {}, memoryCandidates: [], shouldSendPhoto: false, achievementSignals: [] }) } });
  });
  for (const mode of ["chat", "story"]) await chatAsCharacter(config, { ...fixture(), conversationMode: mode }, "Is the garden gate open?");
  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.equal(call.messages[0].content.split(characterFidelityInstruction).length - 1, 1);
    assert.match(call.messages[0].content, /MEMORY OWNERSHIP/);
    assert.match(call.messages[0].content, /Never invent the user's/);
    assert.equal(Object.hasOwn(call.options, "num_ctx"), false);
  }
});

test("optional prompt diagnostics cannot fail an otherwise valid chat response", async t => {
  t.mock.method(promptDiagnostics, "begin", () => { throw new Error("Synthetic diagnostics failure"); });
  let modelCalls = 0;
  t.mock.method(globalThis, "fetch", async (url) => {
    if (String(url).endsWith("/api/ps")) return Response.json({ models: [{ name: "diagnostic-failure", context_length: 65536 }] });
    modelCalls++;
    return Response.json({ message: { content: JSON.stringify({ reply: "The path is clear; we can walk through the gate.", relationshipDelta: 0, scene: {}, sceneEvidence: {}, memoryCandidates: [], shouldSendPhoto: false, achievementSignals: [] }) } });
  });
  const result = await chatAsCharacter({ ollamaUrl: "http://diagnostic-failure.invalid", chatModel: "diagnostic-failure" }, fixture(), "What next?");
  assert.match(result.reply, /path is clear/);
  assert.equal(modelCalls, 1);
});

test("photo permissions and explicit requests change only turn data, including in Story mode", async t => {
  const config = { ollamaUrl: "http://photo-policy.invalid", chatModel: "photo-policy" };
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    if (String(url).endsWith("/api/ps")) return Response.json({ models: [{ name: config.chatModel, context_length: 65536 }] });
    calls.push(JSON.parse(options.body));
    return Response.json({ message: { content: JSON.stringify({ narration: 'Mira looks toward the garden. "The path is clear," she says.', relationshipDelta: 0, scene: {}, sceneEvidence: {}, memoryCandidates: [], shouldSendPhoto: false, achievementSignals: [] }) } });
  });
  const variants = [{}, { photoOpportunity: true }, { visualEventOpportunity: "PRIVATE VISUAL EVENT" }, { explicitPhotoRequest: true }, {}];
  for (const options of variants) await chatAsCharacter(config, { ...fixture(), conversationMode: "story" }, "What can you see?", undefined, { ...options, now: new Date(2026, 9, 26, 16, 0) });
  assert.equal(calls.length, variants.length);
  for (const call of calls) {
    assert.equal(call.messages[0].content, calls[0].messages[0].content);
    assert.ok(call.messages[0].content.includes(photoPolicyInstructions));
    assert.doesNotMatch(call.messages[0].content, /PRIVATE VISUAL EVENT/);
    assert.equal(JSON.parse(call.messages.at(-1).content).userMessage, "What can you see?");
  }
  assert.deepEqual(calls.map(call => JSON.parse(call.messages.at(-1).content).turnContext.photo), [
    { explicitRequest: false, opportunityAvailable: false, visualEvent: "" },
    { explicitRequest: false, opportunityAvailable: true, visualEvent: "" },
    { explicitRequest: false, opportunityAvailable: true, visualEvent: "PRIVATE VISUAL EVENT" },
    { explicitRequest: true, opportunityAvailable: false, visualEvent: "" },
    { explicitRequest: false, opportunityAvailable: false, visualEvent: "" },
  ]);
  const records = performanceMetrics.snapshot().recent.filter(entry => entry.kind === "model" && entry.label === "chat").slice(-variants.length);
  for (const record of records.slice(1)) {
    assert.equal(record.cache.systemChanged, 0);
    assert.deepEqual(record.cache.changedSystemGroups, []);
    assert.ok(record.cache.changedTurnSections.includes("photo"));
  }
  assert.doesNotMatch(JSON.stringify(records), /PRIVATE VISUAL EVENT/);
});
