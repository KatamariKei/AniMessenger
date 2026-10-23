import assert from "node:assert/strict";
import test from "node:test";
import { imageEyeState, eyeStateInText } from "../server/image-eyes.mjs";
import { buildImagePrompt } from "../server/identity.mjs";

const profile = { visual: { identity: ["red hair", "grey eyes"], signature: ["black earrings", "bright blue eyes"], defaultWardrobe: "white shirt" } };
const character = { name: "Erica", trigger: "erica_anderson" };
test("closed-eye photos omit visible eye traits without changing the profile", () => {
  const before = structuredClone(profile);
  const prompt = buildImagePrompt(profile, character, { expression: "affectionate, eyes closed" }, "portrait, looking at the camera");
  assert.match(prompt, /closed eyes:1.2/);
  assert.doesNotMatch(prompt, /grey eyes|blue eyes|looking at the camera/);
  assert.match(prompt, /red hair|black earrings/);
  assert.deepEqual(profile, before);
});
test("sleeping closes eyes, but sleepy and planned sleep do not", () => {
  assert.equal(imageEyeState({ activity: "sleeping" }), "closed");
  assert.equal(imageEyeState({ activity: "settling in for sleep", expression: "sleepy" }), "");
  assert.equal(eyeStateInText("She will close her eyes later."), "");
  assert.equal(eyeStateInText("not sleeping"), "");
});
test("an explicit open-eye photo restores eye color and overrides sleeping staging", () => {
  const prompt = buildImagePrompt(profile, character, { activity: "sleeping", expression: "eyes closed" }, "portrait with her eyes open");
  assert.match(prompt, /grey eyes/);
  assert.match(prompt, /open eyes/);
  assert.doesNotMatch(prompt, /closed eyes|eyes closed|is sleeping/);
  assert.equal(eyeStateInText("she closes her eyes, then opens her eyes"), "open");
});
test("explicit closed photo direction overrides the scene's open eyes", () => {
  const prompt = buildImagePrompt(profile, character, { expression: "eyes open" }, "closed eyes, relaxed portrait");
  assert.match(prompt, /closed eyes:1.2/);
  assert.doesNotMatch(prompt, /grey eyes|eyes open/);
});
