import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import { createAutomaticDiscoveryPreparation } from "../server/discovery-preparation.mjs";

const thread = { id: "miku", character: { id: "miku" }, profile: {}, firstContact: { openingImage: { status: "complete" } } };
function fixture(initial) {
  let state = initial, schedules = 0;
  const saves = [], jobs = new Map();
  const prepare = createAutomaticDiscoveryPreparation({
    identity: c => c.id, jobs,
    store: { load: async () => state, save: async (_c, patch) => { saves.push(patch); state = { ...state, ...patch }; } },
    schedule: () => { schedules++; },
  });
  return { prepare, jobs, saves, schedules: () => schedules };
}

test("opening completion queues preparation once without conversation review or rewards", async () => {
  const f = fixture();
  await Promise.all([f.prepare(thread), f.prepare(thread), f.prepare(thread, { journeyVisit: true })]);
  assert.equal(f.jobs.size, 1);
  assert.equal(f.schedules(), 1);
  assert.deepEqual(f.saves, [{ status: "queued" }]);
  assert.deepEqual(f.jobs.get("miku"), { threadId: "miku", character: thread.character });
});

test("automatic creation waits for a completed opening image and a profile", async () => {
  for (const status of [undefined, "pending", "error"]) {
    const f = fixture();
    assert.equal(await f.prepare({ ...thread, firstContact: { openingImage: { status } } }), false);
    assert.equal(f.jobs.size, 0);
  }
  assert.equal(await fixture().prepare({ ...thread, profile: null }), false);
});

test("a real Journey visit prepares older characters but never retries terminal research", async () => {
  const legacy = { ...thread, firstContact: undefined };
  const fresh = fixture();
  assert.equal(await fresh.prepare(legacy, { journeyVisit: true }), true);
  for (const status of ["ready", "limited", "failed"]) {
    const f = fixture({ status });
    assert.equal(await f.prepare(legacy, { journeyVisit: true }), false);
    assert.equal(f.schedules(), 0);
  }
  assert.equal(await fixture({ status: "preparing", definitions: [{ id: "existing" }] }).prepare(thread), false);
});

test("interrupted preparation resumes without duplicating an active history job", async () => {
  for (const status of ["queued", "preparing"]) assert.equal(await fixture({ status }).prepare(thread), true);
  const f = fixture({ status: "queued" });
  f.jobs.set("miku", { kind: "history" });
  assert.equal(await f.prepare(thread), false);
  assert.deepEqual(f.jobs.get("miku"), { kind: "history" });
});

test("automatic preparation is wired only to successful opening completion and actual Journey visits", async () => {
  const server = await fs.readFile(new URL("../server/index.mjs", import.meta.url), "utf8");
  const start = server.indexOf('const withImage = insertOpeningSceneMessage');
  const end = server.indexOf('\n  const saved = await saveThread', start);
  assert.match(server.slice(start, end), /openingImage: \{ status: "complete"[\s\S]*prepareDiscoveriesAutomatically\(saved\)/);
  const journeyGet = server.slice(server.indexOf('if (request.method === "GET" && journeyMatch)'), server.indexOf('const destinationRecheckMatch'));
  assert.doesNotMatch(journeyGet, /prepareDiscoveriesAutomatically/);
  const client = await fs.readFile(new URL("../src/CharacterJourney.tsx", import.meta.url), "utf8");
  const effect = client.slice(client.indexOf('api.journey(thread.id).then(async'), client.indexOf('const discoveryStatus'));
  assert.match(effect, /api.prepareDiscoveries\(thread.id, false, true\)/);
  assert.doesNotMatch(effect, /checkDiscoveryHistory/);
});
