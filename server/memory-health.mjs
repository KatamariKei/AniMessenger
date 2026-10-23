import { previewMemoryConsolidation, temporaryMemoryReason, validateMemoryDecision } from "./memory.mjs";

export function recordMemoryReviewMetrics(current, next, proposed = 0, now = new Date()) {
  const before = new Map((current.memories || []).map(memory => [memory.id, memory]));
  const after = new Map((next.memories || []).map(memory => [memory.id, memory]));
  let added = 0, updated = 0, resolved = 0;
  for (const memory of after.values()) {
    const previous = before.get(memory.id);
    if (!previous) { added++; continue; }
    if (["promise", "open_loop"].includes(previous.kind) && memory.kind === "shared_event") resolved++;
    else if (previous.text !== memory.text || previous.kind !== memory.kind
      || JSON.stringify(previous.sourceMessageIds) !== JSON.stringify(memory.sourceMessageIds)) updated++;
  }
  const sample = { at: now.toISOString(), proposed, added, updated, resolved,
    removed: [...before.keys()].filter(id => !after.has(id)).length, before: before.size, after: after.size };
  return { version: 1, startedAt: current.memoryHealthMetrics?.startedAt || sample.at,
    reviews: [...(current.memoryHealthMetrics?.reviews || []), sample].slice(-100) };
}

export function auditMemoryHealth(thread, now = new Date()) {
  const memories = thread.memories || [];
  const messages = thread.messages || [];
  const sourceMap = new Map(messages.map(message => [message.id, message]));
  const preview = previewMemoryConsolidation(memories, messages);
  const flags = [];
  for (const pair of [...preview.clearDuplicates, ...preview.reviewPairs]) flags.push({
    type: "similar", memoryIds: pair.memoryIds, texts: pair.texts,
    reason: pair.reason === "exact_text" ? "Same wording; review whether these are the same fact or occasion." : "Similar content; not confirmed duplicates.",
  });
  for (const memory of memories) {
    const temporary = temporaryMemoryReason(memory);
    if (temporary || (memory.kind === "shared_event" && !memory.userEdited && memory.importance <= 2)) flags.push({
      type: "low_priority", memoryIds: [memory.id], texts: [memory.text],
      reason: temporary ? "Temporary status stored as a lasting memory." : "Low-importance episode. A distinctive callback may still be worth keeping.",
    });
    if (!new Set(["promise", "open_loop"]).has(memory.kind) || memory.userEdited) continue;
    for (const outcome of memories.filter(item => item.kind === "shared_event")) {
      const source = (outcome.sourceMessageIds || []).map(id => sourceMap.get(id)).find(message => {
        if (message?.from !== "user" || typeof message.text !== "string") return false;
        return validateMemoryDecision(memory, { ...outcome, action: "resolve", targetMemoryId: memory.id,
          evidenceMessageId: message.id, evidenceQuote: message.text.slice(0, 500) }, messages);
      });
      if (!source) continue;
      flags.push({ type: "possible_resolution", memoryIds: [memory.id, outcome.id], texts: [memory.text, outcome.text],
        reason: "A later sourced outcome may fulfill this commitment. Review before resolving.",
        evidence: { messageId: source.id, quote: source.text.slice(0, 500) } });
      break;
    }
  }
  const since = now.getTime() - 7 * 86400000;
  const reviews = (thread.memoryHealthMetrics?.reviews || []).filter(review => Date.parse(review.at) >= since);
  const totals = reviews.reduce((sum, review) => {
    for (const key of ["added", "updated", "resolved", "removed"]) sum[key] += Number(review[key]) || 0;
    return sum;
  }, { added: 0, updated: 0, resolved: 0, removed: 0 });
  const counts = Object.fromEntries(["similar", "possible_resolution", "low_priority"].map(type => [type, flags.filter(flag => flag.type === type).length]));
  return { total: memories.length, active: memories.filter(memory => !memory.archived).length,
    archived: memories.filter(memory => memory.archived).length, capacityTarget: preview.capacityTarget, counts, flags: flags.slice(0, 40),
    truncated: flags.length > 40, metrics: { startedAt: thread.memoryHealthMetrics?.startedAt || null,
      reviews: reviews.length, ...totals, recentCreated: memories.filter(memory => Date.parse(memory.createdAt) >= since).length },
    readOnly: true };
}
