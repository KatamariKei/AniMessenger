import test from "node:test";
import assert from "node:assert/strict";
import { reduceSceneTurn } from "../server/scene-state.mjs";
import { pendingSceneFields, sceneVerificationContext } from "../server/scene-verification.mjs";
import { createImageSceneResolver, resolveImageSceneSnapshot, sceneEvidenceCatalog, sceneReviewInput, validateSceneReview } from "../server/scene-reconciliation.mjs";
import { buildImagePrompt } from "../server/identity.mjs";
import { queueCharacterImage } from "../server/comfy.mjs";

const baseline = { location: "corridor", environment: "stone walls beside a heavy wooden door", activity: "returning from the gardens", posture: "standing", outfit: "blue dress", lighting: "corridor lanterns", presence: "together", revision: 3 };
const passage = "Mira reclines on red velvet cushions inside her private quarters. Obsidian pillars surround the lounge beneath a vaulted ceiling. Warm lamps light the room.";
const userText = "We are in Mira's bright and spacious private quarters.";
const proof = quote => ({ quote, source: "character", actor: "character", phase: "current" });
const review = () => ({ scene: { location: "private quarters", environment: "Obsidian pillars surround the lounge beneath a vaulted ceiling", activity: "reclining on red velvet cushions", posture: "lying", lighting: "warm lamps" }, sceneEvidence: {
  location: proof("Mira reclines on red velvet cushions inside her private quarters"),
  environment: proof("Obsidian pillars surround the lounge beneath a vaulted ceiling"),
  activity: proof("Mira reclines on red velvet cushions inside her private quarters"),
  posture: proof("Mira reclines on red velvet cushions inside her private quarters"),
  lighting: proof("Warm lamps light the room"),
} });
const uncertain = () => reduceSceneTurn(baseline, {
  userText: "Please make yourself comfortable.", characterText: passage,
  modelScene: review().scene, sceneEvidence: {},
});
const thread = () => ({ id: "scene-test", storageInstanceId: "instance-one", character: { id: "scene-test", name: "Mira" }, profile: { name: "Mira", visual: { identity: [], signature: [], defaultWardrobe: "blue dress" } }, scene: uncertain(), messages: [{ id: "user-one", from: "user", text: userText }, { id: "reply-one", from: "character", narration: passage }] });

test("rejected updates remain uncertain across no-change turns instead of certifying the old room", () => {
  const first = uncertain();
  assert.equal(first.location, "corridor");
  assert.deepEqual(pendingSceneFields(first), ["location", "environment", "activity", "lighting", "posture"]);
  const next = reduceSceneTurn(first, { userText: "Thank you.", characterText: "Mira smiles.", modelScene: {}, sceneEvidence: {} });
  assert.deepEqual(pendingSceneFields(next), pendingSceneFields(first));
  assert.match(sceneVerificationContext(next), /UNCERTAIN SCENE FIELDS.*location/);
  assert.match(sceneVerificationContext(next), /may be stale/);
});

test("a current exact quotation can reaffirm and clear an uncertain unchanged value", () => {
  const scene = { ...baseline, verification: { pending: ["posture"] } };
  const next = reduceSceneTurn(scene, { characterText: "Mira is standing by the window.", modelScene: { posture: "standing" }, sceneEvidence: { posture: proof("Mira is standing by the window") } });
  assert.deepEqual(pendingSceneFields(next), []);
  assert.equal(next.activity, baseline.activity);
});

test("remote user whereabouts cannot verify an uncertain character location", () => {
  const scene = { ...baseline, presence: "apart", verification: { pending: ["location"] } };
  const next = reduceSceneTurn(scene, { userText: "I am in my apartment.",
    modelScene: { location: "my apartment" },
    sceneEvidence: { location: { quote: "I am in my apartment", source: "user", actor: "user", phase: "current" } } });
  assert.equal(next.location, "corridor");
  assert.equal(next.userLocation, "my apartment");
  assert.deepEqual(pendingSceneFields(next), ["location"]);
});

test("a missing scene contract flags changed proposals, without disputing untouched clothing", () => {
  const next = reduceSceneTurn(baseline, { characterText: "Mira is in the lounge.", modelScene: { location: "lounge", outfit: "blue dress" } });
  assert.deepEqual(pendingSceneFields(next), ["location"]);
});

