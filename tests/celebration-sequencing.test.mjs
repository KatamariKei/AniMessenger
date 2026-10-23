import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

test("an award arriving first waits for discovery dismissal, two seconds, then plays once", async () => {
  const source = await fs.readFile(new URL("../src/AchievementNotification.tsx", import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  let now = 10000, quietUntil = 0, cursor = 0, dirty = false, output, soundCount = 0;
  const hooks = [], effects = [], timers = new Map(), dismissed = new Set();
  let timerId = 0;
  const same = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!hooks[index]) hooks[index] = { value: typeof initial === "function" ? initial() : initial };
      return [hooks[index].value, next => {
        const value = typeof next === "function" ? next(hooks[index].value) : next;
        if (!Object.is(value, hooks[index].value)) { hooks[index].value = value; dirty = true; }
      }];
    },
    useRef(value) { const index = cursor++; return hooks[index] ??= { current: value }; },
    useEffect(callback, dependencies) {
      const index = cursor++;
      const old = hooks[index];
      if (!old || !same(old.dependencies, dependencies)) {
        hooks[index] = { dependencies, cleanup: old?.cleanup };
        effects.push(() => { hooks[index].cleanup?.(); hooks[index].cleanup = callback(); });
      }
    },
  };
  const jsx = (type, props) => ({ type, props });
  const modules = {
    react,
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "./api": { api: {
      achievementUnlocks: async () => ({ unlocks: [{ id: "award", title: "Getting to know you", points: 10 }] }),
      discoveryUnlocks: async () => ({ unlocks: [{ id: "final-discovery" }] }),
      acknowledgeAchievement: async () => ({}),
    } },
    "./sound": { playSound: () => { soundCount++; return true; } },
    "./DiscoveryNotification": { discoveryDismissalReceipts: { has: id => dismissed.has(id) }, discoveryQuietUntil: () => quietUntil },
    "../shared/polling.mjs": { discoveryNotificationPoller: { run: async (key, request) => ({ status: "success", value: await request() }) } },
    "../shared/discovery-dismissals.mjs": { createDiscoveryDismissals: () => ({ has: () => false, flush: async () => {}, dismiss: () => {} }) },
  };
  const sandbox = { exports: {}, require: name => { if (!modules[name]) throw new Error(name); return modules[name]; },
    Date: { now: () => now }, document: { hidden: false, addEventListener() {}, removeEventListener() {} },
    window: { localStorage: {}, setInterval: () => 1, clearInterval() {},
      setTimeout(callback, delay) { timers.set(++timerId, { callback, at: now + delay }); return timerId; },
      clearTimeout(id) { timers.delete(id); } },
  };
  vm.runInNewContext(code, sandbox);
  const Component = sandbox.exports.AchievementNotification;
  const props = { thread: { id: "chat" }, characterName: "Fixture", config: { soundEnabled: true, soundVolume: 0.35 }, paused: false };
  const render = () => { cursor = 0; dirty = false; output = Component(props); while (effects.length) effects.shift()(); };
  const settle = async () => { for (let i = 0; i < 12; i++) { await Promise.resolve(); if (dirty) render(); } };
  render(); await settle();
  assert.equal(output, null);
  assert.equal(soundCount, 0);
  // Discovery has priority while visible, even if award polling finished first.
  props.paused = true; render(); await settle();
  dismissed.add("final-discovery"); quietUntil = now + 2000;
  props.paused = false; render(); await settle();
  const advance = async milliseconds => {
    now += milliseconds;
    for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.callback(); }
    await settle();
  };
  await advance(1999);
  assert.equal(output, null);
  assert.equal(soundCount, 0);
  await advance(1);
  assert.equal(output.props.className, "discovery-unlocked achievement-unlocked");
  assert.equal(soundCount, 1);
  render(); await settle();
  assert.equal(soundCount, 1);
});
