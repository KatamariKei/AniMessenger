import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { capturedMomentBrief, prepareSnapshotBrief, snapshotComposition } from "../server/moment-capture.mjs";
import { buildImagePrompt, visibleEnvironmentDescription } from "../server/identity.mjs";
import { imageGenerationSeed } from "../server/comfy.mjs";

test("shower snapshots contain drawable directions, not sensory or continuity boilerplate", () => {
  const scene = { location: "townhouse", presence: "together", posture: "standing", activity: "showering", outfit: "nude",
    environment: "A steamy bathroom filled with the sound and scent of a running shower.",
    environmentEvidence: { kind: "final_scene" }, expression: "mischievous smile", lighting: "soft diffused light through steam" };
  const thread = { scene, profile: { visual: { identity: ["red hair", "grey eyes", "from above"], signature: [], defaultWardrobe: "yellow uniform" } } };
  const before = structuredClone(thread);
  const prompt = buildImagePrompt(thread.profile, { name: "Erica Anderson" }, scene,
    capturedMomentBrief(thread) + "; Show the completed current outfit naturally", { preserveCharacterTraits: true });
  assert.match(prompt, /falling shower water visible/);
  assert.match(prompt, /steamy bathroom/i);
  assert.match(prompt, /showering/);
  assert.match(prompt, /looking at the viewer/);
  assert.match(prompt, /red hair/);
  assert.match(prompt, /from above/);
  assert.doesNotMatch(prompt, /sound|scent|current moment|current action|completed current outfit|yellow uniform|natural interaction/);
  assert.deepEqual(thread, before);
});

test("nonvisual sensory modifiers are removed without losing visible furnishings", () => {
  assert.equal(visibleEnvironmentDescription("A cedar-lined sauna filled with dry heat and the scent of aromatic wood, with tiered benches and a warm amber glow."), "A cedar-lined sauna filled with dry heat, with tiered benches and a warm amber glow.");
  assert.equal(visibleEnvironmentDescription("A kitchen with the scent of coffee, wooden cabinets and a sunlit counter."), "A kitchen, wooden cabinets and a sunlit counter.");
  assert.equal(visibleEnvironmentDescription("A red shirt and black skirt"), "A red shirt and black skirt");
});

test("viewer-facing interaction respects explicit gaze, sleep and occupied attention", () => {
  const scene = { presence: "together", posture: "standing", activity: "chatting", expression: "warm smile" };
  assert.match(prepareSnapshotBrief({ scene }, "medium shot"), /looking at the viewer/);
  for (const patch of [{ activity: "reading a book" }, { activity: "sleeping" }, { expression: "eyes closed" }, { expression: "looking to the side" }, { presence: "apart" }]) {
    assert.doesNotMatch(capturedMomentBrief({ scene: { ...scene, ...patch } }), /looking at the viewer/);
  }
  assert.doesNotMatch(prepareSnapshotBrief({ scene }, "medium shot, looking away"), /looking at the viewer/);
  assert.doesNotMatch(capturedMomentBrief({ scene, profile: { visual: { identity: ["looking to the side"], signature: [] } } }), /looking at the viewer/);
});

test("captured moment briefs describe composition without duplicating the persistent scene", () => {
  const brief = capturedMomentBrief({
    character: { name: "Misty (Pokemon)" },
    scene: {
      activity: "relaxing beside the pool",
      location: "Cerulean Gym",
      environment: "bright tiled pool deck, rippling blue water, tall windows",
      outfit: "red swimsuit",
      expression: "playful smile",
      lighting: "bright indoor light",
    },
  });

  assert.match(brief, /cinematic candid anime illustration/);
  assert.match(brief, /medium shot/);
  assert.doesNotMatch(brief, /current moment|current action|natural interaction|balanced composition/);
  assert.doesNotMatch(brief, /relaxing beside the pool|rippling blue water|red swimsuit|natural observer viewpoint/);
  assert.doesNotMatch(brief, /selfie|camera/i);
});

test("snapshot composition adapts to grounded activity and final posture", () => {
  const fixtures = [
    [{ posture: "standing", activity: "kissing" }, "close"],
    [{ posture: "standing", activity: "running along the beach" }, "full"],
    [{ posture: "lying", activity: "sleeping" }, "full"],
    [{ posture: "seated", activity: "reading a book" }, "three-quarter"],
    [{ posture: "kneeling", activity: "talking" }, "three-quarter"],
    [{ posture: "crouching", activity: "talking" }, "three-quarter"],
    [{ posture: "standing", activity: "getting dressed" }, "three-quarter"],
    [{ posture: "standing", activity: "pouring tea" }, "medium"],
    [{ posture: "seated", activity: "walking" }, "three-quarter"],
    [{ posture: "standing", activity: "planning to go swimming tomorrow" }, "medium"],
  ];
  for (const [scene, expected] of fixtures) {
    const thread = { scene };
    const before = structuredClone(thread);
    assert.equal(snapshotComposition(thread).framing, expected, JSON.stringify(scene));
    assert.deepEqual(thread, before);
  }
});