test("scene repair resolves the final room, surroundings, action and pose as one artwork snapshot", () => {
  const t = thread();
  const scene = validateSceneReview(t.scene, sceneReviewInput(t), review());
  assert.match(scene.location, /private quarters/);
  assert.equal(scene.posture, "lying");
  assert.equal(scene.outfit, baseline.outfit);
  assert.deepEqual(pendingSceneFields(scene), []);
  const prompt = buildImagePrompt(t.profile, t.character, scene);
  assert.match(prompt, /red velvet cushions/);
  assert.match(prompt, /Obsidian pillars/);
  assert.doesNotMatch(prompt, /corridor|returning from the gardens|corridor lanterns/);
});

test("partial, forged, planned and user-owned character state cannot clear uncertainty", () => {
  const t = thread(), input = sceneReviewInput(t);
  const partial = review(); delete partial.scene.posture;
  const forged = review(); forged.sceneEvidence.posture.quote = "Mira lies on a beach towel.";
  const planned = review(); planned.sceneEvidence.posture.phase = "planned";
  const userOwned = review(); userOwned.sceneEvidence.posture.actor = "user";
  for (const result of [partial, forged, planned, userOwned, {}, null]) assert.throws(() => validateSceneReview(t.scene, input, result), /could not be verified/);
  assert.equal(t.scene.location, "corridor");
});

test("historical context and another speaker cannot supply current repair evidence", () => {
  const t = thread();
  t.messages.unshift({ from: "character", text: "Mira stands in a kitchen." });
  t.messages.push({ from: "character", speakerId: "other", text: "I am lying on a beach towel." });
  const input = sceneReviewInput(t);
  assert.equal(input.latestExchange.character, passage);
  const result = review(); result.sceneEvidence.posture.quote = "Mira stands in a kitchen";
  assert.throws(() => validateSceneReview(t.scene, input, result), /could not be verified/);
});

test("a narrow action repair preserves established surroundings and clothes without fresh quotations", () => {
  const scene = { ...baseline, location: "Rural Shrine", environment: "ancient cedars surround a weathered stone gate", environmentEvidence: { kind: "final_scene" }, activity: "arriving", lighting: "ambient light", verification: { pending: ["activity", "lighting"] } };
  const input = { characterName: "Mira", latestExchange: { user: "We enter the shrine grounds.", character: "Mira steps through the gate beside her companion, pausing to enjoy the quiet." } };
  const result = validateSceneReview(scene, input, {
    scene: { location: "shrine grounds", environment: "a completely different beach with white sand", outfit: "red coat", activity: "pausing to enjoy the quiet", lighting: "dappled sunlight", posture: "standing" },
    sceneEvidence: { activity: proof("Mira steps through the gate beside her companion, pausing to enjoy the quiet"), lighting: proof("The sun lights the path") },
  });
  assert.equal(result.location, scene.location);
  assert.equal(result.environment, scene.environment);
  assert.equal(result.outfit, scene.outfit);
  assert.equal(result.posture, scene.posture);
  assert.equal(result.activity, "pausing to enjoy the quiet");
  assert.deepEqual(pendingSceneFields(result), []);
  assert.deepEqual(result.verification.omitted, ["lighting"]);
  const prompt = buildImagePrompt({ visual: { identity: [], signature: [], defaultWardrobe: "blue dress" } }, { name: "Mira" }, result);
  assert.match(prompt, /ancient cedars/i);
  assert.doesNotMatch(prompt, /dappled sunlight|ambient light illuminates|red coat|white sand/);
});

test("missing optional lighting does not block a verified scene or become fabricated evidence", () => {
  const scene = { ...baseline, verification: { pending: ["lighting"] } };
  const input = { latestExchange: { user: "Take a picture.", character: "Mira pauses beside the gate." }, characterName: "Mira" };
  const result = validateSceneReview(scene, input, { scene: {}, sceneEvidence: {} });
  assert.equal(result.location, scene.location);
  assert.deepEqual(result.verification.omitted, ["lighting"]);
  assert.deepEqual(pendingSceneFields(result), []);
  const reaffirmed = reduceSceneTurn(result, { characterText: "Mira stands in the warm lamplight.", modelScene: { lighting: "warm lamplight" }, sceneEvidence: { lighting: proof("Mira stands in the warm lamplight") } });
  assert.equal(reaffirmed.lighting, "warm lamplight");
  assert.equal(reaffirmed.verification.omitted, undefined);
});

