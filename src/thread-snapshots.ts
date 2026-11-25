import type { Message, Thread } from "./api";

// Character IDs are reusable. Conversation instance IDs are not.
export function createThreadSnapshotMerger() {
  const retired = new Map<string, Set<string>>();
  function retire(thread: Thread) {
    const instances = retired.get(thread.id) || new Set<string>();
    instances.add(thread.storageInstanceId || "legacy");
    retired.set(thread.id, instances);
  }
  function merge(existing: Thread | undefined, next: Thread): Thread | undefined {
    if (retired.get(next.id)?.has(next.storageInstanceId || "legacy")) return existing;
    if (!existing) return next;
    if (existing.storageInstanceId !== next.storageInstanceId) {
      // An unversioned response cannot replace a versioned conversation.
      if (!next.storageInstanceId) return existing;
      retire(existing);
      return next;
    }
    const timestampOrder = String(next.updatedAt || "").localeCompare(String(existing.updatedAt || ""));
    const revisionOrder = (next.storageRevision || 0) - (existing.storageRevision || 0);
    const newest = (timestampOrder || revisionOrder) >= 0 ? next : existing;
    const older = newest === next ? existing : next;
    const messages = new Map(older.messages.map(message => [message.id, message]));
    for (const message of newest.messages) {
      const merged: Message = { ...messages.get(message.id), ...message };
      if (!Object.hasOwn(message, "delivery")) delete merged.delivery;
      messages.set(message.id, merged);
    }
    const newestIds = new Set(newest.messages.map(message => message.id));
    return {
      ...newest,
      ...(newest.summary && !older.summary ? { profile: older.profile, summary: false } : {}),
      messages: [
        ...newest.messages.map(message => messages.get(message.id)!),
        ...older.messages.filter(message => !newestIds.has(message.id)).map(message => messages.get(message.id)!),
      ],
    };
  }
  const isRetired = (thread: Thread) => Boolean(retired.get(thread.id)?.has(thread.storageInstanceId || "legacy"));
  return { merge, retire, isRetired };
}
