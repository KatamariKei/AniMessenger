import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import ts from "typescript";

test("discovery fanfare has four distinct notes and its finish is not cut off", async t => {
  const source = await fs.readFile(new URL("../src/sound.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /bond-heartbeat|discovery-steady|discovery-warm|discovery-sparkle/);
  const oscillators = [];
  const timers = [];
  const parameter = () => ({ value: 0, setValueAtTime(value) { this.value = value; }, exponentialRampToValueAtTime() {} });
  const node = () => ({ connect(target) { return target; }, disconnect() {} });
  class AudioContext {
    state = "running";
    currentTime = 0;
    destination = node();
    createGain() { return { ...node(), gain: parameter() }; }
    createOscillator() {
      const oscillator = { ...node(), frequency: parameter(), start(at) { this.at = at; }, stop(at) { this.stopAt = at; } };
      oscillators.push(oscillator);
      return oscillator;
    }
  }
  const oldWindow = globalThis.window;
  const oldDocument = globalThis.document;
  t.after(() => { globalThis.window = oldWindow; globalThis.document = oldDocument; });
  globalThis.window = { AudioContext, setTimeout(callback, duration) { timers.push(duration); } };
  globalThis.document = { visibilityState: "visible" };
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
  const { playSound } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
  assert.equal(playSound("discovery-unlock", { enabled: false, volume: 0.35 }, { preview: true }), false);
  assert.equal(oscillators.length, 0);
  assert.equal(playSound("discovery-unlock", { enabled: true, volume: 0.35 }, { preview: true }), true);
  const melody = oscillators.filter(item => item.type === "sine");
  assert.equal(melody.length, 4);
  assert.deepEqual(melody.map(item => item.frequency.value), [392, 493.88, 587.33, 783.99]);
  assert.ok(Math.abs(melody[1].at - melody[0].at - 0.24) < 0.001);
  assert.ok(melody[3].stopAt - melody[3].at > 0.8);
  assert.ok(timers[0] / 1000 > Math.max(...oscillators.map(item => item.stopAt)));
  const app = await fs.readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(app, /Discovery alternatives|discovery-steady|discovery-warm|discovery-sparkle/);
  assert.match(app, /previewSound\("discovery-unlock"\)/);
});
