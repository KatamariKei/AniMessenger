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
    /\b(?:i(?:'m| am)|we(?:'re| are)) (?:already )?(?:right )?here\b(?!\s+(?:to|for)\b)/,
    /\b(?:i(?:'m| am)|we(?:'re| are)) (?:physically )?(?:with|beside|next to) you\b/,
    /\b(?:i(?:'m| am) )?(?:sitting|standing|lying|laying|kneeling) (?:right )?(?:next to|beside|in front of|behind) you\b/,
    /\b(?:i |we )?(?:sit|sat|move|walk|slide|lie|lay|stand) (?:down )?(?:next to|beside|over to|toward) (?:you|her|him|them)\b/,
    /\b(?:i |we )?(?:kiss|hug|embrace|touch|hold|grab|pull|cuddle|stroke|caress) (?:you|her|him|them)\b/,
    /\b(?:you|she|he|they) (?:kiss|hug|embrace|touch|hold|grab|pull|cuddle|stroke|caress)(?:es|s)? me\b/,
    /\bding dong\b[\s\S]*\bi(?:'m| am) here\b/,
    /\b(?:open|answer) the door\b[\s\S]*\b(?:i(?:'m| am)|you(?:'re| are)) here\b/,
    /\b(?:hear|heard) (?:a )?knock at (?:my|our|the) door\b/,
    /\b(?:arrives?|arrived|shows? up|showed up) at (?:my|our|the) (?:place|apartment|house|home|door)\b/,
  ].some((pattern) => pattern.test(value));
}

function explicitApart(text) {
  const value = clean(text);
  if (!value) return false;
  // Travel by "we" is not evidence that the participants separated. Likewise,
  // a proposed solo departure is not an already completed departure.
  const soloDeparture = value.split(/[.!?;\n]+/).some(clause =>
    !/\b(?:how about|what if|maybe|should|could|would|can|shall|let's|let us|if)\b/.test(clause)
    && (/\bi(?:'m| am)?\s+(?:heading home|going home|head home|go home|walk away|drive away)\b/.test(clause)
      || /\bi(?:'m| am)?\s+(?:leaving|leave|left)(?:\s+(?:you|her|him|them|the (?:house|apartment|home|place|building|venue|party)))?(?:\s*\]|$)/.test(clause.trim())));
  if (soloDeparture) return true;
  return [
    /\bi(?:'m| am) on (?:my|the) way\b/,
    /\bi(?:'m| am) (?:heading|driving|walking) (?:over|there|to your|to the)\b/,
    /\bi(?:'ll| will) (?:be there|come over|head over|see you) (?:soon|later|tonight|tomorrow|in a bit)\b/,
    /\bwhen i (?:get|arrive) there\b/,
    /\bwe (?:split up|part ways|go our separate ways)\b/,
    /\b(?:goodbye|see you later|talk to you later|i(?:'ll| will) text you)\b/,
    /\b(?:why don['’]t |when |once )?(?:you|she|he|they)(?:'ll|'re| will| are| is)? (?:come|coming|head|heading) over\b/,
    /\b(?:text|texts|texted|message|messages|messaged|call|calls|called) me back\b/,
  ].some((pattern) => pattern.test(value));
}

function sharedTravel(text) {
  return /\b(?:we|let's|let us)\s+(?:(?:are|'re|should|could|can|shall|both|all|now)\s+)*(?:head(?:ing)?|go(?:ing)?|walk(?:ing)?|driv(?:e|ing)|leave|leaving|return(?:ing)?)\b/.test(clean(text));
}

function arrivalLocation(text, recentMessages, characterName) {
  const value = clean(text);
  const recent = [...(recentMessages || [])].slice(-18).reverse();
  if (/\b(?:my|our) (?:place|apartment|house|home|door)\b/.test(value)) return "the viewer's home";
  if (/\b(?:your|her|his|their) (?:place|apartment|house|home|door)\b/.test(value)) {
    return characterName ? characterName + "'s home" : "";
  }
  for (const message of recent) {
    const content = clean(message.text);
    const atViewerHome = message.from === "character"
      ? /\b(?:your place|your apartment|your house|your home|come over to you)\b/.test(content)
      : /\b(?:my place|my apartment|my house|my home|come over to my)\b/.test(content);
    if (atViewerHome) return "the viewer's home";
    const atCharacterHome = message.from === "character"
      ? /\b(?:my place|my apartment|my house|my home|come over|have you over)\b/.test(content)
      : /\b(?:your place|your apartment|your house|your home)\b/.test(content);
    if (atCharacterHome) return characterName ? characterName + "'s home" : "";
  }
  return "";
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
  // Distinguish an explicit statement in this turn from merely carrying the
  // saved value forward. The response may complete travel that began in the
  // user's message, so a passive carry-forward must not override the model's
  // end-of-passage presence state.
  const explicitCue = inferPresenceCue(userText, "uncertain", thread?.messages || [], characterName);
  const presenceAuthority = explicitCue.presence === "together" || explicitCue.presence === "apart"
    || (inferred.presence === "together" && sharedTravel(userText))
    ? "deterministic"
    : undefined;
  return {
    ...(cue.presence === "together" && inferred.location ? { location: inferred.location } : {}),
    ...cue,
    ...(presenceAuthority ? { presenceAuthority } : {}),
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
