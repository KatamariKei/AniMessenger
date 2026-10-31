import test from "node:test";
import assert from "node:assert/strict";
import { characterChatSchema, storyCharacterChatSchema, sceneReconciliationSchema } from "../server/ollama-schemas.mjs";
import { chatAsCharacter } from "../server/ollama.mjs";
import { reduceSceneTurn } from "../server/scene-state.mjs";
import { pendingSceneFields, sceneStateFields } from "../server/scene-verification.mjs";

const initial = { location: "living room", environment: "cream walls and wooden shelves", activity: "reading a book", posture: "seated", outfit: "blue dress", expression: "calm", lighting: "warm lamps", presence: "together" };
const proof = (quote, actor = "character", phase = "current") => ({ quote, source: "user", actor, phase });
const dense = patch => Object.fromEntries(sceneStateFields.map(field => [field, patch[field] ?? null]));

test("only foreground scene fields become optional; image reconciliation and evidence requirements stay intact", () => {
  for (const schema of [characterChatSchema, storyCharacterChatSchema]) {
    for (const field of ["scene", "sceneEvidence"]) {
      assert.ok(schema.required.includes(field));
      assert.deepEqual(schema.properties[field].required, []);
      assert.equal(schema.properties[field].additionalProperties, false);
      assert.deepEqual(Object.keys(schema.properties[field].properties).sort(), [...sceneStateFields].sort());
    }
    const evidence = schema.properties.sceneEvidence.properties.posture.anyOf[0];
    assert.deepEqual(evidence.required, ["quote", "source", "phase", "actor"]);
  }
  assert.deepEqual([...sceneReconciliationSchema.properties.scene.required].sort(), [...sceneStateFields].sort());
  assert.deepEqual([...sceneReconciliationSchema.properties.sceneEvidence.required].sort(), [...sceneStateFields].sort());
});

for (const sample of [
  { name: "unchanged room, outfit and pose", text: "What is your favorite flower?", scene: {}, evidence: {}, expected: initial },
  { name: "room and final pose change together", text: "We are now inside the private quarters. Mira reclines across the red velvet cushions.", scene: { location: "private quarters", posture: "lying" }, evidence: { location: proof("We are now inside the private quarters", "shared"), posture: proof("Mira reclines across the red velvet cushions") }, expected: { location: "private quarters", posture: "lying" } },
  { name: "wardrobe change", text: "Mira is now wearing a green sweater and black trousers.", scene: { outfit: "green sweater and black trousers" }, evidence: { outfit: proof("Mira is now wearing a green sweater and black trousers") }, expected: { outfit: "green sweater and black trousers" } },
  { name: "planned move stays rejected", text: "We will enter the garden tomorrow.", scene: { location: "garden" }, evidence: { location: proof("We will enter the garden tomorrow", "shared", "planned") }, expected: { location: "living room" }, pending: ["location"] },
  { name: "changed pose without evidence stays uncertain", text: "Shall we read?", scene: { posture: "lying" }, evidence: {}, expected: { posture: "seated" }, pending: ["posture"] },
  { name: "the user's pose does not change the character", text: "I kneel beside the sofa.", scene: { posture: "kneeling" }, evidence: { posture: proof("I kneel beside the sofa", "user") }, expected: { posture: "seated" } },
]) {
  test(`sparse and legacy null-filled updates preserve ${sample.name}`, () => {
    const update = (modelScene, sceneEvidence) => reduceSceneTurn(initial, { userText: sample.text, characterName: "Mira", modelScene, sceneEvidence });
    const sparse = update(sample.scene, sample.evidence);
    assert.deepEqual(sparse, update(dense(sample.scene), dense(sample.evidence)));
    for (const [field, value] of Object.entries(sample.expected)) assert.equal(sparse[field], value);
    assert.deepEqual(pendingSceneFields(sparse), sample.pending || []);
  });
}

test("empty patches retain unresolved uncertainty, and exact current reaffirmation resolves only its own field", () => {
  const existing = { ...initial, verification: { version: 1, status: "needs_review", pending: ["location", "posture"] } };
  const empty = reduceSceneTurn(existing, { modelScene: {}, sceneEvidence: {} });
  assert.deepEqual(pendingSceneFields(empty), ["location", "posture"]);
  const verified = reduceSceneTurn(empty, { userText: "Mira is seated on the sofa.", modelScene: { posture: "seated" }, sceneEvidence: { posture: proof("Mira is seated on the sofa") } });
  assert.deepEqual(pendingSceneFields(verified), ["location"]);
});

for (const mode of ["chat", "story"]) {
  test(`${mode} generation normalizes omitted fields without dropping the final-scene contract`, async t => {
    const calls = [];
    t.mock.method(globalThis, "fetch", async (url, options) => {
      if (String(url).endsWith("/api/ps")) return Response.json({ models: [{ name: mode, context_length: 65536 }] });
      calls.push(JSON.parse(options.body));
      return Response.json({ message: { content: JSON.stringify({ reply: "Irises have wonderful colors.", narration: mode === "story" ? 'Mira considers the question. "Irises have wonderful colors," she says.' : null, relationshipDelta: 0, scene: {}, sceneEvidence: {}, shouldSendPhoto: false }) } });
    });
    const thread = { id: mode, character: { id: mode, name: "Mira", series: "Synthetic" }, conversationMode: mode, relationship: 8, memories: [], messages: [], scene: initial,
      profile: { name: "Mira", age: 25, summary: "A patient botanist.", visual: { identity: [], signature: [], defaultWardrobe: "blue dress", wardrobePreferences: [] }, persona: { traits: ["patient"], mannerisms: [], emotionalRules: [], speechStyle: "Plain", exampleLines: [] }, canon: { overview: "Synthetic", history: [], relationships: [], knowledge: [], boundaries: [] }, sources: [] } };
    const generated = await chatAsCharacter({ ollamaUrl: "http://scene-patch.invalid", chatModel: mode }, thread, "What is your favorite flower?");
    assert.equal(calls.length, 1);
    assert.match(calls[0].messages[0].content, /Omit unchanged fields from scene and sceneEvidence/);
    assert.deepEqual(generated.scene, dense({}));
    assert.deepEqual(generated.sceneEvidence, {});
    assert.deepEqual(pendingSceneFields(reduceSceneTurn(initial, { modelScene: generated.scene, sceneEvidence: generated.sceneEvidence })), []);
  });
}
