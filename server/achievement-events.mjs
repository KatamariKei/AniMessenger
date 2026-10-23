const normalize = value => String(value || "").normalize("NFKC").toLowerCase().replace(/[’]/g, "'").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const kinds = {
  "shared-laughter": ["laughter"], "new-horizons": ["arrival"],
  "worked-through-it": ["disagreement", "repair"], "heartfelt": ["feelings"],
  "our-tradition": ["tradition_agreement", "tradition_occurrence"],
  "time-well-spent": ["shared_activity"],
};

const laughterCue = /\b(?:laugh(?:s|ed|ing|ter)?|giggl(?:e|es|ed|ing)|chuckl(?:e|es|ed|ing)|snicker(?:s|ed|ing)?|crack(?:s|ed)? up|burst(?:s)? out laughing)\b/i;

export function sceneLaughterProposal(exchange) {
  const user = String(exchange.userText || "").trim();
  const character = String(exchange.characterText || "");
  if (user.length < 8) return null;
  // Capture a short exact reaction rather than the first paragraph, which may
  // omit the laugh. This is only a candidate; causality is reviewed separately.
  const reaction = character.match(/[^.!?\n]*[.!?]?/g)?.find(part => laughterCue.test(part));
  const quote = reaction?.trim();
  if (!quote || quote.length < 8 || quote.length > 400) return null;
  return { id: "shared-laughter", event: "laughter", subject: null, occasion: null,
    actor: "shared", phase: "completed", evidence: [{ source: "user", quote: user.slice(0, 400) }, { source: "character", quote }] };
}

// Conservative shadow grouping only. Unknown aliases remain separate review candidates;
// they must not be used to grant destination awards without semantic reconciliation.
export function destinationKey(value) {
  return normalize(value).replace(/^(?:the|our|a|an) /, "")
    .replace(/\b(?:private dining room|bedroom|bathroom|kitchen|living room|dining room|guest room|hallway|balcony|booth|table|patio) (?:in|of|at) (?:the |our )?/, "")
    .replace(/\b(?: s)? (?:private dining room|bedroom|bathroom|kitchen|living room|dining room|guest room|hallway|balcony|booth|table|patio)$/, "").trim();
}

export function isJourneyDestination(key) {
  return key.length >= 3
    && !/^(?:room|home|bedroom|bathroom|kitchen|living room|dining room|guest room|hallway|balcony|booth|table|patio|outside|inside|here|there|somewhere familiar)$/.test(key)
    && !/\b(?:to|from) the\b/.test(key);
}

export function journeyDestinationKeys(records = []) {
  const keys = [...new Set(records.map(item => destinationKey(item?.key)).filter(isJourneyDestination))];
  // Only reconcile an unnamed venue with a single more-specific match. Two
  // differently named venues remain distinct, and original evidence is retained.
  return new Set(keys.filter(key => !/^(?:rental|apartment|restaurant|hotel|park|beach)$/.test(key)
    || keys.filter(other => other !== key && other.endsWith(" " + key)).length !== 1));
}

export const achievementTopicKey = value => normalize(value).slice(0, 100);

