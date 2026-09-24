import assert from "node:assert/strict";
import test from "node:test";
import { buildImagePrompt, inferOutfitCorrection, inferSceneCue, mergePromptTags, normalizeCharacterPhotoBrief, portraitExpression, portraitWardrobe, reconcileCatalogueHairstyle, reconcileCatalogueWardrobe, splitVisualTags, visualTraitsForFraming } from "../server/identity.mjs";

test("specific catalogue hairstyle corrects twintails wording without changing other visual traits", () => {
  const profile = { visual: { identity: ["long pink hair", "twintails", "green eyes"], signature: ["pink twintails", "hair bow"] } };
  reconcileCatalogueHairstyle(profile, ["long_hair", "pink_hair", "two_side_up"]);
  assert.deepEqual(profile.visual.identity, ["long pink hair", "two side up", "green eyes"]);
  assert.deepEqual(profile.visual.signature, ["pink hair, two side up", "hair bow"]);
  const unsupported = { visual: { identity: ["twintails"] } };
  reconcileCatalogueHairstyle(unsupported, ["long_hair"]);
  assert.deepEqual(unsupported.visual.identity, ["twintails"]);
  const sourceSupported = { visual: { identity: ["twintails"] } };
  reconcileCatalogueHairstyle(sourceSupported, ["two_side_up"], { facts: [
    { category: "appearance", scope: "baseline", quote: "She wears her hair in twintails." },
  ] });
  assert.deepEqual(sourceSupported.visual.identity, ["twintails"]);
});

test("a vague default outfit yields to a named garment supported by catalogue and research", () => {
  const tags = ["chinese clothes", "qipao", "red dress", "china dress"];
  assert.deepEqual(splitVisualTags(tags).wardrobe, tags);
  const profile = { visual: { defaultWardrobe: "A matching blouse and pants.", wardrobePreferences: ["Apron while working"] } };
  const research = { evidence: { passages: [{ provider: "franchise_wiki", text:
    "Shampoo usually wears a matching blouse and pants. For formal occasions, she favors sleeveless cheongsam." }] } };
  reconcileCatalogueWardrobe(profile, tags, research);
  assert.equal(profile.visual.defaultWardrobe, "A sleeveless red Chinese dress (qipao/cheongsam).");
  assert.deepEqual(profile.visual.wardrobePreferences, ["Apron while working", "A matching blouse and pants."]);
  const noSupport = { visual: { defaultWardrobe: "A matching blouse and pants." } };
  reconcileCatalogueWardrobe(noSupport, tags, { evidence: { passages: [{ provider: "franchise_wiki", text: "Only a blouse and pants are described." }] } });
  assert.equal(noSupport.visual.defaultWardrobe, "A matching blouse and pants.");
  const alreadySpecific = { visual: { defaultWardrobe: "A blue embroidered Chinese blouse and black trousers." } };
  reconcileCatalogueWardrobe(alreadySpecific, tags, research);
  assert.equal(alreadySpecific.visual.defaultWardrobe, "A blue embroidered Chinese blouse and black trousers.");
});

test("carried weapons can never become the character's default wardrobe", () => {
  const profile = { visual: {
    defaultWardrobe: "M-23 submachine gun",
    wardrobePreferences: ["professional attire for official Section 9 business", "tactical gear for field operations"],
  } };
  reconcileCatalogueWardrobe(profile, ["fingerless gloves"], null);
  assert.equal(profile.visual.defaultWardrobe, "professional attire");

  const mixed = { visual: {
    defaultWardrobe: "black tactical bodysuit, pistol, fingerless gloves",
    wardrobePreferences: [],
  } };
  reconcileCatalogueWardrobe(mixed, [], null);
  assert.equal(mixed.visual.defaultWardrobe, "black tactical bodysuit, fingerless gloves");
});
import { normalizeWardrobePrompt } from "../server/wardrobe.mjs";

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

