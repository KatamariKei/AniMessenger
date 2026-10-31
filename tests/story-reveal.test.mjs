import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import ts from "typescript";
const source = await fs.readFile(new URL("../src/story-reveal.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { createStoryReveal, updateStoryReveal, advanceStoryReveal } = await import("data:text/javascript;base64," + Buffer.from(code).toString("base64"));
const visible = state => state.tokens.slice(0, state.cursor).join("");

test("reading retains original first-word, word, punctuation and paragraph delays", () => {
  const state = createStoryReveal();
  updateStoryReveal(state, 'One two, three.\n\nFour five.', false, 0);
  advanceStoryReveal(state, 179); assert.equal(visible(state), "");
  advanceStoryReveal(state, 180); assert.equal(visible(state), "One ");
  advanceStoryReveal(state, 314); assert.equal(visible(state), "One ");
  advanceStoryReveal(state, 315); assert.equal(visible(state), "One two, ");
  advanceStoryReveal(state, 534); assert.equal(visible(state), "One two, ");
  advanceStoryReveal(state, 535); assert.equal(visible(state), "One two, three.\n\n");
  advanceStoryReveal(state, 964); assert.equal(visible(state), "One two, three.\n\n");
  advanceStoryReveal(state, 965); assert.equal(visible(state), "One two, three.\n\nFour ");
  assert.equal(advanceStoryReveal(state, 1100).complete, true);
  const sentence = createStoryReveal();
  updateStoryReveal(sentence, 'Ready. Next.', false, 0);
  advanceStoryReveal(sentence, 180); advanceStoryReveal(sentence, 499);
  assert.equal(visible(sentence), 'Ready. ');
  assert.equal(advanceStoryReveal(sentence, 500).complete, true);
});

test("frequent stream chunks neither restart the clock nor reveal partial words", () => {
  const state = createStoryReveal();
  updateStoryReveal(state, 'The gar', true, 0);
  for (let time = 10; time < 180; time += 10) {
    updateStoryReveal(state, 'The garde', true, time);
    advanceStoryReveal(state, time);
    assert.equal(visible(state), '');
  }
  advanceStoryReveal(state, 180); assert.equal(visible(state), 'The ');
  advanceStoryReveal(state, 1000); assert.equal(visible(state), 'The ');
  updateStoryReveal(state, 'The garden ', true, 1010);
  assert.equal(advanceStoryReveal(state, 1010).complete, false);
  assert.equal(visible(state), 'The garden ');
  updateStoryReveal(state, 'The garden is quiet.', true, 1020);
  advanceStoryReveal(state, 1020); assert.equal(visible(state), 'The garden ');
  advanceStoryReveal(state, 1145); assert.equal(visible(state), 'The garden is ');
  advanceStoryReveal(state, 2000); assert.equal(visible(state), 'The garden is ');
  updateStoryReveal(state, 'The garden is quiet.', false, 2010);
  assert.equal(advanceStoryReveal(state, 2010).complete, true);
  assert.equal(visible(state), 'The garden is quiet.');
});

test("saved-reply handoff preserves the visible prefix and deadline rather than dumping or restarting", () => {
  const state = createStoryReveal();
  const text = 'Mira opens the gate and waits beside the garden.';
  updateStoryReveal(state, text, true, 0);
  advanceStoryReveal(state, 180); advanceStoryReveal(state, 315);
  const alreadyRead = visible(state);
  const deadline = state.nextAt;
  updateStoryReveal(state, text, false, 320);
  assert.equal(visible(state), alreadyRead);
  assert.equal(state.nextAt, deadline);
  advanceStoryReveal(state, 449); assert.equal(visible(state), alreadyRead);
  advanceStoryReveal(state, 450); assert.equal(visible(state), 'Mira opens the ');
  assert.ok(state.cursor < state.tokens.length);
});

test("final paragraph formatting preserves read words while a replacement draft starts fresh", () => {
  const state = createStoryReveal();
  updateStoryReveal(state, 'Mira nods. She waits.', true, 0);
  advanceStoryReveal(state, 180); advanceStoryReveal(state, 315);
  updateStoryReveal(state, 'Mira nods.\n\nShe waits.', false, 400);
  assert.equal(visible(state), 'Mira nods.\n\n');
  updateStoryReveal(state, 'Mira smiles beside the gate.', true, 450);
  assert.equal(visible(state), '');
  assert.equal(state.nextAt, 630);
  advanceStoryReveal(state, 629); assert.equal(visible(state), '');
  advanceStoryReveal(state, 630); assert.equal(visible(state), 'Mira ');
});

test("tap-to-reveal remains an explicit opt-out and carries across completion", () => {
  const state = createStoryReveal();
  updateStoryReveal(state, 'Mira opens the ga', true, 0);
  state.skipped = true;
  assert.equal(advanceStoryReveal(state, 10).complete, false);
  assert.equal(visible(state), 'Mira opens the ');
  updateStoryReveal(state, 'Mira opens the gate.', false, 20);
  assert.equal(advanceStoryReveal(state, 20).complete, true);
  assert.equal(visible(state), 'Mira opens the gate.');
});
