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
  assert.deepEqual(routeCameoSpeakers({ ...input, text: "This place is crowded." }), [hostCharacter.id]);
});

test("interjections are occasional and never override explicit addressing or picture requests", () => {
  const input = { host: hostCharacter, guest: guestCharacter };
  assert.equal(cameoInterjectionEligible({ ...input, text: "That would make excellent crispy chips." }), true);
  assert.equal(cameoInterjectionEligible({ ...input, text: "Jessie, what do you think?" }), false);
  assert.equal(cameoInterjectionEligible({ ...input, text: "What do you both think?" }), false);
  assert.equal(cameoInterjectionEligible({ ...input, text: "Send me another picture." }), false);
  assert.equal(cameoInterjectionEligible({ ...input, text: "That is interesting.", image: true }), false);
  assert.equal(cameoInterjectionEligible({ ...input, text: "That is interesting.", messages: [{ cameoInterjection: true }] }), false);
});

test("speaker-specific transcripts keep the other character distinct", () => {
  let session = beginCameoSession({
    hostThread: { character: hostCharacter, profile: profile(hostCharacter, "direct"), relationship: 75, scene: {} },
    guestCharacter,
    guestProfile: profile(guestCharacter, "theatrical"),
  });
  session = appendCameoMessage(session, { from: "user", text: "You two know each other?" });
  session = appendCameoMessage(session, { from: "character", speakerId: hostCharacter.id, text: "Unfortunately." });
  session = appendCameoMessage(session, { from: "character", speakerId: guestCharacter.id, text: "How rude!" });

  const guestThread = threadForCameoSpeaker(session, guestCharacter.id);
  assert.equal(guestThread.profile.name, guestCharacter.name);
  assert.equal(guestThread.messages[1].from, "user");
  assert.match(guestThread.messages[1].text, /^\[Misty\]:/);
  assert.equal(guestThread.messages[2].from, "character");
  assert.match(cameoPromptContext(session, guestCharacter.id), /Never write dialogue.*other character/i);
  assert.match(cameoPromptContext(session, guestCharacter.id, { groupTurn: true }), /one to three concise sentences/i);
  assert.match(cameoPromptContext(session, guestCharacter.id, { allowInterjection: true }), /Usually set it false/i);
  assert.match(cameoPromptContext(session, guestCharacter.id, { interjection: true }), /one or two concise sentences/i);
});

test("a resumed guest sees only the shared encounter while the host keeps recent private context", () => {
  const joinedAtMessageId = "joined-1";
  const hostThread = {
    character: hostCharacter,
    profile: profile(hostCharacter, "direct"),
    relationship: 75,
    scene: {},
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
  const session = resumeCameoSession({ hostThread, guestCharacter, guestProfile: profile(guestCharacter, "theatrical"), guestThread: { relationship: 62 } });
  const guestThread = threadForCameoSpeaker(session, guestCharacter.id);
  assert.equal(guestThread.relationship, 62);
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
