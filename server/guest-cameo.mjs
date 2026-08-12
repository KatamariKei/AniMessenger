import crypto from "node:crypto";

export const GUEST_CAMEO_VERSION = 1;

function cleanText(value, limit = 180) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function cleanId(value) {
  return cleanText(value, 140).replace(/[^a-zA-Z0-9()_.-]/g, "-");
}

export function characterMessageSpeakerId(message, hostCharacterId) {
  if (message?.from !== "character") return message?.from === "user" ? "user" : "system";
  return cleanId(message.speakerId) || cleanId(hostCharacterId);
}

export function normalizeCameoState(value, hostCharacterId = "") {
  if (!value || typeof value !== "object") return null;
  const activeGuest = value.activeGuest && typeof value.activeGuest === "object"
    ? {
        characterId: cleanId(value.activeGuest.characterId),
        profileId: cleanId(value.activeGuest.profileId || value.activeGuest.characterId),
        name: cleanText(value.activeGuest.name, 100),
        joinedAtMessageId: cleanId(value.activeGuest.joinedAtMessageId),
        joinedAt: cleanText(value.activeGuest.joinedAt, 40),
      }
    : null;
  const encounters = Array.isArray(value.encounters)
    ? value.encounters.map((encounter) => ({
        id: cleanId(encounter?.id),
        characterId: cleanId(encounter?.characterId),
        profileId: cleanId(encounter?.profileId || encounter?.characterId),
        name: cleanText(encounter?.name, 100),
        joinedAtMessageId: cleanId(encounter?.joinedAtMessageId),
        leftAtMessageId: cleanId(encounter?.leftAtMessageId),
        summary: cleanText(encounter?.summary, 1200),
      })).filter((encounter) => encounter.id && encounter.characterId)
    : [];
  return {
    version: GUEST_CAMEO_VERSION,
    hostCharacterId: cleanId(value.hostCharacterId || hostCharacterId),
    activeGuest: activeGuest?.characterId ? activeGuest : null,
    encounters,
  };
}

function speakerAliases(character) {
  const full = cleanText(character?.displayName || character?.name, 100)
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .trim()
    .toLowerCase();
  if (!full) return [];
  return [...new Set([full, ...full.split(/\s+/).filter((part) => part.length >= 3)])];
}

function mentioned(text, character) {
  const value = cleanText(text, 4000).toLowerCase();
  return speakerAliases(character).some((alias) => new RegExp("(^|[^a-z0-9])" + alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "([^a-z0-9]|$)", "i").test(value));
}

export function routeCameoSpeakers({ text, host, guest, lastSpeakerId = "", focusSpeakerId = "" }) {
  const hostId = cleanId(host?.id);
  const guestId = cleanId(guest?.id);
  if (!hostId || !guestId) throw new Error("Guest routing requires a host and guest character.");
  const hostMentioned = mentioned(text, host);
  const guestMentioned = mentioned(text, guest);
  const addressesGroup = /\b(?:both of you|you both|you two|either of you|everyone|all of you|what do (?:you two|you guys|all of you) think)\b/i.test(String(text || ""));
  if ((hostMentioned && guestMentioned) || addressesGroup) {
    return cleanId(lastSpeakerId) === hostId ? [guestId, hostId] : [hostId, guestId];
  }
  if (guestMentioned) return [guestId];
  if (hostMentioned) return [hostId];
  const focusedId = cleanId(focusSpeakerId);
  if (focusedId === hostId || focusedId === guestId) return [focusedId];
  if ([hostId, guestId].includes(cleanId(lastSpeakerId))) return [cleanId(lastSpeakerId)];
  return [hostId];
}

export function cameoInterjectionEligible({ text, host, guest, messages = [], image = false }) {
  if (image || mentioned(text, host) || mentioned(text, guest)) return false;
  if (/\b(?:both of you|you both|you two|either of you|everyone|all of you|what do (?:you two|you guys|all of you) think)\b/i.test(String(text || ""))) return false;
  if (/\b(?:send|show|share|take|generate|make)\b.{0,28}\b(?:photo|picture|pic|image|selfie)\b/i.test(String(text || ""))) return false;
  return !(messages || []).slice(-10).some((message) => message?.cameoInterjection);
}

