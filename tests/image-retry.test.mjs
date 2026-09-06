import test from "node:test";
import assert from "node:assert/strict";
import { findRetryableImageMessage, replaceRetriedImage, retryPromptOverrides } from "../server/image-retry.mjs";

const original = {
  id: "faye",
  relationship: 42,
  messages: [{
    id: "photo-1",
    from: "character",
    text: "Try not to stare.",
    time: "2026-07-17T12:00:00.000Z",
    image: "/old.png",
    generated: true,
    reaction: "heart",
    generation: { positive: "original prompt", negative: "bad anatomy", seed: 10 },
  }],
};

test("a retried image replaces its file and generation data without changing the message", () => {
  const generation = { positive: "original prompt", negative: "bad anatomy", seed: 99 };
  const replaced = replaceRetriedImage(original, "photo-1", "/new.png", generation);
  assert.deepEqual(replaced.messages[0], {
    ...original.messages[0],
    image: "/new.png",
    generation,
  });
  assert.equal(replaced.messages.length, 1);
  assert.equal(original.messages[0].image, "/old.png");
});

test("only generated character images can be retried", () => {
  assert.throws(() => findRetryableImageMessage({ messages: [{ id: "upload", from: "user", image: "/upload.png" }] }, "upload"), /available to retry/);
});

