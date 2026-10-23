import tiers from "../shared/relationship-tiers.json" with { type: "json" };

export function relationshipTier(value) {
  const score = Math.max(0, Math.min(100, Number(value) || 0));
  return tiers.findLast(tier => score >= tier.threshold);
}

export function relationshipStage(value) {
  const score = Math.max(0, Math.min(100, Number(value) || 0));
  if (score >= 91) return "deeply close";
  if (score >= 71) return "close";
  if (score >= 41) return "trusted";
  if (score >= 21) return "familiar";
  return "new acquaintance";
}

export function relationshipGuidance(value) {
  const stage = relationshipStage(value);
  const shared = [
    "Closeness represents earned familiarity and trust, not obedience, automatic romance, or constant affection.",
    "Closeness measures emotional trust, not elapsed time. A high score never creates extra days together, repeated encounters, an established routine, or off-screen shared history.",
    "Treat supplied messages and durable memories as the only factual source of shared chronology. Never claim 'we always do this,' 'every time,' or 'we have done this hundreds or thousands of times' unless that repetition is actually supported there.",
    "Duration hyperbole must be clearly framed as a feeling, such as 'it feels like forever,' rather than stated as a factual memory.",
    "Keep the character's core personality, opinions, boundaries, and capacity to disagree.",
    "Express stable traits differently with this user as trust grows. Do not keep replaying stranger-stage suspicion, introductions, or defensive reactions after they no longer fit.",
    "At trusted or higher stages, ordinary contact from the user must not be treated as a recurring social emergency. Panic, hostility, humiliation, or alarm require a proportionately strong present-moment trigger; positive enthusiasm, relief, humor, and affection may freely match the user's emotional energy when they fit the character.",
  ];
  const stages = {
    "new acquaintance": "The user is still unfamiliar. Be appropriately cautious, reserved, formal, curious, or testing according to the character, without manufacturing hostility.",
    familiar: "The user is recognizable and their presence is no longer surprising. Assume basic good intent, remember conversational patterns, and let some guard down while retaining meaningful boundaries.",
    trusted: "The character trusts the user's intent. Speak more directly, share real opinions, use comfortable humor or shorthand, and allow selective vulnerability. Ordinary contact should not trigger alarm or exaggerated embarrassment, but welcome or exciting moments can still produce lively positive reactions.",
    close: "The relationship is established and comfortable. Use shared context, relaxed shorthand, candid opinions, playful disagreement, and unforced vulnerability. The user should feel like a familiar safe person, not a recurring social emergency.",
    "deeply close": "The user is part of the character's inner circle. Be deeply familiar, secure, candid, and emotionally nuanced. Let the character ask for support, disagree safely, tease, be quiet, or discuss ordinary things without performing their most recognizable traits. Extreme distress, panic, anger, or defensiveness require a genuinely strong trigger; joy, relief, desire, and affection may be openly expressive when the present moment supports them.",
  };
  return [...shared, "RELATIONSHIP STAGE: " + stage + ". " + stages[stage]].join("\n");
}

export function applyRelationshipDelta(value, proposedDelta, storedMomentum = 0, maximum = 100) {
  const score = Math.max(0, Math.min(maximum, Number(value) || 0));
  const proposed = Math.max(-2, Math.min(2, Math.trunc(Number(proposedDelta) || 0)));
  let momentum = Math.max(0, Math.min(2, Math.trunc(Number(storedMomentum) || 0)));
  let applied = proposed;

  // Positive progression slows as trust deepens without throwing meaningful
  // moments away. Ordinary +1 moments bank toward the next point while rare
  // +2 moments still move the relationship immediately.
  if (proposed < 0) {
    momentum = 0;
  } else if (proposed > 0 && score >= 91) {
    if (proposed >= 2) {
      applied = 1;
    } else {
      momentum += 1;
      applied = momentum >= 3 ? 1 : 0;
      if (applied) momentum -= 3;
    }
  } else if (proposed > 0 && score >= 71) {
    if (proposed >= 2) {
      applied = 1;
    } else {
      momentum += 1;
      applied = momentum >= 2 ? 1 : 0;
      if (applied) momentum -= 2;
    }
  } else if (proposed > 0 && score >= 41) {
    applied = 1;
    momentum = 0;
  } else if (score < 71) {
    momentum = 0;
  }

  const relationship = Math.max(0, Math.min(maximum, score + applied));
  if (relationship >= maximum) momentum = 0;

  return {
    appliedDelta: applied,
    relationship,
    relationshipMomentum: momentum,
  };
}

