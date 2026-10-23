// Shared across component remounts: UI events cannot bypass transport rate limits.
export function createRateLimitedPoller({ minimumInterval = 10_000, maximumBackoff = 60_000, now = Date.now } = {}) {
  const entries = new Map();
  function run(key, task) {
    let entry = entries.get(key);
    if (!entry) { entry = { nextAt: 0, failures: 0, pending: null }; entries.set(key, entry); }
    if (entry.pending) return entry.pending;
    if (now() < entry.nextAt) return Promise.resolve({ status: "skipped" });
    entry.nextAt = now() + minimumInterval;
    const pending = Promise.resolve().then(task).then(value => {
      entry.failures = 0;
      entry.nextAt = now() + minimumInterval;
      return { status: "success", value };
    }, () => {
      entry.failures = Math.min(6, entry.failures + 1);
      entry.nextAt = now() + Math.min(maximumBackoff, minimumInterval * 2 ** entry.failures);
      return { status: "error" };
    }).finally(() => { if (entry.pending === pending) entry.pending = null; });
    entry.pending = pending;
    return pending;
  }
  return { run };
}

export const notificationPoller = createRateLimitedPoller();
export const discoveryNotificationPoller = createRateLimitedPoller({ minimumInterval: 2_000 });
