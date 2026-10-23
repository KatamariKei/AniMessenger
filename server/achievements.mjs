import definitions from "../shared/achievements.json" with { type: "json" };
import { destinationKey, normalizeAchievementTracking, sceneActivityProposal, sharedActivityKey, sceneDestinationProposal, sceneLaughterProposal, trackAchievementCandidate } from "./achievement-events.mjs";

export const achievementDefinitions = Object.freeze(definitions.map(item => Object.freeze(item)));

export function normalizeAchievementShadow(thread = {}) {
  const state = thread.achievementShadow || {};
  return {
    achievementShadow: {
      revision: Math.max(0, Math.trunc(Number(state.revision) || 0)),
      // This is a bounded evaluation sample, not earned progress or an award ledger.
      turns: Array.isArray(state.turns) ? state.turns.slice(-100) : [],
      tracking: normalizeAchievementTracking(structuredClone(state.tracking || {})),
      verifiedTracking: normalizeAchievementTracking(structuredClone(state.verifiedTracking || {})),
      reviews: Array.isArray(state.reviews) ? state.reviews.slice(-200) : [],
    },
  };
}

export function preserveNewerAchievementShadow(current, incoming) {
  return Number(current?.achievementShadow?.revision || 0) > Number(incoming?.achievementShadow?.revision || 0)
    ? normalizeAchievementShadow(current) : {};
}

export function reconsiderDestinationShadow(thread) {
  let state = normalizeAchievementShadow(thread).achievementShadow;
  for (const turn of [...state.turns]) {
    if (!turn.context?.complete || !turn.signals?.some(signal => signal.id === "new-horizons"
      && ["ambiguous-destination", "unsupported-quotation", "missing-completed-arrival"].includes(signal.reason))) continue;
    const exchange = { userMessageId: turn.userMessageId, characterMessageId: turn.characterMessageId, ...turn.context };
    if (!sceneDestinationProposal(exchange)) continue;
    const next = evaluateAchievementShadow({ ...thread, achievementShadow: { ...state, turns: state.turns.filter(item => item.userMessageId !== turn.userMessageId) } }, exchange, [], new Date(turn.recordedAt));
    const rebuilt = next.achievementShadow.turns.at(-1);
    if (!rebuilt?.signals.some(signal => signal.id === "new-horizons" && signal.reason === "provisional-evidence-chain")) continue;
    state = { ...next.achievementShadow, turns: state.turns.map(item => item.userMessageId === turn.userMessageId
      ? { ...turn, signals: [...turn.signals.filter(signal => signal.id !== "new-horizons"), ...rebuilt.signals], context: rebuilt.context } : item) };
  }
  return { achievementShadow: state };
}

export function reconsiderLaughterShadow(thread) {
  let state = normalizeAchievementShadow(thread).achievementShadow;
  if (state.verifiedTracking.laughter.length >= 5) return { achievementShadow: state };
  // Rebuild only laughter candidates from the recent saved exchanges. Preserve
  // other signals, reviews, verified progress and all conversation content.
  const messages = (thread.messages || []).slice(-200);
  for (let index = 1; index < messages.length; index++) {
    const character = messages[index], user = messages[index - 1];
    if (user.from !== "user" || character.from !== "character") continue;
    const exchange = { userMessageId: user.id, characterMessageId: character.id,
      userText: user.text || "", characterText: character.narration || character.text || "", scene: {} };
    const proposal = sceneLaughterProposal(exchange);
    if (!proposal || state.verifiedTracking.laughter.some(item => item.userMessageId === user.id)) continue;
    const old = state.turns.find(item => item.userMessageId === user.id);
    if (old?.signals?.some(item => item.id === "shared-laughter" && item.reason === "provisional-evidence-chain")) continue;
    const rebuilt = evaluateAchievementShadow({ ...thread, achievementShadow: { ...state, turns: state.turns.filter(item => item.userMessageId !== user.id) } }, exchange, [proposal], new Date(character.time || Date.now())).achievementShadow;
    const turn = rebuilt.turns.at(-1);
    const laughter = turn?.signals.filter(item => item.id === "shared-laughter") || [];
    if (!laughter.some(item => item.reason === "provisional-evidence-chain")) continue;
    state = { ...rebuilt, turns: old ? state.turns.map(item => item === old ? { ...old,
      signals: [...old.signals.filter(signal => signal.id !== "shared-laughter"), ...laughter],
      context: { ...turn.context, scene: old.context?.scene || {} } } : item) : rebuilt.turns };
  }
  return { achievementShadow: state };
}