test("all uncertain descriptive fields can be omitted while verified visual anchors remain intact", () => {
  const scene = { ...baseline, verification: { pending: ["environment", "activity", "expression", "lighting"] } };
  const input = { latestExchange: { user: "Please take a picture.", character: "Mira nods." }, characterName: "Mira" };
  const result = validateSceneReview(scene, input, null);
  assert.equal(result.location, baseline.location);
  assert.equal(result.outfit, baseline.outfit);
  assert.equal(result.posture, baseline.posture);
  assert.equal(result.presence, baseline.presence);
  assert.deepEqual(pendingSceneFields(result), []);
  assert.deepEqual(result.verification.omitted, ["environment", "activity", "expression", "lighting"]);
  const prompt = buildImagePrompt({ visual: { identity: [], signature: [] } }, { name: "Mira" }, result);
  assert.match(prompt, /corridor/);
  assert.match(prompt, /Mira is standing/);
  assert.doesNotMatch(prompt, /returning from the gardens|stone walls|lanterns|unspecified|ambient light illuminates/);
});

test("source references resolve to exact current passages without model-copied quotations", () => {
  const t = thread(), input = sceneReviewInput(t);
  const first = input.evidenceCatalog.find(item => item.source === "character");
  const environment = input.evidenceCatalog.find(item => item.quote.includes("Obsidian pillars"));
  const lighting = input.evidenceCatalog.find(item => item.quote.includes("Warm lamps"));
  const result = review();
  for (const field of ["location", "activity", "posture"]) result.sceneEvidence[field] = { evidenceId: first.id, actor: "character", phase: "current" };
  result.sceneEvidence.environment = { evidenceId: environment.id, actor: "character", phase: "current" };
  result.sceneEvidence.lighting = { evidenceId: lighting.id, actor: "character", phase: "current" };
  assert.equal(validateSceneReview(t.scene, input, result).posture, "lying");
  result.sceneEvidence.posture.evidenceId = "nonexistent-source";
  assert.throws(() => validateSceneReview(t.scene, input, result), /posture could not be verified/);
});

function establishedRoomThread() {
  const t = thread();
  t.scene = { ...baseline, location: "throne room", posture: "standing", locationEvidence: { kind: "final_scene", source: "character", text: "Mira entered the throne room" }, verification: { pending: ["location"] } };
  t.messages = [{ from: "character", text: "Mira entered the throne room." },
    { from: "user", text: "I stand beside her." },
    { from: "character", text: "Mira leans against the door, then picks up her book." }];
  return t;
}

test("a source-backed room can remain current without its name being repeated", () => {
  const t = establishedRoomThread(), input = sceneReviewInput(t);
  assert.equal(input.verifiedLocationCheckpoint.location, "throne room");
  const result = validateSceneReview(t.scene, input, {
    locationDisposition: "unchanged", scene: { location: "throne room", posture: "seated" }, sceneEvidence: {},
  });
  assert.equal(result.location, "throne room");
  assert.equal(result.posture, "standing");
  assert.equal(result.environment, t.scene.environment);
  assert.deepEqual(pendingSceneFields(result), []);
  assert.deepEqual(result.locationEvidence, t.scene.locationEvidence);
});

test("retaining a verified room does not prevent a separately evidenced pose update", () => {
  const t = establishedRoomThread();
  t.scene.verification.pending.push("posture");
  t.messages.at(-1).text = "Mira sits down beside the door.";
  const input = sceneReviewInput(t);
  const source = input.evidenceCatalog.find(item => item.source === "character");
  const result = validateSceneReview(t.scene, input, {
    locationDisposition: "unchanged", scene: { location: "throne room", posture: "seated" },
    sceneEvidence: { posture: { evidenceId: source.id, phase: "current", actor: "character" } },
  });
  assert.equal(result.location, "throne room");
  assert.equal(result.posture, "seated");
});

