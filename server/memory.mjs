const allowedKinds = new Set(["user_fact", "preference", "shared_event", "shared_creation", "promise", "boundary", "open_loop"]);
const stopWords = new Set(["about", "after", "again", "also", "and", "are", "because", "been", "before", "but", "can", "character", "did", "does", "for", "from", "have", "into", "just", "name", "our", "that", "the", "their", "they", "this", "user", "was", "were", "what", "when", "with", "you", "your"]);

function words(value) {
  return [...new Set(String(value || "").toLowerCase().match(/[a-z0-9][a-z0-9'-]{2,}/g) || [])]
    .filter((word) => !stopWords.has(word));
}

function stringList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean);
  if (typeof value === "string") return value.split(/[,;|]/).map((item) => item.trim().toLowerCase()).filter(Boolean);
  return [];
}

function allowedMemoryText(text) {
  if (/\b(sex|sexual|intimate|physical encounter|nude|naked|porn|erotic)\b/i.test(text)) return false;
  if (/\b(a|an|the|and|as|at|about|because|but|by|for|from|has|have|in|into|is|of|on|or|that|their|to|was|were|with)$/i.test(text)) return false;
  return true;
}

export function normalizeMemoryCandidate(candidate, sourceMessageId, now = new Date()) {
  const text = String(candidate?.text || "").replace(/\s+/g, " ").trim();
  if (text.length < 8 || text.length > 500 || !allowedMemoryText(text)) return null;
  const kind = allowedKinds.has(candidate?.kind) ? candidate.kind : "shared_event";
  const explicitKeywords = stringList(candidate?.keywords);
  const keywords = [...new Set([...explicitKeywords, ...words(text)])].slice(0, 16);
  return {
    id: crypto.randomUUID(),
    kind,
    text,
    keywords,
    importance: Math.max(1, Math.min(5, Math.round(Number(candidate?.importance) || 3))),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    sourceMessageIds: sourceMessageId ? [String(sourceMessageId)] : [],
  };
}

function overlap(left, right) {
  const a = new Set(words(left));
  const b = new Set(words(right));
  if (!a.size || !b.size) return 0;
  const shared = [...a].filter((word) => b.has(word)).length;
  return shared / Math.min(a.size, b.size);
}

function isDuplicate(left, right) {
  if (left.kind !== right.kind) return false;
  if (overlap(left.text, right.text) >= 0.72) return true;
  const leftKeywords = new Set(stringList(left.keywords));
  const leftText = String(left.text || "").toLowerCase();
  const rightText = String(right.text || "").toLowerCase();
  return stringList(right.keywords).some((keyword) =>
    (/[\s-]|\d/.test(keyword) || keyword.length >= 12)
    && leftKeywords.has(keyword)
    && leftText.includes(keyword)
    && rightText.includes(keyword));
}

function combineMemory(target, incoming, now) {
  target.text = String(incoming.text || "").length >= String(target.text || "").length ? incoming.text : target.text;
  target.keywords = [...new Set([...(target.keywords || []), ...(incoming.keywords || [])])].slice(0, 20);
  target.importance = Math.max(Number(target.importance) || 1, Number(incoming.importance) || 1);
  target.updatedAt = now.toISOString();
  target.sourceMessageIds = [...new Set([...(target.sourceMessageIds || []), ...(incoming.sourceMessageIds || [])])].slice(-8);
}

export function mergeMemories(existing, candidates, sourceMessageId, now = new Date()) {
  const memories = [];
  for (const item of Array.isArray(existing) ? existing : []) {
    if (!allowedMemoryText(String(item?.text || ""))) continue;
    const copy = { ...item, keywords: [...(item.keywords || [])], sourceMessageIds: [...(item.sourceMessageIds || [])] };
    const match = memories.find((memory) => isDuplicate(memory, copy));
    if (match) combineMemory(match, copy, now);
    else memories.push(copy);
  }
  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    const normalized = normalizeMemoryCandidate(candidate, sourceMessageId, now);
    if (!normalized) continue;
    const match = memories.find((memory) => isDuplicate(memory, normalized));
    if (match) {
      combineMemory(match, normalized, now);
    } else {
      memories.push(normalized);
    }
  }
  return memories.sort((a, b) => Number(b.importance || 0) - Number(a.importance || 0) || String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0, 240);
}

export function selectRelevantMemories(memories, query, limit = 8) {
  const queryWords = new Set(words(query));
  return (Array.isArray(memories) ? memories : [])
    .map((memory) => {
      const memoryWords = new Set([...(memory.keywords || []), ...words(memory.text)]);
      const matches = [...queryWords].filter((word) => memoryWords.has(word)).length;
      const exactPhrase = String(query || "").toLowerCase().split(/\s+/).some((part) => part.length >= 5 && String(memory.text || "").toLowerCase().includes(part));
      return { memory, score: matches * 8 + (exactPhrase ? 4 : 0) + Number(memory.importance || 1) };
    })
    .sort((a, b) => b.score - a.score || String(b.memory.updatedAt).localeCompare(String(a.memory.updatedAt)))
    .slice(0, Math.max(0, limit))
    .map(({ memory }) => memory);
}

export function forgetMemory(memories, memoryId) {
  return (Array.isArray(memories) ? memories : []).filter((memory) => memory.id !== memoryId);
}
