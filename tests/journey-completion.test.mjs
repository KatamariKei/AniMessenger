import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

const source = await fs.readFile(new URL("../src/CharacterJourney.tsx", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
function render(revealed) {
  let cursor = 0;
  const journey = { mode: "active", characterPoints: 0, achievements: [], milestones: [],
    discoveries: { status: "ready", revealed, leadAvailability: { prepared: 3, newAvailable: 0, locked: 0 },
      history: { status: "complete", confirmed: 2 }, leads: [] } };
  const jsx = (type, props) => ({ type, props });
  const modules = { react: { useState: initial => [cursor++ === 0 ? journey : initial, () => {}], useEffect() {} },
    "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "fragment" }, "./api": { api: {} } };
  const sandbox = { exports: {}, require: name => modules[name] };
  vm.runInNewContext(code, sandbox);
  const tree = sandbox.exports.CharacterJourney({ thread: { id: "fixture" } });
  const text = value => value == null || typeof value === "boolean" ? "" : typeof value !== "object" ? String(value)
    : Array.isArray(value) ? value.map(text).join(" ") : text(value.props?.children);
  return { tree, text: text(tree), serialized: JSON.stringify(tree) };
}
const discoveries = Array.from({ length: 3 }, (_, i) => ({ id: `discovery-${i}`, title: `Discovery ${i}`, truth: `Truth ${i}`,
  artwork: { status: "complete", imageUrl: `art-${i}.png` } }));

test("completed discoveries hide research, instructions and empty clues while retaining all artwork cards", () => {
  const result = render(discoveries);
  assert.match(result.text, /All 3 discoveries uncovered/);
  assert.doesNotMatch(result.text, /Discovery research & past conversations|Scan past conversations|Clues to explore|Follow a clue|confirmed from earlier chat/);
  for (const item of discoveries) {
    assert.ok(result.text.includes(item.title));
    assert.ok(result.serialized.includes(item.artwork.imageUrl));
  }
  assert.match(result.text, /Regenerate/);
});

test("unfinished discoveries retain their research and clue controls; duplicate IDs cannot mark completion", () => {
  for (const revealed of [[], discoveries.slice(0, 2), [discoveries[0], discoveries[0], discoveries[1]]]) {
    const result = render(revealed);
    assert.doesNotMatch(result.text, /All 3 discoveries uncovered/);
    assert.match(result.text, /Discovery research & past conversations/);
    assert.match(result.text, /Scan past conversations/);
    assert.match(result.text, /Clues to explore/);
  }
});