test("continuity cannot retain a room without a real checkpoint or rename that checkpoint", () => {
  for (const mutate of [
    t => { delete t.scene.locationEvidence; },
    t => { t.scene.locationEvidence.text = "Mira entered the garden"; },
    t => { t.messages.shift(); },
  ]) {
    const t = establishedRoomThread(); mutate(t);
    const input = sceneReviewInput(t);
    assert.equal(input.verifiedLocationCheckpoint, null);
    assert.throws(() => validateSceneReview(t.scene, input, { locationDisposition: "unchanged", scene: { location: "throne room" }, sceneEvidence: {} }), /location could not be verified/);
  }
  const t = establishedRoomThread();
  t.messages.at(-1).text = "Mira pauses just inside the threshold of her private chambers.";
  assert.throws(() => validateSceneReview(t.scene, sceneReviewInput(t), { locationDisposition: "unchanged", scene: { location: "private quarters" }, sceneEvidence: {} }), /location could not be verified/);
});

test("an unsupported model rename does not poison an established room or its verified pose", () => {
  const t = establishedRoomThread(), input = sceneReviewInput(t);
  const reference = input.evidenceCatalog.find(item => item.source === "character").id;
  const result = validateSceneReview(t.scene, input, {
    locationDisposition: "changed", scene: { location: "private quarters", posture: "lying" },
    sceneEvidence: { location: { evidenceId: reference, actor: "shared", phase: "current" } },
  });
  assert.equal(result.location, "throne room");
  assert.equal(result.posture, "standing");
  assert.deepEqual(pendingSceneFields(result), []);
});

test("checkpoint retention cannot freeze an actual new named room or arrival", () => {
  for (const passage of ["Mira pauses just inside the threshold of her private chambers.", "Mira stands inside the royal hall.", "Mira stepped into the private chambers.", "Mira entered Moonshadow Atrium.", "Mira stepped through the doorway."]) {
    const t = establishedRoomThread(); t.messages.at(-1).text = passage;
    assert.throws(() => validateSceneReview(t.scene, sceneReviewInput(t), { locationDisposition: "unchanged", scene: { location: "throne room" }, sceneEvidence: {} }), /location could not be verified/, passage);
  }
});

test("a completed explicit move overrides an incorrect unchanged-room decision", () => {
  const t = establishedRoomThread();
  t.messages.at(-2).text = "We are now inside the bedroom.";
  t.messages.at(-1).text = "Mira settles onto the bed.";
  const result = validateSceneReview(t.scene, sceneReviewInput(t), { locationDisposition: "unchanged", scene: { location: "throne room" }, sceneEvidence: {} });
  assert.equal(result.location, "the bedroom");
  assert.notEqual(result.location, t.scene.location);
});

test("a source ID does not bypass phase, future-action or actor ownership checks", () => {
  const scene = { ...baseline, verification: { pending: ["posture"] } };
  const latestExchange = { user: "I am kneeling by the table.", character: "Mira will recline on the sofa tomorrow." };
  const input = { latestExchange, evidenceCatalog: sceneEvidenceCatalog(latestExchange), characterName: "Mira" };
  const futureId = input.evidenceCatalog.find(item => item.source === "character").id;
  const userId = input.evidenceCatalog.find(item => item.source === "user").id;
  for (const evidence of [ { evidenceId: futureId, actor: "character", phase: "current" }, { evidenceId: futureId, actor: "character", phase: "planned" }, { evidenceId: userId, actor: "user", phase: "current" } ]) {
    assert.throws(() => validateSceneReview(scene, input, { scene: { posture: "lying" }, sceneEvidence: { posture: evidence } }), /posture could not be verified/);
  }
});

test("a location change discards the old room's lighting; reaffirming a room preserves staging", () => {
  const moved = reduceSceneTurn(baseline, { userText, modelScene: {}, sceneEvidence: {} });
  assert.equal(moved.lighting, "ambient light");
  const stable = { ...baseline, verification: { pending: ["location"] } };
  const next = validateSceneReview(stable, { latestExchange: { user: "", character: "Mira is in the corridor." }, characterName: "Mira" }, { scene: { location: "corridor" }, sceneEvidence: { location: proof("Mira is in the corridor") } });
  assert.equal(next.lighting, baseline.lighting);
  assert.equal(next.posture, baseline.posture);
  assert.equal(next.environment, baseline.environment);
});

