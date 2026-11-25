import assert from "node:assert/strict";
import test from "node:test";
import { applyFinalScene } from "../server/final-scene.mjs";
import { reduceSceneTurn, sceneContinuityCheckpoint } from "../server/scene-state.mjs";
import { buildImagePrompt } from "../server/identity.mjs";

const initial = { location: "restaurant", environment: "wooden tables and warm lamps", activity: "having dinner", posture: "seated", outfit: "blue dress", presence: "together", revision: 3 };

test("ordinary narration commits a verified named venue even with stale or missing structured location evidence", () => {
  const existing = { ...initial, characterLocation: initial.location, userLocation: "workshop", presence: "apart",
    verification: { pending: ["location"] } };
  const narration = "While Alex worked at the studio, Mira was in her element at the Copper Lantern. She moved through the bar and set down a glass.";
  for (const location of [undefined, existing.location, "a different restaurant"]) {
    const scene = reduceSceneTurn(existing, { characterName: "Mira Vale", characterText: narration, characterNarration: narration, modelScene: { location }, sceneEvidence: {} });
    assert.equal(scene.characterLocation, "the Copper Lantern");
    assert.equal(scene.userLocation, "workshop");
    assert.equal(scene.presence, "apart");
    assert.equal(scene.environment, "bar interior");
    assert.equal(scene.verification.pending.includes("location"), false);
  }
  for (const characterText of [
    'Mira said, "I am inside the Copper Lantern."',
    "Mira was on her way to the Copper Lantern.",
    "Yesterday Mira was in her element at the Copper Lantern.",
    "Mira was not at the Copper Lantern.",
    "Mira was at the Copper Lantern. She walked out of the bar.",
    "Alex was at the Copper Lantern.",
  ]) {
    assert.equal(reduceSceneTurn(existing, { characterName: "Mira Vale", characterText, characterNarration: characterText, sceneEvidence: {} }).location, existing.location, characterText);
  }
});

test("a private-quarters scene commits the room and lounging pose together for artwork", () => {
  const characterText = "Mira is inside her private quarters. Obsidian pillars surround a lounge with red velvet cushions. Mira reclines across the cushions.";
  const evidence = quote => ({ quote, source: "character", actor: "character", phase: "current" });
  const scene = reduceSceneTurn({ ...initial, location: "private wing corridor", activity: "returning from the gardens", posture: "standing" }, {
    characterText,
    modelScene: { location: "private quarters", environment: "Obsidian pillars surround a lounge with red velvet cushions", activity: "reclining across the cushions", posture: "lying" },
    sceneEvidence: {
      location: evidence("Mira is inside her private quarters"),
      environment: evidence("Obsidian pillars surround a lounge with red velvet cushions"),
      activity: evidence("Mira reclines across the cushions"),
      posture: evidence("Mira reclines across the cushions"),
    },
  });
  assert.equal(scene.location, "private quarters");
  assert.equal(scene.posture, "lying");
  assert.equal(scene.sharedLocation, scene.location);
  const prompt = buildImagePrompt({ visual: { identity: [], signature: [] } }, { name: "Mira" }, scene);
  assert.match(prompt, /private quarters/);
  assert.match(prompt, /red velvet cushions/);
  assert.match(prompt, /Mira is lying/);
  assert.doesNotMatch(prompt, /corridor|returning from the gardens/);
});

test("private-room vocabulary still requires current grounded evidence", () => {
  for (const quote of ["Mira will enter her private quarters tomorrow", "Mira did not enter her private chambers", "Mira entered the private lounge"]) {
    const result = applyFinalScene(initial, {
      characterText: "Mira remains at the restaurant.",
      modelScene: { location: "private quarters", posture: "lying" },
      sceneEvidence: { location: { quote, source: "character", actor: "character", phase: "current" } },
    });
    assert.equal(result.scene.location, initial.location);
    assert.equal(result.scene.posture, initial.posture);
  }
});
test("a clear shared current-location declaration corrects stale or missing model state", () => {
  const userText = "[action: we're standing inside my living room and Nagatoro is looking up at me, provocatively]";
  for (const modelScene of [{ location: "arcade exit" }, {}, { location: "Alex's living room" }]) {
    const result = applyFinalScene({ ...initial, location: "arcade exit" }, { userText, modelScene, sceneEvidence: {} });
    assert.equal(result.scene.location, "my living room");
    assert.equal(result.scene.sharedLocation, "my living room");
    assert.equal(result.scene.locationEvidence.source, "user");
  }
});

