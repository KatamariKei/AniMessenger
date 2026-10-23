import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { discoveryArtworkInstructions, discoveryArtworkSnapshot, discoveryArtworkSize, unlockedDiscovery } from "../server/discovery-artwork.mjs";
import { createRevelationStore } from "../server/revelations.mjs";
import { publicDiscoveries } from "../server/revelation-live.mjs";

const character = { id: "art-fixture", name: "Fixture", series: "Selected" };
const definitions = [{ id: "one", title: "Past shyness", truth: "She was shy at school." }, { id: "two", title: "Private", truth: "Locked truth." }];
const history = { discoveries: [{ discoveryId: "one", origin: "live_chat" }] };

test("artwork requires an unlocked discovery in the correct conversation", () => {
  const state = { definitions, historyReviews: { chat: history } };
  assert.equal(unlockedDiscovery(state, "chat", "one").truth, definitions[0].truth);
  assert.equal(unlockedDiscovery(state, "chat", "two"), null);
  assert.equal(unlockedDiscovery(state, "other", "one"), null);
});

test("art snapshot uses the discovery scene without mutating or inheriting live state", () => {
  const thread = { character, scene: { location: "lake", outfit: "swimsuit", posture: "lying", outfitEvidence: { text: "private dialogue" } }, memories: ["durable fact"] };
  const before = structuredClone(thread);
  const snapshot = discoveryArtworkSnapshot(thread, { brief: "Shy at a school event", scene: { location: "school hall", outfit: "school uniform", posture: "standing" } });
  assert.deepEqual(thread, before);
  assert.equal(snapshot.thread.scene.location, "school hall");
  assert.equal(snapshot.thread.scene.outfit, "school uniform");
  assert.equal(snapshot.thread.scene.outfitEvidence, undefined);
  assert.doesNotMatch(JSON.stringify(snapshot.thread.scene), /lake|swimsuit|private dialogue/);
  assert.match(discoveryArtworkInstructions, /FULL discovery truth/);
  assert.deepEqual(discoveryArtworkSize, { width: 1536, height: 1024 });
  assert.match(snapshot.brief, /3:2 landscape composition/);
  assert.match(snapshot.brief, /entire head and face visible/);
  assert.throws(() => discoveryArtworkSnapshot(thread, { brief: "test", scene: { outfit: "nude" } }));
});

test("artwork persists across restart and concurrent discovery updates without leaking locked art", async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ani-art-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const store = createRevelationStore(dir);
  await store.save(character, { status: "ready", definitions });
  await store.save(character, { historyReview: history }, { historyThreadId: "chat" });
  await store.save(character, { historyReview: { artwork: { one: { status: "complete", imageUrl: "/api/images/view?filename=one.png", promptId: "private-job" }, two: { status: "complete", imageUrl: "locked" } } } }, { historyThreadId: "chat" });
  await Promise.all([
    store.save(character, { historyReview: { artwork: { one: { status: "queued" } } } }, { historyThreadId: "chat" }),
    store.save(character, { historyReview: { acknowledgedUnlockIds: ["ack"] } }, { historyThreadId: "chat" }),
  ]);
  const state = await createRevelationStore(dir).load(character);
  const view = publicDiscoveries(state, { id: "chat", discoveryAwardIds: ["one"] });
  assert.equal(view.revealed[0].artwork.imageUrl, "/api/images/view?filename=one.png");
  assert.equal(view.revealed[0].artwork.status, "queued");
  assert.doesNotMatch(JSON.stringify(view), /Locked truth|private-job|"id":"locked"/);
  assert.equal(state.historyReviews.chat.artwork.two, undefined);
});

test("art jobs finish outside chat and Journey has separated sections and compact milestones", async () => {
  const server = await fs.readFile(new URL("../server/index.mjs", import.meta.url), "utf8");
  const component = await fs.readFile(new URL("../src/CharacterJourney.tsx", import.meta.url), "utf8");
  const branch = server.slice(server.indexOf('if (job.kind === "discovery_artwork"'), server.indexOf('if (job.kind === "opening_scene"'));
  assert.match(branch, /revelationStore.save/);
  assert.match(server, /snapshot.thread, snapshot.brief, \{ \.\.\.discoveryArtworkSize/);
  assert.doesNotMatch(branch, /saveThread|nowMessage/);
  for (const title of ["Achievements", "Discoveries", "Bond milestones"]) assert.match(component, new RegExp(`>${title}<`));
  assert.match(component, /milestones.slice\(-3\)/);
  assert.match(component, /item.color/);
  assert.match(component, /<dialog/);
});
