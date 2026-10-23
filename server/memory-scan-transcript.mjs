import { createHash } from "node:crypto";

export function fullMemoryScanTranscript(messages = []) {
  return messages.filter(message => message.from !== "system").flatMap(message => {
    const text = String(message.text || "").trim();
    const narration = String(message.narration || "").trim();
    const content = [narration && !text.includes(narration) ? narration : "", text].filter(Boolean).join("\n");
    return content ? [{ id: message.id, from: message.from, text: content,
      ...(message.time ? { time: message.time } : {}) }] : [];
  });
}

export function fullMemoryScanBatches(messages, { maxCharacters = 12000, maxMessages = 60, fragmentCharacters = 4000 } = {}) {
  const transcript = fullMemoryScanTranscript(messages);
  const batches = [];
  let chunk = [];
  let size = 0;
  const flush = () => {
    if (!chunk.length) return;
    batches.push({ id: createHash("sha256").update("full-memory-scan-v2\0" + JSON.stringify(chunk)).digest("hex"), messages: chunk });
    chunk = []; size = 0;
  };
  const fragmentSize = Math.max(1, Math.min(fragmentCharacters, maxCharacters - 1000));
  for (const message of transcript) {
    for (let start = 0; start < message.text.length;) {
      let end = Math.min(message.text.length, start + fragmentSize);
      if (end < message.text.length) {
        const boundary = message.text.lastIndexOf(" ", end);
        if (boundary > start + fragmentSize * 0.75) end = boundary + 1;
      }
      const fragment = { ...message, text: message.text.slice(start, end),
        ...(message.text.length > fragmentSize ? { fragmentStart: start, fragmentTotal: message.text.length } : {}) };
      const cost = JSON.stringify(fragment).length + 2;
      if (chunk.length && (chunk.length >= maxMessages || size + cost > maxCharacters)) flush();
      chunk.push(fragment); size += cost;
      start = end;
    }
  }
  flush();
  return batches;
}