test("retrying an old character image preserves its scene while removing literal framing language", () => {
  const message = {
    generation: {
      positive: "masterpiece, 1person, faye valentine, red bikini, A close-up shot from Faye's perspective looking down at her plate.",
      negative: "low quality, blurry",
    },
  };
  const overrides = retryPromptOverrides(message, { name: "Faye Valentine" });
  assert.match(overrides.positivePrompt, /red bikini/);
  assert.match(overrides.positivePrompt, /^adult,/);
  assert.doesNotMatch(overrides.positivePrompt, /1person|age 18/i);
  assert.match(overrides.positivePrompt, /shot of Faye Valentine looking down at her plate/i);
  assert.doesNotMatch(overrides.positivePrompt, /external[- ]camera/i);
  assert.doesNotMatch(overrides.positivePrompt, /clearly visible in frame/i);
  assert.doesNotMatch(overrides.positivePrompt, /Faye's perspective/i);
  assert.match(overrides.negativePrompt, /low quality/);
  assert.match(overrides.negativePrompt, /first-person POV/);
  assert.match(overrides.negativePrompt, /food-only image/);
});

test("a legacy retry can recover the established environment missing from its old prompt", () => {
  const message = {
    generation: {
      positive: "quality, 1girl, pyra, outside, red dress",
      negative: "low quality",
      scenePrompt: "1girl, adult, pyra, outside, red dress",
    },
  };
  const profile = { visual: { identity: ["red hair"], signature: [], defaultWardrobe: "red dress" } };
  const overrides = retryPromptOverrides(
    message,
    { name: "Pyra" },
    {},
    profile,
    "red dress",
    "vast cloud sea, rolling green fields, distant craggy mountains",
  );
  assert.match(overrides.positivePrompt, /ENVIRONMENT CONTINUITY: vast cloud sea, rolling green fields, distant craggy mountains/i);
});

test("a retry cannot resurrect a pose accidentally stored as the environment", () => {
  const direction = "looks toward the window with a soft, distant expression Like this";
  const message = {
    generation: {
      positive: `quality, 1girl, pyra, living room, ${direction}, embracing`,
      negative: "low quality",
      sceneEnvironment: direction,
    },
  };
  const profile = { visual: { identity: ["red hair"], signature: [], defaultWardrobe: "red dress" } };
  const overrides = retryPromptOverrides(
    message,
    { name: "Pyra" },
    {},
    profile,
    "red dress",
    "A comfortable living room with a sofa, low table, curtained windows, and warm lamplight.",
  );
  assert.doesNotMatch(overrides.positivePrompt, /looks toward the window/i);
  assert.match(overrides.positivePrompt, /ENVIRONMENT CONTINUITY: A comfortable living room/i);
});

test("retrying collapses accumulated negative prompt safeguards", () => {
  const message = {
    generation: {
      positive: "quality, 1person, misty, pool",
      negative: "low quality, first-person POV, character unseen, first-person POV, character unseen, scenery-only image, food-only image, scenery-only image, food-only image",
    },
  };
  const overrides = retryPromptOverrides(message, { name: "Misty" }, {
    globalNegativePrompt: "low quality, first-person POV, character unseen",
  });
  for (const phrase of ["low quality", "first-person POV", "character unseen", "scenery-only image", "food-only image"]) {
    assert.equal((overrides.negativePrompt.toLowerCase().match(new RegExp(phrase.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length, 1);
  }
});

test("retrying replaces recorded global prompts with the latest configured globals", () => {
  const message = {
    generation: {
      positive: "old global quality, 1person, faye valentine, red bikini, kitchen",
      negative: "old global negative, duplicate person",
      globalPositive: "old global quality",
      globalNegative: "old global negative",
    },
  };
  const overrides = retryPromptOverrides(message, { name: "Faye Valentine" }, {
    globalPositivePrompt: "new global masterpiece, detailed eyes",
    globalNegativePrompt: "new global lowres, bad hands",
  });
  assert.match(overrides.positivePrompt, /^new global masterpiece, detailed eyes\n\n/);
  assert.match(overrides.positivePrompt, /red bikini, kitchen/);
  assert.doesNotMatch(overrides.positivePrompt, /old global quality/);
  assert.match(overrides.negativePrompt, /^new global lowres, bad hands,/);
  assert.doesNotMatch(overrides.negativePrompt, /old global negative/);
});

test("legacy retries still add the latest globals when the old split was not recorded", () => {
  const message = {
    generation: {
      positive: "legacy quality, 1person, faye valentine, yellow dress",
      negative: "legacy negative",
    },
  };
  const overrides = retryPromptOverrides(message, { name: "Faye Valentine" }, {
    globalPositivePrompt: "latest quality",
    globalNegativePrompt: "latest negative",
  });
  assert.match(overrides.positivePrompt, /^latest quality\n\n/);
  assert.match(overrides.positivePrompt, /legacy quality/);
  assert.match(overrides.negativePrompt, /^latest negative,/);
});

test("legacy retries add newly saved visual identity features", () => {
  const message = {
    generation: {
      positive: "quality, 1person, misty, orange hair, red bikini, gym pool",
      negative: "low quality",
    },
  };
  const profile = {
    visual: {
      identity: ["orange hair"],
      signature: [],
      userOverrides: { identity: ["orange hair", "swim goggles"], signature: [], exceptions: [], updatedAt: "now" },
    },
  };
  const overrides = retryPromptOverrides(message, { name: "Misty" }, {}, profile);
  assert.match(overrides.positivePrompt, /gym pool, swim goggles/);
});

test("retries replace the recorded visual snapshot with current corrections", () => {
  const message = {
    generation: {
      positive: "quality, 1person, brown hair, blue eyes, school uniform",
      negative: "low quality, mechanical hands",
      visualIdentity: ["brown hair", "blue eyes"],
      visualExceptions: ["mechanical hands"],
    },
  };
  const profile = {
    visual: {
      identity: ["brown hair", "blue eyes"],
      signature: [],
      userOverrides: { identity: ["auburn hair", "green eyes"], signature: ["yellow ribbon"], exceptions: ["robot arms"], updatedAt: "now" },
    },
  };
  const overrides = retryPromptOverrides(message, { name: "Kasumi" }, {}, profile);
  assert.doesNotMatch(overrides.positivePrompt, /brown hair|blue eyes/);
  assert.match(overrides.positivePrompt, /school uniform, auburn hair, green eyes, yellow ribbon/);
  assert.doesNotMatch(overrides.negativePrompt, /mechanical hands/);
  assert.match(overrides.negativePrompt, /robot arms/);
});

test("retries omit signature details that are currently hidden", () => {
  const message = {
    generation: {
      positive: "quality, 1person, orange hair, side ponytail, swim goggles, pool",
      negative: "low quality",
      visualIdentity: ["orange hair", "side ponytail", "swim goggles"],
    },
  };
  const profile = {
    visual: {
      identity: ["orange hair"],
      signature: ["side ponytail", "swim goggles"],
      userOverrides: {
        identity: ["orange hair"],
        signature: ["side ponytail", "swim goggles"],
        hiddenSignature: ["swim goggles"],
        exceptions: [],
        updatedAt: "now",
      },
    },
  };
  const overrides = retryPromptOverrides(message, { name: "Misty" }, {}, profile);
  assert.match(overrides.positivePrompt, /orange hair, side ponytail/);
  assert.doesNotMatch(overrides.positivePrompt, /swim goggles/);
  assert.match(overrides.positivePrompt, /pool/);
});

test("retries replace a recorded default wardrobe without changing contextual outfits", () => {
  const defaultOutfitMessage = {
    generation: {
      positive: "quality, 1person, blonde hair, hooded jacket, bike shorts, park",
      negative: "low quality",
      visualIdentity: ["blonde hair"],
      visualDefaultWardrobe: "hooded jacket, bike shorts",
    },
  };
  const profile = {
    visual: {
      identity: ["blonde hair"],
      signature: [],
      defaultWardrobe: "hooded jacket, bike shorts",
      userOverrides: {
        identity: ["blonde hair"],
        signature: [],
        exceptions: [],
        defaultWardrobe: "long white shirt, short pleated skirt",
      },
    },
  };
  const corrected = retryPromptOverrides(defaultOutfitMessage, { name: "Bridget" }, {}, profile);
  assert.doesNotMatch(corrected.positivePrompt, /hooded jacket|bike shorts/);
  assert.match(corrected.positivePrompt, /long white shirt, short pleated skirt/);

  const contextualMessage = {
    generation: {
      ...defaultOutfitMessage.generation,
      positive: "quality, 1person, blonde hair, school uniform, classroom",
      visualDefaultWardrobe: "",
    },
  };
  const contextual = retryPromptOverrides(contextualMessage, { name: "Bridget" }, {}, profile);
  assert.match(contextual.positivePrompt, /school uniform/);
  assert.doesNotMatch(contextual.positivePrompt, /long white shirt|pleated skirt/);
});

test("retries replace the recorded scene outfit with the latest current outfit", () => {
  const message = {
    generation: {
      positive: "quality, 1person, purple hair, tactical bodysuit, training facility, focused",
      negative: "low quality",
      scenePrompt: "1person, adult, age 18 or older, motoko, purple hair, red eyes, tactical bodysuit, training facility, posing, focused, dim\n\nMotoko clearly visible in frame, full-body dynamic action shot, feet visible\n\nsolo focus, anime illustration",
      visualIdentity: ["purple hair", "red eyes"],
      sceneOutfit: "tactical bodysuit",
    },
  };
  const profile = {
    visual: {
      identity: ["purple hair", "red eyes"],
      signature: [],
      defaultWardrobe: "tactical bodysuit, fingerless gloves, combat boots",
    },
  };
  const overrides = retryPromptOverrides(
    message,
    { name: "Motoko" },
    {},
    profile,
    "light purple strapless highleg leotard, light purple utility belt, thigh boots",
  );
  assert.doesNotMatch(overrides.positivePrompt, /tactical bodysuit/);
  assert.match(overrides.positivePrompt, /light purple strapless highleg leotard, light purple utility belt, thigh boots/);
  assert.match(overrides.positivePrompt, /training facility/);
  assert.match(overrides.positivePrompt, /full-body dynamic action shot/);
});

test("retries translate a current outfit of none into an explicit nude prompt", () => {
  const message = {
    generation: {
      positive: "quality, 1person, blonde hair, blue dress, bedroom",
      negative: "low quality",
      visualIdentity: ["blonde hair"],
      sceneOutfit: "blue dress",
    },
  };
  const profile = { visual: { identity: ["blonde hair"], signature: [], defaultWardrobe: "blue dress" } };
  const overrides = retryPromptOverrides(message, { name: "Marie" }, {}, profile, "none");
  assert.doesNotMatch(overrides.positivePrompt, /blue dress/);
  assert.match(overrides.positivePrompt, /completely nude/);
});

test("legacy retries infer their scene outfit after the recorded visual identity", () => {
  const message = {
    generation: {
      positive: "quality, purple hair, red eyes, tactical bodysuit, training facility",
      negative: "low quality",
      scenePrompt: "1person, adult, age 18 or older, motoko, ghost in the shell, purple hair, red eyes, cybernetic body, tactical bodysuit, training facility, posing, focused, dim\n\nMotoko clearly visible in frame, dynamic action shot\n\nsolo focus, anime illustration",
      visualIdentity: ["purple hair", "red eyes", "cybernetic body"],
    },
  };
  const profile = {
    visual: {
      identity: ["purple hair", "red eyes", "cybernetic body"],
      signature: [],
      defaultWardrobe: "tactical bodysuit, fingerless gloves, combat boots",
    },
  };
  const overrides = retryPromptOverrides(message, { name: "Motoko" }, {}, profile, "casual black dress");
  assert.doesNotMatch(overrides.positivePrompt, /tactical bodysuit/);
  assert.match(overrides.positivePrompt, /casual black dress/);
});

test("legacy retries replace a recognizable researched default wardrobe", () => {
  const profile = {
    visual: {
      identity: ["blonde hair"],
      signature: ["yo-yo"],
      defaultWardrobe: "hooded jacket, open hoodie, puffy long sleeves, bike shorts, fingerless gloves, black gloves",
      userOverrides: {
        identity: ["blonde hair"],
        signature: ["yo-yo"],
        exceptions: [],
        defaultWardrobe: "long white shirt, short pleated skirt",
      },
    },
  };
  const legacyDefault = retryPromptOverrides({
    generation: {
      positive: "quality, blonde hair, hooded jacket, open hoodie, puffy long sleeves, bike shorts, fingerless gloves, black gloves, park",
      negative: "low quality",
      visualIdentity: ["blonde hair", "yo-yo"],
    },
  }, { name: "Bridget" }, {}, profile);
  assert.doesNotMatch(legacyDefault.positivePrompt, /hooded jacket|open hoodie|puffy long sleeves|bike shorts|fingerless gloves|black gloves/);
  assert.match(legacyDefault.positivePrompt, /long white shirt, short pleated skirt/);

  const legacyContextual = retryPromptOverrides({
    generation: {
      positive: "quality, blonde hair, school uniform, classroom",
      negative: "low quality",
      visualIdentity: ["blonde hair", "yo-yo"],
    },
  }, { name: "Bridget" }, {}, profile);
  assert.match(legacyContextual.positivePrompt, /school uniform/);
  assert.doesNotMatch(legacyContextual.positivePrompt, /long white shirt|pleated skirt/);
});
