import fs from "node:fs/promises";
import path from "node:path";
import { dataDir } from "./config.mjs";
import { mergeMemories, normalizeForgottenMemories, removeUnsupportedNamedMemories, rememberForgottenMemory } from "./memory.mjs";
import { normalizeConversationMode } from "./narrative-mode.mjs";
import { normalizeSceneState } from "./scene-state.mjs";
import { stripStructuredMetadataLeak } from "./structured-text.mjs";
import { discoveryBondBonus, normalizeRelationshipProgress, preserveNewerRelationshipProgress } from "./relationship.mjs";
import { preserveNewerAchievementShadow, reconsiderDestinationShadow, reconsiderLaughterShadow } from "./achievements.mjs";
import { mergeAchievementReviews, recoverVerifiedDestinationEvidence } from "./achievement-review.mjs";
import { recordMemoryReviewMetrics } from "./memory-health.mjs";

const threadsDir = path.join(dataDir, "threads");
const profilesDir = path.join(dataDir, "profiles");
const uploadsDir = path.join(dataDir, "uploads");
let threadCache = null;
const threadWriteQueues = new Map();

function safeId(value) {
  const id = String(value || "").replace(/[^a-zA-Z0-9()_.-]/g, "-").slice(0, 140);
  if (!id) throw new Error("A valid local id is required.");
  return id;
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function enqueueThreadWrite(key, work) {
  const prior = threadWriteQueues.get(key) || Promise.resolve();
  const next = prior.catch(() => {}).then(work);
  threadWriteQueues.set(key, next);
  return next.finally(() => {
    if (threadWriteQueues.get(key) === next) threadWriteQueues.delete(key);
  });
}

async function currentStoredThread(key) {
  if (threadCache?.has(key)) return threadCache.get(key);
  try {
    return canonicalThread(await readJson(path.join(threadsDir, key + ".json")));
  } catch (error) {
    if (error && error.code === "ENOENT") return null;
    throw error;
  }
}

export function preserveNewerMemoryState(current, incoming) {
  const incomingMemoryRevision = Number(incoming?.memoryRevision || 0);
  const currentMemoryRevision = Number(current?.memoryRevision || 0);
  if (currentMemoryRevision <= incomingMemoryRevision) return {};
  return {
    memories: current.memories,
    forgottenMemories: current.forgottenMemories,
    memoryCheckpoint: current.memoryCheckpoint,
    memoryHealthMetrics: current.memoryHealthMetrics,
    memoryRevision: currentMemoryRevision,
  };
}

function canonicalThread(thread) {
  if (!thread) return thread;
  const canonicalMessages = Array.isArray(thread.messages) ? thread.messages.map((message) => message?.from === "character"
    ? {
        ...message,
        ...(typeof message.text === "string" ? { text: stripStructuredMetadataLeak(message.text) } : {}),
        ...(typeof message.narration === "string" ? { narration: stripStructuredMetadataLeak(message.narration) } : {}),
      }
    : message) : thread.messages;
  const groundedMemories = Array.isArray(thread.memories)
    ? removeUnsupportedNamedMemories(thread.memories, canonicalMessages)
    : thread.memories;
  return {
    ...thread,
    ...normalizeRelationshipProgress(thread),
    ...recoverVerifiedDestinationEvidence(thread),
    ...(Array.isArray(canonicalMessages) ? { messages: canonicalMessages } : {}),
    conversationMode: normalizeConversationMode(thread.conversationMode),
    scene: thread.scene ? normalizeSceneState({ environment: "", ...thread.scene }) : thread.scene,
    ...(Array.isArray(groundedMemories) ? { memories: mergeMemories(groundedMemories, []) } : {}),
    ...(Array.isArray(thread.forgottenMemories) ? { forgottenMemories: normalizeForgottenMemories(thread.forgottenMemories) } : {}),
  };
}

export async function listThreads() {
  if (threadCache) return sortThreads([...threadCache.values()]);
  await fs.mkdir(threadsDir, { recursive: true });
  const names = await fs.readdir(threadsDir);
  const threads = [];
  for (const name of names.filter((item) => item.endsWith(".json"))) {
    try {
      threads.push(canonicalThread(await readJson(path.join(threadsDir, name))));
    } catch {
      // One damaged local thread should not hide the others.
    }
  }
  threadCache = new Map(threads.map((thread) => [safeId(thread.id), thread]));
  return sortThreads(threads);
}

export function sortThreads(threads = []) {
  return [...threads].sort((a, b) => {
    const pinned = Number(Boolean(b?.pinned)) - Number(Boolean(a?.pinned));
    return pinned || String(b?.updatedAt || "").localeCompare(String(a?.updatedAt || ""));
  });
}

export function summarizeThread(thread) {
  const profile = thread.profile ? {
    profileVersion: thread.profile.profileVersion,
    id: thread.profile.id,
    name: thread.profile.name,
    series: thread.profile.series,
    age: thread.profile.age,
    status: thread.profile.status,
    summary: thread.profile.summary,
    openingLine: thread.profile.openingLine,
    socialIdentity: thread.profile.socialIdentity,
    visual: thread.profile.visual,
    persona: { speechStyle: thread.profile.persona?.speechStyle || "Speak naturally in character." },
  } : thread.profile;
  return {
    ...thread,
    profile,
    messages: thread.messages?.length ? [thread.messages.at(-1)] : [],
    memories: undefined,
    forgottenMemories: undefined,
    summary: true,
    messageCount: thread.messages?.length || 0,
    memoryCount: thread.memories?.length || 0,
  };
}

export async function listThreadSummaries() {
  const threads = await listThreads();
  return threads.map(summarizeThread);
}

export async function loadThread(id) {
  const key = safeId(id);
  if (threadCache?.has(key)) return threadCache.get(key);
  try {
    const thread = canonicalThread(await readJson(path.join(threadsDir, key + ".json")));
    if (threadCache) threadCache.set(key, thread);
    return thread;
  } catch (error) {
    if (error && error.code === "ENOENT") return null;
    throw error;
  }
}

export async function deleteThread(id) {
  const key = safeId(id);
  return enqueueThreadWrite(key, async () => {
    try {
      await fs.unlink(path.join(threadsDir, key + ".json"));
      if (threadCache) threadCache.delete(key);
      return true;
    } catch (error) {
      if (error && error.code === "ENOENT") return false;
      throw error;
    }
  });
}

export async function saveThread(thread, options = {}) {
  const key = safeId(thread.id);
  return enqueueThreadWrite(key, async () => {
    const current = await currentStoredThread(key);
    const memoryState = preserveNewerMemoryState(current, thread);
    const progressionState = preserveNewerRelationshipProgress(current, thread);
    const achievementState = preserveNewerAchievementShadow(current, thread);
    const updatedAt = options.preserveUpdatedAt && thread.updatedAt ? thread.updatedAt : new Date().toISOString();
    const next = canonicalThread({ ...thread, ...memoryState, ...progressionState, ...achievementState, updatedAt });
    await writeJson(path.join(threadsDir, key + ".json"), next);
    if (threadCache) threadCache.set(key, next);
    return next;
  });
}

export async function mergeThreadMemoryCheckpoint(id, candidates, checkpoint = {}, achievementReview = null) {
  const key = safeId(id);
  return enqueueThreadWrite(key, async () => {
    const current = await currentStoredThread(key);
    if (!current) return null;
    const now = new Date();
    const next = canonicalThread({
      ...current,
      ...(achievementReview ? mergeAchievementReviews(current, achievementReview.batch, achievementReview.decisions) : {}),
      memories: mergeMemories(current.memories, candidates, undefined, now, { forgottenMemories: current.forgottenMemories, messages: current.messages }),
      memoryCheckpoint: {
        ...(current.memoryCheckpoint || {}),
        ...checkpoint,
        lastReviewedAt: now.toISOString(),
        lastError: undefined,
      },
      memoryRevision: Number(current.memoryRevision || 0) + 1,
      updatedAt: current.updatedAt,
    });
    next.memoryHealthMetrics = recordMemoryReviewMetrics(current, next, candidates.length, now);
    await writeJson(path.join(threadsDir, key + ".json"), next);
    if (threadCache) threadCache.set(key, next);
    return next;
  });
}

export async function mergeThreadHistoricalMemories(id, candidates, complete = false) {
  const key = safeId(id);
  return enqueueThreadWrite(key, async () => {
    const current = await currentStoredThread(key);
    if (!current) throw new Error("That conversation no longer exists.");
    const memories = mergeMemories(current.memories, candidates, undefined, new Date(), { forgottenMemories: current.forgottenMemories, messages: current.messages });
    const next = canonicalThread({ ...current, memories,
      ...(complete ? { memoryBackfilledAt: new Date().toISOString() } : {}),
      memoryRevision: Number(current.memoryRevision || 0) + 1 });
    if (candidates.length) next.memoryHealthMetrics = recordMemoryReviewMetrics(current, next, candidates.length);
    await writeJson(path.join(threadsDir, key + ".json"), next);
    if (threadCache) threadCache.set(key, next);
    return { thread: next, added: Math.max(0, memories.length - (current.memories || []).length) };
  });
}

export async function consolidateThreadMemories(id, plan) {
  const key = safeId(id);
  return enqueueThreadWrite(key, async () => {
    const current = await currentStoredThread(key);
    if (!current) throw new Error("That conversation no longer exists.");
    const memories = structuredClone(current.memories || []);
    const removed = new Set();
    for (const group of plan?.groups || []) {
      const records = group.ids.map(memoryId => memories.find(memory => memory.id === memoryId));
      if (records.length < 2 || records.some(memory => !memory || removed.has(memory.id))) throw new Error("A reviewed memory changed. Review the consolidation again.");
      const target = records[0];
      target.sourceMessageIds = [...new Set(records.flatMap(memory => memory.sourceMessageIds || []))];
      target.keywords = [...new Set(records.flatMap(memory => memory.keywords || []))];
      target.importance = Math.max(...records.map(memory => Number(memory.importance) || 1));
      target.userEdited = true;
      target.updatedAt = new Date().toISOString();
      records.slice(1).forEach(memory => removed.add(memory.id));
    }
    let forgottenMemories = current.forgottenMemories;
    for (const memoryId of plan?.removeIds || []) {
      const memory = memories.find(item => item.id === memoryId);
      if (!memory || removed.has(memoryId)) throw new Error("A reviewed memory changed. Review the consolidation again.");
      removed.add(memoryId);
      forgottenMemories = rememberForgottenMemory(forgottenMemories, memory);
    }
    const next = canonicalThread({ ...current, memories: memories.filter(memory => !removed.has(memory.id)), forgottenMemories,
      memoryRevision: Number(current.memoryRevision || 0) + 1 });
    await writeJson(path.join(threadsDir, key + ".json"), next);
    if (threadCache) threadCache.set(key, next);
    return next;
  });
}

export async function reconsiderThreadDestinations(id) {
  const key = safeId(id);
  return enqueueThreadWrite(key, async () => {
    const current = await currentStoredThread(key);
    if (!current) return null;
    const shadow = reconsiderDestinationShadow(current);
    if (shadow.achievementShadow.revision === Number(current.achievementShadow?.revision || 0)) return current;
    const next = canonicalThread({ ...current, ...shadow });
    await writeJson(path.join(threadsDir, key + ".json"), next);
    if (threadCache) threadCache.set(key, next);
    return next;
  });
}

export async function reconsiderThreadLaughter(id) {
  const key = safeId(id);
  return enqueueThreadWrite(key, async () => {
    const current = await currentStoredThread(key);
    if (!current) return null;
    const shadow = reconsiderLaughterShadow(current);
    if (shadow.achievementShadow.revision === Number(current.achievementShadow?.revision || 0)) return current;
    const next = canonicalThread({ ...current, ...shadow });
    await writeJson(path.join(threadsDir, key + ".json"), next);
    if (threadCache) threadCache.set(key, next);
    return next;
  });
}

export async function awardDiscoveryBonuses(id, discoveryIds) {
  const key = safeId(id);
  return enqueueThreadWrite(key, async () => {
    const current = await currentStoredThread(key);
    if (!current) return null;
    const progress = discoveryBondBonus(current, discoveryIds);
    if (progress.progressionRevision === Number(current.progressionRevision || 0)) return current;
    const next = canonicalThread({ ...current, ...progress });
    await writeJson(path.join(threadsDir, key + ".json"), next);
    if (threadCache) threadCache.set(key, next);
    return next;
  });
}

export async function recordThreadMemoryCheckpointError(id, error) {
  const key = safeId(id);
  return enqueueThreadWrite(key, async () => {
    const current = await currentStoredThread(key);
    if (!current) return null;
    const next = canonicalThread({
      ...current,
      memoryCheckpoint: {
        ...(current.memoryCheckpoint || {}),
        lastAttemptAt: new Date().toISOString(),
        lastError: String(error || "Automatic memory review could not finish.").slice(0, 300),
      },
      memoryRevision: Number(current.memoryRevision || 0) + 1,
      updatedAt: current.updatedAt,
    });
    await writeJson(path.join(threadsDir, key + ".json"), next);
    if (threadCache) threadCache.set(key, next);
    return next;
  });
}

export async function createThread(character) {
  const existing = await loadThread(character.id);
  if (existing) return existing;
  return saveThread({
    id: character.id,
    character,
    messages: [],
    relationship: 8,
    conversationMode: "chat",
    unreadCount: 0,
    scene: {
      location: "somewhere familiar",
      environment: "",
      activity: "chatting with you",
      outfit: "default outfit",
      expression: "natural expression",
      lighting: "soft natural light",
      presence: "apart",
    },
    updatedAt: new Date().toISOString(),
  });
}

export async function loadProfile(id) {
  try {
    return await readJson(path.join(profilesDir, safeId(id) + ".json"));
  } catch (error) {
    if (error && error.code === "ENOENT") return null;
    throw error;
  }
}

export async function saveProfile(profile) {
  await writeJson(path.join(profilesDir, safeId(profile.id) + ".json"), profile);
  return profile;
}

export async function saveUpload(dataUrl) {
  const match = /^data:(image\/(?:png|jpeg|webp|gif));base64,([a-zA-Z0-9+/=\s]+)$/.exec(dataUrl || "");
  if (!match) throw new Error("Only PNG, JPEG, WebP, and GIF images can be shared.");
  const extension = match[1].split("/")[1].replace("jpeg", "jpg");
  const name = Date.now() + "-" + crypto.randomUUID() + "." + extension;
  await fs.mkdir(uploadsDir, { recursive: true });
  await fs.writeFile(path.join(uploadsDir, name), Buffer.from(match[2], "base64"));
  return "/api/files/uploads/" + name;
}

export async function readLocalAsset(relativeUrl) {
  const match = /^\/api\/files\/(uploads)\/([a-zA-Z0-9._-]+)$/.exec(relativeUrl || "");
  if (!match) throw new Error("Invalid local image path.");
  const filePath = path.resolve(dataDir, match[1], match[2]);
  const allowed = path.resolve(dataDir, match[1]);
  if (!filePath.startsWith(allowed + path.sep)) throw new Error("Invalid local image path.");
  return fs.readFile(filePath);
}

export async function readPublicAsset(relativeUrl) {
  return readLocalAsset(relativeUrl);
}
