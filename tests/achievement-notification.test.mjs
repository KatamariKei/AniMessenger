import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createDiscoveryDismissals } from "../shared/discovery-dismissals.mjs";

test("achievement dismissal is durable, immediate, retriable, and isolated from discoveries", async () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  const receipts = createDiscoveryDismissals({ storage, key: "achievements", retryMs: 0 });
  receipts.dismiss("chat", "award");
  await receipts.flush("chat", async () => { throw new Error("offline"); });
  assert.equal(receipts.has("award"), true);
  const restarted = createDiscoveryDismissals({ storage, key: "achievements", retryMs: 0 });
  assert.equal(restarted.has("award"), true);
  assert.equal(createDiscoveryDismissals({ storage }).has("award"), false);
  let acknowledgements = 0;
  await restarted.flush("chat", async () => { acknowledgements++; });
  await restarted.flush("chat", async () => { acknowledgements++; });
  assert.equal(acknowledgements, 1);
});

test("achievement popup uses the proven notification shell, queued priority and celebration sound", async () => {
  const component = await fs.readFile(new URL("../src/AchievementNotification.tsx", import.meta.url), "utf8");
  const app = await fs.readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  assert.match(component, /playSound\("bond-celebration"/);
  assert.match(component, /aria-label="Dismiss achievement notification"/);
  assert.match(component, /receipts\.dismiss[\s\S]*setUnlocks\(\[\]\)[\s\S]*receipts\.flush/);
  assert.match(component, /filter\(item => !receipts\.has\(item\.id\)\)/);
  assert.match(component, /document\.hidden \|\| pausedRef\.current/);
  assert.match(component, /discovery-unlocked achievement-unlocked/);
  assert.doesNotMatch(component, /disabled=/);
  assert.match(app, /key=\{`achievement:\$\{active\.id\}`\}/);
  assert.match(app, /showSettings \|\| discoveryPending/);
  assert.match(component, /await api\.discoveryUnlocks\(thread\.id\)/);
  assert.match(component, /awaitingDiscoveries\.current\.every\(id => discoveryDismissalReceipts\.has\(id\)\)/);
  assert.match(component, /readyAt - Date\.now\(\), discoveryQuietUntil\(thread\.id\) - Date\.now\(\)/);
  assert.match(component, /paused \|\| !released \|\| !visible/);
});
