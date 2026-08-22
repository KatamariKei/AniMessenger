import test from "node:test";
import assert from "node:assert/strict";
import { isExplicitPhotoRequest } from "../server/photo-request.mjs";

const photoContext = [
  { from: "character", text: "I'm sending the capture now—get ready for my reaction face!" },
];

test("recognizes direct photo requests", () => {
  assert.equal(isExplicitPhotoRequest("Send me another pic please"), true);
  assert.equal(isExplicitPhotoRequest("I want to see a picture of what you're doing"), true);
  assert.equal(isExplicitPhotoRequest("Both of you send pictures."), true);
  assert.equal(isExplicitPhotoRequest("Could you two share selfies?"), true);
});

test("recognizes natural follow-up requests in an active photo context", () => {
  assert.equal(isExplicitPhotoRequest("let's see!", photoContext), true);
  assert.equal(isExplicitPhotoRequest("resend peeeeeez!", photoContext), true);
  assert.equal(isExplicitPhotoRequest("I wanna see your face", photoContext), true);
});

test("recognizes clear visual requests without requiring photo vocabulary", () => {
  assert.equal(isExplicitPhotoRequest("Let me see."), true);
  assert.equal(isExplicitPhotoRequest("Show me!"), true);
  assert.equal(isExplicitPhotoRequest("Let me get a better look at you."), true);
  assert.equal(isExplicitPhotoRequest("Can I see that new outfit?"), true);
  assert.equal(isExplicitPhotoRequest("I wanna see what it looks like."), true);
  assert.equal(isExplicitPhotoRequest("Show me what you're wearing."), true);
});

test("does not interpret ordinary follow-up language as a photo request", () => {
  assert.equal(isExplicitPhotoRequest("let's see what happens", [{ from: "character", text: "Maybe the plan will work." }]), false);
  assert.equal(isExplicitPhotoRequest("Let me see if that works."), false);
  assert.equal(isExplicitPhotoRequest("I want to see what you mean."), false);
  assert.equal(isExplicitPhotoRequest("Show me how to solve it."), false);
});
