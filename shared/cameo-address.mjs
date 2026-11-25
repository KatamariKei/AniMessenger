const groupAddress = /\b(?:both of you|you both|you two|either of you|everyone|all of you|what do (?:you two|you guys|all of you) think)\b/i;
const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function speakerPattern(character) {
  const name = String(character?.displayName || character?.name || "").replace(/\s*\([^)]*\)\s*/g, " ").trim();
  return [...new Set([name, ...name.split(/\s+/).filter(part => part.length >= 3)])].filter(Boolean).map(escapeRegex).join("|");
}

export function addressedCameoSpeakers(text, host, guest, lastSpeakerId) {
  const speech = String(text || "").replace(/\[(?:action|thought)\s*:[^\]]*\]/gi, " ").trim();
  if (groupAddress.test(speech)) return lastSpeakerId === host.id ? [guest.id, host.id] : [host.id, guest.id];
  const mentions = [];
  const addresses = [];
  for (const character of [host, guest]) {
    const aliases = speakerPattern(character);
    if (!aliases) continue;
    const address = new RegExp(`(?:^|[.!?,;]\\s*|\\n\\s*)(?:(?:hey|hi|hello|so|okay|go ahead|thanks|thank you)\\s*,?\\s+)?(?:${aliases})(?=\\s*(?:[,.!?:;]|$))`, "i").exec(speech);
    if (address) addresses.push({ id: character.id, index: address.index });
    if (new RegExp(`(?:^|[^\\p{L}\\p{N}])(?:${aliases})(?=$|[^\\p{L}\\p{N}])`, "iu").test(speech)) mentions.push(character.id);
  }
  if (addresses.length) return addresses.sort((left, right) => left.index - right.index).map(address => address.id);
  return mentions.length === 1 ? mentions : [];
}

export function isCameoConversationReply(message) {
  return message.from === "character" && (Boolean(message.narration?.trim())
    || (Boolean(message.text?.trim()) && !message.imageJobId && !message.image && !message.imageUrl));
}
