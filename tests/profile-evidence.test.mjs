import assert from "node:assert/strict";
import test from "node:test";
import { buildCharacterProfile } from "../server/ollama.mjs";

test("missing source material reports a research failure before any model request", async () => {
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => { requests++; throw new Error("Should not contact the model"); };
  try {
    const stages = [];
    await assert.rejects(buildCharacterProfile({}, { name: "Medusa", tags: [] },
      { notes: [], catalogueNotes: [], evidence: { passages: [] } }, stage => stages.push(stage)), /no usable reference material/);
    assert.deepEqual(stages, ["evidence"]);
    assert.equal(requests, 0);
  } finally { globalThis.fetch = originalFetch; }
});
