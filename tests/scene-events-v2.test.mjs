import assert from "node:assert/strict";
import test from "node:test";
import { classifyPlaceCandidate, evaluateSceneTurnV2, normalizeSceneStateV2 } from "../server/scene-events-v2.mjs";

const deck = {
  location: "rental house deck",
  environment: "A wooden deck overlooking the shoreline.",
  activity: "relaxing together after unpacking",
  outfit: "waitress uniform",
  presence: "together",
  revision: 8,
};

test("natural bathing venues remain valid scene locations", () => {
  for (const location of ["the hot spring", "the hot springs", "an onsen", "the thermal baths", "a spa"]) {
    assert.equal(classifyPlaceCandidate(location).valid, true, location);
  }
});

test("an object interaction cannot become an enclosing location", () => {
  const result = evaluateSceneTurnV2(deck, {
    characterText: "Once they reached the cooler and poured themselves fresh drinks, Erica leaned against the railing.",
    modelScene: { location: "rental house deck" },
  }, { ...deck, location: "the cooler and poured themselves fresh drinks" });
  assert.equal(result.projectedLocation, "rental house deck");
  assert.equal(result.disagreesWithLegacy, true);
  assert.ok(result.accepted.some((event) => event.kind === "interact_object" && event.payload.label === "the cooler"));
  assert.ok(!result.accepted.some((event) => event.kind === "arrive"));
  assert.equal(result.state.actors.character.posture.value, "standing");
  assert.equal(result.state.actors.character.supportObjectId.value, "object:railing");
});

test("an explicitly walk-in cooler can be a room", () => {
  const result = evaluateSceneTurnV2(deck, {
    characterText: "They entered the walk-in cooler to inventory the shelves.",
  });
  const arrival = result.accepted.find((event) => event.kind === "arrive");
  assert.equal(arrival?.payload.label, "the walk-in cooler");
  assert.equal(arrival?.payload.placeKind, "room");
});

test("future destinations never alter current place", () => {
  const result = evaluateSceneTurnV2(deck, {
    userText: "We should go to the beach tomorrow.",
  });
  assert.equal(result.projectedLocation, "rental house deck");
  assert.ok(!result.accepted.some((event) => event.kind === "arrive"));
});

test("posture is independent from activity and location", () => {
  const state = evaluateSceneTurnV2(deck, {
    userText: "[action: We sit down on the outdoor sofa and continue talking.]",
  }).state;
  assert.equal(state.actors.character.posture.value, "seated");
  assert.equal(state.actors.character.supportObjectId.value, "object:outdoor-sofa");
  assert.equal(state.places[state.actors.character.placeId.value].label, "rental house deck");
});

test("natural bed and sleep narration becomes explicit lying posture", () => {
  const climbingIn = evaluateSceneTurnV2({ location: "bedroom", presence: "together" }, {
    userText: "[action: we drop the towels and dive into the bed completely naked and cuddle up]",
  });
  const bedPosture = climbingIn.accepted.find((event) => event.kind === "set_posture");
  assert.equal(bedPosture?.payload.posture, "lying");
  assert.equal(bedPosture?.payload.supportObjectLabel, "bed");

  const sleeping = evaluateSceneTurnV2({ location: "bedroom", presence: "together" }, {
    userText: "[action: we slept hard and deep while the ocean breeze moved through the room]",
  });
  const sleepPosture = sleeping.accepted.find((event) => event.kind === "set_posture");
  assert.equal(sleepPosture?.payload.posture, "lying");
  assert.equal(sleepPosture?.payload.activity, "sleeping");
  assert.equal(sleepPosture?.payload.eyes, "closed");
});

test("a future plan to sleep does not become current posture", () => {
  const evaluation = evaluateSceneTurnV2({ location: "bedroom", presence: "together" }, {
    userText: "We will sleep in the bed later.",
  });
  const posture = evaluation.candidates.find((event) => event.kind === "set_posture");
  assert.equal(posture?.validation.status, "rejected");
  assert.equal(posture?.validation.reason, "future_asserted:explicit_posture");
});

test("multiple posture transitions resolve in textual order", () => {
  const satLast = evaluateSceneTurnV2({ location: "the beach", presence: "together" }, {
    characterText: "Erica stood up, fetched two drinks, and sat back down in her lounger.",
  });
  const satEvents = satLast.accepted.filter((event) => event.kind === "set_posture");
  assert.deepEqual(satEvents.map((event) => event.payload.posture), ["standing", "seated"]);
  assert.equal(satLast.state.actors.character.posture.value, "seated");

  const stoodLast = evaluateSceneTurnV2({ location: "the beach", presence: "together" }, {
    characterText: "Erica sat down for a moment and then stood back up.",
  });
  const stoodEvents = stoodLast.accepted.filter((event) => event.kind === "set_posture");
  assert.deepEqual(stoodEvents.map((event) => event.payload.posture), ["seated", "standing"]);
  assert.equal(stoodLast.state.actors.character.posture.value, "standing");
});

test("shifting back into a lounger establishes seated support", () => {
  const evaluation = evaluateSceneTurnV2({ location: "the beach", presence: "together" }, {
    characterText: "She shifted back into her lounger and took another sip.",
  });
  const posture = evaluation.accepted.find((event) => event.kind === "set_posture");
  assert.equal(posture?.payload.posture, "seated");
  assert.equal(posture?.payload.supportObjectLabel, "lounger");
});

test("legacy imports are provisional instead of silently treated as proven", () => {
  const state = normalizeSceneStateV2({ ...deck, location: "the cooler and poured themselves fresh drinks" });
  assert.equal(state.actors.character.placeId.status, "unknown");
  assert.deepEqual(state.places, {});
});

test("place classification distinguishes objects and inhabitable rooms", () => {
  assert.deepEqual(classifyPlaceCandidate("the cooler and poured themselves fresh drinks", "they reached it"), {
    valid: false,
    label: "the cooler",
    kind: "object",
    reason: "destination_is_object",
  });
  assert.equal(classifyPlaceCandidate("the moonlit crystal observatory").valid, true);
  assert.equal(classifyPlaceCandidate("the walk-in cooler").kind, "room");
});
