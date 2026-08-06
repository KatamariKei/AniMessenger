import assert from "node:assert/strict";
import test from "node:test";
import { buildImagePrompt, inferOutfitCorrection, inferSceneCue, mergePromptTags, normalizeCharacterPhotoBrief, portraitExpression, portraitWardrobe, splitVisualTags } from "../server/identity.mjs";

test("prompt tags are merged without repeating overlapping safeguards", () => {
  assert.equal(
    mergePromptTags("worst quality, first-person POV", "character unseen, first-person POV", "CHARACTER UNSEEN, blurry"),
    "worst quality, first-person POV, character unseen, blurry",
  );
});

test("separates permanent identity from wardrobe tags", () => {
  const split = splitVisualTags([
    "green eyes",
    "white hair",
    "long hair",
    "pointy ears",
    "earrings",
    "white shirt",
    "school uniform",
  ]);
  assert.deepEqual(split.identity, ["green eyes", "white hair", "long hair", "pointy ears"]);
  assert.deepEqual(split.wardrobe, ["white shirt", "school uniform"]);
  assert.deepEqual(split.signature, ["earrings"]);
});

test("school conversation cues replace the current wardrobe layer", () => {
  assert.deepEqual(inferSceneCue("Come meet me at school today"), {
    location: "at school",
    activity: "spending time at school",
    outfit: "character-appropriate school uniform",
  });
});

test("discussing work or training does not teleport an in-person scene", () => {
  assert.deepEqual(inferSceneCue("School has been exhausting lately, but I feel better talking about it here."), {});
  assert.deepEqual(inferSceneCue("Tell me about your classes and the students you teach."), {});
  assert.deepEqual(inferSceneCue("Your tactical training must have been intense."), {});
  assert.deepEqual(inferSceneCue("It might rain tomorrow."), {});
});

test("ANIMA prompt uses scene clothing without reintroducing the default costume", () => {
  const prompt = buildImagePrompt(
    {
      visual: {
        identity: ["green eyes", "white hair", "pointy ears"],
        signature: ["earrings"],
        defaultWardrobe: "white mage robe",
      },
    },
    { name: "Frieren", trigger: "frieren, sousou no frieren" },
    {
      outfit: "character-appropriate school uniform",
      location: "school library",
      activity: "reading",
      expression: "small smile",
      lighting: "afternoon window light",
    },
    "candid phone photo",
  );
  assert.match(prompt, /green eyes, white hair, pointy ears/);
  assert.match(prompt, /character-appropriate school uniform/);
  assert.doesNotMatch(prompt, /white mage robe/);
  assert.match(prompt, /adult, age 18 or older/);
});

test("ANIMA prompt uses a user-corrected default outfit", () => {
  const prompt = buildImagePrompt(
    {
      visual: {
        identity: ["blonde hair", "aqua eyes"],
        signature: ["yo-yo"],
        defaultWardrobe: "hooded jacket and bike shorts",
        userOverrides: {
          identity: ["blonde hair", "aqua eyes"],
          signature: ["yo-yo"],
          exceptions: [],
          defaultWardrobe: "long white shirt, short pleated skirt",
        },
      },
    },
    { name: "Bridget", trigger: "bridget (guilty gear)" },
    { outfit: "default outfit", location: "park", activity: "walking" },
  );
  assert.match(prompt, /long white shirt, short pleated skirt/);
  assert.doesNotMatch(prompt, /hooded jacket|bike shorts/);
});

test("character photo prompts replace the character's own POV with a visible third-person composition", () => {
  const brief = normalizeCharacterPhotoBrief(
    "A close-up shot from Faye's perspective looking down at her plate.",
    { name: "Faye Valentine" },
  );
  assert.doesNotMatch(brief, /Faye's perspective|first-person|pov/i);
  assert.match(brief, /close-up shot of the character looking down at her plate/i);
  assert.match(brief, /Faye Valentine clearly visible in frame/i);

  const prompt = buildImagePrompt(
    { visual: { identity: ["short purple hair", "green eyes"], signature: [], defaultWardrobe: "yellow top" } },
    { name: "Faye Valentine", trigger: "faye valentine" },
    { location: "outdoor dining table", activity: "eating dinner", expression: "satisfied", lighting: "sunset" },
    "A close-up shot from Faye's perspective looking down at her plate.",
  );
  assert.doesNotMatch(prompt, /external[- ]camera/i);
  assert.match(prompt, /Faye Valentine clearly visible in frame/i);
  assert.doesNotMatch(prompt, /Faye's perspective/i);
  assert.equal(prompt.split(/\n\s*\n/).length, 3);
});

test("the configured user name is replaced with viewer language in image prompts", () => {
  const brief = normalizeCharacterPhotoBrief(
    "A close-up shot from Alex's perspective with Faye looking toward the camera.",
    { name: "Faye Valentine" },
    { userName: "Alex" },
  );
  assert.doesNotMatch(brief, /Alex|camera/i);
  assert.match(brief, /viewer/i);
});

test("ANIMA prompt sections avoid duplicate camera and visibility guards", () => {
  const prompt = buildImagePrompt(
    { visual: { identity: ["orange hair", "green eyes"], signature: [], defaultWardrobe: "athletic wear" } },
    { name: "Misty (Pokemon)", trigger: "misty (pokemon)" },
    { location: "at a gym", activity: "relaxing in pool", expression: "impressed", lighting: "bright indoor lighting" },
    "external camera view, Misty (Pokemon) clearly visible in frame; external camera view, looking toward Alex",
    { userName: "Alex" },
  );
  assert.equal(prompt.split(/\n\s*\n/).length, 3);
  assert.equal((prompt.match(/clearly visible in frame/gi) || []).length, 1);
  assert.doesNotMatch(prompt, /external[- ]camera|Alex/i);
  assert.match(prompt, /looking toward the viewer/i);
});

test("just the robe removes an accidental underlayer while preserving robe details", () => {
  assert.deepEqual(
    inferOutfitCorrection("Okay, retake it. Just the robe. 😉", "oversized white robe over a thin tank top"),
    {
      outfit: "oversized white robe",
      excluded: ["thin tank top"],
      exclusive: true,
    },
  );
});

test("without removes a named layer from the saved outfit", () => {
  assert.deepEqual(
    inferOutfitCorrection("Let's try it without the jacket", "green jacket with dark shirt and shorts"),
    {
      outfit: "dark shirt and shorts",
      excluded: ["green jacket"],
      exclusive: false,
    },
  );
});

test("ordinary clothing discussion does not force an outfit correction", () => {
  assert.equal(inferOutfitCorrection("That robe looks comfortable", "oversized white robe over a thin tank top"), null);
});

test("profile portraits omit lower-body wardrobe cues that pull framing wide", () => {
  const wardrobe = portraitWardrobe("A blue and white sleeveless shinobi shozoku with a high slit, featuring a pelvic curtain-style fabric arrangement and white thigh-high stockings.");
  assert.equal(wardrobe, "A blue and white sleeveless shinobi shozoku");
  assert.doesNotMatch(wardrobe, /pelvic curtain|thigh-high|high slit/i);
});

test("profile portraits derive a restrained expression from the character persona", () => {
  assert.match(portraitExpression({ traits: ["determined", "compassionate", "stoic"] }), /composed expression|calm eyes/);
  assert.match(portraitExpression({ traits: ["socially anxious", "loyal"] }), /reserved expression|hesitant eyes/);
  assert.match(portraitExpression({ traits: ["playful", "mischievous"] }), /playful expression|knowing smile/);
});
