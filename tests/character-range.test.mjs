import test from "node:test";
import assert from "node:assert/strict";
import { characterRangeDirection, fayeRangeFacet } from "../server/character-range.mjs";

function thread(overrides = {}) {
  return {
    id: "faye_valentine",
    profile: { id: "faye_valentine" },
    relationship: 82,
    scene: { location: "kitchen", activity: "eating breakfast", outfit: "bikini" },
    messages: [],
    ...overrides,
  };
}

test("Faye range direction selects a confident playful facet for attraction", () => {
  assert.equal(fayeRangeFacet("That bikini is my new favorite thing. 👀", thread()), "playful");
  const direction = characterRangeDirection(thread(), "That bikini is my new favorite thing. 👀");
  assert.match(direction, /PLAYFUL CONFIDENCE/);
  assert.match(direction, /never a script/);
});

test("Faye range direction supports domestic, professional, and sincere facets", () => {
  assert.equal(fayeRangeFacet("More coffee with breakfast?", thread()), "relaxed");
  assert.equal(fayeRangeFacet("The bounty changed routes. What's our plan?", thread()), "professional");
  assert.equal(fayeRangeFacet("Waking up with you felt real. I missed you.", thread()), "affectionate");
});

test("Faye is defensive only when the conversation supplies a real trigger", () => {
  assert.notEqual(fayeRangeFacet("You look beautiful today.", thread()), "defensive");
  assert.equal(fayeRangeFacet("You owe me. Do what I say and tell me about your past.", thread()), "defensive");
});

test("high closeness makes affection available without making it Faye's default mode", () => {
  assert.equal(fayeRangeFacet("I'm glad you're here.", thread()), "affectionate");
  assert.notEqual(fayeRangeFacet("That sounds interesting.", thread()), "affectionate");
  assert.match(characterRangeDirection(thread(), "That sounds interesting."), /does not make Faye automatically agreeable/);
});

test("recent guarded replies produce a cooldown instead of a new personality box", () => {
  const messages = [
    "Careful, keep talking like that and I might believe you.",
    "Don't expect this kind of service every morning.",
    "I might start expecting it if you keep this up.",
  ].map((text) => ({ from: "character", text }));
  const direction = characterRangeDirection(thread({ messages }), "I like spending the morning with you.");
  assert.match(direction, /RECENTLY OVERUSED MOVE/);
  assert.match(direction, /guarded qualifications/);
});

test("the range director leaves every other character untouched", () => {
  const misato = thread({ id: "misato_katsuragi", profile: { id: "misato_katsuragi" } });
  assert.equal(characterRangeDirection(misato, "More coffee?"), "");
});
