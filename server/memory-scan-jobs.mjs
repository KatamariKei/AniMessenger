import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export async function saveMemoryScanCheckpoint(target, snapshot, options = {}) {
  const fileSystem = options.fileSystem || fs;
  const wait = options.wait || (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const delays = options.delays || [50, 100, 200, 400, 800, 1200, 1600];
  const temporary = target + "." + randomUUID() + ".tmp";
  try {
    await fileSystem.mkdir(path.dirname(target), { recursive: true });
    await fileSystem.writeFile(temporary, snapshot, { flag: "wx" });
    for (let attempt = 0; ; attempt++) {
      try { await fileSystem.rename(temporary, target); break; }
      catch (error) {
        if (!["EPERM", "EACCES", "EBUSY", "EEXIST"].includes(error.code)) throw error;
        if (attempt >= delays.length) {
          throw new Error("Windows kept the scan progress file locked. Recovered memories are safe; retry the scan to resume saved progress.", { cause: error });
        }
        // Never remove the previous checkpoint: an interrupted replacement must
        // leave the last successful batch receipts available for resuming.
        await wait(delays[attempt]);
      }
    }
  } finally {
    await fileSystem.rm(temporary, { force: true }).catch(() => {});
  }
}

export function createMemoryScanJobs({ directory, run, ready = () => true, delayMs = 3000 }) {
  const jobs = new Map();
  const starts = new Map();
  const queue = [];
  const saveQueues = new Map();
  let running = false;
  let yielding = false;
  let timer;
  const file = id => {
    if (!/^[a-zA-Z0-9()_.-]+$/.test(id)) throw new Error("Invalid scan character ID.");
    return path.join(directory, id + ".json");
  };
  async function save(job) {
    const target = file(job.characterId);
    const snapshot = JSON.stringify(job) + "\n";
    const previous = saveQueues.get(target) || Promise.resolve();
    const current = previous.catch(() => {}).then(() => saveMemoryScanCheckpoint(target, snapshot));
    saveQueues.set(target, current);
    try { await current; }
    finally { if (saveQueues.get(target) === current) saveQueues.delete(target); }
  }
  async function status(id) {
    if (jobs.has(id)) return { ...jobs.get(id) };
    let job;
    try { job = JSON.parse(await fs.readFile(file(id), "utf8")); }
    catch (error) { if (error.code === "ENOENT") return null; throw error; }
    if (job.characterId !== id) throw new Error("The memory scan status is invalid.");
    if (["queued", "running"].includes(job.status)) {
      job = { ...job, status: "error", error: "The service restarted before this scan finished. Recovered memories are saved; scan again to resume unfinished batches.", finishedAt: new Date().toISOString() };
      await save(job);
    }
    jobs.set(id, job);
    return { ...job };
  }
  function schedule(delay = 0) {
    if (timer || running || !queue.length) return;
    timer = setTimeout(() => { timer = null; void pump(); }, delay);
    timer.unref?.();
  }
  async function pump() {
    if (running || !queue.length) return;
    if (!ready()) { schedule(delayMs); return; }
    running = true;
    const job = queue.shift();
    try {
      job.status = "running";
      await save(job);
      const result = await run(job.characterId, async progress => {
        Object.assign(job, progress);
        await save(job);
      }, { ...job });
      Object.assign(job, result, { status: "complete", finishedAt: new Date().toISOString() });
    } catch (error) {
      Object.assign(job, { status: "error", error: error instanceof Error ? error.message : "The scan could not finish.", finishedAt: new Date().toISOString() });
    } finally {
      await save(job).catch(error => console.warn("Memory scan status could not be saved:", error.message));
      running = false;
      schedule();
    }
  }
  async function start(id) {
    if (starts.has(id)) return starts.get(id);
    const work = (async () => {
      const previous = await status(id);
      if (["queued", "running"].includes(previous?.status)) return previous;
      const resume = previous?.status === "error" && previous.scanVersion === 2;
      const job = { id: randomUUID(), characterId: id, status: "queued", completed: resume ? previous.completedBatchIds?.length || 0 : 0,
        total: resume ? previous.total : 0, failed: 0, added: resume ? previous.added || 0 : 0,
        scanVersion: 2, completedBatchIds: resume ? previous.completedBatchIds || [] : [], startedAt: new Date().toISOString() };
      await save(job);
      jobs.set(id, job);
      queue.push(job);
      schedule();
      return { ...job };
    })();
    starts.set(id, work);
    try { return await work; } finally { starts.delete(id); }
  }
  return { start, status, get running() { return running && !yielding; },
    async waitUntilReady() {
      // Keep ownership of this scan, but release the model-work gate so live
      // discovery/memory jobs can drain instead of mutually waiting forever.
      yielding = true;
      try { while (!ready()) await new Promise(resolve => setTimeout(resolve, delayMs)); }
      finally { yielding = false; }
    },
    isActive: id => ["queued", "running"].includes(jobs.get(id)?.status) };
}
