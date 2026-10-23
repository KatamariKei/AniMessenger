// Automatic preparation only queues source research. Conversation reviews and
// unlock/bonus operations deliberately remain separate, explicit workflows.
export function createAutomaticDiscoveryPreparation({ identity, store, jobs, schedule }) {
  const pending = new Map();
  return function prepare(thread, { journeyVisit = false } = {}) {
    if (!thread?.profile || (!journeyVisit && thread.firstContact?.openingImage?.status !== "complete")) return Promise.resolve(false);
    const key = identity(thread.character);
    if (pending.has(key)) return pending.get(key);
    const work = (async () => {
      if (jobs.has(key)) return false;
      const state = await store.load(thread.character);
      if (jobs.has(key) || state?.definitions?.length
        || (state?.status && !["unprepared", "queued", "preparing"].includes(state.status))) return false;
      // Reserve before saving so concurrent image recovery / Journey visits
      // cannot create duplicate jobs. Failed research requires a manual retry.
      jobs.set(key, { threadId: thread.id, character: thread.character });
      try { await store.save(thread.character, { status: "queued" }, { enrich: true }); }
      catch (error) { jobs.delete(key); throw error; }
      schedule();
      return true;
    })();
    pending.set(key, work);
    return work.finally(() => { pending.delete(key); });
  };
}
