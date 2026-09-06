import assert from "node:assert/strict";
import test from "node:test";
import { activateFirstContact, firstContactCanChange, firstContactPreviewMatches, insertOpeningSceneMessage, normalizeFirstContactScenario, openingSceneBrief, openingSceneJobMatches, openingsAreTooSimilar, rejectedOpeningHistory } from "../server/first-contact.mjs";

const character = { id: "test", name: "Test Character", series: "Test World" };
const profile = {
  openingLine: "Hello.",
  visual: { defaultWardrobe: "blue military coat, silver clasps" },
};

test("normalizes an in-person opening into a persistent shared scene", () => {
  const scenario = normalizeFirstContactScenario({
    title: "At the old observatory",
    premise: "A damaged telescope has drawn both of you to the same quiet room.",
    contactMode: "in_person",
    connection: "You are standing within speaking distance.",
    scene: {
      location: "Old observatory",
      environment: "A circular stone observatory with a brass telescope, cracked glass dome, and star charts covering a long oak table.",
      activity: "repairing the telescope",
      outfit: "wrong model outfit",
      expression: "focused curiosity",
      lighting: "cold moonlight through cracked glass",
      presence: "apart",
    },
    openingLine: "If you're going to stand there, at least hold this lens.",
  }, profile, character);

  assert.equal(scenario.status, "preview");
  assert.equal(scenario.scene.presence, "together");
  assert.equal(scenario.scene.outfit, profile.visual.defaultWardrobe);
  assert.match(scenario.scene.environment, /brass telescope/);
});

test("remote and world-link openings remain apart", () => {
  for (const contactMode of ["remote", "world_link"]) {
    const scenario = normalizeFirstContactScenario({ contactMode, scene: {} }, profile, character);
    assert.equal(scenario.scene.presence, "apart");
  }
});

test("an opening can change only before the first user turn", () => {
  const scenario = normalizeFirstContactScenario({ contactMode: "in_person", scene: {} }, profile, character);
  const base = { profile, firstContact: scenario, messages: [] };
  assert.equal(firstContactCanChange(base), true);
  assert.equal(firstContactCanChange({ ...base, messages: [{ from: "user" }] }), false);
  assert.equal(firstContactCanChange({ ...base, firstContact: { ...scenario, status: "started" } }), false);
  assert.equal(firstContactPreviewMatches(base, scenario.generatedAt), true);
  assert.equal(firstContactPreviewMatches({ ...base, character: { ...character, avatarUrl: "/finished.png" } }, scenario.generatedAt), true);
  assert.equal(firstContactPreviewMatches({ ...base, firstContact: { ...scenario, generatedAt: "newer-scenario" } }, scenario.generatedAt), false);
});

test("starting preserves thread history systems and appends only the opening line", () => {
  const scenario = normalizeFirstContactScenario({ contactMode: "in_person", scene: {}, openingLine: "There you are." }, profile, character);
  const thread = {
    profile,
    firstContact: scenario,
    messages: [],
    memories: [{ id: "memory" }],
    relationship: 42,
    scene: { location: "old", outfit: "old" },
  };
  const opening = { id: "opening", from: "character", text: scenario.openingLine, time: "2026-08-27T12:00:00.000Z" };
  const started = activateFirstContact(thread, opening);
  assert.deepEqual(started.memories, thread.memories);
  assert.equal(started.relationship, 42);
  assert.deepEqual(started.messages, [opening]);
  assert.equal(started.firstContact.status, "started");
});

test("rerolls retain a bounded unique history instead of alternating between the last two openings", () => {
  const park = normalizeFirstContactScenario({
    title: "A Midnight Encounter",
    premise: "A moonlit park offers a chance meeting.",
    contactMode: "in_person",
    connection: "You meet beside a pond.",
    scene: { location: "Moonlit City Park" },
  }, profile, character);
  const invitation = {
    title: "A Royal Invitation",
    premise: "A formal summons arrives from the castle.",
    contactMode: "remote",
    location: "Royal Castle",
    connection: "A sealed letter reaches you.",
  };
  const history = rejectedOpeningHistory({ ...park, rejectedOpenings: [invitation] });
  assert.equal(history.length, 2);
  assert.deepEqual(history.map((item) => item.title), ["A Royal Invitation", "A Midnight Encounter"]);
  assert.equal(openingsAreTooSimilar(park, { ...park, title: "A Meeting After Dark" }), true);
  assert.equal(openingsAreTooSimilar(park, invitation), false);
});

test("opening visuals establish the scenario without pretending to be character-sent photos", () => {
  const scenario = normalizeFirstContactScenario({
    title: "At the old observatory",
    contactMode: "in_person",
    scene: { location: "Old observatory", activity: "repairing the brass telescope" },
  }, profile, character);
  const opening = { id: "opening", from: "character", text: "Hold this lens.", time: "2026-08-27T12:00:00.000Z" };
  const started = activateFirstContact({ profile, character, firstContact: scenario, messages: [], scene: {} }, opening);
  const job = { scenarioGeneratedAt: scenario.generatedAt };
  assert.equal(openingSceneJobMatches(started, job), true);
  assert.match(openingSceneBrief(started), /not a selfie/i);
  assert.match(openingSceneBrief(started), /Old observatory/i);
  const image = { id: "image", from: "character", image: "/opening.png", imageOrigin: "opening_scene" };
  const withImage = insertOpeningSceneMessage({ ...started, messages: [opening, { id: "reply", from: "user", text: "Okay." }] }, opening.id, image);
  assert.deepEqual(withImage.messages.map((message) => message.id), ["opening", "image", "reply"]);
  assert.deepEqual(insertOpeningSceneMessage(withImage, opening.id, { ...image, id: "duplicate" }), withImage);
});
