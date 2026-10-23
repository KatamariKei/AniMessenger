import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

test("memory scan HTTP requests return immediately, reconnect, and deduplicate while Ollama is slow", async t => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "ani-scan-http-"));
  let modelResponse;
  let modelCalls = 0;
  const model = http.createServer((request, response) => {
    if (request.url === "/api/chat") { modelCalls++; modelResponse = response; }
    else { response.writeHead(200, { "content-type": "application/json" }); response.end('{}'); }
  });
  await new Promise(resolve => model.listen(0, "127.0.0.1", resolve));
  const reservation = http.createServer();
  await new Promise(resolve => reservation.listen(0, "127.0.0.1", resolve));
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  await fs.mkdir(path.join(home, "data", "threads"), { recursive: true });
  await fs.writeFile(path.join(home, "animessenger.config.json"), JSON.stringify({
    ollamaUrl: `http://127.0.0.1:${model.address().port}`, profileModel: "fixture", proactiveEnabled: false,
  }));
  await fs.writeFile(path.join(home, "data", "threads", "fixture.json"), JSON.stringify({
    id: "fixture", character: { id: "fixture", name: "Pyra" }, profile: { id: "fixture", name: "Pyra" },
    messages: [{ id: "one", from: "user", text: "I love Panang curry." }], memories: [], relationship: 8,
  }));
  const child = spawn(process.execPath, [path.resolve("server/index.mjs")], {
    env: { ...process.env, ANIMESSENGER_HOME: home, HOST: "127.0.0.1", PORT: String(port) }, stdio: "ignore",
  });
  t.after(async () => {
    if (child.exitCode === null) { child.kill(); await new Promise(resolve => child.once("exit", resolve)); }
    model.closeAllConnections(); await new Promise(resolve => model.close(resolve));
    await fs.rm(home, { recursive: true, force: true });
  });
  const url = `http://127.0.0.1:${port}/api/threads/fixture/memories/backfill`;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { if ((await fetch(url)).ok) break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  const start = await fetch(url, { method: "POST" });
  assert.equal(start.status, 202);
  const first = (await start.json()).job;
  for (let attempt = 0; !modelResponse && attempt < 100; attempt++) await new Promise(resolve => setTimeout(resolve, 10));
  assert.ok(modelResponse);
  const second = (await (await fetch(url, { method: "POST" })).json()).job;
  assert.equal(second.id, first.id);
  const reconnected = (await (await fetch(url)).json()).job;
  assert.equal(reconnected.status, "running");
  assert.equal(reconnected.total, 1);
  assert.equal(modelCalls, 1);
  modelResponse.writeHead(200, { "content-type": "application/json" });
  modelResponse.end(JSON.stringify({ message: { content: JSON.stringify({ memories: [{
    kind: "preference", text: "The user loves Panang curry.", importance: 4, keywords: ["panang", "curry"], sourceMessageIds: ["one"], eventAt: null,
  }] }) }, done_reason: "stop" }));
  let finished;
  for (let attempt = 0; attempt < 100; attempt++) {
    finished = (await (await fetch(url)).json()).job;
    if (finished.status === "complete") break;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.equal(finished.status, "complete"); assert.equal(finished.added, 1);
  const saved = JSON.parse(await fs.readFile(path.join(home, "data", "threads", "fixture.json"), "utf8"));
  assert.equal(saved.memories.length, 1); assert.equal(saved.messages.length, 1); assert.ok(saved.memoryBackfilledAt);
});
