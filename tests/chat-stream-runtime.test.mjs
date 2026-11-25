import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";

test("streamed drafts precede persistence; retries, disconnects and deletions retain existing turn ownership", { timeout: 20000 }, async t => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "animessenger-stream-"));
  let child, mode = "hold", modelCalls = 0;
  const held = [];
  const modelPrompts = [];
  const passage = 'Mira looks toward the garden. "The path is clear," she says.';
  const output = JSON.stringify({ narration: passage, relationshipDelta: 0, scene: {}, sceneEvidence: {}, memoryCandidates: [], shouldSendPhoto: false, achievementSignals: [] });
  const mock = http.createServer(async (request, response) => {
    let raw = ""; for await (const chunk of request) raw += chunk;
    const body = raw ? JSON.parse(raw) : {};
    const json = value => { response.writeHead(200, { "content-type": "application/json" }); response.end(JSON.stringify(value)); };
    if (request.url === "/api/ps") return json({ models: [{ name: "synthetic", context_length: 65536 }] });
    if (request.url !== "/api/chat") return json({});
    modelCalls++;
    modelPrompts.push(body.messages.map(message => message.content).join("\n"));
    assert.equal(body.stream, true);
    response.writeHead(200, { "content-type": "application/x-ndjson" });
    response.write(JSON.stringify({ message: { content: output.slice(0, 40) } }) + "\n");
    if (mode === "drop") return response.end();
    const complete = () => {
      response.write(JSON.stringify({ message: { content: output.slice(40) } }) + "\n");
      response.end(JSON.stringify({ done: true, done_reason: "stop", eval_count: 30, prompt_eval_count: 1000 }) + "\n");
    };
    if (mode === "complete") complete(); else held.push(complete);
  });
  await new Promise(resolve => mock.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    held.splice(0).forEach(complete => complete());
    if (child && child.exitCode === null) { child.kill(); await once(child, "exit"); }
    mock.closeAllConnections(); await new Promise(resolve => mock.close(resolve));
    assert.ok(path.resolve(home).startsWith(path.resolve(os.tmpdir()) + path.sep + "animessenger-stream-"));
    await fs.rm(home, { recursive: true, force: true });
  });
  const profile = { id: "stream", name: "Mira", series: "Synthetic", age: 25, summary: "A patient gardener.", status: "Ready", visual: { identity: [], signature: [], defaultWardrobe: "blue coat", wardrobePreferences: [] }, persona: { traits: [], mannerisms: [], speechStyle: "Plain", emotionalRules: [], exampleLines: [] }, canon: { overview: "Synthetic", history: [], relationships: [], knowledge: [], boundaries: [] }, sources: [] };
  const thread = { id: "stream", character: { id: "stream", name: "Mira", series: "Synthetic" }, profile, messages: [], memories: [], relationship: 8, conversationMode: "story", scene: { location: "garden", environment: "a garden", outfit: "blue coat", presence: "together" }, updatedAt: new Date().toISOString() };
  await fs.mkdir(path.join(home, "data/threads"), { recursive: true });
  await fs.writeFile(path.join(home, "data/threads/stream.json"), JSON.stringify(thread));
  const mockUrl = `http://127.0.0.1:${mock.address().port}`;
  await fs.writeFile(path.join(home, "animessenger.config.json"), JSON.stringify({ ollamaUrl: mockUrl, comfyUrl: mockUrl, chatModel: "synthetic", proactiveEnabled: false, researchEnabled: false, comfyWorkflowFile: "", comfyMappingFile: "" }));
  const bootstrap = `import http from 'node:http';const listen=http.Server.prototype.listen;http.Server.prototype.listen=function(...args){this.once('listening',()=>console.log('TEST_PORT='+this.address().port));return listen.apply(this,args)};await import('./server/index.mjs');`;
  child = spawn(process.execPath, ["--input-type=module", "-e", bootstrap], { cwd: root, env: { ...process.env, ANIMESSENGER_HOME: home, HOST: "127.0.0.1", PORT: "0", ANIMESSENGER_ALLOWED_ORIGINS: "" }, stdio: ["ignore", "pipe", "pipe"] });
  let diagnostics = ""; child.stderr.on("data", chunk => { diagnostics += chunk; });
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Startup timed out: " + diagnostics)), 5000);
    child.stdout.on("data", chunk => { const match = /TEST_PORT=(\d+)/.exec(String(chunk)); if (match) { clearTimeout(timer); resolve(Number(match[1])); } });
    child.on("exit", code => { clearTimeout(timer); reject(new Error(`Server exited ${code}: ${diagnostics}`)); });
  });
  const base = `http://127.0.0.1:${port}`;
  const call = (url, body, method = "POST") => fetch(base + url, { method, headers: { "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const saved = async () => (await (await call("/api/threads/stream", undefined, "GET")).json()).thread;
  const wait = async predicate => { for (let i = 0; i < 300; i++) { if (await predicate()) return; await new Promise(resolve => setTimeout(resolve, 10)); } throw new Error("Timed out: " + diagnostics); };
  const open = async id => {
    const response = await call("/api/chat", { characterId: "stream", clientMessageId: id, text: "Is the path clear?", stream: true });
    assert.match(response.headers.get("content-type"), /ndjson/);
    const reader = response.body.getReader(), decoder = new TextDecoder();
    let pending = "";
    async function next() {
      while (!pending.includes("\n")) { const { done, value } = await reader.read(); if (done) return null; pending += decoder.decode(value, { stream: true }); }
      const end = pending.indexOf("\n"), event = JSON.parse(pending.slice(0, end)); pending = pending.slice(end + 1); return event;
    }
    async function rest() { const events = []; let event; while ((event = await next())) events.push(event); return events; }
    return { next, rest, reader };
  };
  const original = await saved();
  const demeanorUrl = "/api/threads/stream/demeanor";
  const note = "Speak with a warm, understated wit.";
  const demeanorResponse = await call(demeanorUrl, { demeanor: note, expectedStorageInstanceId: original.storageInstanceId }, "PATCH");
  assert.equal(demeanorResponse.status, 200);
  const demeanorThread = (await demeanorResponse.json()).thread;
  assert.equal(demeanorThread.demeanor, note);
  assert.equal(demeanorThread.updatedAt, original.updatedAt);
  assert.deepEqual(demeanorThread.memories, original.memories);
  const first = await open("client-stream");
  let draft; do { draft = await first.next(); } while (draft?.type === "draft" && !draft.text);
  assert.equal(draft.type, "draft"); assert.match(draft.text, /Mira/);
  assert.equal((await saved()).messages.filter(message => message.from === "character").length, 0);
  const duplicate = call("/api/chat", { characterId: "stream", clientMessageId: "client-stream", text: "Is the path clear?" });
  await wait(() => held.length === 1); held.shift()();
  const completed = (await first.rest()).find(event => event.type === "complete");
  assert.equal(completed.payload.reply.narration, passage);
  assert.equal((await (await duplicate).json()).reply.id, completed.payload.reply.id);
  assert.equal(modelCalls, 1);
  assert.match(modelPrompts[0], /USER'S DEMEANOR NOTE: "Speak with a warm, understated wit\."/);
  assert.match(modelPrompts[0], /CORE: A patient gardener\./);
  assert.match(modelPrompts[0], /add nuance to the character’s established voice and personality/);
  assert.equal((await saved()).messages.length, 2);
  const metrics = await (await call("/api/performance", undefined, "GET")).json();
  assert.ok(metrics.recent.some(row => row.kind === "chat" && Number.isFinite(row.firstTextMs)));

  const clearDemeanor = await call(demeanorUrl, { demeanor: "", expectedStorageInstanceId: original.storageInstanceId }, "PATCH");
  assert.equal(clearDemeanor.status, 200);
  assert.equal((await saved()).demeanor, undefined);
  mode = "drop";
  const broken = await open("client-broken");
  const failed = await broken.rest();
  assert.ok(failed.some(event => event.type === "error"));
  assert.ok(!failed.some(event => event.type === "complete"));
  assert.doesNotMatch(modelPrompts[1], /USER'S DEMEANOR NOTE/);
  assert.equal((await saved()).messages.filter(message => message.from === "character").length, 1);
  mode = "complete";
  const retry = await open("client-broken");
  assert.ok((await retry.rest()).some(event => event.type === "complete"));
  assert.equal((await saved()).messages.filter(message => message.id === "client-broken").length, 1);

  mode = "hold";
  const disconnected = await open("client-disconnected");
  await wait(() => held.length === 1);
  await disconnected.reader.cancel(); held.shift()();
  await wait(async () => (await saved()).messages.some(message => message.inReplyTo === "client-disconnected"));
  const beforeRecovery = modelCalls;
  const recovery = await call("/api/chat", { characterId: "stream", clientMessageId: "client-disconnected", text: "Is the path clear?" });
  assert.ok((await recovery.json()).reply);
  assert.equal(modelCalls, beforeRecovery);

  const deleted = await open("client-deleted");
  await wait(() => held.length === 1);
  assert.equal((await call("/api/threads/stream", undefined, "DELETE")).status, 200);
  held.shift()();
  const cancelled = await deleted.rest();
  assert.ok(cancelled.some(event => event.type === "error" && event.status === 409));
  assert.ok(!cancelled.some(event => event.type === "complete"));
  await assert.rejects(fs.access(path.join(home, "data/threads/stream.json")), { code: "ENOENT" });
});
