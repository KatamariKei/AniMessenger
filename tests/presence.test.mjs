import assert from "node:assert/strict";
import test from "node:test";
import {
  currentPresence,
  inferPresenceCue,
  inferPresenceFromHistory,
  presencePromptGuidance,
  presenceSceneCue,
} from "../server/presence.mjs";

test("arrival and shared physical actions establish co-presence", () => {
  assert.equal(inferPresenceCue("DING DONG! I'm here!", "apart").presence, "together");
  assert.equal(inferPresenceCue("I'm sitting right next to you.", "apart").presence, "together");
  assert.equal(inferPresenceCue("[action: I pull her into a hug.]", "apart").presence, "together");
});

test("travel and departures establish physical separation", () => {
  assert.equal(inferPresenceCue("I'm on my way. See you soon!", "together").presence, "apart");
  assert.equal(inferPresenceCue("[action: I head home.] I'll text you later.", "together").presence, "apart");
});

test("moving between rooms does not imply physical separation", () => {
  assert.equal(inferPresenceCue("[action: I throw on a robe and leave the bathroom]", "together").presence, "together");
  assert.equal(inferPresenceCue("We leave the kitchen and walk into the living room.", "together").presence, "together");
});

test("leaving to return later or texting back establishes physical separation", () => {
  assert.equal(inferPresenceCue("Why don't you come over after the gym?", "together").presence, "apart");
  assert.equal(inferPresenceCue("Just let me know when you're coming over.", "together").presence, "apart");
  assert.equal(inferPresenceCue("Nagatoro gets dressed and texts me back an hour later.", "together").presence, "apart");
});

test("ambiguous conversation preserves the established presence", () => {
  assert.equal(inferPresenceCue("What movie should we watch?", "together").presence, "together");
  assert.equal(inferPresenceCue("How was work?", "apart").presence, "apart");
});

test("arriving after an invitation resolves the character's home", () => {
  const recent = [
    { from: "character", text: "I'd love to see you at my place later." },
    { from: "user", text: "I'm on my way!" },
  ];
  const cue = inferPresenceCue("DING DONG! I'm here!", "apart", recent, "Sadayo");
  assert.deepEqual(cue, { presence: "together", location: "Sadayo's home" });
});

test("a character knocking after accepting an invitation resolves the viewer's home", () => {
  const recent = [
    { from: "user", text: "You are welcome to come over to my apartment." },
    { from: "character", text: "Fine, I'll come over so I can crush you in person!" },
    { from: "character", text: "I'm already on my way. Just be ready to lose at your place!" },
  ];
  const cue = inferPresenceCue("[action: I hear a knock at my door. It's Neru.] Hey, welcome!", "apart", recent, "Neru");
  assert.deepEqual(cue, { presence: "together", location: "the viewer's home" });
});

test("legacy threads infer their latest presence from conversation history", () => {
  const thread = {
    character: { name: "Sadayo" },
    scene: { location: "at school" },
    messages: [
      { from: "character", text: "I'd love to see you at my place later." },
      { from: "user", text: "I'll head over after work." },
      { from: "user", text: "DING DONG! I'm here!" },
      { from: "user", text: "I'm sitting right next to you." },
    ],
  };
  assert.equal(currentPresence(thread), "together");
  assert.deepEqual(presenceSceneCue(thread, "I really want to kiss you."), {
    presence: "together",
    location: "Sadayo's home",
  });
  assert.equal(inferPresenceFromHistory(thread.messages, "apart", "Sadayo").presence, "together");
});

test("presence guidance explicitly separates the interface from physical distance", () => {
  const together = presencePromptGuidance({ scene: { presence: "together" }, messages: [] });
  assert.match(together, /physically present in the same scene/i);
  assert.match(together, /chat-bubble interface.*does not mean/i);
  assert.match(together, /if you were here/i);

  const apart = presencePromptGuidance({ scene: { presence: "apart" }, messages: [] });
  assert.match(apart, /different physical locations/i);
});
