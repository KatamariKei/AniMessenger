// Reuse only work currently in flight; neither results nor failures are cached.
export function createSingleFlight() {
  const pending = new Map();
  return function run(key, work) {
    if (pending.has(key)) return pending.get(key);
    const result = Promise.resolve().then(work).finally(() => {
      if (pending.get(key) === result) pending.delete(key);
    });
    pending.set(key, result);
    return result;
  };
}
