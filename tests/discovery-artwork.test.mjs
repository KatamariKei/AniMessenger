import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { queueCharacterImage } from "../server/comfy.mjs";
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

test("discovery generation saves only the refined image and keeps ordinary images single pass", async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  let sent;
  globalThis.fetch = async (_url, options) => {
    sent = JSON.parse(options.body);
    return new Response(JSON.stringify({ prompt_id: "hires-discovery" }));
  };
  const config = {
    comfyUrl: "http://fixture",
    comfyWorkflowFile: fileURLToPath(new URL("../workflows/anima-fast-standard-loras-api.json", import.meta.url)),
    comfyMappingFile: fileURLToPath(new URL("../workflows/anima-fast-standard-loras-api.mapping.json", import.meta.url)),
  };
  const thread = { character, profile: { visual: { identity: ["brown hair"], signature: [], defaultWardrobe: "blue jacket" } }, scene: { outfit: "blue jacket" } };
  const options = { ...discoveryArtworkSize, sceneAwareFraming: false, seed: 123, hiresFix: true };
  await queueCharacterImage(config, thread, "School event", options);
  const graph = sent.prompt;
  const node = link => graph[link[0]];
  const save = Object.values(graph).filter(n => n.class_type === "SaveImage");
  assert.equal(save.length, 1);
  const finalDecode = node(save[0].inputs.images);
  const refine = node(finalDecode.inputs.samples);
  assert.equal(refine.class_type, "KSampler");
  assert.equal(refine.inputs.denoise, 0.5);
  assert.equal(refine.inputs.seed, 123);
  const encode = node(refine.inputs.latent_image);
  const scale = node(encode.inputs.pixels);
  assert.equal(encode.class_type, "VAEEncode");
  assert.deepEqual(encode.inputs.vae, finalDecode.inputs.vae);
  assert.equal(scale.class_type, "ImageScale");
  assert.deepEqual([scale.inputs.width, scale.inputs.height, scale.inputs.upscale_method, scale.inputs.crop], [2304, 1536, "lanczos", "disabled"]);
  const firstDecode = node(scale.inputs.image);
  const firstSampler = node(firstDecode.inputs.samples);
  assert.equal(firstSampler.inputs.denoise, 1);
  assert.deepEqual(refine.inputs.model, firstSampler.inputs.model);
  assert.deepEqual(refine.inputs.positive, firstSampler.inputs.positive);
  assert.deepEqual(refine.inputs.negative, firstSampler.inputs.negative);
  assert.deepEqual([graph["59"].inputs.width, graph["59"].inputs.height], [1536, 1024]);
  assert.equal(sent.extra_data, undefined);
  await queueCharacterImage(config, thread, "School event", { ...options, hiresFix: false });
  assert.equal(Object.values(sent.prompt).filter(n => n.class_type === "KSampler").length, 1);
  assert.ok(sent.extra_data.extra_pnginfo.workflow);
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
