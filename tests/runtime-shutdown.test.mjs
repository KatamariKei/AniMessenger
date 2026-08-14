import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("the installed runtime reports standalone mode and shuts down cleanly", async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "animessenger-shutdown-"));
  const port = 52973;
  const child = spawn(process.execPath, [path.join(root, "server", "index.mjs"), "--serve-dist"], {
    cwd: root,
    env: { ...process.env, ANIMESSENGER_HOME: home, HOST: "127.0.0.1", PORT: String(port) },
    stdio: "ignore",
  });
  t.after(async () => {
    if (child.exitCode === null) child.kill();
    await fs.rm(home, { recursive: true, force: true });
  });

  let runtime;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/runtime`, { signal: AbortSignal.timeout(250) });
      if (response.ok) {
        runtime = await response.json();
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.equal(runtime.standalone, true);
  assert.equal(runtime.mode, "installed");
  assert.equal(runtime.canShutdown, true);

  const response = await fetch(`http://127.0.0.1:${port}/api/runtime/shutdown`, { method: "POST" });
  assert.equal(response.ok, true);
  assert.deepEqual(await response.json(), { ok: true });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Standalone runtime did not exit after shutdown.")), 2500);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
});
