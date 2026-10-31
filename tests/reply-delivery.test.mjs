import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

const compile = source => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const load = async file => import("data:text/javascript;base64," + Buffer.from(compile(await fs.readFile(new URL(file, import.meta.url), "utf8"))).toString("base64"));
const { createReplyDelivery } = await load("../src/reply-delivery.ts");
const reveal = await load("../src/story-reveal.ts");

test("Story arrival sounds once at first visible text, never at generation or save completion", () => {
  let sounds = 0;
  const delivery = createReplyDelivery("story", () => sounds++);
  assert.equal(delivery.streamDrafts, true);
  delivery.delivered(); assert.equal(sounds, 0);
  delivery.firstVisible(); assert.equal(sounds, 1);
  delivery.firstVisible(); delivery.delivered(); assert.equal(sounds, 1);
  // Retrying a provisional draft and handing off to the saved bubble share it.
  delivery.firstVisible(); delivery.firstVisible(); assert.equal(sounds, 1);
});

test("Messaging keeps the reply buffered and announces only completed delivery", () => {
  for (const mode of ["chat", undefined]) {
    let sounds = 0;
    const delivery = createReplyDelivery(mode, () => sounds++);
    assert.equal(delivery.streamDrafts, false);
    delivery.firstVisible(); assert.equal(sounds, 0);
    delivery.delivered(); assert.equal(sounds, 1);
    delivery.delivered(); assert.equal(sounds, 1);
  }
});

test("separate speakers own separate cues, while an unshown failed reply is silent", () => {
  let sounds = 0;
  const host = createReplyDelivery("story", () => sounds++);
  const guest = createReplyDelivery("story", () => sounds++);
  createReplyDelivery("story", () => sounds++); // Failed before anything appeared.
  host.firstVisible(); guest.firstVisible(); host.delivered(); guest.delivered();
  assert.equal(sounds, 2);
});

test("the actual Story component announces the first rendered word and stays silent through handoff and replacement", async () => {
  const source = await fs.readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  const ast = ts.createSourceFile("App.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const component = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "StoryPassage").getText(ast);
  const code = ts.transpileModule(`import {useMemo,useState,useRef,useEffect,useLayoutEffect} from 'react';
    import {advanceStoryReveal,createStoryReveal,updateStoryReveal} from './story-reveal';
    ${component}\nexport {StoryPassage};`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  let now = 0, cursor = 0, dirty = false, frameId = 0, output;
  const hooks = [], layout = [], effects = [], frames = new Map();
  const same = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  const effect = queue => (callback, dependencies) => {
    const index = cursor++, previous = hooks[index];
    if (!previous || !same(previous.dependencies, dependencies)) {
      hooks[index] = { dependencies, cleanup: previous?.cleanup };
      queue.push(() => { hooks[index].cleanup?.(); hooks[index].cleanup = callback(); });
    }
  };
  const react = {
    useMemo(callback, dependencies) { const index = cursor++; if (!hooks[index] || !same(hooks[index].dependencies, dependencies)) hooks[index] = { value: callback(), dependencies }; return hooks[index].value; },
    useState(initial) { const index = cursor++; hooks[index] ??= { value: typeof initial === "function" ? initial() : initial }; return [hooks[index].value, next => { const value = typeof next === "function" ? next(hooks[index].value) : next; if (!Object.is(value, hooks[index].value)) { hooks[index].value = value; dirty = true; } }]; },
    useRef(value) { const index = cursor++; return hooks[index] ??= { current: value }; },
    useEffect: effect(effects), useLayoutEffect: effect(layout),
  };
  const jsx = (type, props) => ({ type, props });
  const sandbox = { exports: {}, require: name => name === "react" ? react : name === "./story-reveal" ? reveal : { jsx, jsxs: jsx },
    performance: { now: () => now }, window: { requestAnimationFrame(callback) { frames.set(++frameId, callback); return frameId; }, cancelAnimationFrame(id) { frames.delete(id); } } };
  vm.runInNewContext(code, sandbox);
  let sounds = 0;
  const delivery = createReplyDelivery("story", () => sounds++);
  let props = { text: "Mira opens the ga", animate: true, streaming: true, resume: reveal.createStoryReveal(), onFirstVisible: delivery.firstVisible, onProgress() {}, onComplete() {} };
  const render = () => {
    for (let i = 0; i < 10; i++) {
      dirty = false; cursor = 0; output = sandbox.exports.StoryPassage(props);
      while (layout.length) layout.shift()();
      if (dirty) continue;
      while (effects.length) effects.shift()();
      if (!dirty) break;
    }
  };
  const tick = time => { now = time; const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback(now)); if (dirty) render(); };
  render(); assert.equal(sounds, 0);
  tick(179); assert.equal(sounds, 0);
  tick(180); assert.equal(output.props["aria-label"], "Mira "); assert.equal(sounds, 1);
  delivery.delivered(); assert.equal(sounds, 1);
  props = { ...props, text: "Mira opens the gate.", streaming: false }; render();
  tick(315); assert.equal(sounds, 1);
  props = { ...props, text: "Mira waits beside the gate.", resume: reveal.createStoryReveal(), streaming: true }; render();
  tick(495); assert.equal(sounds, 1);
  output.props.onClick(); if (dirty) render(); assert.equal(sounds, 1);
});
