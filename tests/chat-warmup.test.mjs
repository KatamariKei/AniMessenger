import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import ts from "typescript";
import { createChatWarmup } from "../server/chat-warmup.mjs";

const config = { ollamaUrl: "http://model.invalid", chatModel: "selected:latest", chatKeepAliveMinutes: 15 };
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

test("cold preparation loads only the selected model with an empty request and the user's memory policy", async () => {
  const requests = [], metrics = [];
  const warm = createChatWarmup({ fetcher: async (url, options) => {
    requests.push({ url, body: options.body && JSON.parse(options.body) });
    return Response.json(url.endsWith("/api/ps") ? { models: [] } : { done: true, done_reason: "load" });
  }, onMetrics: value => metrics.push(value) });
  assert.deepEqual(await warm(config), { status: "loaded" });
  assert.deepEqual(requests, [{ url: config.ollamaUrl + "/api/ps", body: undefined }, { url: config.ollamaUrl + "/api/chat", body: { model: "selected:latest", stream: false, keep_alive: "15m" } }]);
  assert.equal(metrics.length, 1); assert.equal(metrics[0].success, true);
  assert.deepEqual(Object.keys(metrics[0]).sort(), ["success", "wallMs"]);
});

test("resident models are left untouched; another resident model is not evicted", async () => {
  for (const [models, status] of [[[{ name: "selected" }], "already_loaded"], [[{ model: "selected:latest" }], "already_loaded"], [[{ name: "another" }], "other_model"]]) {
    let calls = 0;
    const warm = createChatWarmup({ fetcher: async url => { calls++; assert.ok(url.endsWith("/api/ps")); return Response.json({ models }); } });
    assert.equal((await warm(config)).status, status);
    assert.equal(calls, 1);
  }
});

test("no selection or ongoing work never starts a model request", async () => {
  const warm = createChatWarmup({ busy: () => true, fetcher: async () => { throw new Error("Must not fetch"); } });
  assert.equal((await warm({ ...config, chatModel: "" })).status, "no_model");
  assert.equal((await warm(config)).status, "busy");
});

test("concurrent PC/phone activity shares one load and a different model cannot start alongside it", async () => {
  const hold = deferred(); let loads = 0;
  const warm = createChatWarmup({ fetcher: async url => {
    if (url.endsWith("/api/ps")) return Response.json({ models: [] });
    loads++; await hold.promise; return Response.json({ done: true });
  } });
  const first = warm(config), second = warm(config);
  assert.equal(first, second);
  assert.equal((await warm({ ...config, chatModel: "other" })).status, "busy");
  hold.resolve();
  assert.equal((await first).status, "loaded"); assert.equal(loads, 1);
});

test("metadata and loads are rate limited; later activity can check again without extending an already warm model", async () => {
  let time = 1000, checks = 0, loads = 0;
  const warm = createChatWarmup({ now: () => time, fetcher: async url => {
    if (url.endsWith("/api/ps")) { checks++; return Response.json({ models: loads ? [{ name: "selected" }] : [] }); }
    loads++; return Response.json({ done: true });
  } });
  assert.equal((await warm(config)).status, "loaded");
  time += 10000; assert.equal((await warm(config)).status, "cooldown");
  time += 20000; assert.equal((await warm(config)).status, "already_loaded");
  assert.equal(checks, 2); assert.equal(loads, 1);
});

test("a foreground request arriving during inspection prevents speculative loading", async () => {
  const hold = deferred(); let occupied = false, calls = 0;
  const warm = createChatWarmup({ busy: () => occupied, fetcher: async url => {
    calls++; assert.ok(url.endsWith("/api/ps")); await hold.promise; return Response.json({ models: [] });
  } });
  const pending = warm(config); occupied = true; hold.resolve();
  assert.equal((await pending).status, "busy"); assert.equal(calls, 1);
});

test("both running and queued image work block preloading", async () => {
  for (const jobs of [{ queue_running: [[1]], queue_pending: [] }, { queue_running: [], queue_pending: [[2]] }]) {
    let loads = 0;
    const warm = createChatWarmup({ fetcher: async url => {
      if (url.endsWith("/api/ps")) return Response.json({ models: [] });
      if (url.endsWith("/queue")) return Response.json(jobs);
      loads++; return Response.json({ done: true });
    } });
    assert.equal((await warm({ ...config, comfyUrl: "http://images.invalid" })).status, "image_busy");
    assert.equal(loads, 0);
  }
});

test("server-policy keep-alive is omitted, never converted to immediate unload", async () => {
  let body;
  const warm = createChatWarmup({ fetcher: async (url, options) => {
    if (url.endsWith("/api/ps")) return Response.json({ models: [] });
    body = JSON.parse(options.body); return Response.json({ done: true });
  } });
  await warm({ ...config, chatKeepAliveMinutes: 0 });
  assert.equal(Object.hasOwn(body, "keep_alive"), false);
  assert.equal(Object.hasOwn(body, "messages"), false);
  assert.equal(Object.hasOwn(body, "options"), false);
});

