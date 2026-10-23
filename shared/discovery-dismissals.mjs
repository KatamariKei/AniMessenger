// UI dismissal is immediate and durable; server acknowledgement is retriable
// background work, never a lock on another notification's close button.
export function createDiscoveryDismissals({ storage, now = Date.now, retryMs = 10_000, key = "animessenger.discovery-dismissals.v1" } = {}) {
  let records = new Map();
  try {
    const saved = JSON.parse(storage?.getItem(key) || "[]");
    records = new Map(Array.isArray(saved) ? saved.filter(entry => Array.isArray(entry)
      && typeof entry[0] === "string" && typeof entry[1]?.threadId === "string") : []);
  } catch { /* A damaged local receipt must not break the notification UI. */ }
  const inFlight = new Set();
  const retryAt = new Map();
  const persist = () => {
    try { storage?.setItem(key, JSON.stringify([...records])); } catch { /* Storage may be unavailable. */ }
  };
  return {
    has: id => records.has(id),
    dismiss(threadId, id) {
      if (!records.has(id)) records.set(id, { threadId, acknowledged: false });
      persist();
    },
    async flush(threadId, acknowledge) {
      const tasks = [];
      for (const [id, record] of records) {
        if (record.threadId !== threadId || record.acknowledged || inFlight.has(id) || now() < (retryAt.get(id) || 0)) continue;
        inFlight.add(id);
        tasks.push(Promise.resolve().then(() => acknowledge(threadId, id)).then(() => {
          records.set(id, { ...record, acknowledged: true });
          retryAt.delete(id);
          persist();
        }, () => { retryAt.set(id, now() + retryMs); }).finally(() => inFlight.delete(id)));
      }
      await Promise.all(tasks);
    },
  };
}
