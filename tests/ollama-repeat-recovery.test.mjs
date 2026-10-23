import assert from "node:assert/strict";
import test from "node:test";
import { applyProfileCorrectionPatch, generateStructuredProfileDraft, isOllamaTokenRepeatAbort, mergeProfileRepairDraft, ollamaResponseWasTruncated, profileRepairFieldsForIssues, tokenRepeatRecoveryOptions } from "../server/ollama.mjs";

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

test("quality repair requests only the weak profile fields", () => {
  assert.deepEqual(profileRepairFieldsForIssues([
    "at least five varied exampleLines",
    "a concrete plain-conversation baselineVoice",
  ]), ["baselineVoice", "exampleLines"]);
  assert.deepEqual(profileRepairFieldsForIssues([
    "a specific two- or three-sentence character summary covering role, temperament, and supported relationships or context",
    "at least three specific, sometimes contrasting personality traits",
  ]), ["summary", "traits"]);
});

test("focused factual correction replaces only explicitly patched profile fields", () => {
  const profile = {
    summary: "An existing supported summary.",
    visual: { defaultWardrobe: "a red coat", identity: ["black hair"] },
    persona: { traits: ["direct", "loyal"], competencies: ["martial arts"] },
    canon: { relationships: ["A supported friendship"] },
  };
  const corrected = applyProfileCorrectionPatch(profile, { changes: [
    { path: "persona.competencies", stringValue: "", arrayValue: ["documented hand-to-hand combat skill"] },
    { path: "summary", stringValue: "A corrected supported summary.", arrayValue: [] },
  ] });
  assert.equal(corrected.summary, "A corrected supported summary.");
  assert.deepEqual(corrected.persona.competencies, ["documented hand-to-hand combat skill"]);
  assert.deepEqual(corrected.persona.traits, profile.persona.traits);
  assert.deepEqual(corrected.visual, profile.visual);
  assert.deepEqual(corrected.canon, profile.canon);
});

test("focused factual correction can remove the final unsupported array item", () => {
  const corrected = applyProfileCorrectionPatch({ persona: { characterTensions: ["unsupported tension"] } }, { changes: [
    { path: "persona.characterTensions", stringValue: "", arrayValue: [] },
  ] });
  assert.deepEqual(corrected.persona.characterTensions, []);
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
