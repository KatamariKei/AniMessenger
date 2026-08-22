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
