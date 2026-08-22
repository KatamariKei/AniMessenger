import test from "node:test";
import assert from "node:assert/strict";
import { imageFraming, normalizeWardrobePrompt, stabilizeWardrobePrompt, wardrobeForFraming } from "../server/wardrobe.mjs";

const visual = {
  defaultWardrobe: "yellow sleeveless top, red shorts, chunky boots",
  wardrobePreferences: ["comfortable athletic wear", "bright colors"],
};

test("generic swimwear becomes a stable character-derived outfit", () => {
  const outfit = stabilizeWardrobePrompt("bikini", visual, "misty");
  assert.match(outfit, /yellow/);
  assert.match(outfit, /bikini/);
  assert.match(outfit, /(?:ruffled|halter|straps|piping|panels|trim|textured|cutout)/);
});

test("generic athletic and casual labels become concrete garments", () => {
  const athletic = stabilizeWardrobePrompt("character-appropriate athletic wear", visual, "misty");
  const casual = stabilizeWardrobePrompt("casual clothes", visual, "misty");
  assert.match(athletic, /(?:racerback|performance|mesh-paneled|training top|athletic tank)/);
  assert.match(athletic, /(?:stripe|piping|panels)/);
  assert.match(casual, /(?:ribbed|ringer|draped|graphic|contrast stitching)/);
  assert.match(casual, /(?:jacket|accessory|jewelry|belt|shoes)/);
});

test("character style influences the design beyond its palette", () => {
  const elegant = { ...visual, wardrobePreferences: ["elegant, sophisticated, glamorous clothing"] };
  assert.match(stabilizeWardrobePrompt("formalwear", elegant, "faye"), /sequin cocktail dress with a thigh slit/);
  const playful = { ...visual, wardrobePreferences: ["cute playful clothes and bright patterns"] };
  assert.match(stabilizeWardrobePrompt("school uniform", playful, "misty"), /tartan-patterned pleated skirt/);
  const masculine = { ...visual, socialIdentity: { gender: "male", pronouns: "he/him", selfReference: "man" } };
  assert.match(stabilizeWardrobePrompt("formalwear", masculine, "spike"), /tailored evening suit/);
});

test("specific outfits, explicit nudity, and already stabilized outfits remain unchanged", () => {
  assert.equal(stabilizeWardrobePrompt("white cropped tank top and denim shorts", visual, "misty"), "white cropped tank top and denim shorts");
  assert.equal(stabilizeWardrobePrompt("none", visual, "misty"), "completely nude");
  const first = stabilizeWardrobePrompt("pajamas", visual, "misty");
  assert.equal(stabilizeWardrobePrompt(first, visual, "misty"), first);
  assert.equal(normalizeWardrobePrompt("none"), "completely nude");
});

test("image framing keeps the complete outfit in scene data but trims invisible garments from prompts", () => {
  const outfit = "white cropped tank top, green and black tartan-patterned pleated skirt, yellow ribbon, polished black loafers";
  assert.equal(
    wardrobeForFraming(outfit, "close-up face focus, shoulders and upper chest"),
    "white cropped tank top, yellow ribbon",
  );
  assert.equal(
    wardrobeForFraming(outfit, "medium shot, waist-up"),
    "white cropped tank top, green and black tartan-patterned pleated skirt, yellow ribbon",
  );
  assert.equal(wardrobeForFraming(outfit, "full-body portrait, feet visible"), outfit);
});

test("unspecified framing omits footwear without discarding distinctive outfit design", () => {
  assert.equal(
    wardrobeForFraming("low-cut black sequin cocktail dress with a thigh slit, silver jewelry, elegant heels", "candid party photograph"),
    "low-cut black sequin cocktail dress with a thigh slit, silver jewelry",
  );
  assert.equal(imageFraming("three-quarter view from the knees up"), "three-quarter");
});
