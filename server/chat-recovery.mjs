export function recoverClientTurn(messages = [], clientMessageId = "") {
  const id = String(clientMessageId || "").trim();
  if (!id) return { index: -1, userMessage: null, reply: null };
  const index = messages.findIndex((message) => message.id === id && message.from === "user");
  if (index < 0) return { index: -1, userMessage: null, reply: null };
  const reply = messages[index + 1]?.from === "character" ? messages[index + 1] : null;
  return { index, userMessage: messages[index], reply };
}
