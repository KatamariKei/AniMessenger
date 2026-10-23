import test from "node:test";
import assert from "node:assert/strict";
import { generationStatus } from "../server/comfy.mjs";

test("lost artwork jobs become retryable instead of pending forever", async t => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async url => new Response(JSON.stringify(String(url).endsWith("/queue")
    ? { queue_running: [], queue_pending: [] } : {}));
  assert.equal((await generationStatus({ comfyUrl: "http://fixture" }, "lost", { detectMissing: true })).status, "error");
  assert.equal((await generationStatus({ comfyUrl: "http://fixture" }, "lost")).status, "pending");
});

test("queued and executing artwork jobs remain pending", async t => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  for (const location of ["queue_running", "queue_pending"]) {
    globalThis.fetch = async url => new Response(JSON.stringify(String(url).endsWith("/queue")
      ? { queue_running: [], queue_pending: [], [location]: [[0, "active", {}, {}]] } : {}));
    assert.equal((await generationStatus({ comfyUrl: "http://fixture" }, "active", { detectMissing: true })).status, "pending");
  }
});

test("artwork completing between history and queue reads is not marked lost", async t => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  let historyReads = 0;
  globalThis.fetch = async url => new Response(JSON.stringify(String(url).endsWith("/queue")
    ? { queue_running: [], queue_pending: [] }
    : ++historyReads === 1 ? {} : { active: { outputs: { save: { images: [{ filename: "reward.png", type: "output" }] } } } }));
  const status = await generationStatus({ comfyUrl: "http://fixture" }, "active", { detectMissing: true });
  assert.equal(status.status, "complete");
  assert.match(status.imageUrl, /reward.png/);
});

test("unavailable or malformed queues are not evidence that a job vanished", async t => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async () => new Response("{}");
  await assert.rejects(generationStatus({ comfyUrl: "http://fixture" }, "active", { detectMissing: true }), /queue is invalid/);
});
