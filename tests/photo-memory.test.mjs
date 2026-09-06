import assert from "node:assert/strict";
import test from "node:test";
import { generatedPhotoHistory } from "../server/ollama.mjs";

test("generated character photos become explicit conversation memory", () => {
  const history = generatedPhotoHistory({
    from: "character",
    generated: true,
    image: "/api/images/view?id=example",
    text: "Proof that I actually went outside today.",
    imageContext: "a candid park selfie under the cherry trees",
  });

  assert.deepEqual(history[0], {
    role: "assistant",
    content: "Proof that I actually went outside today.",
  });
  assert.equal(history[1].role, "system");
  assert.match(history[1].content, /you sent the user a photo/i);
  assert.match(history[1].content, /candid park selfie/i);
  assert.match(history[1].content, /never deny sending it/i);
});

test("older image-only generated messages still record that a photo was sent", () => {
  const history = generatedPhotoHistory({
    from: "character",
    generated: true,
    image: "/api/images/view?id=older",
  });

  assert.equal(history.length, 1);
  assert.equal(history[0].role, "system");
  assert.match(history[0].content, /exact visual details were not saved/i);
});

test("user uploads are not misremembered as photos sent by the character", () => {
  assert.deepEqual(generatedPhotoHistory({
    from: "user",
    image: "/api/files/uploads/example.png",
  }), []);
});

test("captured moments are remembered as shared visuals rather than character-sent photos", () => {
  const history = generatedPhotoHistory({
    from: "character",
    generated: true,
    image: "/api/images/view?id=moment",
    imageOrigin: "captured_moment",
    imageContext: "Misty relaxing beside the pool",
  });

  assert.equal(history.length, 1);
  assert.equal(history[0].role, "system");
  assert.match(history[0].content, /visual snapshot captured the current shared moment/i);
  assert.match(history[0].content, /did not send this/i);
  assert.match(history[0].content, /Misty relaxing beside the pool/i);
  assert.doesNotMatch(history[0].content, /you sent the user a photo/i);
});

test("opening scenes are remembered as establishing visuals rather than character-sent photos", () => {
  const history = generatedPhotoHistory({
    from: "character",
    generated: true,
    image: "/api/images/view?id=opening",
    imageOrigin: "opening_scene",
    imageContext: "Morrigan waiting beneath the moonlit park trees",
  });
  assert.equal(history.length, 1);
  assert.match(history[0].content, /establishing visual/i);
  assert.match(history[0].content, /did not send it as a photo/i);
  assert.doesNotMatch(history[0].content, /you sent the user a photo/i);
});
