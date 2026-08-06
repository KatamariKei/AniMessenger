export const INTERACTION_PRESENCE = Object.freeze({
  apart: "apart",
  together: "together",
  uncertain: "uncertain",
});

function clean(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function validPresence(value) {
  return Object.prototype.hasOwnProperty.call(INTERACTION_PRESENCE, value);
}

function explicitTogether(text) {
  const value = clean(text);
  if (!value) return false;
  return [
    /\b(?:i(?:'m| am)|we(?:'re| are)) (?:already )?(?:right )?here\b/,
    /\b(?:i(?:'m| am)|we(?:'re| are)) (?:physically )?(?:with|beside|next to) you\b/,
    /\b(?:i(?:'m| am) )?(?:sitting|standing|lying|laying|kneeling) (?:right )?(?:next to|beside|in front of|behind) you\b/,
    /\b(?:i |we )?(?:sit|sat|move|walk|slide|lie|lay|stand) (?:down )?(?:next to|beside|over to|toward) (?:you|her|him|them)\b/,
    /\b(?:i |we )?(?:kiss|hug|embrace|touch|hold|grab|pull|cuddle|stroke|caress) (?:you|her|him|them)\b/,
    /\b(?:you|she|he|they) (?:kiss|hug|embrace|touch|hold|grab|pull|cuddle|stroke|caress)(?:es|s)? me\b/,
    /\bding dong\b[\s\S]*\bi(?:'m| am) here\b/,
    /\b(?:open|answer) the door\b[\s\S]*\b(?:i(?:'m| am)|you(?:'re| are)) here\b/,
  ].some((pattern) => pattern.test(value));
}

function explicitApart(text) {
  const value = clean(text);
  if (!value) return false;
  return [
    /\b(?:i(?:'m| am)|we(?:'re| are)) on (?:my|our|the) way\b/,
    /\b(?:i(?:'m| am)|we(?:'re| are)) (?:heading|driving|walking) (?:over|there|to your|to the)\b/,
    /\b(?:i(?:'ll| will)|we(?:'ll| will)) (?:be there|come over|head over|see you) (?:soon|later|tonight|tomorrow|in a bit)\b/,
    /\bwhen (?:i|we) (?:get|arrive) there\b/,
    /\b(?:i(?:'m| am)|we(?:'re| are)) (?:leaving|heading home|going home)\b/,
    /\b(?:i |we )?(?:leave|left|head home|go home|walk away|drive away)\b/,
    /\b(?:goodbye|see you later|talk to you later|i(?:'ll| will) text you)\b/,
  ].some((pattern) => pattern.test(value));
}

function arrivalLocation(text, recentMessages, characterName) {
  const value = clean(text);
  const recent = [...(recentMessages || [])].slice(-18).reverse();
  const atCharacterHome = /\b(?:your|her|his|their) (?:place|apartment|house|home|door)\b/.test(value)
    || recent.some((message) => {
      const content = clean(message.text);
      return message.from === "character"
        ? /\b(?:my place|my apartment|my house|my home|come over|have you over)\b/.test(content)
        : /\b(?:your place|your apartment|your house|your home)\b/.test(content);
    });
  return atCharacterHome && characterName ? characterName + "'s home" : "";
}

export function inferPresenceCue(text, currentPresence = "uncertain", recentMessages = [], characterName = "") {
  const current = validPresence(currentPresence) ? currentPresence : "uncertain";
  if (explicitTogether(text)) {
    const location = arrivalLocation(text, recentMessages, characterName);
    return { presence: "together", ...(location ? { location } : {}) };
  }
  if (explicitApart(text)) return { presence: "apart" };
  return { presence: current };
}

export function inferPresenceFromHistory(messages = [], fallback = "apart", characterName = "") {
  let presence = validPresence(fallback) ? fallback : "apart";
  let location = "";
  for (const message of messages.slice(-300)) {
    if (message.from !== "user" || !message.text) continue;
    const cue = inferPresenceCue(message.text, presence, messages, characterName);
    presence = cue.presence;
    if (cue.location) location = cue.location;
  }
  return { presence, ...(location ? { location } : {}) };
}

export function currentPresence(thread) {
  const saved = thread?.scene?.presence;
  if (validPresence(saved)) return saved;
  return inferPresenceFromHistory(thread?.messages || [], "apart", thread?.profile?.name || thread?.character?.name || "").presence;
}

export function presenceSceneCue(thread, userText) {
  const characterName = thread?.profile?.name || thread?.character?.name || "";
  const saved = thread?.scene?.presence;
  const inferred = validPresence(saved)
    ? { presence: saved }
    : inferPresenceFromHistory(thread?.messages || [], "apart", characterName);
  const cue = inferPresenceCue(userText, inferred.presence, thread?.messages || [], characterName);
  return {
    ...(cue.presence === "together" && inferred.location ? { location: inferred.location } : {}),
    ...cue,
  };
}

export function presencePromptGuidance(thread) {
  const presence = currentPresence(thread);
  if (presence === "together") {
    return [
      "INTERACTION PRESENCE: TOGETHER. You and the user are physically present in the same scene.",
      "Do not say 'if you were here,' 'if we were together,' 'when you arrive,' 'come over,' 'get over here,' or otherwise imply physical separation unless the latest user turn explicitly establishes that someone has left.",
      "The chat-bubble interface is only how the scene is displayed; it does not mean either person is texting from another location.",
    ].join(" ");
  }
  if (presence === "apart") {
    return [
      "INTERACTION PRESENCE: APART. You and the user are currently communicating from different physical locations.",
      "Do not describe touching, seeing, handing objects to, or physically moving around the user as if you share a room unless the latest turn establishes an arrival.",
    ].join(" ");
  }
  return [
    "INTERACTION PRESENCE: UNCERTAIN. Do not assume either physical separation or co-presence.",
    "Use the latest explicit location and action evidence; ask a brief clarification if physical presence materially changes the reply.",
  ].join(" ");
}