test("shared declarations do not accept questions, memories, imagined scenes, plans, props or remote user state", () => {
  for (const userText of ["Are we standing inside my living room?", "We're standing inside my living room?",
    "Imagine we're standing inside my living room.", "Yesterday we were standing inside my living room.",
    "We're going to be standing inside my living room.", "We're standing inside my handbag.",
    "We are not standing inside my living room."]) {
    assert.equal(applyFinalScene(initial, { userText, modelScene: {}, sceneEvidence: {} }).scene.location, initial.location, userText);
  }
  assert.equal(applyFinalScene({ ...initial, presence: "apart" }, {
    userText: "We're standing inside my living room.", modelScene: {}, sceneEvidence: {},
  }).scene.location, initial.location);
});

test("shared declarations preserve coordinated room adjectives before the place noun", () => {
  for (const location of ["Mira's expansive and lush private quarters", "the bright and spacious lounge", "my small and cozy living room"]) {
    const userText = `[action: We are in ${location}.]`;
    const result = applyFinalScene(initial, { userText, modelScene: {}, sceneEvidence: {} });
    assert.equal(result.scene.location, location);
    assert.equal(result.scene.sharedLocation, location);
    assert.equal(result.scene.locationEvidence.text, `[action: We are in ${location}`);
  }
});

test("coordinated room adjectives still separate a following character action", () => {
  const result = applyFinalScene(initial, {
    userText: "We're inside the bright and spacious lounge and Mira is sitting beside the window.",
    modelScene: {}, sceneEvidence: {},
  });
  assert.equal(result.scene.location, "the bright and spacious lounge");
  assert.doesNotMatch(result.scene.location, /sitting|window/);
});

test("a completed apartment arrival supports a home label, but cannot invent a specific room", () => {
  const characterText = "Nagatoro stepped into the warmth of the apartment, the door clicking shut behind them.";
  const result = applyFinalScene({ ...initial, location: "arcade exit" }, {
    characterText, modelScene: { location: "Alex's home" }, sceneEvidence: {},
  });
  assert.equal(result.scene.location, "Alex's home");
  assert.equal(applyFinalScene(initial, { characterText, modelScene: { location: "home kitchen" }, sceneEvidence: {} }).scene.location, initial.location);
});
test("driveway and townhouse arrivals are valid and recover missing model evidence", () => {
  let scene = { ...initial, location: "the car", activity: "driving home" };
  const driveway = "We arrived in the driveway.";
  scene = applyFinalScene(scene, { userText: driveway, modelScene: { location: "the driveway" }, sceneEvidence: { location: { source: "user", actor: "shared", phase: "current", quote: driveway } } }).scene;
  assert.equal(scene.location, "the driveway");
  scene = applyFinalScene(scene, { userText: "[action: we unpack our gear and go inside our townhouse ]", modelScene: { location: "our townhouse" }, sceneEvidence: {} }).scene;
  assert.equal(scene.location, "our townhouse");
  assert.equal(scene.sharedLocation, "our townhouse");
  const recovered = applyFinalScene({ ...initial, location: "the car" }, { characterText: "Erica practically bounced into the living room.", modelScene: { location: "the living room" }, sceneEvidence: {} });
  assert.equal(recovered.scene.location, "the living room");
});

test("arrival recovery cannot turn plans, props or remote movement into a shared move", () => {
  for (const userText of ["we will go inside our townhouse", "we did not enter our townhouse", "we talked about our townhouse", "we go to the cooler", "if we enter our townhouse"]) {
    assert.equal(applyFinalScene(initial, { userText, modelScene: { location: "our townhouse" }, sceneEvidence: {} }).scene.location, initial.location);
  }
  assert.equal(applyFinalScene({ ...initial, presence: "apart" }, { userText: "we go inside our townhouse", modelScene: { location: "our townhouse" }, sceneEvidence: {} }).scene.location, initial.location);
});
const proof = (quote, source = "user", actor = "shared", phase = "current") => ({ quote, source, actor, phase });