export function evaluateAchievementShadow(thread, exchange, proposals = [], now = new Date()) {
  const { achievementShadow: current } = normalizeAchievementShadow(thread);
  if (!exchange.userMessageId || !exchange.characterMessageId || current.turns.some(turn => turn.userMessageId === exchange.userMessageId)) {
    return { achievementShadow: current };
  }
  const signals = [];
  let tracking = current.tracking;
  const seen = new Set();
  const destination = sceneDestinationProposal(exchange);
  const laughter = current.verifiedTracking.laughter.length < 5 ? sceneLaughterProposal(exchange) : null;
  const supplied = (Array.isArray(proposals) ? proposals : []).slice(0, 5);
  const activity = current.verifiedTracking.activities.length < 3 ? sceneActivityProposal(exchange) : null;
  let candidates = laughter ? [laughter, ...supplied.filter(item => item?.id !== "shared-laughter")] : supplied;
  if (activity) candidates = [activity, ...candidates.filter(item => item?.id !== "time-well-spent")];
  const alreadyVerified = destination && current.verifiedTracking.destinations.some(item => item.key === destinationKey(destination.subject));
  const screened = destination ? [...candidates.filter(item => item?.id !== "new-horizons"), ...(alreadyVerified ? [] : [destination])] : candidates;
  for (const proposal of screened.slice(0, 5)) {
    const definition = achievementDefinitions.find(item => item.id === proposal?.id);
    if (!definition || seen.has(definition.id)) continue;
    seen.add(definition.id);
    const evidence = Array.isArray(proposal.evidence) ? proposal.evidence.slice(0, 3) : [];
    let reason = "needs-semantic-review";
    const supported = evidence.length > 0 && evidence.every(item => {
      const text = item?.source === "user" ? exchange.userText : item?.source === "character" ? exchange.characterText : "";
      return typeof item?.quote === "string" && item.quote.trim().length >= 8 && item.quote.length <= 400
        && String(text || "").includes(item.quote);
    });
    if (proposal.actor !== "shared" || proposal.phase !== "completed") reason = "wrong-participant-or-not-completed";
    else if (!supported) reason = "unsupported-quotation";
    else if (!["arrival", "shared_activity"].includes(proposal.event) && evidence.some(item => /\b(tomorrow|maybe|might|would|will|plan(?:ning)? to|going to|if we)\b/i.test(item.quote))) reason = "ambiguous-or-planned";
    if (reason === "needs-semantic-review" && proposal.event) {
      const tracked = trackAchievementCandidate(tracking, proposal, evidence, exchange);
      tracking = tracked.state;
      reason = tracked.reason;
      if (proposal.event === "arrival" && reason === "repeat-destination" && !current.verifiedTracking.destinations.some(item => item.key === destinationKey(proposal.subject))) reason = "provisional-evidence-chain";
      if (proposal.event === "shared_activity" && reason === "repeat-activity" && !current.verifiedTracking.activities.some(item => item.key === sharedActivityKey(proposal.subject))) reason = "provisional-evidence-chain";
    }
    // Exact quotations and rule screening do not prove semantic truth. Nothing awards points.
    signals.push({ id: definition.id, version: definition.version, reason,
      event: proposal.event || null, subject: typeof proposal.subject === "string" ? proposal.subject.slice(0, 100) : null,
      occasion: typeof proposal.occasion === "string" ? proposal.occasion.slice(0, 100) : null,
      evidence: supported ? evidence.map(item => ({ source: item.source, quote: item.quote })) : [] });
  }
  return { achievementShadow: {
    revision: current.revision + 1,
    tracking,
    verifiedTracking: current.verifiedTracking,
    reviews: current.reviews,
    turns: [...current.turns, {
      userMessageId: exchange.userMessageId,
      characterMessageId: exchange.characterMessageId,
      characterId: thread.character?.id || null,
      recordedAt: now.toISOString(), signals,
      ...(signals.length ? { context: {
        userText: String(exchange.userText || "").slice(0, 4000),
        characterText: String(exchange.characterText || "").slice(0, 8000),
        complete: String(exchange.userText || "").length <= 4000 && String(exchange.characterText || "").length <= 8000,
        scene: { location: exchange.scene?.location || "", presence: exchange.scene?.presence || "uncertain" },
      } } : {}),
    }].slice(-100),
  } };
}

export const achievementShadowInstructions = "ACHIEVEMENT CANDIDATES: optionally return achievementSignals, at most five objects {id,event,subject,occasion:null,actor:'shared',phase:'completed',evidence:[{source:'user'|'character',quote}]}. Copy short exact quotations only from this latest user message and your visible reply/narration. IDs: shared-laughter event laughter (genuine laughter caused by the user); new-horizons event arrival (completed shared venue visit); heartfelt event feelings (meaningful affection, appreciation, friendship or trust); time-well-spent event shared_activity (an activity actually enjoyed together, such as watching a film, cooking, gaming, walking, soaking or dining). Activities count when meaningfully underway or completed, not only when someone explicitly says finished. Do not count plans, merely discussing an activity, routine posture or garment changes, or manufacture narrative milestones. Getting to know you is calculated by the application from confirmed discoveries; never propose it. Empty array if uncertain. Never award points or announce achievements.";

export function achievementTrackingInstructions(thread) {
  const { tracking } = normalizeAchievementShadow(thread).achievementShadow;
  return "For shared_activity, subject is a short activity category (watching, cooking, games, walking, bathing, dining, music, creating, or another concrete shared activity); repeated descriptions of the same activity are not new progress. For arrival subject is the enclosing venue, not its room. occasion is null. Do not force story behavior to fit bookkeeping. Provisional activity categories (not proof): " + JSON.stringify(tracking.activities.map(item => item.key));
}