test("unavailable metadata causes no speculative request and can retry after the cooldown", async () => {
  let time = 0, failure = true, loads = 0;
  const warm = createChatWarmup({ now: () => time, fetcher: async url => {
    if (failure) throw new Error("offline");
    if (url.endsWith("/api/ps")) return Response.json({ models: [] });
    loads++; return Response.json({ done: true });
  } });
  assert.equal((await warm(config)).status, "unavailable");
  failure = false; time += 30000;
  assert.equal((await warm(config)).status, "loaded"); assert.equal(loads, 1);
});

test("an offline optional image service still permits chat preparation", async () => {
  const warm = createChatWarmup({ fetcher: async url => {
    if (url.endsWith("/queue")) throw Object.assign(new Error("image service is off"), { cause: { code: "ECONNREFUSED" } });
    return Response.json(url.endsWith("/api/ps") ? { models: [] } : { done: true });
  } });
  assert.equal((await warm({ ...config, comfyUrl: "http://images.invalid" })).status, "loaded");
});

test("unknown image activity backs off instead of competing for memory", async () => {
  for (const queueResult of [async () => Response.json({}, { status: 503 }), async () => { throw new Error("queue timed out"); }, async () => Response.json({})]) {
    let loads = 0;
    const warm = createChatWarmup({ fetcher: async url => {
      if (url.endsWith("/api/ps")) return Response.json({ models: [] });
      if (url.endsWith("/queue")) return queueResult();
      loads++; return Response.json({ done: true });
    } });
    assert.equal((await warm({ ...config, comfyUrl: "http://images.invalid" })).status, "image_unknown");
    assert.equal(loads, 0);
  }
});

test("only a successful inherited-context load can establish the runtime allocation policy", async () => {
  let observed = 0;
  const warm = createChatWarmup({ fetcher: async url => Response.json(url.endsWith("/api/ps") ? { models: [] } : { done: true }),
    onLoaded: async (settings, model) => { observed++; assert.equal(settings, config); assert.equal(model, config.chatModel); } });
  assert.equal((await warm(config)).status, "loaded");
  assert.equal(observed, 1);
});

const source = await fs.readFile(new URL("../src/chat-warmup.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { prepareChatOnActivity } = await import("data:text/javascript;base64," + Buffer.from(compiled).toString("base64"));

test("view activity starts preparation without waiting, skips hidden tabs and removes listeners on chat switch", async () => {
  const surfaces = { window: new EventTarget(), document: Object.assign(new EventTarget(), { visibilityState: "visible" }) };
  const hold = deferred(); let calls = 0, time = 0;
  const stop = prepareChatOnActivity(async () => { calls++; await hold.promise; }, surfaces, undefined, () => time);
  assert.equal(calls, 1); assert.equal(typeof stop, "function");
  surfaces.document.visibilityState = "hidden";
  surfaces.window.dispatchEvent(new Event("focus")); assert.equal(calls, 1);
  surfaces.document.visibilityState = "visible";
  time += 30000;
  surfaces.document.dispatchEvent(new Event("visibilitychange")); assert.equal(calls, 2);
  stop(); surfaces.window.dispatchEvent(new Event("focus")); assert.equal(calls, 2);
  hold.resolve(); await Promise.resolve(); assert.equal(calls, 2);
});

test("returning to the composer after idle prepares once rather than issuing a request on every keystroke", () => {
  const surfaces = { window: new EventTarget(), document: Object.assign(new EventTarget(), { visibilityState: "visible" }) };
  const composer = new EventTarget(); let time = 0, calls = 0;
  const stop = prepareChatOnActivity(async () => { calls++; }, surfaces, composer, () => time);
  assert.equal(calls, 1);
  for (let index = 0; index < 50; index++) composer.dispatchEvent(new Event("keydown"));
  assert.equal(calls, 1);
  time += 20 * 60000;
  composer.dispatchEvent(new Event("pointerdown")); composer.dispatchEvent(new Event("focus")); composer.dispatchEvent(new Event("keydown"));
  assert.equal(calls, 2);
  stop(); time += 60000; composer.dispatchEvent(new Event("keydown")); assert.equal(calls, 2);
});

test("a background tab does not warm on mount and preparation errors stay out of the normal chat flow", async () => {
  const surfaces = { window: new EventTarget(), document: Object.assign(new EventTarget(), { visibilityState: "hidden" }) };
  let calls = 0;
  const stop = prepareChatOnActivity(async () => { calls++; throw new Error("offline"); }, surfaces);
  assert.equal(calls, 0);
  surfaces.document.visibilityState = "visible";
  surfaces.window.dispatchEvent(new Event("focus"));
  await Promise.resolve(); await Promise.resolve(); assert.equal(calls, 1);
  stop();
});
