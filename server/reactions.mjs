export const MESSAGE_REACTIONS = ["👍", "❤️", "👎", "😂", "‼️", "❓"];

export const REACTION_RESPONSE_CHANCES = Object.freeze({
  [MESSAGE_REACTIONS[0]]: 0.10,
  [MESSAGE_REACTIONS[1]]: 0.25,
  [MESSAGE_REACTIONS[2]]: 0.50,
  [MESSAGE_REACTIONS[3]]: 0.20,
  [MESSAGE_REACTIONS[4]]: 0.65,
  [MESSAGE_REACTIONS[5]]: 0.85,
});

export function normalizeMessageReaction(value) {
  if (value === null || value === undefined || value === "") return null;
  const reaction = String(value);
  if (!MESSAGE_REACTIONS.includes(reaction)) throw new Error("Choose one of the available message reactions.");
  return reaction;
}

export function reactionResponseChance(value) {
  const reaction = normalizeMessageReaction(value);
  return reaction ? REACTION_RESPONSE_CHANCES[reaction] : 0;
}

export function shouldRespondToReaction(value, random = Math.random) {
  return random() < reactionResponseChance(value);
}

export function canTriggerReactionResponse(message, value) {
  const reaction = normalizeMessageReaction(value);
  return Boolean(
    reaction
    && message?.from === "character"
    && message.reaction !== reaction
    && !message.reactionResponseId,
  );
}

export function applyMessageReaction(thread, messageId, value) {
  const reaction = normalizeMessageReaction(value);
  let found = false;
  const messages = thread.messages.map((message) => {
    if (message.id !== messageId) return message;
    if (message.from !== "character") throw new Error("Reactions can only be added to character messages.");
    found = true;
    const next = { ...message };
    if (reaction) next.reaction = reaction;
    else delete next.reaction;
    return next;
  });
  if (!found) throw new Error("That message no longer exists.");
  return { ...thread, messages };
}

export function appendReactionResponse(thread, messageId, reaction, responseMessage) {
  if (!responseMessage?.id || responseMessage.from !== "character") {
    throw new Error("A reaction response must be a character message.");
  }
  let found = false;
  let alreadyResponded = false;
  const respondedAt = responseMessage.time || new Date().toISOString();
  const messages = thread.messages.map((message) => {
    if (message.id !== messageId) return message;
    if (message.from !== "character") throw new Error("Reactions can only be added to character messages.");
    found = true;
    if (message.reactionResponseId) {
      alreadyResponded = true;
      return message;
    }
    return {
      ...message,
      reactionResponseId: responseMessage.id,
      reactionRespondedAt: respondedAt,
      reactionResponseReaction: reaction,
    };
  });
  if (!found) throw new Error("That message no longer exists.");
  if (alreadyResponded) return thread;
  return {
    ...thread,
    messages: [
      ...messages,
      {
        ...responseMessage,
        reactionResponse: true,
        reactionResponseTo: messageId,
      },
    ],
  };
}
