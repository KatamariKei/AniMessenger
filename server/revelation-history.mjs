export const discoveryRecognitionRules = "Recognize the core personal fact in natural conversation, not a password or an acted-out test. Natural paraphrases, enthusiastic explanations, and clear first-person statements of likes, dislikes, fears, or history count. A stated strong objection can establish a reaction tendency without making the user provoke actual anger, fear, embarrassment, or conflict. Do not demand every incidental adjective or background detail in a reference summary. Preserve the essential distinctive meaning: merely liking ice cream does not establish a particular favorite flavor or an objection to a specific comparison. Reveal conditions describe a conversational opportunity, not extra mandatory wording; numeric minTrust/minimumTrust strings are metadata, not transcript facts or unlock requirements. Require the selected character to clearly communicate the fact in the same exchange as a user contribution. User guesses alone, vague agreement, keyword overlap, private thoughts, hypothetical scenes, future plans, contradictions, and other characters' statements do not count. Cite exact transcript quotations and IDs. Confidence >=0.90 means clear supported meaning, not verbatim wording; uncertain guesses still mean no match.";

// Private transcript evidence never enters the public Journey response.
export function revelationHistoryWindows(thread, budget = 9000) {
  const windows = [];
  let turns = [], current;
  for (const message of thread.messages || []) {
    if (message.from === "user" && !message.speakerId) {
      current = { user: message, replies: [] }; turns.push(current);
    } else if (current && message.from === "character" && (!message.speakerId || message.speakerId === thread.character.id)) {
      current.replies.push(message);
    }
  }
  let window = [], size = 0;
  for (const turn of turns) {
    if (!turn.user.id || !turn.replies.length) continue;
    for (const reply of turn.replies) {
      if (!reply.id) continue;
      const messages = [turn.user, reply].map(message => ({ id: message.id, role: message.from,
        text: [message.narration, message.text].filter(Boolean).join("\n").slice(0, message.from === "user" ? 3000 : 5000) }));
      if (messages.some(message => !message.text)) continue;
      const exchange = { userId: turn.user.id, messages };
      const length = JSON.stringify(exchange).length;
      if (size + length > budget && window.length) { windows.push(window); window = []; size = 0; }
      window.push(exchange); size += length;
    }
  }
  if (window.length) windows.push(window);
  return windows;
}

export function revelationHistorySchema(definitions) {
  return { type: "object", additionalProperties: false, properties: { matches: { type: "array", maxItems: 3, items: {
    type: "object", additionalProperties: false, properties: {
      discoveryId: { type: "string", enum: definitions.map(item => item.id) },
      userId: { type: "string" }, characterMessageId: { type: "string" },
      userQuote: { type: "string", minLength: 1, maxLength: 400 }, characterQuote: { type: "string", minLength: 12, maxLength: 500 },
      confidence: { type: "number", minimum: 0, maximum: 1 },
    }, required: ["discoveryId", "userId", "characterMessageId", "userQuote", "characterQuote", "confidence"] } } }, required: ["matches"] };
}

export function exactDiscoveryQuoteParts(quote, source) {
  if (typeof quote !== "string" || quote.length < 12 || quote.length > 500 || typeof source !== "string") return null;
  if (source.includes(quote)) return [quote];
  // Models flatten paragraph breaks when quoting speech. Match whitespace
  // only, then store the literal source span; never accept changed words.
  const patternFor = part => part.split(/\s+/).map(word => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+");
  const whole = new RegExp(patternFor(quote)).exec(source);
  if (whole) return [whole[0]];
  let parts = quote.split(/(?:\s+\.{3}\s+|\s*…\s*)/).map(part => part.trim());
  if (parts.length === 1) parts = quote.split(/\s*(?:\.{3}|…)\s*/).map(part => part.trim());
  if (parts.length > 4 || parts.some(part => part.length < 12)) return null;
  let cursor = 0;
  const exact = [];
  for (const part of parts) {
    const match = new RegExp(patternFor(part)).exec(source.slice(cursor));
    if (!match) return null;
    exact.push(match[0]);
    cursor += match.index + match[0].length;
  }
  return exact;
}

export function validateHistoricalDiscoveries(definitions, window, result, options = {}) {
  const accepted = new Map();
  for (const item of (Array.isArray(result?.matches) ? result.matches : []).slice(0, 3)) {
    if (!definitions.some(definition => definition.id === item.discoveryId) || !Number.isFinite(item.confidence)
      || item.confidence < (options.live ? 0.85 : 0.90) || item.confidence > 1) continue;
    const exchange = window.find(turn => turn.userId === item.userId && turn.messages.some(message => message.id === item.characterMessageId));
    const user = exchange?.messages.find(message => message.id === item.userId && message.role === "user");
    const reply = exchange?.messages.find(message => message.id === item.characterMessageId && message.role === "character");
    const characterQuoteParts = exactDiscoveryQuoteParts(item.characterQuote, reply?.text);
    if (typeof item.userQuote !== "string" || !item.userQuote.trim() || item.userQuote.length > 400 || !user?.text.includes(item.userQuote)
      || !characterQuoteParts) continue;
    if (!accepted.has(item.discoveryId)) accepted.set(item.discoveryId, { discoveryId: item.discoveryId, userId: item.userId,
      characterMessageId: item.characterMessageId, userQuote: item.userQuote, characterQuote: characterQuoteParts.join(" ... "),
      ...(characterQuoteParts.length > 1 ? { characterQuoteParts } : {}),
      origin: "earlier_chat", rewardGranted: false });
  }
  return [...accepted.values()];
}

export function publicDiscoveryHistory(state, threadId, queued = false) {
  const history = state?.historyReviews?.[threadId];
  const status = queued ? history?.status || "queued" : ["queued", "checking"].includes(history?.status) ? "interrupted" : history?.status || "unchecked";
  return { status, checkedBatches: history?.checkedBatches || 0, totalBatches: history?.totalBatches || 0,
    ...(["complete", "failed", "interrupted"].includes(status) && history?.updatedAt ? { completedAt: history.updatedAt } : {}),
    confirmed: history?.discoveries?.filter(item => item.origin !== "live_chat").length || 0 };
}
