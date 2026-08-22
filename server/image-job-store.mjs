import fs from "node:fs/promises";
import path from "node:path";
import { dataDir } from "./config.mjs";

const jobsPath = path.join(dataDir, "image-jobs.json");
const maxAgeMs = 7 * 24 * 60 * 60 * 1000;
const saveQueues = new Map();

export async function loadImageJobEntries(now = Date.now(), filePath = jobsPath) {
  try {
    const parsed = JSON.parse(await fs.readFile(filePath, "utf8"));
    return Object.entries(parsed && typeof parsed === "object" ? parsed : {})
      .filter(([promptId, job]) => promptId && job && typeof job === "object")
      .filter(([, job]) => now - new Date(job.updatedAt || job.createdAt || 0).getTime() <= maxAgeMs);
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    return [];
  }
}

async function writeImageJobEntries(entries, filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const value = Object.fromEntries(entries);
  const temporary = filePath + "." + process.pid + "." + crypto.randomUUID() + ".tmp";
  try {
    await fs.writeFile(temporary, JSON.stringify(value, null, 2) + "\n", "utf8");
    try {
      await fs.rename(temporary, filePath);
    } catch (error) {
      if (!(["EEXIST", "EPERM"].includes(error?.code))) throw error;
      await fs.rm(filePath, { force: true });
      await fs.rename(temporary, filePath);
    }
  } finally {
    await fs.rm(temporary, { force: true }).catch(() => {});
  }
}

export function saveImageJobEntries(entries, filePath = jobsPath) {
  // Snapshot iterators immediately, then serialize replacement of the same file.
  // Windows cannot reliably rename over a destination while another save is landing.
  const snapshot = [...entries];
  const previous = saveQueues.get(filePath) || Promise.resolve();
  const current = previous.catch(() => {}).then(() => writeImageJobEntries(snapshot, filePath));
  saveQueues.set(filePath, current);
  return current.finally(() => {
    if (saveQueues.get(filePath) === current) saveQueues.delete(filePath);
  });
}