export function normalizeRelationshipProgress(thread = {}) {
  const score = Math.max(0, Math.min(200, Number(thread.bondScore ?? thread.relationship ?? 8) || 0));
  const peak = Math.max(score, Math.min(200, Number(thread.progressionPeak ?? score) || 0));
  const milestones = Array.isArray(thread.relationshipMilestones) ? thread.relationshipMilestones.slice(-10) : [];
  return {
    bondScore: score,
    progressionPeak: peak,
    progressionRevision: Math.max(0, Number(thread.progressionRevision) || 0),
    discoveryAwardIds: [...new Set(Array.isArray(thread.discoveryAwardIds) ? thread.discoveryAwardIds.filter(id => typeof id === "string") : [])],
    relationship: Math.min(100, score),
    relationshipTier: score >= 200 ? "Soulbound" : relationshipTier(score).label,
    soulboundEarned: Boolean(thread.soulboundEarned || milestones.some(event => event.kind === "soulbound")),
    relationshipMomentum: Math.max(0, Math.min(2, Number(thread.relationshipMomentum) || 0)),
    relationshipMilestones: milestones,
    progressionTurnIds: Array.isArray(thread.progressionTurnIds) ? thread.progressionTurnIds.slice(-100) : [],
  };
}

export function progressRelationship(thread, delta, sourceMessageId, now = new Date()) {
  const current = normalizeRelationshipProgress(thread);
  if (!sourceMessageId || current.progressionTurnIds.includes(sourceMessageId)) return current;
  const result = applyRelationshipDelta(current.bondScore, delta, current.relationshipMomentum, 200);
  const score = result.relationship;
  const events = [...tiers.filter(tier => tier.threshold > current.progressionPeak && tier.threshold <= score),
    ...(current.progressionPeak < 200 && score >= 200 ? [{ threshold: 200, label: "Soulbound" }] : [])]
    .map(tier => ({ id: `${thread.id}:bond:${tier.threshold}`, kind: tier.threshold === 200 ? "soulbound" : "relationship_tier", label: tier.label, sourceMessageId, earnedAt: now.toISOString() }));
  return normalizeRelationshipProgress({
    ...current,
    bondScore: score,
    progressionPeak: Math.max(current.progressionPeak, score),
    progressionRevision: current.progressionRevision + 1,
    relationshipMomentum: result.relationshipMomentum,
    relationshipMilestones: [...current.relationshipMilestones, ...events],
    progressionTurnIds: [...current.progressionTurnIds, sourceMessageId],
  });
}

export function discoveryBondBonus(thread, discoveryIds, now = new Date()) {
  const current = normalizeRelationshipProgress(thread);
  const newIds = [...new Set(discoveryIds)].filter(id => typeof id === "string" && !current.discoveryAwardIds.includes(id));
  if (!newIds.length) return current;
  const score = Math.min(200, current.bondScore + newIds.length * 5);
  const events = [...tiers.filter(tier => tier.threshold > current.progressionPeak && tier.threshold <= score),
    ...(current.progressionPeak < 200 && score >= 200 ? [{ threshold: 200, label: "Soulbound" }] : [])]
    .map(tier => ({ id: `${thread.id}:bond:${tier.threshold}`, kind: tier.threshold === 200 ? "soulbound" : "relationship_tier", label: tier.label, earnedAt: now.toISOString() }));
  return normalizeRelationshipProgress({ ...current, bondScore: score, progressionPeak: Math.max(current.progressionPeak, score),
    progressionRevision: current.progressionRevision + 1, discoveryAwardIds: [...current.discoveryAwardIds, ...newIds],
    relationshipMilestones: [...current.relationshipMilestones, ...events] });
}

// Apply to every JSON response, including nested guest and full-thread payloads.
export function progressionResponseReplacer(key, value) {
  return ["bondScore", "progressionPeak", "progressionTurnIds", "discoveryAwardIds", "achievementShadow"].includes(key) ? undefined : value;
}

export function preserveNewerRelationshipProgress(current, incoming) {
  return Number(current?.progressionRevision || 0) > Number(incoming?.progressionRevision || 0)
    ? normalizeRelationshipProgress(current) : {};
}