export function beginCameoSession({ hostThread, guestCharacter, guestProfile, location = "a shared public place", activity = "talking together" }) {
  if (!hostThread?.character?.id || !hostThread?.profile) throw new Error("The host needs a cached character profile.");
  if (!guestCharacter?.id || !guestProfile) throw new Error("The guest needs a cached character profile.");
  const now = new Date().toISOString();
  return {
    id: "cameo-" + crypto.randomUUID(),
    version: GUEST_CAMEO_VERSION,
    host: { character: structuredClone(hostThread.character), profile: structuredClone(hostThread.profile), relationship: Number(hostThread.relationship) || 8 },
    guest: { character: structuredClone(guestCharacter), profile: structuredClone(guestProfile), relationship: 8 },
    scene: { ...structuredClone(hostThread.scene || {}), location, activity, presence: "together" },
    hostHistory: structuredClone((hostThread.messages || []).slice(-24)),
    messages: [],
    startedAt: now,
    lastSpeakerId: "",
  };
}

export function resumeCameoSession({ hostThread, guestCharacter, guestProfile, guestThread = null }) {
  const cameo = normalizeCameoState(hostThread?.cameo, hostThread?.character?.id);
  if (!cameo?.activeGuest || cameo.activeGuest.characterId !== cleanId(guestCharacter?.id)) {
    throw new Error("That guest is no longer in this conversation.");
  }
  const joinIndex = (hostThread.messages || []).findIndex((message) => message.id === cameo.activeGuest.joinedAtMessageId);
  const sharedStart = joinIndex >= 0 ? joinIndex + 1 : Math.max(0, (hostThread.messages || []).length - 28);
  const sharedMessages = structuredClone((hostThread.messages || []).slice(sharedStart));
  const lastCharacterMessage = [...sharedMessages].reverse().find((message) => message.from === "character");
  return {
    id: "cameo-" + cleanId(cameo.activeGuest.joinedAtMessageId || crypto.randomUUID()),
    version: GUEST_CAMEO_VERSION,
    host: { character: structuredClone(hostThread.character), profile: structuredClone(hostThread.profile), relationship: Number(hostThread.relationship) || 8 },
    guest: {
      character: structuredClone(guestCharacter),
      profile: structuredClone(guestProfile),
      relationship: Number(guestThread?.relationship) || 8,
    },
    scene: { ...structuredClone(hostThread.scene || {}), presence: "together" },
    hostHistory: structuredClone((hostThread.messages || []).slice(0, Math.max(0, sharedStart - 1)).slice(-24)),
    messages: sharedMessages,
    startedAt: cameo.activeGuest.joinedAt || new Date().toISOString(),
    lastSpeakerId: lastCharacterMessage ? characterMessageSpeakerId(lastCharacterMessage, hostThread.character.id) : "",
  };
}

function encounterExcerpt(value, limit = 110) {
  const text = cleanText(value, limit + 20).replace(/^\[(?:action|thought):\s*/i, "").replace(/\]$/, "");
  return text.length > limit ? text.slice(0, limit - 1).trimEnd() + "…" : text;
}

export function summarizeCameoEncounter(hostThread, activeGuest) {
  const messages = Array.isArray(hostThread?.messages) ? hostThread.messages : [];
  const joinIndex = messages.findIndex((message) => message.id === activeGuest?.joinedAtMessageId);
  const shared = messages.slice(joinIndex >= 0 ? joinIndex + 1 : Math.max(0, messages.length - 24));
  const userHighlights = shared
    .filter((message) => message.from === "user" && message.text)
    .map((message) => encounterExcerpt(message.text))
    .filter((text) => text.length >= 8)
    .slice(-3);
  const hostName = cleanText(hostThread?.character?.displayName || hostThread?.character?.name, 100) || "the host character";
  const guestName = cleanText(activeGuest?.name, 100) || "the guest character";
  const participants = "The user, " + hostName + ", and " + guestName + " shared a conversation";
  if (!userHighlights.length) return participants + ".";
  return participants + ". The user brought up: " + userHighlights.map((text) => "“" + text + "”").join("; ") + ".";
}