test("explicit framing overrides adaptive choices without erasing a configured angle", () => {
  const thread = { scene: { posture: "lying", activity: "sleeping" }, profile: { visual: { identity: ["from above"], signature: [] } } };
  assert.equal(snapshotComposition(thread, "chest-up portrait").framing, "close");
  assert.equal(prepareSnapshotBrief(thread, "chest-up portrait"), "chest-up portrait");
  assert.equal(snapshotComposition(thread).framing, "full");
  const configured = { ...thread, profile: { visual: { identity: ["from above", "medium shot"], signature: [] } } };
  assert.equal(snapshotComposition(configured).framing, "medium");
  assert.equal(snapshotComposition(configured).explicit, true);
  const prompt = buildImagePrompt(thread.profile, { name: "Hana" }, thread.scene, capturedMomentBrief(thread), { preserveCharacterTraits: true });
  assert.match(prompt, /from above/);
  assert.doesNotMatch(prompt, /eye[- ]level/);
});

test("action direction does not invent hand poses or named supporting objects", () => {
  const brief = capturedMomentBrief({ scene: { posture: "standing", activity: "pouring tea" } });
  assert.match(brief, /hands visible and unobscured/);
  assert.doesNotMatch(brief, /left hand|right hand|teapot|cup|countertop|chair|table/);
  const sleeping = capturedMomentBrief({ scene: { posture: "lying", activity: "sleeping" } });
  assert.doesNotMatch(sleeping, /bed|sofa|pillow/);
  assert.equal((prepareSnapshotBrief({ scene: {} }, brief).match(/medium shot/g) || []).length, 1);
});

test("image comparisons can reuse a valid seed without changing random generation defaults", () => {
  assert.equal(imageGenerationSeed(0), 0);
  assert.equal(imageGenerationSeed(123456), imageGenerationSeed(123456));
  assert.ok(Number.isInteger(imageGenerationSeed()));
  for (const seed of [-1, 1.5, "123", NaN, 2147483648]) assert.throws(() => imageGenerationSeed(seed), /comparison seed/);
});

test("snapshot framing retains identity and signature traits while respecting closed eyes", () => {
  const profile = { visual: {
    identity: ["silver hair", "grey eyes", "from above", "feet", "buttocks", "pubic hair"],
    signature: ["tattoo on thigh", "red toes"],
    defaultWardrobe: "shirt",
  } };
  const before = structuredClone(profile);
  const prompt = buildImagePrompt(profile, { name: "Hana" }, { expression: "eyes closed", outfit: "shirt" }, capturedMomentBrief({}), { preserveCharacterTraits: true });
  for (const trait of ["silver hair", "from above", "feet", "buttocks", "pubic hair", "tattoo on thigh", "red toes"]) assert.ok(prompt.includes(trait), trait);
  assert.match(prompt, /eyelids fully closed/);
  assert.doesNotMatch(prompt, /grey eyes/);
  assert.deepEqual(profile, before);
});

test("queued scene images preserve character traits by default and portraits explicitly opt out", () => {
  const comfy = readFileSync(new URL("../server/comfy.mjs", import.meta.url), "utf8");
  const server = readFileSync(new URL("../server/index.mjs", import.meta.url), "utf8");
  assert.match(comfy, /preserveCharacterTraits: overrides\.preserveCharacterTraits !== false/);
  const portrait = readFileSync(new URL("../server/portrait-style.mjs", import.meta.url), "utf8");
  assert.match(server, /profilePortraitRequest\(thread/);
  assert.match(portrait, /width: 1024, height: 1024, preserveCharacterTraits: false/);
});

test("snapshots retain deliberate perspective tags and grounded possessive room descriptions", () => {
  const profile = { visual: { identity: ["silver hair", "from above", "collarbone"], signature: [], defaultWardrobe: "long-sleeve shirt" } };
  const scene = {
    location: "my apartment",
    environment: "Inside my apartment, in the kitchen area with a countertop and a pan of sizzling bacon.",
    environmentEvidence: { kind: "final_scene", source: "character", text: "Inside my apartment, in the kitchen area with a countertop and a pan of sizzling bacon." },
    activity: "kissing", posture: "standing", outfit: "long-sleeve shirt",
  };
  const prompt = buildImagePrompt(profile, { name: "Hana Uzaki" }, scene, capturedMomentBrief({ scene }));
  assert.match(prompt, /from above/);
  assert.match(prompt, /kitchen area with a countertop and a pan of sizzling bacon/i);
  assert.match(prompt, /leaning forward to kiss the viewer/);
  assert.doesNotMatch(prompt, /at eye level|doorway|door frame/i);
  assert.equal(scene.environment.startsWith("Inside my apartment"), true);
});

test("possessive place normalization does not admit dialogue or future plans", () => {
  const profile = { visual: { identity: [], signature: [], defaultWardrobe: "shirt" } };
  const prompt = buildImagePrompt(profile, { name: "Hana" }, {
    location: "apartment",
    environment: "Inside my apartment, I hope we can visit the kitchen next week.",
    environmentEvidence: { kind: "final_scene", source: "character", text: "Inside my apartment, I hope we can visit the kitchen next week." },
  }, capturedMomentBrief({}));
  assert.doesNotMatch(prompt, /I hope|next week/i);
});
