import assert from "node:assert/strict";
import test from "node:test";
import { mergeScene, normalizeSceneState, previewSceneForUserTurn, reduceSceneTurn, sceneContinuityCheckpoint } from "../server/scene-state.mjs";

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

  const repairedShared = normalizeSceneState({
    location: "Big Benedict's patio",
    presence: "together",
    locationOwner: "character",
    characterLocation: "Big Benedict's and scanned for a spot",
    userLocation: "the bedroom",
  });
  assert.equal(repairedShared.locationOwner, "shared");
  assert.equal(repairedShared.sharedLocation, "Big Benedict's patio");
  assert.equal(repairedShared.characterLocation, "Big Benedict's patio");
  assert.equal(repairedShared.userLocation, "Big Benedict's patio");

  const apart = normalizeSceneState({ location: "Arcade", presence: "apart" });
  assert.equal(apart.locationOwner, "character");
  assert.equal(apart.characterLocation, "Arcade");
  assert.equal(apart.sharedLocation, undefined);
});

test("legacy destination actions are removed from both location and surroundings", () => {
  const repaired = normalizeSceneState({
    location: "the bedroom and dive into bed",
    environment: "Inside the bedroom and dive into bed, with walls, floor, furniture, and ordinary indoor details appropriate to the room.",
    presence: "together",
  });
  assert.equal(repaired.location, "the bedroom");
  assert.match(repaired.environment, /bedroom.*bed/i);
  assert.doesNotMatch(repaired.environment, /dive/i);
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

test("an explicit action location overrides a stale room even when pose words come first", () => {
  const preview = previewSceneForUserTurn({
    ...kitchen,
    location: "bathroom",
    environment: "A steamy bathroom with tiled walls and a running shower.",
    activity: "washing in the shower",
    revision: 16,
  }, "[action: we're lying in bed, in the bedroom. Talking ]", {
    presencePatch: { presence: "together" },
  });
  assert.equal(preview.location, "the bedroom");
  assert.match(preview.environment, /bedroom|bed|furniture/i);
  assert.equal(preview.revision, 17);
  assert.equal(preview.locationEvidence.source, "shared");
  assert.equal(preview.locationEvidence.kind, "action_present");
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

test("Erica's restaurant arrival settles into a shared patio-table scene", () => {
  const bedroom = {
    ...kitchen,
    location: "the bedroom",
    environment: "A comfortable bedroom with a bed and morning light.",
    activity: "getting ready to leave for brunch",
    presence: "together",
    revision: 19,
  };
  const arrived = reduceSceneTurn(bedroom, {
    characterText: "As they stepped into Big Benedict's and scanned for a spot, she beamed at the suggestion of the patio. She led him toward the sunny patio.",
    presencePatch: { presence: "together" },
    modelScene: {
      location: "Big Benedict's and scanned for a spot",
      environment: "As they stepped into Big Benedict's and scanned for a spot, she beamed at the suggestion of the patio",
      activity: "settling into Big Benedict's and scanned for a spot",
    },
  });
  assert.equal(arrived.location, "Big Benedict's");
  assert.equal(arrived.locationOwner, "shared");
  assert.equal(arrived.sharedLocation, "Big Benedict's");
  assert.equal(arrived.userLocation, "Big Benedict's");
  assert.doesNotMatch(arrived.environment, /stepped|scanned|beamed/i);

  const seated = reduceSceneTurn(arrived, {
    userText: "[action: we sit down at a table on the patio and check out the menu. I order a French press coffee and bottomless mimosas]",
    characterText: "Erica leans back in her chair and looks over the menu while the drinks arrive.",
    presencePatch: { presence: "together" },
    modelScene: { location: null, environment: null, activity: "having brunch at the patio table" },
  });
  assert.equal(seated.location, "Big Benedict's patio");
  assert.equal(seated.locationOwner, "shared");
  assert.match(seated.environment, /restaurant patio.*tables.*umbrellas/i);
  assert.match(seated.activity, /sitting at a table on the patio.*checking out the menu/i);
  assert.doesNotMatch(`${seated.location} ${seated.environment} ${seated.activity}`, /stepped into|scanned for a spot|settling into/i);
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

test("leaving dinner to walk along the beach updates the scene before a camera capture", () => {
  const restaurant = {
    ...kitchen,
    location: "the restaurant",
    environment: "An elegant oceanfront restaurant with linen-covered tables and dim interior lighting.",
    activity: "finishing dessert",
    lighting: "dim restaurant lighting",
  };
  const next = reduceSceneTurn(restaurant, {
    userText: "We leave the restaurant and walk along the beach, headed back to the bungalow.",
    characterText: "Moonlight catches on the tide while warm sand yields beneath their footsteps.",
    presencePatch: { presence: "together" },
    modelScene: {
      location: "the restaurant",
      activity: "walking back toward the bungalow",
      lighting: "moonlight",
    },
  });
  assert.equal(next.location, "the beach");
  assert.match(next.environment, /shoreline.*sand.*horizon/i);
  assert.equal(next.activity, "walking back toward the bungalow");
  assert.equal(next.lighting, "moonlight");
  assert.equal(next.revision, 3);
});

test("leaving a house commits an exterior transit scene without waiting for arrival", () => {
  const next = reduceSceneTurn({
    ...kitchen,
    location: "bedroom",
    environment: "A comfortable bedroom with a bed and clothing storage.",
    activity: "getting dressed",
    revision: 0,
  }, {
    userText: "Fine. Let's go get those parfaits. [action: we finally leave the house]",
    characterText: "As they step outside, Nagatoro skips toward the street and leads the way toward the cafe.",
    presencePatch: { presence: "together" },
    modelScene: { location: "bedroom", activity: "walking toward the parfait cafe", lighting: "bright daylight" },
  });
  assert.equal(next.location, "outside the house");
  assert.match(next.environment, /exterior area.*open air/i);
  assert.equal(next.activity, "walking toward the parfait cafe");
  assert.equal(next.lighting, "bright daylight");
  assert.equal(next.revision, 1);
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

test("a character getting dressed and joining the user commits both shared location and outfit", () => {
  const shower = {
    ...kitchen,
    location: "the shower",
    environment: "A steamy bathroom with a tiled shower and bright overhead lighting.",
    activity: "finishing the shower",
    outfit: "robe",
    revision: 8,
  };
  const next = reduceSceneTurn(shower, {
    userText: "[action: I head to the kitchen and make coffee. She gets dressed in her yellow waitress uniform and joins me in the kitchen] Here's your coffee!",
    characterText: "Erica practically floated into the kitchen, the bright yellow of her Stray Sheep uniform contrasting with the morning light.",
    presencePatch: { presence: "together" },
    modelScene: { location: "the shower", outfit: "robe", activity: "drinking coffee" },
  });
  assert.equal(next.location, "the kitchen");
  assert.match(next.environment, /kitchen.*counters.*cabinets/i);
  assert.equal(next.locationOwner, "shared");
  assert.equal(next.outfit, "yellow waitress uniform");
  assert.equal(next.outfitEvidence.source, "user");
  assert.equal(next.revision, 9);
});

test("a completed response arrival can replace passively carried apart presence", () => {
  const next = reduceSceneTurn({
    ...kitchen,
    location: "The Stray Sheep",
    presence: "apart",
    locationOwner: "character",
  }, {
    userText: "I leave home and start walking to the bar.",
    characterText: "When Alex steps into the bar, Erica looks up and greets him.",
    presencePatch: { presence: "apart" },
    modelScene: { presence: "together", location: "The Stray Sheep", activity: "greeting Alex at the bar" },
  });
  assert.equal(next.presence, "together");
});

test("an explicit user separation overrides a conflicting model presence", () => {
  const next = reduceSceneTurn(kitchen, {
    userText: "[action: I head home.] I'll text you later.",
    characterText: "She waves goodbye from the doorway.",
    presencePatch: { presence: "apart", presenceAuthority: "deterministic" },
    modelScene: { presence: "together" },
  });
  assert.equal(next.presence, "apart");
});

test("a character wrapping herself in a towel commits the towel outfit", () => {
  const next = reduceSceneTurn({ ...kitchen, outfit: "completely nude" }, {
    characterText: "[action: steps out of the shower and quickly grabs a towel, wrapping it around herself with a huff] Finally!",
    modelScene: { outfit: "completely nude" },
  });
  assert.equal(next.outfit, "bath towel wrapped around her body");
  assert.equal(next.outfitEvidence.source, "character");
});

test("a completed narrative ensemble overrides stale nudity", () => {
  const narration = "Once back in the bedroom, Erica slid into a pair of high-waisted, charcoal grey leggings that hugged her curves and paired them with a soft, cream-colored off-the-shoulder knit sweater.";
  const next = reduceSceneTurn({ ...kitchen, outfit: "completely nude" }, {
    characterText: narration,
    modelScene: { outfit: "completely nude", activity: "getting ready to leave" },
  });
  assert.equal(
    next.outfit,
    "high-waisted, charcoal grey leggings, soft, cream-colored off-the-shoulder knit sweater",
  );
  assert.equal(next.outfitEvidence.source, "character");
});

test("Narrative Mode commits removal, a gifted dress, and its later description", () => {
  const bunny = { ...kitchen, outfit: "shiny red satin bunny bodysuit with white bunny ears" };
  const nude = reduceSceneTurn(bunny, {
    userText: "Take off that bunny outfit. Get naked!",
    characterText: "Within moments he peels the fabric away. Now completely naked and glowing with anticipation, he stands on the bed.",
  });
  assert.equal(nude.outfit, "completely nude");

  const dressed = reduceSceneTurn(nude, {
    userText: "It's a frilly dress with ribbons! Go ahead, try it on!",
    characterText: "Once he's finally settled into the dress, he spins around and strikes a proud pose.",
  });
  assert.equal(dressed.outfit, "frilly dress with ribbons");

  const described = reduceSceneTurn(dressed, {
    userText: "Describe the dress you're wearing.",
    characterText: "It's this super short, fluffy white dress made of a soft, airy material that feels like a cloud!",
    allowWardrobeDescription: true,
  });
  assert.equal(described.outfit, "super short, fluffy white dress made of a soft, airy material that feels like a cloud");
});

test("changing location cannot silently replace a known outfit", () => {
  const canonical = "white graphic T-shirt, short light blue skirt, black pantyhose, walnut brown boots";
  const next = reduceSceneTurn({ ...kitchen, outfit: canonical }, {
    userText: "Let's step outside and walk across campus.",
    characterText: "Hana follows him into the sunlight and looks around the busy campus.",
    modelScene: { location: "campus", outfit: "vague school clothes", activity: "walking outside" },
  });
  assert.equal(next.outfit, canonical);
});

test("removing one garment preserves every other known layer", () => {
  const next = reduceSceneTurn({
    ...kitchen,
    outfit: "red jacket, white fitted shirt, black skirt, knee-high boots",
  }, {
    characterText: "Erica takes off her red jacket and drops it over a chair.",
    modelScene: { outfit: "casual clothes" },
  });
  assert.equal(next.outfit, "white fitted shirt, black skirt, knee-high boots");
  assert.equal(next.outfitEvidence.kind, "removed");
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

test("an action infinitive after movement cannot become the scene location", () => {
  const bar = {
    ...kitchen,
    location: "The Stray Sheep",
    environment: "A warmly lit neighborhood bar with booths, a counter, and amber pendant lights.",
    activity: "finishing a drink in a booth",
    presence: "apart",
  };
  const narration = "Erica watched him with a smile as he moved to settle his bill. She remained in the booth behind him.";
  const next = reduceSceneTurn(bar, {
    characterText: narration,
    modelScene: {
      location: "settle his bill",
      environment: "The setting is settle his bill.",
      activity: "settling into settle his bill",
    },
  });
  assert.equal(next.location, bar.location);
  assert.equal(next.environment, bar.environment);
  assert.equal(next.activity, bar.activity);
});

test("the immediate checkpoint marks older locations and activities as completed context", () => {
  const checkpoint = sceneContinuityCheckpoint({
    ...kitchen,
    location: "the beach",
    environment: "A moonlit shoreline with warm sand and rolling surf.",
    activity: "walking toward the bungalow",
    lighting: "moonlight",
  });
  assert.match(checkpoint, /location=the beach/);
  assert.match(checkpoint, /walking toward the bungalow/);
  assert.match(checkpoint, /earlier history.*completed past context/i);
  assert.match(checkpoint, /earlier food.*present again/i);
});
