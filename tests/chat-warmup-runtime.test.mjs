import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";

test("overlapping warmup requests share a load without blocking normal chat or writing a turn", { timeout: 15000 }, async t => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "animessenger-warmup-"));
  let child, warmCalls = 0, chatCalls = 0, resident = false, finishWarm;
  const held = new Promise(resolve => { finishWarm = resolve; });
  const mock = http.createServer(async (request, response) => {
    let raw = ""; for await (const chunk of request) raw += chunk;
    const body = raw ? JSON.parse(raw) : {};
    const json = value => { response.writeHead(200, { "content-type": "application/json" }); response.end(JSON.stringify(value)); };
    if (request.url === "/api/ps") return json({ models: resident ? [{ name: "synthetic", context_length: 8192 }] : [] });
    if (request.url === "/api/show") return json({ model_info: { "test.context_length": 8192 }, details: { family: "test" } });
    if (request.url === "/queue") return json({ queue_running: [], queue_pending: [] });
    if (request.url === "/api/chat") {
      if (!body.messages) {
        warmCalls++;
        assert.deepEqual(body, { model: "synthetic", stream: false, keep_alive: "15m" });
        await held; resident = true;
        return json({ done: true, done_reason: "load" });
      }
      chatCalls++;
      return json({ done: true, message: { content: JSON.stringify({ reply: "The garden path is clear. We can walk to the greenhouse.", relationshipDelta: 0, scene: {}, sceneEvidence: {}, memoryCandidates: [], shouldSendPhoto: false, achievementSignals: [] }) } });
    }
    return json({});
  });
  await new Promise(resolve => mock.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    finishWarm();
    if (child && child.exitCode === null) { child.kill(); await once(child, "exit"); }
    mock.closeAllConnections(); await new Promise(resolve => mock.close(resolve));
    assert.ok(path.resolve(home).startsWith(path.resolve(os.tmpdir()) + path.sep + "animessenger-warmup-"));
    await fs.rm(home, { recursive: true, force: true });
  });
  const profile = { id: "warm", name: "Mira", series: "Synthetic", age: 25, summary: "A patient gardener.", status: "Ready", visual: { identity: [], signature: [], defaultWardrobe: "blue coat", wardrobePreferences: [] }, persona: { traits: [], mannerisms: [], speechStyle: "Plain", emotionalRules: [], exampleLines: [] }, canon: { overview: "Synthetic", history: [], relationships: [], knowledge: [], boundaries: [] }, sources: [] };
  const original = { id: "warm", storageInstanceId: "warm-instance", storageRevision: 1, character: { id: "warm", name: "Mira" }, profile, messages: [], memories: [], relationship: 8, conversationMode: "chat", scene: { location: "garden", environment: "a garden with a wooden bench", activity: "chatting", outfit: "blue coat", expression: "calm", lighting: "daylight", presence: "together" }, updatedAt: new Date().toISOString() };
  await fs.mkdir(path.join(home, "data/threads"), { recursive: true });
  const threadFile = path.join(home, "data/threads/warm.json");
  const initialBytes = JSON.stringify(original);
  await fs.writeFile(threadFile, initialBytes);
  const mockUrl = `http://127.0.0.1:${mock.address().port}`;
  await fs.writeFile(path.join(home, "animessenger.config.json"), JSON.stringify({ ollamaUrl: mockUrl, comfyUrl: mockUrl, chatModel: "synthetic", proactiveEnabled: false, researchEnabled: false, comfyWorkflowFile: "", comfyMappingFile: "" }));
  const bootstrap = `import http from 'node:http';const listen=http.Server.prototype.listen;http.Server.prototype.listen=function(...args){this.once('listening',()=>console.log('TEST_PORT='+this.address().port));return listen.apply(this,args)};await import('./server/index.mjs');`;
  child = spawn(process.execPath, ["--input-type=module", "-e", bootstrap], { cwd: root, env: { ...process.env, ANIMESSENGER_HOME: home, HOST: "127.0.0.1", PORT: "0", ANIMESSENGER_ALLOWED_ORIGINS: "" }, stdio: ["ignore", "pipe", "pipe"] });
  let diagnostics = ""; child.stderr.on("data", chunk => { diagnostics += chunk; });
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Startup timed out: " + diagnostics)), 5000);
    child.stdout.on("data", chunk => { const match = /TEST_PORT=(\d+)/.exec(String(chunk)); if (match) { clearTimeout(timer); resolve(Number(match[1])); } });
    child.on("exit", code => { clearTimeout(timer); reject(new Error(`Service exited ${code}: ${diagnostics}`)); });
  });
  const base = `http://127.0.0.1:${port}`;
  const post = (route, body) => fetch(base + route, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const a = post("/api/chat/warm", { characterId: "warm" });
  const b = post("/api/chat/warm", { characterId: "warm" });
  for (let i = 0; i < 200 && warmCalls === 0; i++) await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(warmCalls, 1);
  assert.equal(await fs.readFile(threadFile, "utf8"), initialBytes);
  // The app must not queue a real user turn behind its optional preparation.
  const chat = await post("/api/chat", { characterId: "warm", text: "Is the garden path clear?", clientMessageId: "real-turn" });
  assert.equal(chat.status, 200); assert.ok((await chat.json()).reply);
  assert.equal(chatCalls, 1);
  finishWarm();
  assert.equal((await (await a).json()).status, "loaded");
  assert.equal((await (await b).json()).status, "loaded");
  assert.equal((await (await post("/api/chat/warm", { characterId: "warm" })).json()).status, "cooldown");
  assert.equal(warmCalls, 1);
  const final = JSON.parse(await fs.readFile(threadFile, "utf8"));
  assert.equal(final.messages.length, 2);
  assert.equal(final.messages[0].text, "Is the garden path clear?");
  const performance = await (await fetch(base + "/api/performance")).json();
  const warmRecords = performance.recent.filter(entry => entry.label === "chat_warmup");
  assert.equal(warmRecords.length, 1); assert.equal(warmRecords[0].success, true);
  assert.equal(JSON.stringify(warmRecords).includes("garden"), false);
});
