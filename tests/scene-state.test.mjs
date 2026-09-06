import assert from "node:assert/strict";
import test from "node:test";
import { mergeScene, normalizeSceneState, previewSceneForUserTurn, reduceSceneTurn } from "../server/scene-state.mjs";

const kitchen = {
  location: "Kitchen",
  environment: "A warm kitchen with counters, cabinets, cookware, and a refrigerator.",
  activity: "finishing parfaits",
  outfit: "yellow hoodie and white shorts",
  expression: "joyful",
  lighting: "warm kitchen light",
  presence: "together",
  revision: 2,
};

test("arrival commentary never becomes the place name or character activity", () => {
  const next = reduceSceneTurn(kitchen, {
    userText: "[action: we arrive at the beach and she was right... it's completely private. No one is around]",
    modelScene: { location: "beach", activity: "walking along the sand", environment: "The setting is the beach." },
  });
  assert.equal(next.location, "the beach");
  assert.equal(next.activity, "walking along the sand");
  assert.match(next.environment, /shoreline.*sand.*horizon/i);
  assert.doesNotMatch(next.environment, /she was right|private/i);
});

test("racing to the other side preserves the enclosing indoor pool and its surroundings", () => {
  const pool = {
    ...kitchen,
    location: "Mansion indoor pool",
    environment: "A vast indoor swimming hall with a long clear-water pool, tiled deck, and a high ceiling.",
    activity: "swimming a race",
  };
  const next = reduceSceneTurn(pool, {
    userText: "[action: we race to the other side and arrive at the same time]",
    modelScene: {
      location: "the other side and arrive at the same time",
      environment: "The setting is the other side.",
      activity: "surfacing after finishing the race in a tie",
    },
  });
  assert.equal(next.location, pool.location);
  assert.equal(next.environment, pool.environment);
  assert.equal(next.activity, "surfacing after finishing the race in a tie");
  assert.equal(next.revision, pool.revision);
});

test("legacy scenes acquire compatible revision and location ownership metadata", () => {
  const together = normalizeSceneState({ location: "Kitchen", presence: "together" });
  assert.equal(together.revision, 0);
  assert.equal(together.locationOwner, "shared");
  assert.equal(together.sharedLocation, "Kitchen");
  assert.equal(together.characterLocation, "Kitchen");
  assert.equal(together.userLocation, "Kitchen");

  const apart = normalizeSceneState({ location: "Arcade", presence: "apart" });
  assert.equal(apart.locationOwner, "character");
  assert.equal(apart.characterLocation, "Arcade");
  assert.equal(apart.sharedLocation, undefined);
});

test("an explicit user transition updates the prompt scene before Ollama replies", () => {
  const preview = previewSceneForUserTurn(kitchen, "[action: We're in the bedroom now, sitting on the bed.]", {
    presencePatch: { presence: "together" },
  });
  assert.equal(preview.location, "the bedroom");
  assert.equal(preview.activity, "sitting on the bed");
  assert.match(preview.environment, /bedroom|room/i);
  assert.equal(preview.revision, 3);
});

test("a completed movement commits location, surroundings, activity, and ownership atomically", () => {
  const next = reduceSceneTurn(kitchen, {
    userText: "[action: We race to the bedroom and jump on the bed, play wrestling and roll around laughing.]",
    characterText: "No fair! I'm going to win this wrestling match!",
    presencePatch: { presence: "together" },
    modelScene: {
      location: "Kitchen",
      environment: "we race to the bedroom and jump on the bed",
      activity: "finishing parfaits",
      lighting: "bright, warm",
    },
  });
  assert.equal(next.location, "the bedroom");
  assert.match(next.environment, /bedroom|room/i);
  assert.doesNotMatch(next.environment, /we race/i);
  assert.match(next.activity, /jump on the bed|play wrestling/i);
  assert.equal(next.locationOwner, "shared");
  assert.equal(next.sharedLocation, "the bedroom");
  assert.equal(next.revision, 3);
  assert.equal(next.outfit, kitchen.outfit);
});