export function appendCameoMessage(session, message) {
  const next = structuredClone(session);
  const copy = { ...structuredClone(message), id: message.id || crypto.randomUUID(), time: message.time || new Date().toISOString() };
  next.messages.push(copy);
  if (copy.from === "character") next.lastSpeakerId = characterMessageSpeakerId(copy, next.host.character.id);
  return next;
}

export function threadForCameoSpeaker(session, speakerId) {
  const hostId = cleanId(session.host.character.id);
  const guestId = cleanId(session.guest.character.id);
  const selected = cleanId(speakerId) === guestId ? session.guest : session.host;
  const other = cleanId(speakerId) === guestId ? session.host : session.guest;
  const sharedMessages = session.messages.map((message) => {
    if (message.from === "system") return message;
    if (message.from === "user") return { ...message, text: "[User]: " + cleanText(message.text, 8000) };
    const messageSpeakerId = characterMessageSpeakerId(message, hostId);
    if (messageSpeakerId === cleanId(selected.character.id)) return { ...message, from: "character" };
    return { ...message, from: "user", text: "[" + cleanText(other.profile.name || other.character.name, 100) + "]: " + cleanText(message.text, 8000) };
  });
  const visibleMessages = cleanId(selected.character.id) === hostId
    ? [...structuredClone(session.hostHistory || []), ...sharedMessages]
    : sharedMessages;
  return {
    id: "prototype-" + selected.character.id,
    character: structuredClone(selected.character),
    profile: structuredClone(selected.profile),
    messages: visibleMessages,
    memories: [],
    relationship: selected.relationship,
    scene: structuredClone(session.scene),
    updatedAt: new Date().toISOString(),
  };
}

export function cameoPromptContext(session, speakerId, options = {}) {
  const selected = cleanId(speakerId) === cleanId(session.guest.character.id) ? session.guest : session.host;
  const other = selected === session.guest ? session.host : session.guest;
  return [
    "SHARED CAMEO SCENE: You are in the same conversation as " + cleanText(other.profile.name || other.character.name, 100) + " and the user.",
    "Reply only as " + cleanText(selected.profile.name || selected.character.name, 100) + ". Never write dialogue, actions, thoughts, or decisions for the other character or the user.",
    "Lines labeled [" + cleanText(other.profile.name || other.character.name, 100) + "] are the other character speaking. Treat them as visible shared conversation, not as the user and not as your own prior dialogue.",
    "Keep your voice distinct. You may respond to the other character, the user, or both, but do not summarize the entire scene and do not announce speaker labels in your reply.",
    options.groupTurn
      ? "BOTH CHARACTERS ARE RESPONDING THIS TURN: Make one focused contribution, usually one to three concise sentences. Leave conversational space for the other character instead of delivering a complete monologue."
      : "",
    options.interjection
      ? "You are adding an occasional interjection after the other character has already answered. Contribute one distinct, directly relevant thought in one or two concise sentences. Do not merely agree, restate, police, scold, or summarize what was just said. Set otherShouldRespond false."
      : options.allowInterjection
        ? "TURN-TAKING: The other character may occasionally have a worthwhile brief contribution after you answer. Set otherShouldRespond true only when their distinct perspective is unusually relevant and a second bubble would materially improve this exact moment. Routine agreement, commentary, teasing, correction, supervision, scolding, or repeating your point does not qualify. Usually set it false."
        : "Set otherShouldRespond false.",
    "This is a temporary encounter. Do not claim private knowledge about the other character's relationship with the user unless it was stated in this shared transcript.",
  ].filter(Boolean).join("\n");
}