test("school conversation cues do not invent a wardrobe change", () => {
  assert.deepEqual(inferSceneCue("Come meet me at school today"), {
    location: "at school",
    activity: "spending time at school",
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
        identity: ["1girl", "green eyes", "white hair", "pointy ears"],
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
  assert.match(prompt, /school (?:shirt|blouse|blazer|cardigan)/);
  assert.match(prompt, /(?:stripe trim|tartan|ribbon tie|necktie)/);
  assert.doesNotMatch(prompt, /white mage robe/);
  assert.match(prompt, /^1girl, adult, frieren, sousou no frieren/);
  assert.doesNotMatch(prompt, /1person|age 18/i);
});

test("ANIMA prompts replace vague photo-brief attire with the established outfit", () => {
  const prompt = buildImagePrompt(
    {
      visual: {
        identity: ["1girl", "red hair", "red eyes"],
        signature: ["chest jewel"],
        defaultWardrobe: "red dress with short shorts, red thighhighs, black fingerless gloves",
      },
    },
    { id: "pyra", name: "Pyra", trigger: "pyra_(xenoblade)" },
    {
      location: "outside Pyra's home",
      environment: "vast cloud sea, rolling green fields, distant craggy mountains, tall grass waving in the wind",
      activity: "starting a walk",
      outfit: "red dress with short shorts, red thighhighs, black fingerless gloves",
    },
    "Pyra clearly visible in frame, wearing standard attire, natural observer viewpoint",
  );
  assert.doesNotMatch(prompt, /standard attire/i);
  assert.match(prompt, /red dress with short shorts/);
  assert.match(prompt, /vast cloud sea, rolling green fields, distant craggy mountains/i);
  assert.equal((prompt.match(/red dress with short shorts/gi) || []).length, 1);
  assert.doesNotMatch(prompt, /natural observer viewpoint|clearly visible in frame/i);
});

test("ANIMA prompts use character tags plus one clean natural-language scene", () => {
  const environment = "A comfortable living room with a sofa, low table, curtained windows, warm lamplight, and clearly visible interior walls and flooring.";
  const prompt = buildImagePrompt(
    {
      socialIdentity: { gender: "woman", pronouns: "she/her" },
      visual: {
        identity: ["1girl", "red hair", "red eyes", "short hair", "bob cut", "large breasts"],
        signature: ["chest jewel"],
        defaultWardrobe: "red dress",
      },
    },
    { name: "Pyra", trigger: "pyra_(xenoblade), xenoblade" },
    {
      outfit: "completely nude",
      location: "living room",
      environment,
      activity: "passionate embracing and kissing",
      expression: "deeply affectionate and longing",
      lighting: "warm indoor light",
    },
    "A candid third-person image of Pyra clearly visible in frame.",
  );
  const sections = prompt.split(/\n\s*\n/);
  assert.equal(sections.length, 3);
  assert.match(sections[0], /^1girl, adult, pyra_\(xenoblade\), xenoblade/);
  assert.match(sections[0], /completely nude/);
  assert.doesNotMatch(sections[0], /living room|embracing|warm indoor light/);
  assert.match(sections[1], /The scene takes place in the living room\./);
  assert.match(sections[1], /Pyra is leaning forward into a passionate embrace and kiss toward the viewer\./);
  assert.match(sections[1], /Pyra's expression is deeply affectionate and longing\./);
  assert.equal((prompt.match(/A comfortable living room/gi) || []).length, 1);
  assert.doesNotMatch(prompt, /wearing completely nude|current-moment candid scene|natural observer viewpoint|clearly visible in frame|\.\s*,/i);
  assert.ok(sections.every((section) => !/[^\r\n]\s{2,}[^\r\n]/.test(section)));
});

test("natural scene prompts remove dialogue, duplicated activity, and internal continuity scaffolding", () => {
  const profile = {
    socialIdentity: { gender: "woman", pronouns: "she/her" },
    visual: { identity: ["1girl", "auburn hair", "brown eyes"], signature: [], defaultWardrobe: "blue shinobi outfit" },
  };
  const kasumi = buildImagePrompt(
    profile,
    { name: "Kasumi (Doa)", trigger: "kasumi_(doa), dead or alive" },
    {
      location: "mountainous forest",
      environment: "Kasumi finally moves on from the training hall and starts her trek to Kyoto through the mountainous forest The air is much crisper here than in the hall, I must keep a steady pace if I am to arrive by next week, but I will be careful to remain hidden among the trees.",
      activity: "trekking",
      expression: "determined",
      lighting: "soft morning light filtering through the canopy",
      outfit: "blue shinobi outfit",
    },
    "A candid third-person image.",
  );
  assert.match(kasumi, /A candid third-person image of Kasumi \(Doa\)\./i);
  assert.doesNotMatch(kasumi, /clearly visible in frame/i);
  assert.equal((kasumi.match(/\btrekking\b/gi) || []).length, 1);
  assert.match(kasumi, /A mountain forest with steep wooded terrain, dense trees, a narrow path, and crisp open air\./i);
  assert.doesNotMatch(kasumi, /I must|next week|training hall/);

  const marie = buildImagePrompt(
    profile,
    { name: "Marie Rose", trigger: "marie_rose, dead or alive" },
    {
      location: "Kitchen",
      environment: "The visible surroundings of Kitchen, with setting-appropriate architecture, terrain, objects, and lighting; no remnants of the previous location.",
      activity: "Preparing dinner",
      expression: "Flustered but happy",
      lighting: "Warm kitchen lighting",
      outfit: "casual dress",
    },
    "A candid third-person image.",
  );
  assert.match(marie, /warm, functional kitchen with counters, cabinets, cookware/i);
  assert.doesNotMatch(marie, /setting-appropriate|terrain|remnants|previous location/i);
  assert.match(marie, /Marie Rose is preparing dinner\./);
  assert.match(marie, /Marie Rose's expression is flustered but happy\./);
});

test("natural scene prompts render descriptive cave locations without echoing them", () => {
  const prompt = buildImagePrompt(
    {
      socialIdentity: { gender: "woman", pronouns: "she/her" },
      visual: { identity: ["1girl", "purple hair", "red eyes"], signature: [], defaultWardrobe: "red and black outfit" },
    },
    { name: "Lilith Aensland", trigger: "lilith_aensland, darkstalkers" },
    {
      location: "Hidden cave behind Lucifer Falls",
      environment: "The setting is Hidden cave behind Lucifer Falls.",
      activity: "exploring the crystal chamber",
      expression: "awe-struck and amazed",
      lighting: "flashlight beam reflecting off thousands of purple crystal facets",
      outfit: "red and black outfit",
    },
    "A candid third-person image.",
  );
  assert.match(prompt, /The scene takes place in a hidden cave behind Lucifer Falls\./);
  assert.match(prompt, /A rocky cave chamber with irregular stone walls/i);
  assert.equal((prompt.match(/Hidden cave behind Lucifer Falls/gi) || []).length, 1);
  assert.doesNotMatch(prompt, /The setting is/i);
});

test("legacy beach scene contamination produces a single visible setting without story chatter", () => {
  const prompt = buildImagePrompt(
    { visual: { identity: ["orange hair"], signature: [], defaultWardrobe: "black athletic bikini" } },
    { name: "Neru", trigger: "neru" },
    {
      location: "the beach and she was right",
      environment: "The setting is the beach and she was right.",
      activity: "... it's completely private. No one is around",
      expression: "competitive and fired up",
      lighting: "bright daylight",
    },
    "A candid third-person image.",
  );
  assert.equal((prompt.match(/the beach/gi) || []).length, 1);
  assert.match(prompt, /on the beach\./i);
  assert.match(prompt, /shoreline.*sand.*horizon/i);
  assert.doesNotMatch(prompt, /she was right|Neru is|The setting is|door|frame/i);
});

test("an unknown setting fallback is not repeated after the location sentence", () => {
  const prompt = buildImagePrompt({}, { name: "Traveler" }, {
    location: "the crystal observatory",
    environment: "The setting is the crystal observatory.",
    activity: "studying the stars",
  });
  assert.equal((prompt.match(/crystal observatory/gi) || []).length, 1);
  assert.match(prompt, /studying the stars/i);
});

test("a settled restaurant patio prompt leads with staging and excludes arrival prose", () => {
  const prompt = buildImagePrompt(
    { visual: { identity: ["red hair", "grey eyes"], signature: [], defaultWardrobe: "cream sweater and charcoal leggings" } },
    { name: "Erica Anderson", trigger: "erica_anderson" },
    {
      location: "Big Benedict's patio",
      environment: "A sunny outdoor restaurant patio with cafe tables, chairs, shade umbrellas, planters, and open morning air.",
      activity: "sitting at a patio table and having brunch",
      expression: "warm and playful",
      lighting: "morning sunlight",
      outfit: "cream sweater and charcoal leggings",
    },
    "A candid third-person image.",
  );
  const activityIndex = prompt.indexOf("Erica Anderson is sitting at a patio table and having brunch.");
  const locationIndex = prompt.indexOf("Big Benedict's patio");
  assert.ok(activityIndex > -1 && activityIndex < locationIndex);
  assert.match(prompt, /restaurant patio.*cafe tables.*umbrellas/i);
  assert.doesNotMatch(prompt, /stepped into|scanned for a spot|settling into|doorway|door frame|threshold|KEY VISUAL|LATEST VISUAL/i);
});

test("current social identity chooses one booru subject tag without weakening the adult rule", () => {
  const prompt = buildImagePrompt(
    {
      age: 18,
      socialIdentity: { gender: "woman", pronouns: "she/her", selfReference: "woman" },
      visual: {
        identity: ["1boy", "blonde hair", "blue eyes"],
        signature: [],
        defaultWardrobe: "long white shirt",
      },
    },
    { name: "Bridget", trigger: "bridget (guilty gear), guilty gear" },
    { location: "town street" },
  );
  assert.match(prompt, /^1girl, adult, bridget \(guilty gear\), guilty gear/);
  assert.equal((prompt.match(/\b1girl\b/g) || []).length, 1);
  assert.doesNotMatch(prompt, /\b1boy\b|1person|age 18/i);
});

test("plain-language empty clothing values become an explicit ANIMA wardrobe prompt", () => {
  for (const value of ["none", "nothing", "no clothes", "no clothing", "nude", "naked"]) {
    assert.equal(normalizeWardrobePrompt(value), "completely nude");
  }
  const prompt = buildImagePrompt(
    { visual: { identity: ["blonde hair"], signature: [], defaultWardrobe: "blue dress" } },
    { name: "Marie" },
    { outfit: "none", location: "bedroom" },
  );
  assert.match(prompt, /completely nude/);
  assert.doesNotMatch(prompt, /blue dress/);
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

test("character photo prompts replace the character's own POV with a named third-person composition", () => {
  const brief = normalizeCharacterPhotoBrief(
    "A close-up shot from Faye's perspective looking down at her plate.",
    { name: "Faye Valentine" },
  );
  assert.doesNotMatch(brief, /Faye's perspective|first-person|pov/i);
  assert.match(brief, /close-up shot of Faye Valentine looking down at her plate/i);
  assert.doesNotMatch(brief, /clearly visible in frame/i);

  const prompt = buildImagePrompt(
    { visual: { identity: ["short purple hair", "green eyes"], signature: [], defaultWardrobe: "yellow top" } },
    { name: "Faye Valentine", trigger: "faye valentine" },
    { location: "outdoor dining table", activity: "eating dinner", expression: "satisfied", lighting: "sunset" },
    "A close-up shot from Faye's perspective looking down at her plate.",
  );
  assert.doesNotMatch(prompt, /external[- ]camera/i);
  assert.match(prompt, /close-up shot of Faye Valentine looking down at her plate/i);
  assert.doesNotMatch(prompt, /clearly visible in frame/i);
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

test("ANIMA prompt sections strip legacy camera and literal framing guards", () => {
  const prompt = buildImagePrompt(
    { visual: { identity: ["orange hair", "green eyes"], signature: [], defaultWardrobe: "athletic wear" } },
    { name: "Misty (Pokemon)", trigger: "misty (pokemon)" },
    { location: "at a gym", activity: "relaxing in pool", expression: "impressed", lighting: "bright indoor lighting" },
    "external camera view, Misty (Pokemon) clearly visible in frame; external camera view, looking toward Alex",
    { userName: "Alex" },
  );
  assert.equal(prompt.split(/\n\s*\n/).length, 3);
  assert.doesNotMatch(prompt, /clearly visible in frame|external[- ]camera|Alex/i);
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

test("generated image prompts include only wardrobe details visible in the requested framing", () => {
  const profile = {
    visual: {
      identity: ["auburn hair", "green eyes"],
      signature: ["yellow hair ribbon"],
      defaultWardrobe: "white cropped tank top, green and black tartan-patterned pleated skirt, black loafers",
    },
  };
  const close = buildImagePrompt(profile, { name: "Kasumi" }, {}, "close-up portrait, shoulders and upper chest");
  assert.match(close, /white cropped tank top/);
  assert.doesNotMatch(close, /tartan-patterned pleated skirt|loafers/);
  const full = buildImagePrompt(profile, { name: "Kasumi" }, {}, "full-body portrait, feet visible");
  assert.match(full, /tartan-patterned pleated skirt/);
  assert.match(full, /black loafers/);
});

test("close portraits preserve a short cape while omitting necessarily off-frame anatomy", () => {
  const profile = {
    visual: {
      identity: ["pink hair", "purple eyes", "slender build", "long legs", "navel"],
      signature: ["black hair bow"],
      defaultWardrobe: "white and black outfit with a short cape, black bows, and stockings",
    },
  };
  const prompt = buildImagePrompt(profile, { name: "Portrait Test" }, {}, "close-up character portrait, head and shoulders portrait");
  assert.match(prompt, /white and black outfit with a short cape/);
  assert.doesNotMatch(prompt, /long legs|navel|stockings/);
  assert.deepEqual(visualTraitsForFraming(["green eyes", "mechanical hands", "long legs"], "full-body portrait"), ["green eyes", "mechanical hands", "long legs"]);
});

test("profile portraits derive a restrained expression from the character persona", () => {
  assert.match(portraitExpression({ traits: ["determined", "compassionate", "stoic"] }), /composed expression|calm eyes/);
  assert.match(portraitExpression({ traits: ["socially anxious", "loyal"] }), /reserved expression|hesitant eyes/);
  assert.match(portraitExpression({ traits: ["playful", "mischievous"] }), /playful expression|knowing smile/);
});
