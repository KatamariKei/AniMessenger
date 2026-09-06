import test from "node:test";
import assert from "node:assert/strict";
import { claimsCurrentPhotoTransfer, removeCurrentPhotoClaim, shouldQueueCharacterPhoto } from "../server/photo-claim.mjs";

test("recognizes a character claiming to send a current selfie", () => {
  assert.equal(claimsCurrentPhotoTransfer("I'm all done! [action: She sends a quick selfie of her outfit] Don't start drawing without me!"), true);
  assert.equal(claimsCurrentPhotoTransfer("Here’s a picture of the dress."), true);
  assert.equal(claimsCurrentPhotoTransfer("Sending you a photo now."), true);
});

test("does not mistake old, hypothetical, or denied photos for a current transfer", () => {
  assert.equal(claimsCurrentPhotoTransfer("I sent that picture yesterday."), false);
  assert.equal(claimsCurrentPhotoTransfer("Maybe I'll send you a selfie later."), false);
  assert.equal(claimsCurrentPhotoTransfer("I didn't send you a photo."), false);
});

test("an unavailable image service removes the false transfer claim without losing the reply", () => {
  const repaired = removeCurrentPhotoClaim("I'm all done! [action: She sends a quick selfie of her outfit] Don't start drawing without me!");
  assert.equal(repaired, "I'm all done! Don't start drawing without me!");
});

test("key visual events and claimed transfers queue even when the model forgets its photo flag", () => {
  assert.equal(shouldQueueCharacterPhoto({ visualEvent: "an immediate outfit change", modelRequested: false }), true);
  assert.equal(shouldQueueCharacterPhoto({ reply: "[action: She sends a quick selfie]", modelRequested: false }), true);
  assert.equal(shouldQueueCharacterPhoto({ visualEvent: "an outfit reveal", hasUserImage: true }), false);
  assert.equal(shouldQueueCharacterPhoto({ reply: "Here is a picture I just took.", hasUserImage: true }), true);
});

test("an outfit request waits when the reply explicitly defers changing", () => {
  const reply = "Hehe, okay! Just give me a few minutes to change, alright? Please wait right there... I want everything to be perfect when I come back out for you! [action: quickly gathers the clothes and slips into the bathroom]";
  assert.equal(shouldQueueCharacterPhoto({ reply, explicitRequest: true, modelRequested: true, visualEvent: "outfit reveal" }), false);
  assert.equal(shouldQueueCharacterPhoto({ reply: "I'm getting ready to change into the dress.", modelRequested: true }), false);
});

test("completed outfit reveals and actual photo transfers remain eligible", () => {
  assert.equal(shouldQueueCharacterPhoto({ reply: "[action: steps out from the bathroom wearing the new dress]", explicitRequest: true }), true);
  assert.equal(shouldQueueCharacterPhoto({ reply: "Give me a minute to change. [action: returns wearing the red dress]", modelRequested: true }), true);
  assert.equal(shouldQueueCharacterPhoto({ reply: "I'm going to change. Here's a picture of my current outfit.", modelRequested: true }), true);
});
