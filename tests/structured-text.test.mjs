import test from "node:test";
import assert from "node:assert/strict";
import { stripStructuredMetadataLeak } from "../server/structured-text.mjs";

test("structured response metadata can never leak into visible narrative prose", () => {
  const leaked = 'She smiled. "Though I make no promises about giving up any more of the mattress," relationshipDelta":0,';
  assert.equal(
    stripStructuredMetadataLeak(leaked),
    'She smiled. "Though I make no promises about giving up any more of the mattress."',
  );
});

test("other structured chat fields are removed without damaging completed prose", () => {
  assert.equal(
    stripStructuredMetadataLeak('She smiles and settles into the chair. "shouldSendPhoto": false, "photoBrief": null'),
    "She smiles and settles into the chair.",
  );
  assert.equal(
    stripStructuredMetadataLeak('She smiles. “That sounds perfect.”'),
    'She smiles. “That sounds perfect.”',
  );
});

test("new scene evidence cannot leak into visible prose", () => {
  assert.equal(stripStructuredMetadataLeak('We are home now., "sceneEvidence":{"location":null}'), "We are home now.");
});

test("a punctuation-only JSON tail after complete dialogue is removed without truncating prose", () => {
  const text = 'She tugged lightly on his shirt. "I guess it\'s time to pay up on that bet!"",';
  const expected = 'She tugged lightly on his shirt. "I guess it\'s time to pay up on that bet!"';
  assert.equal(stripStructuredMetadataLeak(text), expected);
  assert.equal(stripStructuredMetadataLeak(expected), expected);
});

test("legitimate dialogue endings, nested quotes and unfinished prose are not rewritten", () => {
  for (const text of ['She said, "Ready?"', 'She said, “Ready?”', '"Wait," she said,', 'She called it "a \"great idea!\"",', 'She paused,', 'The door swung open…', '"Ready?",', 'This includes a "quoted phrase",']) {
    assert.equal(stripStructuredMetadataLeak(text), text);
  }
});
