// Temporary, local-only metadata trace. Never record chat text, titles or portraits.
export function createDiscoveryDiagnostics({ storage, now = Date.now, limit = 120 } = {}) {
  const key = "animessenger.discovery-diagnostics.v1";
  let events = [];
  return {
    record(event, detail = {}) {
      events.push({ at: now(), event, ...detail });
      events = events.slice(-limit);
      try { storage?.setItem(key, JSON.stringify(events)); } catch { /* Diagnostics must not affect dismissal. */ }
    },
    read: () => events.map(event => ({ ...event })),
  };
}
