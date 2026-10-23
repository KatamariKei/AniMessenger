import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pendingDiscoveryUnlocks } from "../server/revelation-live.mjs";
import { createRevelationStore } from "../server/revelations.mjs";
import { createDiscoveryDismissals } from "../shared/discovery-dismissals.mjs";

const character = { id: "fixture", name: "Fixture", series: "Selected", tags: [] };
const definitions = [{ id: "one", title: "A familiar craft", truth: "A private supported truth." }, { id: "two", title: "An old promise", truth: "Another private truth." }];
const thread = { id: "chat", character, discoveryAwardIds: ["one", "two"] };
const state = { definitions, historyReviews: { chat: { discoveries: [{ discoveryId: "one", origin: "live_chat" }, { discoveryId: "two", origin: "earlier_chat" }] } } };

test("unlock notifications require a confirmed live discovery and completed bonus", () => {
  assert.deepEqual(pendingDiscoveryUnlocks(state, thread), [{ id: "chat:discovery:one", discoveryId: "one", title: "A familiar craft", bondReward: 5 }]);
  assert.deepEqual(pendingDiscoveryUnlocks(state, { ...thread, discoveryAwardIds: [] }), []);
  assert.deepEqual(pendingDiscoveryUnlocks(state, { ...thread, id: "other-chat" }), []);
  assert.doesNotMatch(JSON.stringify(pendingDiscoveryUnlocks(state, thread)), /private supported truth|Another private truth|sources|Quote/);
  const acknowledged = { ...state, historyReviews: { chat: { ...state.historyReviews.chat, acknowledgedUnlockIds: ["chat:discovery:one"] } } };
  assert.deepEqual(pendingDiscoveryUnlocks(acknowledged, thread), []);
});

test("dismissals survive restart and concurrent history updates without replay", async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ani-unlock-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const store = createRevelationStore(dir);
  await store.save(character, { status: "ready", definitions });
  await store.save(character, { historyReview: state.historyReviews.chat }, { historyThreadId: thread.id });
  await Promise.all([
    store.save(character, { historyReview: { acknowledgedUnlockIds: ["chat:discovery:one"] } }, { historyThreadId: thread.id }),
    store.save(character, { historyReview: { status: "complete", encounteredLeadIds: ["two"] } }, { historyThreadId: thread.id }),
  ]);
  const saved = await createRevelationStore(dir).load(character);
  assert.deepEqual(pendingDiscoveryUnlocks(saved, thread), []);
  assert.deepEqual(saved.historyReviews.chat.acknowledgedUnlockIds, ["chat:discovery:one"]);
  assert.deepEqual(saved.definitions, definitions);
});

test("the popup is persistent, accessible, queued behind bond milestones, and uses sound preferences", async () => {
  const component = await fs.readFile(new URL("../src/DiscoveryNotification.tsx", import.meta.url), "utf8");
  const app = await fs.readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  const css = await fs.readFile(new URL("../src/local.css", import.meta.url), "utf8");
  assert.match(component, /Discovery unlocked/);
  assert.match(component, /aria-label="Dismiss discovery notification"/);
  assert.match(component, /api.acknowledgeDiscoveryUnlock/);
  assert.match(component, /config\?\.soundEnabled/);
  assert.match(component, /playSound\("discovery-unlock"/);
  assert.doesNotMatch(component, /bond-heartbeat|bond-celebration/);
  assert.match(component, /document.hidden/);
  assert.doesNotMatch(component, /setTimeout/);
  assert.match(app, /onPendingChange=\{setDiscoveryPending\}/);
  assert.match(component, /lastDismissed\.set\(thread\.id, Date\.now\(\)\)/);
  const popupRule = css.match(/\.discovery-unlocked \{([^}]+)\}/)?.[1] || "";
  assert.match(popupRule, /animation: none/);
  assert.match(popupRule, /transform: none/);
  assert.match(popupRule, /backdrop-filter: none/);
  assert.match(popupRule, /-webkit-backdrop-filter: none/);
  assert.match(popupRule, /background: #161819/);
  assert.doesNotMatch(css, /@keyframes discovery-unlocked/);
  assert.equal((app.match(/<DiscoveryNotification\b/g) || []).length, 1);
  // Notification and message-scroll are siblings. Sharing active.id made React
  // leave orphaned notification DOM behind during thread refresh/reconciliation.
  assert.match(app, /<DiscoveryNotification key=\{`discovery:\$\{active.id\}`\}/);
  assert.doesNotMatch(app, /<DiscoveryNotification key=\{active.id\}/);
  assert.match(component, /dismissalReceipts.has\(item.id\)/);
  assert.doesNotMatch(component, /addEventListener\("focus"/);
  assert.match(component, /notificationPoller.run/);
  assert.match(component, /setInterval\(\(\) => void poll\(\), 2000\)/);
  assert.match(component, /document.hidden \|\| pausedRef.current/);
  assert.match(component, /refreshedUnlocks.add\(unlock.id\);\s*void api.thread/);
  assert.match(component, /dismissalReceipts.dismiss\(thread.id, unlock.id\);\s*setUnlock/);
  assert.match(component, /setUnlock\(null\)/);
  assert.doesNotMatch(component, /pendingUnlocks|relationship-milestone discovery-unlocked/);
  assert.match(component, /setUnlock\(value => \{[\s\S]*result.value.unlocks.filter/);
  assert.doesNotMatch(component, /disabled=\{saving\}|setUnlock\(closing\)|dismissing.current/);
  assert.match(component, /viewBox="0 0 24 24"/);
  assert.match(css, /\.discovery-unlocked button svg \{ display: block; pointer-events: none;/);
});

test("dismissal survives remount and failed acknowledgement without reopening the popup", async () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  let time = 0;
  const queue = createDiscoveryDismissals({ storage, now: () => time });
  queue.dismiss("chat", "one");
  await queue.flush("chat", async () => { throw new Error("offline"); });
  assert.equal(queue.has("one"), true);
  const reopened = createDiscoveryDismissals({ storage });
  assert.equal(reopened.has("one"), true);
  let calls = 0;
  await queue.flush("chat", async () => { calls++; });
  assert.equal(calls, 0);
  time = 10_000;
  await queue.flush("chat", async () => { calls++; });
  assert.equal(calls, 1);
  await createDiscoveryDismissals({ storage }).flush("chat", async () => { calls++; });
  assert.equal(calls, 1);
});

test("a slow acknowledgement cannot block another dismissal or duplicate the same request", async () => {
  const queue = createDiscoveryDismissals();
  let finish;
  const slow = new Promise(resolve => { finish = resolve; });
  const calls = [];
  const acknowledge = async (_, id) => { calls.push(id); if (id === "one") await slow; };
  queue.dismiss("chat", "one");
  const first = queue.flush("chat", acknowledge);
  queue.dismiss("chat", "two");
  await queue.flush("chat", acknowledge);
  assert.deepEqual(calls, ["one", "two"]);
  assert.equal(queue.has("two"), true);
  finish();
  await first;
});
