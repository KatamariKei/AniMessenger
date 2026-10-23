export function journeyActivityFingerprint(journey, previousFingerprint) {
  const discovery = journey?.discoveries || {};
  let previous = {};
  try { previous = JSON.parse(previousFingerprint || "{}"); } catch { /* First observation. */ }
  const resultStatus = (status, terminal, previousStatus) => terminal.includes(status) ? status : previousStatus;
  const historyFinished = ["complete", "failed", "interrupted"].includes(discovery.history?.status);
  return JSON.stringify({
    achievements: (journey?.achievements || []).map(item => [item.id, item.progress, item.earned, item.earnedAt]),
    milestones: (journey?.milestones || []).map(item => [item.id, item.earnedAt]),
    research: [resultStatus(discovery.status, ["ready", "limited", "failed"], previous.research?.[0]), discovery.leadAvailability?.prepared || 0],
    history: [resultStatus(discovery.history?.status, ["complete", "failed", "interrupted"], previous.history?.[0]), discovery.history?.confirmed || 0],
    scanCompletedAt: historyFinished ? discovery.history?.completedAt : previous.scanCompletedAt,
    leads: (discovery.leads || []).map(item => [item.id, item.clue]),
    revealed: (discovery.revealed || []).map(item => [item.id,
      resultStatus(item.artwork?.status, ["complete", "error"], previous.revealed?.find(old => old[0] === item.id)?.[1]), item.artwork?.imageUrl]),
  });
}

export function updateJourneyActivity(previous, fingerprint, viewed) {
  const seen = viewed || !previous ? fingerprint : previous.seen;
  return { observed: fingerprint, seen, unread: !viewed && (Boolean(previous?.unread) || fingerprint !== seen) };
}
