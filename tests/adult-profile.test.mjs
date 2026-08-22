import assert from "node:assert/strict";
import test from "node:test";
import { adultCharacterAge, enforceAdultCharacterProfile } from "../server/ollama.mjs";

test("character ages are deterministically raised to the adult minimum", () => {
  assert.equal(adultCharacterAge(15), 18);
  assert.equal(adultCharacterAge("17 years old"), 18);
  assert.equal(adultCharacterAge(undefined), 18);
});

test("adult character ages are preserved", () => {
  assert.equal(adultCharacterAge(24), 24);
  assert.equal(adultCharacterAge("over 1000 years old"), 1000);
});

test("vague age-coded appearance filler is removed without touching concrete adult traits", () => {
  const normalized = enforceAdultCharacterProfile({
    age: 18,
    visual: {
      identity: ["1girl", "youthful appearance", "young-looking face", "red hair", "athletic build"],
      signature: ["glasses"],
    },
  });
  assert.deepEqual(normalized.visual.identity, ["1girl", "red hair", "athletic build"]);
  assert.deepEqual(normalized.visual.signature, ["glasses"]);
});

test("profile normalization overrides model or research-derived minor ages", () => {
  const source = { id: "example", name: "Example", age: 14, summary: "test" };
  const normalized = enforceAdultCharacterProfile(source);
  assert.equal(normalized.age, 18);
  assert.equal(normalized.name, "Example");
  assert.equal(source.age, 14);
});
