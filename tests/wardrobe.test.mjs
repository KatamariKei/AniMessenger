import test from "node:test";
import assert from "node:assert/strict";
import { imageFraming, inferWardrobeDescription, inferWardrobeEvent, isWardrobePlaceholder, normalizeWardrobePrompt, photoOutfitUpdate, removeWardrobeItems, replaceWardrobePlaceholders, stabilizeWardrobePrompt, wardrobeChangeIsEstablished, wardrobeDescriptionRequested, wardrobeForFraming } from "../server/wardrobe.mjs";

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

test("vague model wardrobe placeholders fall back to the exact canonical outfit", () => {
  assert.equal(stabilizeWardrobePrompt("standard attire", visual, "pyra"), visual.defaultWardrobe);
  assert.equal(stabilizeWardrobePrompt("her usual outfit", visual, "pyra"), visual.defaultWardrobe);
  assert.equal(isWardrobePlaceholder("normal clothes"), true);
  assert.equal(
    replaceWardrobePlaceholders("Pyra outside, wearing standard attire, morning light", visual.defaultWardrobe),
    "Pyra outside, wearing yellow sleeveless top, red shorts, chunky boots, morning light",
  );
});

test("ordinary scene movement does not establish an outfit change", () => {
  assert.equal(wardrobeChangeIsEstablished("Let's step outside and take a walk."), false);
  assert.equal(wardrobeChangeIsEstablished("She catches me when I stumble."), false);
  assert.equal(wardrobeChangeIsEstablished("I'll change into my red travel coat before we go."), false);
  assert.equal(wardrobeChangeIsEstablished("She puts on a swimsuit."), true);
  assert.equal(wardrobeChangeIsEstablished("She's wearing a fitted blue travel dress."), true);
});

test("direct requests to describe current clothing refine wardrobe state", () => {
  assert.equal(wardrobeDescriptionRequested("Can you describe your outfit in detail for me?"), true);
  assert.equal(wardrobeDescriptionRequested("Describe you outfit in detail for me. I like it"), true);
  assert.equal(wardrobeDescriptionRequested("What are you wearing right now?"), true);
  assert.equal(wardrobeDescriptionRequested("Describe your athletic gear, Marie! You look great!"), true);
  assert.equal(wardrobeDescriptionRequested("Describe the dress you're wearing, Asty!"), true);
  assert.equal(wardrobeDescriptionRequested("That outfit looks comfortable."), false);
  assert.equal(wardrobeDescriptionRequested("What should we pack for camping?"), false);
  assert.equal(wardrobeChangeIsEstablished("Go get a jumpsuit on or something."), false);
  assert.equal(wardrobeChangeIsEstablished("She returns in her athletic gear."), true);
});

test("narrative wardrobe completion and current-state descriptions are recognized", () => {
  assert.equal(
    inferWardrobeEvent("Now completely naked and glowing with anticipation, he stands on the bed.", "character")?.outfit,
    "completely nude",
  );
  assert.equal(
    inferWardrobeEvent("Once he's finally settled into the dress, he spins around on the mattress.", "character")?.outfit,
    "dress",
  );
  assert.equal(
    inferWardrobeDescription("It's this super short, fluffy white dress made of a soft, airy material that feels like a cloud!", "character")?.outfit,
    "super short, fluffy white dress made of a soft, airy material that feels like a cloud",
  );
});

test("extracts completed towel and T-shirt wardrobe changes from actions", () => {
  assert.equal(
    inferWardrobeEvent("[action: steps out of the shower and quickly grabs a towel, wrapping it around herself with a huff]", "character")?.outfit,
    "bath towel wrapped around her body",
  );
  assert.equal(
    inferWardrobeEvent("[action: she walks out wearing my black oversized T-shirt. She looks too cute.]", "user")?.outfit,
    "black oversized T-shirt",
  );
});

