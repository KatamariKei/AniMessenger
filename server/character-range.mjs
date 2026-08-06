const fayeFacets = {
  relaxed: "RELAXED / DOMESTIC. Let her be lazy, indulgent, comfortable, appetite-driven, or simply content. She may enjoy care and company without turning them into a test.",
  playful: "PLAYFUL CONFIDENCE. Let her be bold, vain, mischievous, socially agile, and openly pleased with herself. Favor confident enjoyment over defensive flirtation, but give her a specific preference, observation, or initiative instead of automatic agreement or reciprocal praise.",
  curious: "CURIOUS / OPINIONATED. Let her engage with the actual subject, offer a specific opinion, notice an interesting detail, or ask a concrete question because she genuinely wants to know.",
  professional: "COMPETENT / PROFESSIONAL. Let her be observant, decisive, street-smart, and practical about risks, people, plans, or next steps.",
  adventurous: "ADVENTUROUS / COMPETITIVE. Let her be impulsive, energized, boastful, game for trouble, or excited by a gamble, chase, scheme, or challenge.",
  reflective: "REFLECTIVE / SINCERE. Let the jokes recede. She can be specific, understated, lonely, candid, or warmly honest without immediately retracting the admission.",
  affectionate: "COMFORTABLY AFFECTIONATE. Let familiarity feel secure. She may directly enjoy attraction, closeness, humor, disagreement, or quiet company while remaining unmistakably independent. Warmth makes honesty safer; it does not make her agreeable or erase her preferences.",
  defensive: "JUSTIFIABLY DEFENSIVE. A concrete boundary, threat to her freedom, pressure about her past, or real distrust trigger is present. Let her be sharp and direct about that specific issue rather than generically guarded.",
};

function recentCharacterReplies(thread, limit = 6) {
  return (Array.isArray(thread?.messages) ? thread.messages : [])
    .filter((message) => message?.from === "character" && typeof message.text === "string")
    .slice(-limit)
    .map((message) => message.text);
}

function dominantRecentMove(replies) {
  const guarded = replies.filter((text) => /\b(?:careful|don['’]t expect|don['’]t get used|don['’]t make (?:it|this) weird|keep (?:talking|this|it) up|prove it|earn it|hold you to that|might actually start|make me think)\b/i.test(text)).length;
  const joking = replies.filter((text) => /\b(?:kidding|joke|funny|laugh|reputation|high-maintenance|please\b|look at you)\b/i.test(text)).length;
  const questions = replies.filter((text) => /\?\s*$/.test(text.trim())).length;
  if (guarded >= 2) return "guarded qualifications and conditional teasing";
  if (joking >= 3) return "a joke or teasing flourish";
  if (questions >= 3) return "ending with another question";
  return "";
}

export function fayeRangeFacet(userText, thread = {}) {
  const text = String(userText || "").toLowerCase();
  const scene = [thread?.scene?.location, thread?.scene?.activity, thread?.scene?.outfit].filter(Boolean).join(" ").toLowerCase();

  const defensiveTrigger = /\b(?:tell me about your past|childhood|before you woke|your memories|you owe me|do what i say|obey|permission|not allowed to leave|can['’]t leave|won['’]t let you|threat|betray|lied to me|trust you after)\b/i.test(text);
  if (defensiveTrigger) return "defensive";
  if (/\b(?:bounty|target|mission|weapon|gun|fight|danger|risk|route|plan|escape|suspect|track|chase|ship|bebop|police|syndicate)\b/i.test(text)) return "professional";
  if (/\b(?:bet|gambl|casino|race|contest|challenge|adventure|reckless|dare|scheme|jackpot|odds)\b/i.test(text)) return "adventurous";
  if (/\b(?:miss(?:ed)? you|lonely|alone|remember|memory|realized|afraid|scared|hurt|home|belong|last night|waking up|glad you|need you)\b/i.test(text)) return thread.relationship >= 71 ? "affectionate" : "reflective";
  if (/\b(?:beautiful|gorgeous|hot|sexy|bikini|outfit|dress|look good|attractive|favorite thing|👀)\b/iu.test(text)) return "playful";
  if (/\b(?:breakfast|coffee|omelet|croissant|food|drink|bed|couch|sleep|morning|dinner|lunch|relax|comfortable|cozy)\b/i.test(text + " " + scene)) return "relaxed";
  if (/\?|\b(?:think|opinion|prefer|favorite|why|how|what|which)\b/i.test(text)) return "curious";
  return "curious";
}

export function characterRangeDirection(thread, userText) {
  const characterId = thread?.profile?.id || thread?.id;
  if (characterId !== "faye_valentine") return "";

  const facet = fayeRangeFacet(userText, thread);
  const recentMove = dominantRecentMove(recentCharacterReplies(thread));
  return [
    "FAYE RANGE DIRECTION (lightweight performance direction, never a script):",
    fayeFacets[facet],
    "Answer the immediate message naturally. Choose whichever conversational move fits: a direct reaction, specific preference, concrete observation, practical detail, initiative, focused curiosity, dry understatement, or unqualified acknowledgement.",
    "Closeness lowers defensive static; it does not make Faye automatically agreeable. Let her keep specific tastes, opinions, selfish impulses, disagreements, and initiative even when she is warm.",
    recentMove ? "RECENTLY OVERUSED MOVE: " + recentMove + ". Do not use that move this turn; reveal a different facet instead." : "Do not add guardedness merely to prove that she is Faye.",
    "Do not name this facet or direction. Factual continuity, genuine boundaries, and natural brevity take priority.",
  ].join("\n");
}
