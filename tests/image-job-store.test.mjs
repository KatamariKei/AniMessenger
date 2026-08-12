import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { loadImageJobEntries, saveImageJobEntries } from "../server/image-job-store.mjs";

test("pending image attribution survives a process restart", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "animessenger-image-jobs-"));
  const filePath = path.join(directory, "image-jobs.json");
  const promptId = "test-restart-" + Date.now();
  const job = {
    characterId: "frieren",
    speakerId: "fern",
    appended: false,
    updatedAt: new Date().toISOString(),
  };
  const existing = new Map(await loadImageJobEntries(Date.now(), filePath));
  existing.set(promptId, job);
  await saveImageJobEntries(existing.entries(), filePath);
  existing.set(promptId, { ...job, caption: "still waiting" });
  await saveImageJobEntries(existing.entries(), filePath);
  const reloaded = new Map(await loadImageJobEntries(Date.now(), filePath));
  assert.deepEqual(reloaded.get(promptId), { ...job, caption: "still waiting" });
  await fs.rm(directory, { recursive: true, force: true });
});
