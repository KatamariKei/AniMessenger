import assert from "node:assert/strict";
import test from "node:test";
import { appendCameoMessage, beginCameoSession, cameoInterjectionEligible, cameoPromptContext, characterMessageSpeakerId, normalizeCameoState, resumeCameoSession, routeCameoSpeakers, summarizeCameoEncounter, threadForCameoSpeaker } from "../server/guest-cameo.mjs";

const hostCharacter = { id: "misty_(pokemon)", name: "Misty", series: "Pokemon" };
const guestCharacter = { id: "jessie_(pokemon)", name: "Jessie (Pokemon)", series: "Pokemon" };
const profile = (character, voice) => ({ id: character.id, name: character.name, series: character.series, age: 22, summary: voice, visual: { identity: [], signature: [], defaultWardrobe: "default" }, persona: { traits: [], mannerisms: [], speechStyle: voice, emotionalRules: [] }, canon: { overview: "", history: [], relationships: [], knowledge: [], boundaries: [] } });

test("legacy character messages resolve to the host without migration", () => {
  assert.equal(characterMessageSpeakerId({ from: "character", text: "Hi" }, hostCharacter.id), hostCharacter.id);
  assert.equal(characterMessageSpeakerId({ from: "character", speakerId: guestCharacter.id }, hostCharacter.id), guestCharacter.id);
});

test("cameo state normalization is optional and backward compatible", () => {
  assert.equal(normalizeCameoState(undefined, hostCharacter.id), null);
  assert.deepEqual(normalizeCameoState({ activeGuest: null, encounters: [] }, hostCharacter.id), {
    version: 1,
    hostCharacterId: hostCharacter.id,
    activeGuest: null,
    encounters: [],
  });
});

test("routing favors direct address, group address, follow-ups, then the host", () => {
  const input = { host: hostCharacter, guest: guestCharacter };
  assert.deepEqual(routeCameoSpeakers({ ...input, text: "Jessie, what do you think?" }), [guestCharacter.id]);
  assert.deepEqual(routeCameoSpeakers({ ...input, text: "Misty, your turn." }), [hostCharacter.id]);
  assert.deepEqual(routeCameoSpeakers({ ...input, text: "What do you both think?" }), [hostCharacter.id, guestCharacter.id]);
  assert.deepEqual(routeCameoSpeakers({ ...input, text: "What do you both think?", lastSpeakerId: hostCharacter.id }), [guestCharacter.id, hostCharacter.id]);
  assert.deepEqual(routeCameoSpeakers({ ...input, text: "Really?", lastSpeakerId: guestCharacter.id }), [guestCharacter.id]);
  assert.deepEqual(routeCameoSpeakers({ ...input, text: "That would make excellent crispy chips.", lastSpeakerId: guestCharacter.id }), [guestCharacter.id]);
  assert.deepEqual(routeCameoSpeakers({ ...input, text: "Try smiling this time.", focusSpeakerId: guestCharacter.id }), [guestCharacter.id]);
  assert.deepEqual(routeCameoSpeakers({ ...input, text: "That picture looks great.", focusSpeakerId: guestCharacter.id }), [guestCharacter.id]);
  assert.deepEqual(routeCameoSpeakers({ ...input, text: "Misty, your turn.", focusSpeakerId: guestCharacter.id }), [hostCharacter.id]);
  assert.deepEqual(routeCameoSpeakers({ ...input, text: "Both of you try again.", focusSpeakerId: guestCharacter.id }), [hostCharacter.id, guestCharacter.id]);
  assert.deepEqual(routeCameoSpeakers({ ...input, text: "What's your name? Can you speak?", lastSpeakerId: hostCharacter.id, focusSpeakerId: hostCharacter.id, guestNeedsFirstTurn: true }), [guestCharacter.id]);
  assert.deepEqual(routeCameoSpeakers({ ...input, text: "Misty, tell her what happened.", guestNeedsFirstTurn: true }), [hostCharacter.id]);
  assert.deepEqual(routeCameoSpeakers({ ...input, text: "This place is crowded." }), [hostCharacter.id]);
});

