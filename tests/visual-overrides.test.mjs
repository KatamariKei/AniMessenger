import assert from "node:assert/strict";
import test from "node:test";
import { applyVisualOverrides, effectiveVisual, preserveVisualOverrides } from "../server/visual-overrides.mjs";

const profile = {
  id: "misty",
  persona: { speechStyle: "bright and direct", traits: ["confident"] },
  canon: { overview: "Cerulean Gym Leader" },
  visual: { identity: ["orange hair"], signature: ["side ponytail"], defaultWardrobe: "yellow top" },
};

test("visual edits do not rewrite personality or canon", () => {
  const next = applyVisualOverrides(profile, { identity: ["auburn hair"], signature: ["yellow ribbon", "swim goggles"], hiddenSignature: ["swim goggles"], exceptions: ["brown hair"], defaultWardrobe: "blue swimsuit" });
  assert.deepEqual(next.persona, profile.persona);
  assert.deepEqual(next.canon, profile.canon);
  assert.deepEqual(effectiveVisual(next), { identity: ["auburn hair"], signature: ["yellow ribbon"], exceptions: ["brown hair"], defaultWardrobe: "blue swimsuit" });
  assert.deepEqual(next.visual.userOverrides.hiddenSignature, ["swim goggles"]);
  assert.deepEqual(effectiveVisual(applyVisualOverrides(next, null)), { identity: ["orange hair"], signature: ["side ponytail"], exceptions: [], defaultWardrobe: "yellow top" });
});

test("hidden signature details stay saved but are omitted from image prompts", () => {
  const next = applyVisualOverrides(profile, {
    identity: ["orange hair"],
    signature: ["side ponytail", "swim goggles"],
    hiddenSignature: ["SWIM GOGGLES", "not a saved feature"],
    exceptions: [],
  });
  assert.deepEqual(next.visual.userOverrides.signature, ["side ponytail", "swim goggles"]);
  assert.deepEqual(next.visual.userOverrides.hiddenSignature, ["SWIM GOGGLES"]);
  assert.deepEqual(effectiveVisual(next).signature, ["side ponytail"]);
});

test("profile rebuilds preserve user visual corrections", () => {
  const existing = applyVisualOverrides(profile, { identity: ["auburn hair"], signature: [], exceptions: [], defaultWardrobe: "blue swimsuit" });
  const rebuilt = { ...profile, summary: "rebuilt", visual: { ...profile.visual, identity: ["brown hair"] } };
  assert.equal(effectiveVisual(preserveVisualOverrides(rebuilt, existing)).identity[0], "auburn hair");
  assert.equal(effectiveVisual(preserveVisualOverrides(rebuilt, existing)).defaultWardrobe, "blue swimsuit");
});

test("profile rebuilds preserve a verified current identity", () => {
  const rebuilt = {
    ...profile,
    socialIdentity: { gender: "incorrect", pronouns: "incorrect", selfReference: "incorrect" },
  };
  const existing = {
    ...profile,
    socialIdentity: {
      gender: "woman",
      pronouns: "she/her",
      selfReference: "woman/female",
      locked: true,
      updatedAt: "2026-07-24T00:00:00.000Z",
    },
  };

  assert.deepEqual(preserveVisualOverrides(rebuilt, existing).socialIdentity, existing.socialIdentity);
});
