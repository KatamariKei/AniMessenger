import assert from "node:assert/strict";
import test from "node:test";
import { environmentChangeIsEstablished, environmentForLocation, inferEnvironmentCue, inferExplicitLocation, isDetailedEnvironment, locationChangeIsEstablished, meaningfulLocationChange, stabilizeEnvironment } from "../server/environment.mjs";

test("extracts a visually described landscape from an in-person action", () => {
  const cue = inferEnvironmentCue("[action: Pyra opens the door and we step outside. My eyes adjust to a vast cloud sea, rolling green hills, craggy mountains, and grass waving in the wind.] Wow!");
  assert.match(cue, /cloud sea/i);
  assert.match(cue, /craggy mountains/i);
  assert.match(cue, /grass waving/i);
});

test("preserves detailed surroundings when a model falls back to a vague label", () => {
  const current = "vast cloud sea, rolling green fields, distant craggy mountains";
  assert.equal(stabilizeEnvironment(current, "outside", "We keep walking."), current);
  assert.equal(stabilizeEnvironment(current, "the surroundings", "We keep talking."), current);
});

test("generic indoor environments do not invent a doorway composition", () => {
  const bedroom = environmentForLocation("bedroom");
  assert.match(bedroom, /walls, floor, furniture/i);
  assert.doesNotMatch(bedroom, /\b(?:door|doorway|frame)\b/i);
});

test("accepts a newly established detailed environment", () => {
  const next = stabilizeEnvironment("sunlit green fields beneath a cloud sea", "quiet stone temple interior, carved pillars, blue torchlight", "We enter the temple and see carved stone pillars under blue torchlight.");
  assert.match(next, /stone temple|carved stone pillars/i);
  assert.equal(environmentChangeIsEstablished("We enter the temple and see carved stone pillars."), true);
  assert.equal(isDetailedEnvironment(next), true);
});

test("does not mistake an ordinary object mention for a new environment", () => {
  assert.equal(inferEnvironmentCue("I bought a wooden table yesterday."), "");
});

test("does not persist a character's gaze or pose as the environment", () => {
  const direction = "looks toward the window with a soft, distant expression Like this";
  assert.equal(isDetailedEnvironment(direction), false);
  assert.equal(
    stabilizeEnvironment(
      "A cozy living room with a sofa, low table, curtained windows, and warm lamplight.",
      direction,
      "She looks toward the window.",
      { currentLocation: "living room", nextLocation: "living room" },
    ),
    "A cozy living room with a sofa, low table, curtained windows, and warm lamplight.",
  );
});

test("does not persist an action beat and dialogue as the environment", () => {
  assert.equal(isDetailedEnvironment("strikes a confident pose in her athletic gear Now that I'm ready, let's head to the game room"), false);
});

test("repairs a legacy pose saved in the environment field from its location", () => {
  const repaired = stabilizeEnvironment(
    "looks toward the window with a soft, distant expression Like this",
    "",
    "They continue talking.",
    { currentLocation: "living room", nextLocation: "living room" },
  );
  assert.match(repaired, /comfortable living room/i);
  assert.doesNotMatch(repaired, /looks toward/i);
});