test("user-applied robes and named action corrections are authoritative", () => {
  const wrapped = inferWardrobeEvent("[action: we exit the shower, I dry her off and wrap her in a big fluffy white robe]", "user");
  assert.equal(wrapped?.outfit, "big fluffy white robe");
  assert.equal(wrapped?.source, "user");

  const corrected = inferWardrobeEvent("[action: naru is wearing a big fluffy white robe]", "user");
  assert.equal(corrected?.outfit, "big fluffy white robe");
  assert.equal(corrected?.source, "user");
});

test("extracts a completed narrative outfit assembled through styling language", () => {
  const narration = "Once in the bedroom, Nagatoro began rummaging through her clothes. She bypassed her casual wear and opted for a playful, feminine look: a white, off-the-shoulder ribbed knit top, paired with a high-waisted, pale blue pleated tennis skirt. She finished the outfit with a thin black choker around her neck, adding a touch of edge.";
  const event = inferWardrobeEvent(narration, "character");
  assert.equal(event?.source, "character");
  assert.match(event?.outfit || "", /white, off-the-shoulder ribbed knit top/i);
  assert.match(event?.outfit || "", /pale blue pleated tennis skirt/i);
  assert.match(event?.outfit || "", /thin black choker/i);
  assert.doesNotMatch(event?.outfit || "", /playful, feminine look:/i);
});

test("extracts a coordinated ensemble described as sliding into and pairing garments", () => {
  const narration = "Once back in the bedroom, Erica bypassed her usual oversized sweaters. She slid into a pair of high-waisted, charcoal grey leggings that hugged her curves and paired them with a soft, cream-colored off-the-shoulder knit sweater. She turned toward Alex with a smile.";
  const event = inferWardrobeEvent(narration, "character");
  assert.equal(event?.source, "character");
  assert.equal(
    event?.outfit,
    "high-waisted, charcoal grey leggings, soft, cream-colored off-the-shoulder knit sweater",
  );
  assert.doesNotMatch(event?.outfit || "", /hugged her curves|usual oversized/i);
});

test("a planned ensemble is not committed before the character changes", () => {
  assert.equal(
    inferWardrobeEvent("She might slide into black leggings and pair them with a red sweater later."),
    null,
  );
});

test("planned clothing does not become the current outfit before it is worn", () => {
  assert.equal(inferWardrobeEvent("I'll change into my red travel coat before we go."), null);
  assert.equal(inferWardrobeEvent("You can grab one of my oversized T-shirts if you want."), null);
});

test("explicit garment removal subtracts only known layers from the current outfit", () => {
  const current = "white graphic T-shirt, short light blue skirt, black pantyhose, walnut brown boots";
  const event = inferWardrobeEvent("Hana takes off her T-shirt and boots, leaving them beside the couch.", "character");
  assert.equal(event?.phase, "removed");
  assert.deepEqual(event?.removedGarments.map((item) => item.toLowerCase()), ["t-shirt", "boots"]);
  assert.equal(removeWardrobeItems(current, event?.removedGarments), "short light blue skirt, black pantyhose");
  assert.equal(removeWardrobeItems("black dress", ["dress"]), "completely nude");
  assert.equal(removeWardrobeItems(current, ["jacket"]), current);
});

test("planned or merely opened clothing is not treated as removed", () => {
  assert.equal(inferWardrobeEvent("She might take off her jacket later."), null);
  assert.equal(inferWardrobeEvent("She unbuttons her jacket but keeps it on."), null);
  assert.equal(normalizeWardrobePrompt("completely naked"), "completely nude");
});

test("a generated photo's explicit wardrobe becomes scene continuity only with a visual brief", () => {
  const swimsuit = "sleek minimalist black one-piece swimsuit with a deep V-neck and open back";
  assert.equal(photoOutfitUpdate("Motoko reveals her new swimsuit.", swimsuit), swimsuit);
  assert.equal(photoOutfitUpdate("", swimsuit), "");
  assert.equal(photoOutfitUpdate("Motoko considers changing later.", null), "");
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