test("guest mentions in actions or in conversation do not turn one question into a group reply", () => {
  const host = { id: "erica", name: "Erica Anderson" };
  const guest = { id: "rin", name: "Rin" };
  const route = (text) => routeCameoSpeakers({ host, guest, text, lastSpeakerId: guest.id });
  assert.deepEqual(route("I'm glad, Rin! [action: I thank Erica for the drink] So, Rin... how are things?"), [guest.id]);
  assert.deepEqual(route("Erica! What do you think I would convince Rin to do?"), [host.id]);
  assert.deepEqual(route("Go ahead, Erica. Rin is curious."), [host.id]);
  assert.deepEqual(route("Erica, what do you think? Rin, how about you?"), [host.id, guest.id]);
  assert.deepEqual(route("[action: both of you sit down] Rin, are you playing tonight?"), [guest.id]);
});

test("the server keeps every guest speaker in the active conversation mode", async () => {
  const source = await import("node:fs/promises").then((fs) => fs.readFile(new URL("../server/index.mjs", import.meta.url), "utf8"));
  assert.match(source, /conversationMode:\s*working\.conversationMode/);
  assert.doesNotMatch(source, /conversationMode:\s*speakerIndex\s*===\s*0/);
  assert.match(source, /working\.conversationMode\s*===\s*"story"[\s\S]*?result\.narration\s*\|\|\s*result\.reply/);
});

test("a named first speaker can hand off to the other participant without overriding routing or picture requests", () => {
  const input = { host: hostCharacter, guest: guestCharacter };
  assert.equal(cameoInterjectionEligible({ ...input, text: "That would make excellent crispy chips." }), true);
  assert.equal(cameoInterjectionEligible({ ...input, text: "Jessie, what do you think?" }), true);
  assert.deepEqual(routeCameoSpeakers({ ...input, text: "Jessie, what do you think?" }), [guestCharacter.id]);
  const arrival = { host: { id: "mira", name: "Mira" }, guest: { id: "sora", name: "Sora" },
    text: "[action: Sora arrives at Mira's workbench]", guestNeedsFirstTurn: true };
  assert.deepEqual(routeCameoSpeakers(arrival), ["sora"]);
  assert.equal(cameoInterjectionEligible(arrival), true);
  assert.equal(cameoInterjectionEligible({ ...arrival, messages: [{ cameoInterjection: true }] }), true);
  assert.equal(cameoInterjectionEligible({ ...input, text: "What do you both think?" }), false);
  assert.equal(cameoInterjectionEligible({ ...input, text: "Send me another picture." }), false);
  assert.equal(cameoInterjectionEligible({ ...input, text: "That is interesting.", image: true }), false);
  assert.equal(cameoInterjectionEligible({ ...input, text: "That is interesting.", messages: [{ cameoInterjection: true }] }), false);
});

test("speaker-specific transcripts keep the other character distinct", () => {
  let session = beginCameoSession({
    hostThread: { character: hostCharacter, profile: profile(hostCharacter, "direct"), relationship: 75, scene: { outfit: "yellow raincoat", expression: "focused" } },
    guestCharacter,
    guestProfile: { ...profile(guestCharacter, "theatrical"), visual: { identity: [], signature: [], defaultWardrobe: "white suit" } },
  });
  session = appendCameoMessage(session, { from: "user", text: "You two know each other?" });
  session = appendCameoMessage(session, { from: "character", speakerId: hostCharacter.id, text: "Unfortunately." });
  session = appendCameoMessage(session, { from: "character", speakerId: guestCharacter.id, text: "How rude!" });

  const guestThread = threadForCameoSpeaker(session, guestCharacter.id);
  const hostThread = threadForCameoSpeaker(session, hostCharacter.id);
  assert.equal(guestThread.profile.name, guestCharacter.name);
  assert.equal(hostThread.scene.outfit, "yellow raincoat");
  assert.equal(hostThread.scene.expression, "focused");
  assert.equal(guestThread.scene.outfit, "white suit");
  assert.notEqual(guestThread.scene.expression, "focused");
  assert.equal(guestThread.messages[1].from, "user");
  assert.match(guestThread.messages[1].text, /^\[Misty\]:/);
  assert.equal(guestThread.messages[2].from, "character");
  assert.match(cameoPromptContext(session, guestCharacter.id), /Never write dialogue.*other character/i);
  assert.match(cameoPromptContext(session, guestCharacter.id, { groupTurn: true }), /one to three concise sentences/i);
  const firstStorySegment = cameoPromptContext(session, hostCharacter.id, {
    groupTurn: true,
    storyMode: true,
    groupSpeakerIndex: 0,
    groupSpeakerCount: 2,
  });
  const finalStorySegment = cameoPromptContext(session, guestCharacter.id, {
    groupTurn: true,
    storyMode: true,
    groupSpeakerIndex: 1,
    groupSpeakerCount: 2,
  });
  assert.match(firstStorySegment, /HANDOFF SEGMENT/);
  assert.match(firstStorySegment, /naturally yields to Jessie/);
  assert.doesNotMatch(firstStorySegment, /forward pressure/i);
  assert.match(finalStorySegment, /FINAL SEGMENT/);
  assert.match(finalStorySegment, /forward pressure/i);
  assert.match(finalStorySegment, /opportunity the user can naturally act on/i);
  assert.match(cameoPromptContext(session, guestCharacter.id, { allowInterjection: true }), /Usually set it false/i);
  assert.match(cameoPromptContext(session, guestCharacter.id, { allowInterjection: true }), /respond to YOU as well as the user/);
  assert.match(cameoPromptContext(session, guestCharacter.id, { interjection: true }), /one or two concise sentences/i);
});