test("going outside into the yard commits the shared outdoor scene", () => {
  const livingRoom = {
    ...kitchen,
    location: "living room couch",
    environment: "A cozy living room with a sofa, low table, and warm lamplight.",
    activity: "planning a camping trip",
  };
  const next = reduceSceneTurn(livingRoom, {
    userText: "[action: we go outside in the yard and check on the construction progress]",
    characterText: "Wow! The pool area is already starting to take shape!",
    presencePatch: { presence: "together" },
  });
  assert.equal(next.location, "yard");
  assert.match(next.environment, /outdoor residential space/i);
  assert.match(next.activity, /check on the construction progress/i);
  assert.equal(next.locationOwner, "shared");
  assert.equal(next.revision, 3);
});

test("an explicit user wardrobe action overrides a stale model outfit", () => {
  const next = reduceSceneTurn({ ...kitchen, outfit: "Naked towel" }, {
    userText: "[action: she walks out wearing my black oversized T-shirt. She looks too cute.]",
    characterText: "Don't call me cute!",
    modelScene: { outfit: "Naked towel", expression: "defensive" },
  });
  assert.equal(next.outfit, "black oversized T-shirt");
  assert.equal(next.outfitEvidence.source, "user");
});

test("a character wrapping herself in a towel commits the towel outfit", () => {
  const next = reduceSceneTurn({ ...kitchen, outfit: "completely nude" }, {
    characterText: "[action: steps out of the shower and quickly grabs a towel, wrapping it around herself with a huff] Finally!",
    modelScene: { outfit: "completely nude" },
  });
  assert.equal(next.outfit, "bath towel wrapped around her body");
  assert.equal(next.outfitEvidence.source, "character");
});

test("a rejected model destination cannot leak environment, activity, or lighting", () => {
  const leisureWing = {
    ...kitchen,
    location: "Leisure Wing",
    environment: "A mansion leisure room with an air-hockey table and arcade cabinets.",
    activity: "playing air hockey",
    lighting: "warm indoor lighting",
  };
  const next = mergeScene(leisureWing, {
    location: "Ice Rink",
    environment: "A frozen stadium surrounded by ice and spectator stands.",
    activity: "playing ice hockey",
    lighting: "cold arena floodlights",
    expression: "competitive",
  }, "The air-hockey puck bounces off the table rail and enters the goal.");
  assert.equal(next.location, "Leisure Wing");
  assert.equal(next.environment, leisureWing.environment);
  assert.equal(next.activity, "playing air hockey");
  assert.equal(next.lighting, "warm indoor lighting");
  assert.equal(next.expression, "competitive");
});

test("a remote character report updates the character location without creating a shared scene", () => {
  const next = reduceSceneTurn({ ...kitchen, location: "Arcade", presence: "apart", revision: 1 }, {
    characterText: "I'm taking a break from training while the others finish cleaning the gym.",
    modelScene: {
      location: "C&C Training Gym",
      environment: "A spacious training gym with weight racks, polished floors, and echoing acoustics.",
      activity: "resting between strength sets",
      lighting: "bright morning gym lights",
    },
  });
  assert.equal(next.location, "C&C Training Gym");
  assert.equal(next.characterLocation, "C&C Training Gym");
  assert.equal(next.locationOwner, "character");
  assert.equal(next.presence, "apart");
  assert.equal(next.sharedLocation, undefined);
});

test("a remote user's solo move does not teleport the character", () => {
  const next = reduceSceneTurn({ ...kitchen, location: "Arcade", presence: "apart", revision: 1 }, {
    userText: "I'm in the kitchen now, making coffee.",
  });
  assert.equal(next.location, "Arcade");
  assert.equal(next.characterLocation, "Arcade");
  assert.equal(next.userLocation, "the kitchen");
  assert.equal(next.presence, "apart");
});

test("reaffirming the same location does not create another scene revision", () => {
  const next = reduceSceneTurn(kitchen, {
    userText: "We're in the kitchen now, washing the parfait glasses.",
    presencePatch: { presence: "together" },
  });
  assert.equal(next.location.toLowerCase().replace(/^the /, ""), "kitchen");
  assert.equal(next.revision, 2);
});