const activityFamilies = [
  ["watching", /\b(?:watch(?:ing|ed)?|movie|film|episode|cinema)\b/i],
  ["cooking", /\b(?:cook(?:ing|ed)?|bak(?:e|ing|ed)|prepar(?:e|ing|ed) (?:a |the )?(?:meal|breakfast|dinner))\b/i],
  ["games", /\b(?:play(?:ing|ed)? (?:a |the )?(?:game|cards|chess|video game)|gaming|controller|board game)\b/i],
  ["walking", /\b(?:walk(?:ing|ed)?|hik(?:e|ing|ed)|stroll(?:ing|ed)?)\b/i],
  ["bathing", /\b(?:hot springs?|onsen|soak(?:ing|ed)?|swim(?:ming)?|swam)\b/i],
  ["dining", /\b(?:eat(?:ing)?|ate|din(?:ing|ed)|shar(?:e|ing|ed) (?:a |the )?meal)\b/i],
  ["music", /\b(?:listen(?:ing|ed)? (?:to )?(?:music|songs?|records?)|sing(?:ing)?|sang|danc(?:e|ing|ed))\b/i],
  ["creating", /\b(?:draw(?:ing)?|drew|paint(?:ing|ed)?|craft(?:ing|ed)?|sculpt(?:ing|ed)?)\b/i],
];
export function sharedActivityKey(subject) {
  const value = normalize(subject);
  return activityFamilies.find(([key, pattern]) => key === value || pattern.test(value))?.[0] || value.slice(0, 100);
}
export function sceneActivityProposal(exchange) {
  if (exchange.scene?.presence !== "together") return null;
  const user = String(exchange.userText || "").trim();
  const character = String(exchange.characterText || "");
  if (user.length < 8) return null;
  for (const [subject, pattern] of activityFamilies) {
    const quote = character.match(/[^.!?\n]+[.!?]?/g)?.find(sentence => pattern.test(sentence))?.trim();
    if (!quote || quote.length < 8 || quote.length > 400) continue;
    return { id: "time-well-spent", event: "shared_activity", subject, occasion: null,
      actor: "shared", phase: "completed", evidence: [{ source: "user", quote: user.slice(0, 400) }, { source: "character", quote }] };
  }
  return null;
}

export function sceneDestinationProposal(exchange) {
  const location = String(exchange.scene?.location || "");
  const key = destinationKey(location);
  if (exchange.scene?.presence !== "together" || !isJourneyDestination(key)) return null;
  const user = String(exchange.userText || "");
  const character = String(exchange.characterText || "");
  if (user.trim().length < 8 || character.trim().length < 8) return null;
  // Broad candidate capture, not completion proof. Review receives the full exchange
  // and final scene; neither a venue noun nor scene state alone can verify a visit.
  if (!/\b(?:arriv\w*|reach\w*|enter\w*|walk\w*|step\w*|restaurant|bistro|cafe|caf\u00e9|diner|menu|waiter|waitress|server|order\w*|meal|dinner|lunch|booth|table|park|beach|arcade|bowling|hotel|rental|station|museum|library|shop|store|cinema|theater)\b/i.test(`${location} ${user} ${character}`)) return null;
  return { id: "new-horizons", event: "arrival", subject: location, occasion: null, actor: "shared", phase: "completed",
    evidence: [{ source: "user", quote: user.slice(0, 400) }, { source: "character", quote: character.slice(0, 400) }] };
}

export function normalizeAchievementTracking(value = {}) {
  return {
    laughter: Array.isArray(value.laughter) ? value.laughter.slice(0, 5) : [],
    // Ten distinct venues is the achievement target, not the evidence capacity.
    // Keep legacy records intact so excluded rooms/aliases cannot fill the goal.
    destinations: Array.isArray(value.destinations) ? value.destinations.slice(0, 200) : [],
    feelings: value.feelings || null,
    activities: Array.isArray(value.activities) ? value.activities.slice(0, 30) : [],
    disagreements: Array.isArray(value.disagreements) ? value.disagreements.slice(0, 20) : [],
    traditions: Array.isArray(value.traditions) ? value.traditions.slice(0, 20) : [],
  };
}

