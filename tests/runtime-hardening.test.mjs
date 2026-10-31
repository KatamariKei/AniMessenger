import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("HTTP boundary blocks unrelated origins; delayed chat retains image and settings changes and cannot resurrect a deleted chat", { timeout: 20000 }, async t => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "animessenger-runtime-hardening-"));
  let child;
  const held = [];
  let chatCalls = 0;
  let imageComplete = false;
  const reply = { reply: "The garden path is quiet today.", narration: null, relationshipDelta: 0, scene: {}, sceneEvidence: {}, memoryCandidates: [], shouldSendPhoto: false, followUp: null, resolvesPendingFollowUp: false, achievementSignals: [] };
  const mock = http.createServer(async (request, response) => {
    let raw = "";
    for await (const chunk of request) raw += chunk;
    const body = raw ? JSON.parse(raw) : {};
    const send = value => { response.writeHead(200, { "content-type": "application/json" }); response.end(JSON.stringify(value)); };
    if (request.url === "/api/show") return send({ model_info: { "test.context_length": 8192 }, details: { family: "test" } });
    if (request.url === "/api/chat" && body.format?.properties?.relationshipDelta) {
      chatCalls++;
      held.push(() => send({ message: { content: JSON.stringify(reply) }, done: true }));
      return;
    }
    if (request.url.startsWith("/history/")) return send(imageComplete ? { "review-image": { outputs: { "14": { images: [{ filename: "synthetic.png", type: "output" }] } } } } : {});
    return send({});
  });
  await new Promise(resolve => mock.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    held.splice(0).forEach(release => release());
    if (child && child.exitCode === null) { child.kill(); await once(child, "exit"); }
    mock.closeAllConnections();
    await new Promise(resolve => mock.close(resolve));
    await fs.rm(home, { recursive: true, force: true });
  });
  const mockUrl = `http://127.0.0.1:${mock.address().port}`;
  await fs.mkdir(path.join(home, "data", "threads"), { recursive: true });
  const profile = { id: "review", name: "Synthetic", series: "Review", age: 25, summary: "A synthetic test character.", status: "Ready", visual: { identity: [], signature: [], defaultWardrobe: "blue shirt", wardrobePreferences: [] }, persona: { traits: [], mannerisms: [], speechStyle: "Plain", emotionalRules: [], exampleLines: [] }, canon: { overview: "Synthetic", history: [], relationships: [], knowledge: [], boundaries: [] }, sources: [] };
  const thread = { id: "review", character: { id: "review", name: "Synthetic", series: "Review" }, profile, messages: [], memories: [], relationship: 8, conversationMode: "chat", scene: { location: "garden", environment: "a garden", activity: "chatting", outfit: "blue shirt", expression: "natural", lighting: "daylight", presence: "apart" }, updatedAt: new Date().toISOString() };
  await fs.writeFile(path.join(home, "data/threads/review.json"), JSON.stringify(thread));
  await fs.writeFile(path.join(home, "animessenger.config.json"), JSON.stringify({ ollamaUrl: mockUrl, comfyUrl: mockUrl, chatModel: "synthetic", proactiveEnabled: false, researchEnabled: false, comfyWorkflowFile: "", comfyMappingFile: "" }));
  await fs.writeFile(path.join(home, "data/image-jobs.json"), JSON.stringify({ "review-image": { characterId: "review", caption: "Synthetic image", appended: false, updatedAt: new Date().toISOString() } }));
  const bootstrap = `import http from 'node:http';const listen=http.Server.prototype.listen;http.Server.prototype.listen=function(...args){this.once('listening',()=>console.log('TEST_PORT='+this.address().port));return listen.apply(this,args)};await import('./server/index.mjs');`;
  child = spawn(process.execPath, ["--input-type=module", "-e", bootstrap], { cwd: root, env: { ...process.env, ANIMESSENGER_HOME: home, HOST: "127.0.0.1", PORT: "0", ANIMESSENGER_ALLOWED_ORIGINS: "" }, stdio: ["ignore", "pipe", "pipe"] });
  let diagnostics = "";
  child.stderr.on("data", chunk => { diagnostics += chunk; });
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Service startup timed out: " + diagnostics)), 5000);
    child.stdout.on("data", chunk => { const match = /TEST_PORT=(\d+)/.exec(String(chunk)); if (match) { clearTimeout(timer); resolve(Number(match[1])); } });
    child.on("exit", code => { clearTimeout(timer); reject(new Error(`Service exited ${code}: ${diagnostics}`)); });
  });
  const base = `http://127.0.0.1:${port}`;
  const call = (url, body, method = "POST", headers = {}) => fetch(base + url, { method, headers: { "content-type": "application/json", ...headers }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const waitUntil = async predicate => {
    for (let i = 0; i < 200; i++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 10)); }
    throw new Error("Synthetic model request did not arrive: " + diagnostics);
  };

  for (const [url, method, body] of [["/api/config", "GET"], ["/api/performance", "GET"], ["/api/config", "POST", { userName: "attacker" }], ["/api/threads/review", "DELETE"], ["/api/config", "OPTIONS"]]) {
    const denied = await call(url, body, method, { origin: "https://untrusted.example" });
    assert.equal(denied.status, 403);
    assert.equal(denied.headers.has("access-control-allow-origin"), false);
  }
  const allowed = await call("/api/config", undefined, "OPTIONS", { origin: base });
  assert.equal(allowed.status, 204);
  assert.equal(allowed.headers.get("access-control-allow-origin"), base);

  const first = call("/api/chat", { characterId: "review", text: "Hello there.", clientMessageId: "client-review" });
  await waitUntil(() => held.length === 1);
  const duplicate = call("/api/chat", { characterId: "review", text: "Hello there.", clientMessageId: "client-review" });
  imageComplete = true;
  assert.equal((await call("/api/images/status/review-image", undefined, "GET")).status, 200);
  assert.equal((await call("/api/threads/review/pin", { pinned: true })).status, 200);
  assert.equal((await call("/api/threads/review/conversation-mode", { mode: "story" })).status, 200);
  held.shift()();
  const firstResponse = await first;
  assert.equal(firstResponse.status, 200, await firstResponse.clone().text());
  const completed = (await firstResponse.json()).thread;
  assert.equal(completed.pinned, true);
  assert.equal(completed.conversationMode, "story");
  assert.equal(completed.messages.filter(message => message.image).length, 1);
  assert.equal(completed.messages.filter(message => message.id === "client-review").length, 1);
  assert.equal(completed.messages.filter(message => message.text === reply.reply).length, 1);
  const duplicateResponse = await duplicate;
  assert.equal(duplicateResponse.status, 200);
  assert.equal((await duplicateResponse.json()).reply.text, reply.reply);
  assert.equal(chatCalls, 1);
  const timing = await (await call("/api/performance", undefined, "GET")).json();
  assert.ok(timing.recent.some(entry => entry.kind === "chat" && entry.success && Number.isFinite(entry.totalMs)));
  assert.equal(JSON.stringify(timing).includes("client-review"), false);
  assert.equal(JSON.stringify(timing).includes(reply.reply), false);

  await call("/api/threads/review/conversation-mode", { mode: "chat" });
  const late = call("/api/chat", { characterId: "review", text: "Another greeting.", clientMessageId: "client-deleted" });
  await waitUntil(() => held.length === 1);
  const queued = call("/api/chat", { characterId: "review", text: "Queued greeting.", clientMessageId: "client-queued" });
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal((await call("/api/threads/review", undefined, "DELETE")).status, 200);
  await assert.rejects(fs.access(path.join(home, "data/threads/review.json")), { code: "ENOENT" });
  assert.equal((await call("/api/threads", { character: { id: "review", name: "Replacement", series: "Review" } })).status, 200);
  held.shift()();
  assert.equal((await late).status, 409);
  assert.equal((await queued).status, 409);
  const replacement = JSON.parse(await fs.readFile(path.join(home, "data/threads/review.json"), "utf8"));
  assert.equal(replacement.character.name, "Replacement");
  assert.equal(replacement.messages.length, 0);
});
