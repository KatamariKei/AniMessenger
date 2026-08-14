import fs from "node:fs/promises";
import path from "node:path";
import { dataDir } from "./config.mjs";

const jobsPath = path.join(dataDir, "image-jobs.json");
const maxAgeMs = 7 * 24 * 60 * 60 * 1000;

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

export async function saveImageJobEntries(entries, filePath = jobsPath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const value = Object.fromEntries(entries);
  const temporary = filePath + "." + process.pid + "." + crypto.randomUUID() + ".tmp";
  await fs.writeFile(temporary, JSON.stringify(value, null, 2) + "\n", "utf8");
  await fs.rename(temporary, filePath);
}
