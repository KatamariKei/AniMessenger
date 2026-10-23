import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { effectiveVisual } from "../server/visual-overrides.mjs";
import { normalizeOllamaMessages, plainStructuredReplyFallback } from "../server/ollama.mjs";

test("chat default wardrobe explicitly uses user corrections without forcing a clothing change", () => {
  const profile = { visual: { identity: ["red hair"], signature: [], defaultWardrobe: "white shirt and black vest",
    userOverrides: { defaultWardrobe: "yellow waitress uniform with red piping and half apron" } } };
  assert.match(effectiveVisual(profile).defaultWardrobe, /yellow waitress uniform/);
  const source = readFileSync(new URL("../server/ollama.mjs", import.meta.url), "utf8");
  assert.match(source, /EXACT DEFAULT WARDROBE.*effectiveVisual\(profile\)\.defaultWardrobe/);
  assert.match(source, /Do not overwrite the current scene outfit with the default until a completed change is established/);
});

test("consolidates system directives at the beginning for strict chat templates", () => {
  const messages = [
    { role: "system", content: "Character profile" },
    { role: "user", content: "Hello" },
    { role: "assistant", content: "Hi" },
    { role: "system", content: "Remember the photo" },
    { role: "user", content: "Do you remember it?" },
    { role: "system", content: "Answer the direct question" },
  ];

  assert.deepEqual(normalizeOllamaMessages(messages), [
    {
      role: "system",
      content: "Character profile\n\nRemember the photo\n\nAnswer the direct question",
    },
    { role: "user", content: "Hello" },
    { role: "assistant", content: "Hi" },
    { role: "user", content: "Do you remember it?" },
  ]);
});

test("leaves message lists without system directives unchanged", () => {
  const messages = [
    { role: "user", content: "Hello" },
    { role: "assistant", content: "Hi" },
  ];

  assert.equal(normalizeOllamaMessages(messages), messages);
});

test("salvages a useful plain-text character reply when optional JSON metadata is missing", () => {
  const error = new Error("Unreadable structured response");
  error.rawResponse = "I'm checking the trail near the north wall.";
  assert.equal(plainStructuredReplyFallback(error), "I'm checking the trail near the north wall.");
});

test("does not salvage malformed structured output as visible dialogue", () => {
  const error = new Error("Unreadable structured response");
  error.rawResponse = '{"reply": "unfinished"';
  assert.equal(plainStructuredReplyFallback(error), "");
});

test("plain response recovery strips a swallowed metadata tail", () => {
  const error = new Error("Unreadable structured response");
  error.rawResponse = 'That sounds good to me," relationshipDelta":0,';
  assert.equal(plainStructuredReplyFallback(error), "That sounds good to me.");
});
