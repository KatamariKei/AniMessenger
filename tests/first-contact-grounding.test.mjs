import test from "node:test";
import assert from "node:assert/strict";
import { firstContactCharacterContext, firstContactEverydayEvidence } from "../server/first-contact.mjs";
import { generateFirstContactScenario } from "../server/ollama.mjs";

const character = { id: "opening-fixture", name: "Mira", series: "Synthetic Observatory" };
const profile = {
  name: "Mira",
  summary: "An observatory keeper who enjoys quiet company.",
  canon: { overview: "Works at the Brass Dome observatory.", history: ["Maintains the telescope."] },
  persona: {
    initiativeSeeds: ["Cataloguing unusual stars", "Sharing a favorite pastry", "Choosing a new lens", "Wondering what visitors notice"],
    competencies: ["Repairs optical instruments"], selfConcept: ["Proud of patient observation"],
    conversationHabits: ["Asks visitors what they can see"], traits: ["Patient"], baselineVoice: "Dry, concise curiosity.",
    avoidPatterns: ["Do not reduce her to a stern supervisor."], mischaracterizations: ["Treating visitors as employees."],
  },
  visual: { defaultWardrobe: "blue coat", identity: ["silver hair"] },
  researchEvidence: { passages: [{ id: "wiki-mira", provider: "franchise_wiki", text: "Mira currently works at the Brass Dome observatory.\n\nMira regularly visits the Copper Kettle bakery." }] },
};

test("opening context reuses existing world, interests, capabilities and voice within a fixed budget", () => {
  const context = firstContactCharacterContext(profile);
  for (const detail of ["Brass Dome", "favorite pastry", "optical instruments", "patient observation", "what they can see", "Dry, concise curiosity", "stern supervisor", "visitors as employees", "Copper Kettle", "wiki-mira"]) assert.ok(context.includes(detail));
  const huge = { summary: "x".repeat(10000), canon: { overview: "x".repeat(10000), history: Array(100).fill("x".repeat(10000)) }, persona: Object.fromEntries(Object.keys(profile.persona).map(key => [key, Array(100).fill("x".repeat(10000))])) };
  assert.ok(firstContactCharacterContext(huge).length <= 2200);
  assert.equal(firstContactCharacterContext({}), "");
});

test("everyday evidence copies exact character workplaces and recurring venues without inferring them from traits", () => {
  const anchors = firstContactEverydayEvidence(profile);
  assert.equal(anchors.length, 2);
  for (const item of anchors) {
    assert.equal(item.sourceId, "wiki-mira");
    assert.ok(profile.researchEvidence.passages[0].text.includes(item.quote));
  }
  assert.deepEqual(firstContactEverydayEvidence({ ...profile, researchEvidence: undefined }), []);
  assert.deepEqual(firstContactEverydayEvidence({ ...profile, name: undefined }), []);
});

test("opening anchors exclude other people, uncertain or negated statements and plot-dependent branches", () => {
  const text = `Mira's father works at the Iron Bank.

Mira might work at a restaurant.

Mira never visits the Golden Cafe.

Mira formerly works at the factory.

Mira frequently visits a clinic after she becomes pregnant.

== Alternate ending ==

Mira works at the Night Hotel.

=== Employment ===

Mira regularly visits the Moon Cafe.

== Daily life ==

Mira often visits the Copper Kettle bakery.

Mira's sister frequently visits the park.`;
  const result = firstContactEverydayEvidence({ ...profile, researchEvidence: { passages: [{ id: "wiki", provider: "franchise_wiki", text }] } });
  assert.deepEqual(result, [{ sourceId: "wiki", quote: "Mira often visits the Copper Kettle bakery." }]);
});

test("source anchor selection is bounded and ignores visual catalogue data", () => {
  const sentence = "Mira regularly visits the Copper Kettle bakery.";
  const result = firstContactEverydayEvidence({ ...profile, researchEvidence: { passages: [
    { id: "tags", provider: "catalogue", text: sentence },
    { id: "wiki", provider: "franchise_wiki", text: Array(10).fill(sentence).join("\n\n") + "\n\nMira works at the observatory." },
  ] } });
  assert.equal(result.length, 2);
  assert.ok(result.every(item => item.sourceId === "wiki"));
  assert.ok(firstContactCharacterContext({ ...profile, summary: "x".repeat(5000) }).length <= 2200);
});

test("first opening and reroll each use one existing model call, no search or planner, and unchanged output limits", async t => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  const calls = [];
  const scenario = { title: "A lens in the sunlight", premise: "Mira compares two telescope lenses at her workbench.", contactMode: "in_person", connection: "She addresses a visitor within earshot.", scene: { location: "Brass Dome workshop", environment: "A brass telescope and two lenses on a wooden workbench.", activity: "comparing lenses", outfit: "blue coat", expression: "curious", lighting: "sunlight", presence: "together" }, openingLine: "Which one gives you the sharper edge?" };
  globalThis.fetch = async (url, options) => {
    assert.equal(String(url), "http://opening-test.invalid/api/chat");
    calls.push(JSON.parse(options.body));
    return new Response(JSON.stringify({ message: { content: JSON.stringify(scenario) }, done: true }));
  };
  const config = { ollamaUrl: "http://opening-test.invalid", profileModel: "fixture-model", ollamaThinking: false };
  const rejected = [{ title: "A rainy awning", premise: "Two strangers shelter from the rain outside a cafe.", location: "Cafe doorway", connection: "A chance meeting", contactMode: "in_person" }];
  for (const history of [[], rejected]) {
    const before = calls.length;
    const result = await generateFirstContactScenario(config, character, profile, history);
    assert.equal(calls.length, before + 1);
    assert.equal(result.scene.outfit, "blue coat");
    const request = calls.at(-1);
    assert.equal(request.model, "fixture-model");
    assert.equal(request.options.num_predict, 1400);
    assert.equal(request.stream, false);
    assert.match(request.messages[0].content, /character evidence/);
    assert.match(request.messages[0].content, /not an occupation or a scene template/);
    assert.match(request.messages[0].content, /one small character-driven development that reaches the user now/);
    assert.match(request.messages[0].content, /including its immediate hook/);
    assert.match(request.messages[0].content, /Do not prescribe the user's reaction/);
    assert.match(request.messages[1].content, /stern supervisor/);
    assert.match(request.messages[1].content, /favorite pastry/);
    assert.match(request.messages[1].content, /Copper Kettle/);
    assert.doesNotMatch(request.messages[0].content, /explore this broad direction/);
    if (history.length) {
      assert.match(request.messages[0].content, /underlying encounter/);
      assert.match(request.messages[1].content, /A rainy awning/);
    }
  }
});