test("a second Story speaker receives the previous passage with its speaker label", () => {
  let session = beginCameoSession({
    hostThread: { character: hostCharacter, profile: profile(hostCharacter, "direct") },
    guestCharacter,
    guestProfile: profile(guestCharacter, "theatrical"),
  });
  session = appendCameoMessage(session, { from: "user", text: "What do you both think?" });
  const narration = 'Misty set the glass down.\n\n"No, that was my idea," she said.';
  session = appendCameoMessage(session, { from: "character", speakerId: hostCharacter.id, text: "", narration });
  const messages = threadForCameoSpeaker(session, guestCharacter.id).messages;
  assert.deepEqual(messages.map(message => message.text), ["[User]: What do you both think?", "[Misty]: " + narration]);
});

test("a resumed guest sees only the shared encounter while the host keeps recent private context", () => {
  const joinedAtMessageId = "joined-1";
  const hostThread = {
    character: hostCharacter,
    profile: profile(hostCharacter, "direct"),
    relationship: 75,
    scene: { outfit: "yellow raincoat", expression: "focused" },
    messages: [
      { id: "private-1", from: "user", text: "My private secret is apricot.", time: "2026-01-01T00:00:00Z" },
      { id: "private-2", from: "character", text: "I'll remember.", time: "2026-01-01T00:00:01Z" },
      { id: joinedAtMessageId, from: "system", text: "Jessie joined.", time: "2026-01-01T00:00:02Z" },
      { id: "shared-1", from: "user", text: "Welcome, Jessie.", time: "2026-01-01T00:00:03Z" },
    ],
    cameo: {
      version: 1,
      hostCharacterId: hostCharacter.id,
      activeGuest: { characterId: guestCharacter.id, profileId: guestCharacter.id, name: guestCharacter.name, joinedAtMessageId, joinedAt: "2026-01-01T00:00:02Z" },
      encounters: [],
    },
  };
  const session = resumeCameoSession({ hostThread, guestCharacter, guestProfile: profile(guestCharacter, "theatrical"), guestThread: { relationship: 62, scene: { outfit: "white suit", expression: "amused" } } });
  const guestThread = threadForCameoSpeaker(session, guestCharacter.id);
  assert.equal(guestThread.relationship, 62);
  assert.equal(guestThread.scene.outfit, "white suit");
  assert.equal(guestThread.scene.expression, "amused");
  const resumedHostThread = threadForCameoSpeaker(session, hostCharacter.id);
  assert.doesNotMatch(guestThread.messages.map((message) => message.text).join(" "), /apricot/i);
  assert.match(resumedHostThread.messages.map((message) => message.text).join(" "), /apricot/i);
  assert.match(guestThread.messages.map((message) => message.text).join(" "), /Welcome, Jessie/i);
});

test("an ended encounter creates a bounded shared summary from only the shared transcript", () => {
  const joinedAtMessageId = "joined-summary";
  const hostThread = {
    character: hostCharacter,
    messages: [
      { id: "private", from: "user", text: "My private password is apricot." },
      { id: joinedAtMessageId, from: "system", text: "Jessie joined." },
      { id: "shared-1", from: "user", text: "Let's name our ramen shop Moon Broth." },
      { id: "shared-2", from: "character", speakerId: guestCharacter.id, text: "Dramatic, but memorable." },
    ],
  };
  const summary = summarizeCameoEncounter(hostThread, { ...guestCharacter, joinedAtMessageId });
  assert.match(summary, /Moon Broth/);
  assert.doesNotMatch(summary, /apricot/);
  assert.ok(summary.length <= 500);
});