test("explicit character garment removal survives missing model quotation", () => {
  const existing = { ...initial, outfit: "black bra, black lace panties" };
  const text = "Please, mistress. If I may... [action: I slide my hands around her back and unhook her constrictive bra and take her bra off... letting her shoulders relax.]";
  const scene = reduceSceneTurn(existing, { userText: text, characterText: "She exhales with relief.",
    modelScene: { outfit: "black lace panties" }, sceneEvidence: {}, characterName: "Erica Anderson" });
  assert.equal(scene.outfit, "black lace panties");
  assert.equal(scene.outfitEvidence.kind, "final_scene");
  assert.equal(scene.outfitEvidence.phase, "removed");
  assert.equal(scene.revision, initial.revision + 1);
});

test("garment removal preserves other layers, excludes user clothing and planned changes", () => {
  const existing = { ...initial, outfit: "black bra, black lace panties" };
  for (const userText of ["[action: I take my bra off]", "[action: I will take her bra off]", "[action: I did not take her bra off]", "Would you like me to take her bra off?"]) {
    assert.equal(applyFinalScene(existing, { userText, modelScene: {}, sceneEvidence: {} }).scene.outfit, existing.outfit);
  }
  assert.equal(applyFinalScene(existing, { characterText: "I take my bra off.", modelScene: {}, sceneEvidence: {} }).scene.outfit, "black lace panties");
});

test("a later evidenced change can put a removed garment back on", () => {
  const characterText = "She changes into a red bra and black panties.";
  const result = applyFinalScene({ ...initial, outfit: "black bra, black lace panties" }, {
    userText: "[action: I take her bra off]", characterText,
    modelScene: { outfit: "red bra, black panties" }, sceneEvidence: { outfit: proof(characterText, "character", "character") } });
  assert.equal(result.scene.outfit, "red bra, black panties");
});
function update(text, scene, evidence, existing = initial) {
  return applyFinalScene(existing, { userText: text, modelScene: scene, sceneEvidence: evidence });
}

test("final scene accepts an arrival fragment without a movement-verb grammar", () => {
  const text = "[action: finally back inside our rental, we pressed against each other]";
  const result = update(text, { location: "rental" }, { location: proof("finally back inside our rental") });
  assert.equal(result.scene.location, "rental");
  assert.equal(result.scene.sharedLocation, result.scene.location);
  assert.equal(result.scene.posture, "unknown");
  assert.equal(result.scene.revision, 4);
});

test("character evidence supports the end of a narrated arrival", () => {
  const quote = "They reached the rental and the door clicked shut behind them";
  const scene = reduceSceneTurn(initial, { characterText: quote, modelScene: { location: "rental" }, sceneEvidence: { location: proof(quote, "character") } });
  assert.equal(scene.location, "rental");
});

test("a room named elsewhere in the same current action can refine an arrival quote", () => {
  const text = "[action: finally back inside our rental, we stop in the entryway.]";
  const result = update(text, { location: "rental entryway", environment: "a quiet rental home entrance with a shoe bench" }, { location: proof("finally back inside our rental"), environment: proof("we stop in the entryway") });
  assert.equal(result.scene.location, "rental entryway");
  assert.equal(result.scene.environment, "a quiet rental home entrance with a shoe bench");
});

test("a room absent from the source is not invented from a generic arrival", () => {
  const text = "finally back inside our rental";
  assert.equal(update(text, { location: "rental kitchen" }, { location: proof(text) }).scene.location, "restaurant");
});

test("final pose supersedes intermediate standing", () => {
  const text = "Erica stood up, grabbed beers, and sat back down on the lounger.";
  const result = update(text, { posture: "seated", activity: "resting on the lounger" }, { posture: proof("sat back down on the lounger", "user", "character"), activity: proof("sat back down on the lounger", "user", "character") }, { ...initial, posture: "standing" });
  assert.equal(result.scene.posture, "seated");
  assert.match(sceneContinuityCheckpoint(result.scene), /posture=seated/);
  const prompt = buildImagePrompt({ visual: { identity: [], signature: [] } }, { name: "Erica" }, result.scene);
  assert.match(prompt, /Erica is seated/i);
});

test("a seated character stays seated through ordinary dialogue and can explicitly stand", () => {
  const quiet = "Erica grinned and picked up the remote.";
  for (const posture of ["unknown", "standing"]) {
    const next = reduceSceneTurn(initial, { characterText: quiet, modelScene: { posture }, sceneEvidence: { posture: proof(quiet, "character") } });
    assert.equal(next.posture, "seated");
  }
  const approximate = "Erica practically stood up on the couch, her glass held high in excitement.";
  for (const quote of [approximate, "stood up on the couch"]) {
    const next = reduceSceneTurn(initial, { characterText: approximate, modelScene: { posture: "standing" }, sceneEvidence: { posture: proof(quote, "character") } });
    assert.equal(next.posture, "seated");
  }
  const rise = "Erica stood up to get a drink.";
  const next = reduceSceneTurn(initial, { characterText: rise, modelScene: { posture: "standing" }, sceneEvidence: { posture: proof(rise, "character") } });
  assert.equal(next.posture, "standing");
});

