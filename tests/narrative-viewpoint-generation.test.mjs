import test from "node:test";
import assert from "node:assert/strict";
import { chatAsCharacter } from "../server/ollama.mjs";
import { storyVerbalResponseInstruction } from "../server/narrative-mode.mjs";

const firstPerson = 'I rest my hand on the gate. "I can see the path," I say.';
const thirdPerson = 'Mira rests her hand on the gate. "I can see the path," she says.';
const result = narration => ({ narration, relationshipDelta: 0, scene: {}, sceneEvidence: {}, memoryCandidates: [], shouldSendPhoto: false, followUp: null, resolvesPendingFollowUp: false, achievementSignals: [] });
const thread = () => ({
  id: "viewpoint-test", character: { id: "viewpoint-test", name: "Mira", series: "Synthetic" },
  conversationMode: "story", relationship: 8, memories: [],
  messages: [{ id: "old-chat", from: "character", text: "I can wait by the garden gate. My coat is warm enough." }],
  scene: { location: "garden", environment: "a garden path", activity: "waiting", outfit: "coat", expression: "natural", lighting: "daylight", presence: "together" },
  profile: { id: "viewpoint-test", name: "Mira", series: "Synthetic", age: 25, summary: "A synthetic test character.", status: "Ready", visual: { identity: [], signature: [], defaultWardrobe: "coat", wardrobePreferences: [] }, persona: { traits: [], mannerisms: [], speechStyle: "Plain", emotionalRules: [], exampleLines: [] }, canon: { overview: "Synthetic", history: [], relationships: [], knowledge: [], boundaries: [] }, sources: [] },
});

function model(t, outputs) {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    if (String(url).endsWith("/api/show")) return Response.json({ model_info: { "test.context_length": 8192 } });
    if (String(url).endsWith("/api/ps")) return Response.json({ models: [{ name: t.name, context_length: 65536 }] });
    assert.ok(String(url).endsWith("/api/chat"), String(url));
    calls.push(JSON.parse(options.body));
    const output = outputs[Math.min(calls.length - 1, outputs.length - 1)];
    return Response.json({ message: { content: typeof output === "string" ? output : JSON.stringify(output) }, done: true });
  });
  return { calls, config: { ollamaUrl: "http://synthetic.invalid", chatModel: t.name, ollamaThinking: false } };
}

test("switching old first-person chat history to Story mode repairs narrator viewpoint once", async t => {
  const { config, calls } = model(t, [result(firstPerson), result(thirdPerson)]);
  const original = thread();
  const generated = await chatAsCharacter(config, original, "What can you see?");
  assert.equal(generated.narration, thirdPerson);
  assert.equal(calls.length, 2);
  assert.match(calls[0].messages[0].content, /CURRENT TURN VIEWPOINT/);
  assert.equal(JSON.parse(calls[0].messages.at(-1).content).turnContext.verbalResponseRequired, true);
  assert.equal(calls[0].messages.find(message => message.role === "assistant").content, original.messages[0].text);
  assert.match(calls[1].messages[0].content, /VIEWPOINT REPAIR/);
  assert.equal(original.messages[0].text, "I can wait by the garden gate. My coat is warm enough.");
});

test("correct third-person prose with first-person dialogue needs no extra model call", async t => {
  const { config, calls } = model(t, [result(thirdPerson)]);
  assert.equal((await chatAsCharacter(config, thread(), "What can you see?")).narration, thirdPerson);
  assert.equal(calls.length, 1);
});

test("spoken and nonverbal Story turns retain identical system rules while changing only the response requirement flag", async t => {
  const { config, calls } = model(t, [result(thirdPerson)]);
  const original = thread();
  await chatAsCharacter(config, original, "What can you see?");
  await chatAsCharacter(config, original, "[I point toward the open gate.]");
  assert.equal(calls.length, 2);
  assert.equal(calls[0].messages[0].content, calls[1].messages[0].content);
  assert.match(calls[0].messages[0].content, /CURRENT TURN VIEWPOINT/);
  assert.ok(calls[0].messages[0].content.includes(storyVerbalResponseInstruction));
  assert.match(calls[0].messages[0].content, /IMMEDIATE SCENE CHECKPOINT/);
  const first = JSON.parse(calls[0].messages.at(-1).content);
  const second = JSON.parse(calls[1].messages.at(-1).content);
  assert.equal(first.turnContext.verbalResponseRequired, true);
  assert.equal(second.turnContext.verbalResponseRequired, false);
  assert.equal(first.turnContext.guidance.includes(storyVerbalResponseInstruction), false);
  assert.match(first.turnContext.scene.join("\n"), /location=garden/);
  assert.equal(second.userMessage, "[I point toward the open gate.]");
});

test("persistent first-person narration cannot bypass validation after the retry budget", async t => {
  const { config, calls } = model(t, [result(firstPerson)]);
  await assert.rejects(chatAsCharacter(config, thread(), "What can you see?"), /kept using first-person narration/);
  assert.equal(calls.length, 2);
});

test("streamed Story retries replace the provisional first-person draft and retain final validation", async t => {
  const { config, calls } = model(t, [result(firstPerson), result(thirdPerson)]);
  const drafts = [];
  const original = thread();
  const before = structuredClone(original);
  const generated = await chatAsCharacter(config, original, "What can you see?", undefined, { onDraft: text => drafts.push(text) });
  assert.equal(generated.narration, thirdPerson);
  assert.deepEqual(original, before);
  assert.equal(calls.length, 2);
  assert.ok(calls.every(call => call.stream === true));
  assert.deepEqual(drafts, ["", firstPerson, "", thirdPerson]);
});

test("a rejected streamed passage ends with a reset, and a failed display callback cannot fail generation", async t => {
  const { config } = model(t, [result(firstPerson)]);
  const drafts = [];
  await assert.rejects(chatAsCharacter(config, thread(), "What can you see?", undefined, { onDraft: text => drafts.push(text) }), /kept using first-person narration/);
  assert.equal(drafts.at(-1), "");
  const passing = model(t, [result(thirdPerson)]);
  const generated = await chatAsCharacter(passing.config, thread(), "What can you see?", undefined, { onDraft: () => { throw new Error("Display disconnected"); } });
  assert.equal(generated.narration, thirdPerson);
});

test("unstructured first-person fallback cannot become a Story passage", async t => {
  const { config, calls } = model(t, [firstPerson]);
  await assert.rejects(chatAsCharacter(config, thread(), "What can you see?"), /structured response|first-person narration/);
  assert.equal(calls.length, 2);
});

test("legacy reply-field Story prose still receives the viewpoint repair", async t => {
  const { config, calls } = model(t, [{ ...result(null), reply: firstPerson }, { ...result(null), reply: thirdPerson }]);
  assert.equal((await chatAsCharacter(config, thread(), "What can you see?")).narration, thirdPerson);
  assert.equal(calls.length, 2);
});

test("ordinary Chat mode retains first-person character replies", async t => {
  const text = "I can see the garden path from here.";
  const { config, calls } = model(t, [{ ...result(null), reply: text }]);
  const original = { ...thread(), conversationMode: "chat", messages: [] };
  assert.equal((await chatAsCharacter(config, original, "What can you see?")).reply, text);
  assert.equal(calls.length, 1);
});
