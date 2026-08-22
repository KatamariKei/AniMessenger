import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const app = fs.readFileSync(path.join(root, "src", "App.tsx"), "utf8");

test("first-run setup treats Ollama as required and ComfyUI as optional", () => {
  assert.match(app, /Ollama is required to create and chat with characters/);
  assert.match(app, /Required to meet characters/);
  assert.match(app, /disabled=\{step === 1 && !ready\}/);
  assert.match(app, /ComfyUI adds optional profile pictures/);
  assert.doesNotMatch(app, /Your characters live here—not in the cloud/);
});

test("unavailable image controls are disabled or hidden while ComfyUI is offline", () => {
  assert.match(app, /disabled=\{!active\.profile \|\| !health\.comfy \|\| typing \|\| capturingMoment\}/);
  assert.match(app, /\{health\.comfy && <button[\s\S]*?className="avatar-refresh"/);
  assert.match(app, /if \(!active \|\| !health\.comfy \|\| typing \|\| capturingMoment\) return/);
});

test("empty discovery and settings actions use clear labels", () => {
  assert.match(app, /Use the character search on the left to choose someone to meet/);
  assert.match(app, /Save settings/);
  assert.doesNotMatch(app, /Save locally/);
});

test("character catalogue status offers a manual reconnect and refreshes active discovery searches", () => {
  assert.match(app, /health\.animadex \? "Refresh" : "Reconnect"/);
  assert.match(app, /onClick=\{\(\) => void retryConnections\(\)\}/);
  assert.match(app, /\[mode, search, health\.animadex\]/);
  assert.match(app, /Character search is still offline/);
});

test("a first meeting opens immediately while the character profile is prepared", () => {
  assert.match(app, /openThread\(started\)/);
  assert.match(app, /className="build-in-chat"/);
  assert.match(app, /disabled=\{!active\.profile\}/);
  assert.doesNotMatch(app, /className="profile-layer build-layer"/);
});