function harness(reviewFn = async () => review()) {
  let current = thread(), calls = 0, writes = 0;
  const resolve = createImageSceneResolver({
    review: async (...args) => { calls++; return reviewFn(...args); },
    load: async () => structuredClone(current),
    update: async (id, work, options) => {
      assert.equal(options.expectedInstanceId, "instance-one");
      if (!current || current.storageInstanceId !== options.expectedInstanceId) throw Object.assign(new Error("replaced"), { statusCode: 409 });
      const patch = await work(structuredClone(current));
      current = { ...current, ...patch }; writes++; return structuredClone(current);
    },
  });
  return { resolve, get current() { return current; }, set current(value) { current = value; }, get calls() { return calls; }, get writes() { return writes; } };
}

test("verified scenes bypass the model entirely; ordinary turns do not invoke the resolver", async () => {
  const h = harness(); const t = { ...thread(), scene: baseline };
  const result = await h.resolve({}, t);
  assert.equal(h.calls, 0); assert.equal(h.writes, 0); assert.equal(result.thread, t);
});

test("concurrent captures share one repair and persist only the scene", async () => {
  let release; const held = new Promise(resolve => { release = resolve; });
  const h = harness(async () => { await held; return review(); });
  const before = structuredClone(h.current);
  const a = h.resolve({}, before), b = h.resolve({}, before);
  await Promise.resolve(); release();
  const results = await Promise.all([a, b]);
  assert.equal(h.calls, 1); assert.equal(h.writes, 1);
  assert.deepEqual(h.current.messages, before.messages);
  assert.equal(h.current.scene.verification.status, "verified");
  assert.equal(results[0].reconciled, true);
  await h.resolve({}, h.current);
  assert.equal(h.calls, 1);
});

test("new dialogue, a newer scene or deletion during review prevents stale persistence", async () => {
  for (const change of [
    value => ({ ...value, messages: [...value.messages, { from: "user", text: "We left for the garden." }] }),
    value => ({ ...value, scene: { ...value.scene, location: "garden" } }),
    () => null,
    value => ({ ...value, storageInstanceId: "replacement" }),
  ]) {
    const h = harness(async () => { h.current = change(h.current); return review(); });
    await assert.rejects(h.resolve({}, structuredClone(h.current)), { statusCode: 409 });
    assert.equal(h.writes, 0);
  }
});

test("failed repair leaves the original state intact and remains retryable", async () => {
  let fail = true;
  const h = harness(async () => { if (fail) throw new Error("offline"); return review(); });
  const before = structuredClone(h.current);
  await assert.rejects(h.resolve({}, before), /offline/);
  assert.deepEqual(h.current, before);
  fail = false; await h.resolve({}, before);
  assert.equal(h.calls, 2); assert.equal(h.writes, 1);
});

test("an unavailable reviewer can omit an optional action without blocking a safe picture", async () => {
  const h = harness(async () => { throw new Error("offline"); });
  h.current.scene = { ...baseline, verification: { pending: ["activity"] } };
  const result = await h.resolve({}, structuredClone(h.current));
  assert.equal(h.calls, 1);
  assert.equal(result.thread.scene.location, baseline.location);
  assert.equal(result.thread.scene.posture, baseline.posture);
  assert.deepEqual(result.thread.scene.verification.omitted, ["activity"]);
});

test("a pending user turn cannot be paired with an older reply for verification", async () => {
  const h = harness(); h.current.messages.push({ from: "user", text: "We are in the garden now." });
  await assert.rejects(h.resolve({}, h.current), /could not be verified/);
  assert.equal(h.calls, 0);
});

test("temporary speaker snapshots are repaired without changing the original conversation", async () => {
  const t = thread(), before = structuredClone(t);
  const result = await resolveImageSceneSnapshot({}, t, async () => review());
  assert.equal(result.thread.scene.posture, "lying");
  assert.deepEqual(t, before);
});

test("the image transport refuses unresolved current scenes before contacting ComfyUI", async () => {
  await assert.rejects(queueCharacterImage({}, thread()), /scene needs to be verified/);
});
