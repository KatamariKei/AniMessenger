import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const queues = new Map();

export async function replaceFileAtomically(target, contents, { fileSystem = fs, wait = ms => new Promise(resolve => setTimeout(resolve, ms)), delays = [25, 50, 100, 200, 400, 800] } = {}) {
  const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await fileSystem.mkdir(path.dirname(target), { recursive: true });
    const handle = await fileSystem.open(temporary, "wx");
    try {
      await handle.writeFile(contents, "utf8");
      await handle.sync();
    } finally { await handle.close(); }
    for (let attempt = 0; ; attempt++) {
      try { await fileSystem.rename(temporary, target); break; }
      catch (error) {
        if (!["EPERM", "EACCES", "EBUSY", "EEXIST"].includes(error.code) || attempt >= delays.length) throw error;
        // Never delete the last successful destination to work around a lock.
        await wait(delays[attempt]);
      }
    }
  } finally { await fileSystem.rm(temporary, { force: true }).catch(() => {}); }
}

export function writeJsonAtomically(target, value) {
  // Serialize before queueing so caller mutations cannot alter this save.
  const contents = JSON.stringify(value, null, 2) + "\n";
  const key = path.resolve(target);
  const previous = queues.get(key) || Promise.resolve();
  const next = previous.catch(() => {}).then(() => replaceFileAtomically(key, contents));
  queues.set(key, next);
  return next.finally(() => { if (queues.get(key) === next) queues.delete(key); });
}
