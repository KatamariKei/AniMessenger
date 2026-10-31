export function recoverClientTurn(messages = [], clientMessageId = "") {
  const id = String(clientMessageId || "").trim();
  if (!id) return { index: -1, userMessage: null, reply: null };
  const index = messages.findIndex((message) => message.id === id && message.from === "user");
  if (index < 0) return { index: -1, userMessage: null, reply: null };
  const later = messages.slice(index + 1);
  const linked = later.find(message => message.from === "character" && message.inReplyTo === id);
  const nextUser = later.findIndex(message => message.from === "user");
  const turn = nextUser < 0 ? later : later.slice(0, nextUser);
  // Older chats have no explicit link. Images/proactive messages arriving while
  // generation is pending must not be mistaken for that turn's actual answer.
  const reply = linked || turn.find(message => message.from === "character" && !message.inReplyTo && !message.image && !message.generated && !message.proactive) || null;
  return { index, userMessage: messages[index], reply };
}
