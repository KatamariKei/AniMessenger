import { revelationHistoryWindows } from "./revelation-history.mjs";

const words = text => new Set(String(text || "").toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) || []);
const common = new Set(["that", "this", "with", "from", "have", "been", "were", "they", "their", "there", "when", "what", "would", "about", "character", "herself", "himself", "after", "before"]);

export function focusedDiscoveryPacket(state, thread) {
  const history = state?.historyReviews?.[thread.id] || {};
  const confirmed = new Set((history.discoveries || []).map(item => item.discoveryId));
  const exchanges = revelationHistoryWindows({ ...thread, messages: (thread.messages || []).slice(-12) }).flat().slice(-3);
  const latestReplyId = exchanges.at(-1)?.messages.find(item => item.role === "character")?.id;
  if (!latestReplyId || latestReplyId === history.lastFocusedReviewMessageId) return null;
  const conversation = words(exchanges.flatMap(item => item.messages.map(message => message.text)).join(" "));
  const definitions = (state?.definitions || []).filter(item => !confirmed.has(item.id) && (
    history.activeLeadId === item.id || [...words(`${item.truth} ${item.clue} ${item.directQuestion}`)]
      .filter(word => !common.has(word) && conversation.has(word)).length >= 2
  )).slice(0, 3);
  return definitions.length ? { definitions, exchanges, latestReplyId } : null;
}

export async function reviewFocusedDiscoveries(config, state, thread, review) {
  const packet = focusedDiscoveryPacket(state, thread);
  if (!packet) return null;
  let proposedCount = 0;
  const matches = await review(config, thread.character, packet.definitions, packet.exchanges, {
    live: true,
    onReviewResult: result => { proposedCount = Array.isArray(result.proposed?.matches) ? result.proposed.matches.length : 0; },
  });
  return { matches: matches.map(item => ({ ...item, origin: "live_chat" })),
    historyReview: { lastFocusedReviewMessageId: packet.latestReplyId, lastLiveReviewAt: new Date().toISOString(),
      focusedReview: { status: "complete", proposedCount, acceptedCount: matches.length,
        outcome: matches.length ? "matched" : proposedCount ? "evidence-not-validated" : "no-semantic-match" } } };
}