test("a meaningful new location cannot retain the previous detailed environment", () => {
  const garden = "An ethereal moonlit garden with oversized glowing flowers and floating crystal shards.";
  const room = stabilizeEnvironment(garden, garden, "She comes through the portal and lands beside me.", {
    currentLocation: "Aensland Estate Gardens",
    nextLocation: "the viewer's room",
  });
  assert.equal(meaningfulLocationChange("Aensland Estate Gardens", "the viewer's room"), true);
  assert.match(room, /Inside the viewer's room/i);
  assert.match(room, /walls.*furniture/i);
  assert.doesNotMatch(room, /glowing flowers|crystal shards/i);
  assert.match(environmentForLocation("the viewer's room"), /walls.*furniture/i);
  assert.doesNotMatch(environmentForLocation("the viewer's room"), /previous location|no garden/i);
  assert.match(environmentForLocation("Hidden cave behind Lucifer Falls"), /rocky cave chamber.*stone walls/i);
});

test("a location transition prefers a genuinely new detailed environment", () => {
  const room = stabilizeEnvironment(
    "moonlit garden with glowing flowers",
    "A compact bedroom with a low bed, wooden desk, computer monitor, pale walls, and a closed door.",
    "She steps through the portal.",
    { currentLocation: "Aensland Estate Gardens", nextLocation: "the viewer's room" },
  );
  assert.match(room, /compact bedroom/i);
  assert.doesNotMatch(room, /moonlit garden/i);
});

test("an activity association cannot silently replace the established location", () => {
  const conversation = "We are playing air hockey. The puck ricochets off the table rail and goes into the goal.";
  assert.equal(meaningfulLocationChange("Leisure Wing", "the Leisure Wing"), false);
  assert.equal(locationChangeIsEstablished("Leisure Wing", "Ice Rink", conversation), false);
  assert.equal(locationChangeIsEstablished("Leisure Wing", "Ice Rink", "We arrive at the ice rink and step onto the ice."), true);
});

test("an explicit present-location statement can correct a mistaken scene", () => {
  assert.equal(locationChangeIsEstablished("Ice Rink", "Leisure Wing", "We're still in the Leisure Wing playing at the air hockey table."), true);
});

test("a remote character's current activity can establish a newly reported location", () => {
  const report = "Just taking a break from training while the others finish cleaning the gym. I've been hitting the weights since early this morning.";
  assert.equal(locationChangeIsEstablished("Arcade", "C&C Training Gym", report), true);
});

test("plans and casual place mentions do not change the current location", () => {
  assert.equal(locationChangeIsEstablished("Arcade", "C&C Training Gym", "Maybe I'll head to the gym later and do some training."), false);
  assert.equal(locationChangeIsEstablished("Leisure Wing", "Ice Rink", "Air hockey is basically hockey inside an arcade."), false);
});

test("a knock at the viewer's door establishes a completed arrival", () => {
  assert.equal(
    locationChangeIsEstablished("Millennium Gym Locker Room", "the viewer's home", "I hear a knock at my door. It's Neru. Hey, welcome!"),
    true,
  );
});

test("extracts an explicit current room from a user action", () => {
  const text = "[action: Ok, we're in the kitchen now, making the parfait]";
  assert.equal(inferExplicitLocation(text), "the kitchen");
  assert.equal(locationChangeIsEstablished("the viewer's bedroom", inferExplicitLocation(text), text), true);
});

test("extracts an outdoor yard reached through natural action phrasing", () => {
  const text = "[action: we go outside in the yard and check on the construction progress]";
  assert.equal(inferExplicitLocation(text), "yard");
  assert.match(environmentForLocation("yard"), /outdoor residential space/i);
});

test("completed movement can establish a new narrative location without a place-name whitelist", () => {
  const text = "[action: we enter the moonlit crystal observatory and look through the telescope]";
  assert.equal(inferExplicitLocation(text), "the moonlit crystal observatory");
});

test("destination labels retain place qualifiers but exclude coordinated story clauses", () => {
  assert.equal(inferExplicitLocation("We arrive at the beach and she was right... it's private."), "the beach");
  assert.equal(inferExplicitLocation("We enter the moonlit crystal observatory and she smiles."), "the moonlit crystal observatory");
  assert.equal(inferExplicitLocation("We walk into the cave behind the waterfall and inspect the crystals."), "the cave behind the waterfall");
  assert.equal(inferExplicitLocation("We arrive at the Salt and Pepper cafe."), "the Salt and Pepper cafe");
});

test("does not invent a location from ordinary conversation or future plans", () => {
  assert.equal(inferExplicitLocation("We're in trouble if we burn the parfait."), "");
  assert.equal(inferExplicitLocation("We'll go into the kitchen later."), "");
});

test("relative movement does not establish an independent destination", () => {
  for (const destination of ["the other side", "the far end", "the opposite edge", "over there"]) {
    assert.equal(inferExplicitLocation(`We race to ${destination} and arrive at the same time.`), "");
    assert.equal(locationChangeIsEstablished("Mansion indoor pool", destination, `We arrive at ${destination}.`), false);
  }
  assert.equal(inferExplicitLocation("We arrive at the massive indoor pool and wait for her."), "the massive indoor pool");
});

test("figurative room language is not an environment", () => {
  assert.equal(isDetailedEnvironment("There is no room for error now."), false);
  assert.equal(isDetailedEnvironment("The room is moving a little bit because it's exciting"), false);
  assert.match(environmentForLocation("massive indoor pool"), /clear water.*high ceiling/i);
});