test("a named action corrects the character's posture until a completed change", () => {
  const standing = { ...initial, posture: "standing" };
  const userText = "[action: Erica is sitting down, but cheering at the screen]";
  const characterName = "Erica Anderson";
  const characterText = "She practically stood up on the couch, her glass held high in excitement.";
  const next = reduceSceneTurn(standing, { userText, characterName, characterText, modelScene: { posture: "standing" }, sceneEvidence: { posture: proof("stood up on the couch", "character") } });
  assert.equal(next.posture, "seated");
  const stood = reduceSceneTurn(standing, { userText, characterName, characterText: "She stood up and picked up the remote.", modelScene: {}, sceneEvidence: {} });
  assert.equal(stood.posture, "standing");
});

test("generic home references preserve an established residence", () => {
  const existing = { ...initial, location: "living room in the modern urban townhouse" };
  const narration = "She was still in the living room.";
  const next = reduceSceneTurn(existing, { characterText: narration, modelScene: { location: "living room" }, sceneEvidence: { location: proof(narration, "character") } });
  assert.equal(next.location, existing.location);
});

test("future plans and negated moves do not change the current scene", () => {
  for (const quote of ["We will go to the beach tomorrow", "We did not enter the rental"]) {
    const result = update(quote, { location: quote.includes("beach") ? "beach" : "rental" }, { location: proof(quote) });
    assert.equal(result.scene.location, "restaurant");
  }
});

test("a cooler is a prop, and rejected destinations cannot leak staging", () => {
  const text = "We went to the cooler and poured ourselves fresh drinks.";
  const result = update(text, { location: "the cooler and poured themselves fresh drinks", environment: "icy walls and snowy floor", posture: "standing" }, { location: proof(text), environment: proof(text), posture: proof(text) });
  assert.equal(result.scene.location, "restaurant");
  assert.equal(result.scene.environment, initial.environment);
  assert.equal(result.scene.posture, "seated");
});

test("missing, forged, planned, or malformed evidence cannot commit changes", () => {
  for (const evidence of [null, proof("We arrived at the rental"), proof("rental tomorrow", "user", "shared", "planned"), proof("rental tomorrow", "user", "invalid")]) {
    assert.equal(update("rental tomorrow", { location: "rental" }, { location: evidence }).scene.location, "restaurant");
  }
});

test("sequential rental, car, restaurant and private-room transitions share one snapshot", () => {
  let scene = initial;
  for (const location of ["rental", "car interior", "restaurant", "private restaurant room"]) {
    const quote = `We are now inside the ${location}.`;
    scene = reduceSceneTurn(scene, { userText: quote, modelScene: { location }, sceneEvidence: { location: proof(quote) } });
    assert.equal(scene.location, location);
    assert.equal(scene.characterLocation, location);
    assert.equal(scene.userLocation, location);
  }
});

test("remote user movement cannot teleport the character", () => {
  const quote = "I am back inside my rental.";
  const result = update(quote, { location: "rental", posture: "standing" }, { location: proof(quote, "user", "user"), posture: proof(quote, "user", "user") }, { ...initial, presence: "apart" });
  assert.equal(result.scene.location, "restaurant");
  assert.equal(result.scene.userLocation, "rental");
  assert.equal(result.scene.posture, "seated");
});

test("user clothing does not bleed into the character", () => {
  const quote = "I put on a red shirt.";
  const result = update(quote, { outfit: "red shirt" }, { outfit: proof(quote, "user", "user") });
  assert.equal(result.scene.outfit, "blue dress");
  assert.equal(result.decisions[0].reason, "user_state_not_character_state");
});

test("completed character wardrobe changes accept exact evidence", () => {
  const quote = "Erica is now dressed in her yellow waitress uniform.";
  assert.equal(update(quote, { outfit: "yellow waitress uniform" }, { outfit: proof(quote, "user", "character") }).scene.outfit, "yellow waitress uniform");
});
