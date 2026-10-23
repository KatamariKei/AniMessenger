import assert from "node:assert/strict";
import test from "node:test";
import { applyFinalScene } from "../server/final-scene.mjs";
import { verifiedOutfitChange, visualEventOpportunity } from "../server/visual-event.mjs";
import { shouldQueueCharacterPhoto } from "../server/photo-claim.mjs";

const before = { location: "outside the restaurant", outfit: "blue dress", presence: "together" };
const proof = (quote, source = "character", actor = "character") => ({ quote, source, actor, phase: "current" });

test("explicit current shared location survives missing model quotations", () => {
  for (const text of ["[action: we are inside the boutique doing some shopping and Hana looks around]", "[action: We're in the trendy boutique and Hana is trying on clothes] I could buy a scarf."]) {
    const location = text.includes("trendy") ? "trendy boutique" : "boutique";
    const { scene } = applyFinalScene(before, { userText: text, modelScene: { location }, sceneEvidence: { location: null } });
    assert.equal(scene.location, location);
    assert.equal(scene.locationEvidence.source, "user");
  }
});

test("declaration fallback rejects plans, questions and remote scenes, and corrects a different proposed destination", () => {
  for (const text of ["We're in the boutique tomorrow.", "Imagine we're in the boutique.", "We're in the boutique?", "We're not in the boutique."]) {
    assert.equal(applyFinalScene(before, { userText: text, modelScene: { location: "boutique" }, sceneEvidence: {} }).scene.location, before.location);
  }
  assert.equal(applyFinalScene(before, { userText: "We are at the restaurant.", modelScene: { location: "boutique" }, sceneEvidence: {} }).scene.location, "the restaurant");
  assert.equal(applyFinalScene({ ...before, presence: "apart" }, { userText: "We're in the boutique.", modelScene: { location: "boutique" }, sceneEvidence: {} }).scene.location, before.location);
});

test("boutique arrival and a completed outfit change commit and queue a photo without reveal keywords", () => {
  const text = "They entered the boutique. She emerged from the fitting room in a green skirt and white blouse.";
  const { scene } = applyFinalScene(before, { characterText: text,
    modelScene: { location: "the boutique", outfit: "green skirt and white blouse" },
    sceneEvidence: { location: proof("They entered the boutique", "character", "shared"), outfit: proof("She emerged from the fitting room in a green skirt and white blouse") } });
  assert.equal(scene.location, "the boutique");
  assert.equal(visualEventOpportunity(text, scene, { actor: "character" }), null);
  assert.equal(verifiedOutfitChange(before, scene), true);
  assert.equal(shouldQueueCharacterPhoto({ reply: text, verifiedOutfitChanged: verifiedOutfitChange(before, scene) }), true);
});

test("planned shopping and changing neither move the scene nor trigger an outfit photo", () => {
  const text = "Tomorrow we will visit the boutique. She will change into a green skirt.";
  const { scene } = applyFinalScene(before, { characterText: text,
    modelScene: { location: "boutique", outfit: "green skirt" },
    sceneEvidence: { location: proof("Tomorrow we will visit the boutique"), outfit: proof("She will change into a green skirt") } });
  assert.equal(scene.location, before.location);
  assert.equal(verifiedOutfitChange(before, scene), false);
});

test("unchanged, unverified, or stale outfit evidence does not trigger another photo", () => {
  assert.equal(verifiedOutfitChange(before, before), false);
  assert.equal(verifiedOutfitChange(before, { ...before, outfit: "green skirt" }), false);
  const evidence = { kind: "final_scene", text: "She emerged in a green skirt", source: "character" };
  assert.equal(verifiedOutfitChange({ ...before, outfitEvidence: evidence }, { ...before, outfit: "green skirt", outfitEvidence: evidence }), false);
});

test("pending preparation overrides a purported outfit change and respects a user-supplied image", () => {
  assert.equal(shouldQueueCharacterPhoto({ reply: "Give me a minute to change.", verifiedOutfitChanged: true }), false);
  assert.equal(shouldQueueCharacterPhoto({ reply: "Give me a minute to change." }), false);
  assert.equal(shouldQueueCharacterPhoto({ verifiedOutfitChanged: true, hasUserImage: true }), false);
});

test("describing an ensemble before entering the fitting room is not a completed outfit", () => {
  const text = "She described a green skirt and white blouse. She was practically diving back into the fitting room to prepare her final reveal.";
  const { scene, decisions } = applyFinalScene(before, { characterText: text,
    modelScene: { outfit: "green skirt and white blouse" },
    sceneEvidence: { outfit: proof("She described a green skirt and white blouse") } });
  assert.equal(scene.outfit, before.outfit);
  assert.equal(decisions[0].reason, "outfit_change_still_pending");
  assert.equal(shouldQueueCharacterPhoto({ reply: text, modelRequested: true, verifiedOutfitChanged: true }), false);
});

test("a subsequent completed reveal in the same narrative remains eligible", () => {
  const text = "She heads into the fitting room to change. She returns wearing a green skirt and white blouse.";
  const { scene } = applyFinalScene(before, { characterText: text,
    modelScene: { outfit: "green skirt and white blouse" },
    sceneEvidence: { outfit: proof("She returns wearing a green skirt and white blouse") } });
  assert.equal(verifiedOutfitChange(before, scene), true);
  assert.equal(shouldQueueCharacterPhoto({ reply: text, verifiedOutfitChanged: true }), true);
});
