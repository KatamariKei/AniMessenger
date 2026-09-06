export const FIRST_CONTACT_VERSION = 1;

const modes = new Set(["remote", "in_person", "world_link"]);

function text(value, fallback = "") {
  return String(value ?? "").replace(/\s+/g, " ").trim() || fallback;
}

function openingKey(opening) {
  return [opening?.title, opening?.contactMode, opening?.location || opening?.scene?.location]
    .map((value) => text(value).toLowerCase())
    .join("|");
}

export function rejectedOpeningRecord(scenario) {
  if (!scenario) return null;
  return {
    title: text(scenario.title),
    premise: text(scenario.premise),
    contactMode: modes.has(scenario.contactMode) ? scenario.contactMode : "in_person",
    location: text(scenario.location || scenario.scene?.location),
    connection: text(scenario.connection),
  };
}

export function rejectedOpeningHistory(firstContact, limit = 8) {
  const candidates = [
    ...(Array.isArray(firstContact?.rejectedOpenings) ? firstContact.rejectedOpenings : []),
    rejectedOpeningRecord(firstContact),
  ].filter(Boolean);
  const unique = new Map();
  for (const candidate of candidates) unique.set(openingKey(candidate), candidate);
  return [...unique.values()].slice(-limit);
}

function meaningfulWords(opening) {
  return new Set([opening?.title, opening?.premise, opening?.connection, opening?.location || opening?.scene?.location]
    .join(" ")
    .toLowerCase()
    .match(/[a-z]{4,}/g)
    ?.filter((word) => !new Set(["with", "from", "that", "this", "your", "their", "where", "when", "into", "through", "character"]).has(word)) || []);
}

export function openingsAreTooSimilar(left, right) {
  if (!left || !right) return false;
  const leftLocation = text(left.location || left.scene?.location).toLowerCase();
  const rightLocation = text(right.location || right.scene?.location).toLowerCase();
  if (leftLocation && rightLocation && leftLocation === rightLocation) return true;
  const a = meaningfulWords(left);
  const b = meaningfulWords(right);
  if (!a.size || !b.size) return false;
  const overlap = [...a].filter((word) => b.has(word)).length;
  return overlap / Math.min(a.size, b.size) >= 0.48;
}

export function normalizeFirstContactScenario(raw, profile, character) {
  const contactMode = modes.has(raw?.contactMode) ? raw.contactMode : "in_person";
  const presence = contactMode === "in_person" ? "together" : "apart";
  const defaultWardrobe = text(profile?.visual?.userOverrides?.defaultWardrobe || profile?.visual?.defaultWardrobe, "character-appropriate default outfit");
  const location = text(raw?.scene?.location, text(character?.series, "an unfamiliar place"));
  const environment = text(raw?.scene?.environment, "A character-appropriate setting with distinct, visible surroundings that establish the first meeting.");

  return {
    version: FIRST_CONTACT_VERSION,
    status: "preview",
    title: text(raw?.title, "An unexpected beginning"),
    premise: text(raw?.premise, `${text(character?.name, "Someone")} is within reach, and a new conversation is about to begin.`),
    contactMode,
    connection: text(raw?.connection, contactMode === "in_person" ? "You are close enough to speak naturally." : "A world-appropriate connection has opened between you."),
    scene: {
      location,
      environment,
      activity: text(raw?.scene?.activity, "noticing your arrival"),
      outfit: defaultWardrobe,
      expression: text(raw?.scene?.expression, "a natural first-meeting expression"),
      lighting: text(raw?.scene?.lighting, "character-appropriate ambient light"),
      presence,
    },
    openingLine: text(raw?.openingLine, text(profile?.openingLine, "You're here.")),
    generatedAt: new Date().toISOString(),
    startedAt: null,
    ...(Array.isArray(raw?.rejectedOpenings) ? { rejectedOpenings: raw.rejectedOpenings.slice(-8) } : {}),
  };
}

export function firstContactCanChange(thread) {
  return Boolean(
    thread?.profile
    && thread?.firstContact?.status === "preview"
    && !(thread.messages || []).some((message) => message.from === "user"),
  );
}

export function firstContactPreviewMatches(thread, generatedAt) {
  return firstContactCanChange(thread)
    && Boolean(generatedAt)
    && thread.firstContact.generatedAt === generatedAt;
}

export function activateFirstContact(thread, openingMessage) {
  if (!firstContactCanChange(thread)) throw new Error("This adventure has already begun.");
  return {
    ...thread,
    messages: [...(thread.messages || []), openingMessage],
    scene: { ...thread.scene, ...thread.firstContact.scene },
    firstContact: {
      ...thread.firstContact,
      status: "started",
      startedAt: openingMessage.time || new Date().toISOString(),
    },
  };
}

export function openingSceneBrief(thread) {
  const scenario = thread?.firstContact;
  const name = text(thread?.character?.displayName || thread?.character?.name, "the character");
  return [
    "OPENING SCENE ESTABLISHING IMAGE",
    "A cinematic environmental character portrait that establishes the beginning of the adventure; this is not a selfie and not a photo being sent in-world",
    name + " naturally engaged in " + text(scenario?.scene?.activity, "the opening moment"),
    "show enough of the distinctive surroundings to make " + text(scenario?.scene?.location, "the setting") + " immediately recognizable",
    "medium-wide or three-quarter composition at eye level, balanced character and environment, natural character-appropriate expression",
    "external observer view, solo character focus, no user or viewer visible, no phone, no handheld camera, no photo-taking gesture",
  ].join("; ");
}

export function openingSceneJobMatches(thread, job) {
  return Boolean(
    thread?.firstContact?.status === "started"
    && job?.scenarioGeneratedAt
    && job.scenarioGeneratedAt === thread.firstContact.generatedAt,
  );
}

export function insertOpeningSceneMessage(thread, openingMessageId, imageMessage) {
  if (!imageMessage || thread?.messages?.some((message) => message.imageOrigin === "opening_scene")) return thread;
  const messages = [...(thread?.messages || [])];
  const index = messages.findIndex((message) => message.id === openingMessageId);
  messages.splice(index >= 0 ? index + 1 : messages.length, 0, imageMessage);
  return { ...thread, messages };
}
