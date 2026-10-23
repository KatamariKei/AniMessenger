import test from "node:test";
import assert from "node:assert/strict";
import { buildImageSceneSnapshot } from "../server/image-scene-snapshot.mjs";
import { buildImagePrompt } from "../server/identity.mjs";

const ericaProfile = {
  visual: {
    identity: ["red hair", "brown eyes"],
    signature: [],
    defaultWardrobe: "yellow waitress uniform",
  },
};
const erica = { name: "Erica Anderson", trigger: "erica_anderson" };

test("the final saved posture replaces a conflicting photo-brief pose", () => {
  const scene = { location: "rental entryway", posture: "seated", activity: "taking off shoes", environment: "a quiet rental home entrance with a shoe bench", environmentEvidence: { kind: "final_scene" } };
  const snapshot = buildImageSceneSnapshot(scene, "Erica standing by the door, soft indoor lighting");
  assert.equal(snapshot.scene.environment, scene.environment);
  assert.doesNotMatch(snapshot.brief, /standing/);
  assert.match(buildImagePrompt(ericaProfile, erica, snapshot.scene, snapshot.brief), /Erica Anderson is seated/);
});

test("image snapshot rejects the cooler sentence fragment but preserves the visible deck", () => {
  const snapshot = buildImageSceneSnapshot({
    location: "the cooler and poured themselves fresh drinks",
    environment: "A wooden rental-house deck overlooking the shoreline with a railing and bright afternoon sky.",
    activity: "sharing fresh drinks",
  }, "Erica leaning against the railing holding a drink");
  assert.equal(snapshot.scene.location, "");
  assert.match(snapshot.scene.environment, /wooden rental-house deck/i);
  assert.ok(snapshot.issues.includes("location_rejected:destination_is_object"));

  const prompt = buildImagePrompt(ericaProfile, erica, snapshot.scene, snapshot.brief);
  assert.match(prompt, /wooden rental-house deck/i);
  assert.doesNotMatch(prompt, /cooler|takes place in\s*\./i);
});

test("image snapshot drops a malformed location echo instead of inventing a setting", () => {
  const prompt = buildImagePrompt(ericaProfile, erica, {
    location: "the cooler and poured themselves fresh drinks",
    environment: "The setting is the cooler and poured themselves fresh drinks.",
    activity: "sharing fresh drinks",
  }, "A candid third-person image of Erica");
  assert.doesNotMatch(prompt, /cooler|the setting is|takes place/i);
  assert.match(prompt, /sharing fresh drinks/i);
});

test("image snapshot removes a conflicting room from the photo brief", () => {
  const prompt = buildImagePrompt(ericaProfile, erica, {
    location: "bedroom",
    environment: "A quiet bedroom with a made bed, bedside table, curtained window, and warm lamplight.",
    activity: "reading",
  }, "A candid image of Erica in the kitchen, reading a book");
  assert.match(prompt, /bedroom/i);
  assert.doesNotMatch(prompt, /kitchen/i);
  assert.match(prompt, /reading a book/i);
});

test("image snapshot cannot combine two contradictory room environments", () => {
  const prompt = buildImagePrompt(ericaProfile, erica, {
    location: "bedroom",
    environment: "A bright kitchen with marble counters, cabinets, cookware, and a tiled floor.",
    activity: "reading",
  }, "A candid image of Erica reading");
  assert.match(prompt, /bedroom/i);
  assert.doesNotMatch(prompt, /kitchen|marble counters/i);
});

test("image snapshot replaces a leaked movement fragment with the established room", () => {
  const prompt = buildImagePrompt(ericaProfile, erica, {
    location: "bedroom",
    environment: ") we dry off and walk into the bedroom",
    activity: "cuddling in bed to sleep",
  }, "A sleepy candid image of Erica");
  assert.match(prompt, /furnished bedroom.*nightstands/i);
  assert.doesNotMatch(prompt, /we dry off|walk into/i);
});

test("image snapshot preserves valid open-vocabulary and inhabitable settings", () => {
  const observatory = buildImageSceneSnapshot({ location: "the moonlit crystal observatory" });
  assert.equal(observatory.scene.location, "the moonlit crystal observatory");
  const cooler = buildImageSceneSnapshot({ location: "the walk-in cooler" });
  assert.equal(cooler.scene.location, "the walk-in cooler");
});

