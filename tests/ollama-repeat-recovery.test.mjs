import assert from "node:assert/strict";
import test from "node:test";
import { generateStructuredProfileDraft, isOllamaTokenRepeatAbort, mergeProfileRepairDraft, ollamaResponseWasTruncated, tokenRepeatRecoveryOptions } from "../server/ollama.mjs";

test("a readable first profile draft is retained instead of being mistaken for a failed response", async () => {
  const draft = { summary: "A specific, grounded portrait.", persona: { traits: ["direct"] } };
  let calls = 0;
  assert.equal(await generateStructuredProfileDraft(async () => { calls += 1; return draft; }), draft);
  assert.equal(calls, 1);
});

test("an unreadable profile response gets one bounded retry", async () => {
  const attempts = [];
  const draft = await generateStructuredProfileDraft(async (attempt) => {
    attempts.push(attempt);
    if (!attempt) throw new Error("invalid JSON");
    return { summary: "Recovered" };
  });
  assert.deepEqual(attempts, [0, 1]);
  assert.equal(draft.summary, "Recovered");
});

test("a nested quality-repair response keeps the top-level summary and prior core when fields are blank", () => {
  const draft = { summary: "A specific existing summary about a grounded character and their role.", persona: {
    traits: ["forthright"], speechStyle: "Uses plain, direct sentences and follows up with a specific question.",
  } };
  const merged = mergeProfileRepairDraft(draft, { summary: "A revised grounded summary that remains specific to the character.", persona: {
    traits: [], speechStyle: "", competencies: ["documented combat skill"],
  } });
  assert.equal(merged.summary, "A revised grounded summary that remains specific to the character.");
  assert.deepEqual(merged.persona.traits, draft.persona.traits);
  assert.equal(merged.persona.speechStyle, draft.persona.speechStyle);
  assert.deepEqual(merged.persona.competencies, ["documented combat skill"]);
});

test("recognizes Ollama's token-repeat abort without swallowing unrelated failures", () => {
  assert.equal(isOllamaTokenRepeatAbort(new Error('Ollama returned HTTP 500: {"error":"prediction aborted, token repeat limit reached"}')), true);
  assert.equal(isOllamaTokenRepeatAbort(new Error("Ollama returned HTTP 500: out of memory")), false);
});

test("repeat recovery raises sampling freedom and adds a bounded repetition window", () => {
  assert.deepEqual(tokenRepeatRecoveryOptions({ temperature: 0.1 }), {
    temperature: 0.35,
    repeatPenalty: 1.15,
    repeatLastN: 256,
  });
  assert.deepEqual(tokenRepeatRecoveryOptions({ temperature: 0.8, repeatPenalty: 1.2, repeatLastN: 512 }), {
    temperature: 0.8,
    repeatPenalty: 1.2,
    repeatLastN: 512,
  });
});

test("recognizes Ollama's explicit token-limit completion reason", () => {
  assert.equal(ollamaResponseWasTruncated({ done_reason: "length" }), true);
  assert.equal(ollamaResponseWasTruncated({ done_reason: "stop" }), false);
});
