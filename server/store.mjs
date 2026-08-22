import fs from "node:fs/promises";
import path from "node:path";
import { dataDir } from "./config.mjs";
import { mergeMemories } from "./memory.mjs";

const threadsDir = path.join(dataDir, "threads");
const profilesDir = path.join(dataDir, "profiles");
const uploadsDir = path.join(dataDir, "uploads");

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

function canonicalThread(thread) {
  if (!thread || !Array.isArray(thread.memories)) return thread;
  return { ...thread, memories: mergeMemories(thread.memories, []) };
}

export async function listThreads() {
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
  return threads.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

export function summarizeThread(thread) {
  return {
    ...thread,
    messages: thread.messages?.length ? [thread.messages.at(-1)] : [],
    memories: undefined,
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
  try {
    return canonicalThread(await readJson(path.join(threadsDir, safeId(id) + ".json")));
  } catch (error) {
    if (error && error.code === "ENOENT") return null;
    throw error;
  }
}

export async function deleteThread(id) {
  try {
    await fs.unlink(path.join(threadsDir, safeId(id) + ".json"));
    return true;
  } catch (error) {
    if (error && error.code === "ENOENT") return false;
    throw error;
  }
}

export async function saveThread(thread) {
  const next = canonicalThread({ ...thread, updatedAt: new Date().toISOString() });
  await writeJson(path.join(threadsDir, safeId(thread.id) + ".json"), next);
  return next;
}

export async function createThread(character) {
  const existing = await loadThread(character.id);
  if (existing) return existing;
  return saveThread({
    id: character.id,
    character,
    messages: [],
    relationship: 8,
    unreadCount: 0,
    scene: {
      location: "somewhere familiar",
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