export function trackAchievementCandidate(value, proposal, evidence, exchange) {
  const state = normalizeAchievementTracking(structuredClone(value || {}));
  const event = proposal.event;
  if (!kinds[proposal.id]?.includes(event)) return { state, reason: "missing-or-mismatched-event-kind" };
  const user = evidence.filter(item => item.source === "user").map(item => item.quote).join(" ");
  const character = evidence.filter(item => item.source === "character").map(item => item.quote).join(" ");
  const all = `${user} ${character}`;
  if (!["arrival", "shared_activity"].includes(event) && /\b(didn't|did not|never|pretend(?:ed|s)?|fake(?:d)?|sarcastic(?:ally)?)\b/i.test(all)) return { state, reason: "negated-or-ambiguous" };
  const record = { userMessageId: exchange.userMessageId, characterMessageId: exchange.characterMessageId,
    evidence: structuredClone(evidence) };
  const topic = achievementTopicKey(proposal.subject);
  let reason = "provisional-evidence-chain";
  if (event === "laughter") {
    if (!user || !laughterCue.test(character)) return { state, reason: "missing-user-contribution-or-laughter" };
    if (!state.laughter.some(item => item.userMessageId === record.userMessageId) && state.laughter.length < 5) state.laughter.push(record);
  } else if (event === "shared_activity") {
    const key = sharedActivityKey(proposal.subject);
    if (!key || !user || !character || exchange.scene?.presence !== "together") return { state, reason: "missing-completed-shared-activity" };
    if (state.activities.some(item => item.key === key)) reason = "repeat-activity";
    else if (state.activities.length < 30) state.activities.push({ key, ...record });
  } else if (event === "feelings") {
    if (!/\b(?:i (?:love|trust|appreciate|care)|you (?:mean|matter)|your .{0,50}means|grateful|friendship)\b/i.test(user)) return { state, reason: "missing-meaningful-user-feelings" };
    state.feelings ||= record;
  } else if (event === "arrival") {
    const key = destinationKey(proposal.subject);
    if (!isJourneyDestination(key)) return { state, reason: "ambiguous-destination" };
    if (exchange.scene?.presence !== "together" || destinationKey(exchange.scene?.location) !== key) return { state, reason: "not-confirmed-shared-final-destination" };
    if (!user || !character) return { state, reason: "missing-shared-visit-evidence" };
    if (state.destinations.some(item => destinationKey(item.key) === key)) reason = "repeat-destination";
    else if (state.destinations.length < 200) state.destinations.push({ key, ...record });
    else reason = "destination-evidence-capacity";
  } else if (event === "disagreement" || event === "repair") {
    if (topic.length < 3 || !user || !character) return { state, reason: "missing-shared-topic-evidence" };
    let chain = state.disagreements.find(item => item.topic === topic);
    if (event === "disagreement") {
      if (!/\b(disagree|disagreement|argument|upset|hurt|not okay|not ok|don't agree|do not agree)\b/i.test(all)) return { state, reason: "missing-disagreement" };
      if (!chain && state.disagreements.length < 20) state.disagreements.push({ topic, opened: record, repaired: null });
    } else {
      if (!chain || chain.opened.userMessageId === record.userMessageId) return { state, reason: "no-prior-disagreement" };
      if (!/\b(sorry|apologi[sz]e|understand|forgive|work it out|make it right|resolved)\b/i.test(user)
        || !/\b(accept|forgive|understand|resolved|okay|all right|work it out)\b/i.test(character)) return { state, reason: "missing-mutual-repair" };
      chain.repaired ||= record;
    }
  } else {
    if (topic.length < 3 || !user || !character) return { state, reason: "missing-shared-topic-evidence" };
    let chain = state.traditions.find(item => item.topic === topic);
    if (event === "tradition_agreement") {
      if (!/\b(tradition|ritual|every|regular|from now on|our thing)\b/i.test(all)
        || !/\b(yes|agree|deal|love that|let's|our tradition|our ritual)\b/i.test(character)) return { state, reason: "missing-recurring-agreement" };
      if (!chain && state.traditions.length < 20) state.traditions.push({ topic, agreed: record, occurrences: [] });
    } else {
      if (!chain || chain.agreed.userMessageId === record.userMessageId) return { state, reason: "no-prior-tradition-agreement" };
      // Separate turns alone cannot prove separate occasions. Only an explicit story-time
      // marker is retained, and the whole chain still requires semantic review.
      const occasion = normalize(proposal.occasion).slice(0, 100);
      if (occasion.length < 3 || !normalize(all).includes(occasion)) return { state, reason: "missing-grounded-distinct-occasion" };
      if (chain.occurrences.some(item => item.occasion === occasion)) reason = "repeat-tradition-occasion";
      else if (chain.occurrences.length < 2) chain.occurrences.push({ occasion, ...record });
    }
  }
  return { state, reason };
}
