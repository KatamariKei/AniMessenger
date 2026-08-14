import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("a completed image is recovered after AniMessenger restarts without its browser watcher", async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "animessenger-image-recovery-"));
  const promptId = "completed-while-browser-was-away";
  const threadId = "recovery_character";
  const comfy = http.createServer((request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({
      [promptId]: { outputs: { "14": { images: [{ filename: "recovered.png", subfolder: "AniMessenger\\Recovery", type: "output" }] } } },
    }));
  });
  await new Promise((resolve) => comfy.listen(0, "127.0.0.1", resolve));
  const comfyPort = comfy.address().port;
  await fs.mkdir(path.join(home, "data", "threads"), { recursive: true });
  await fs.writeFile(path.join(home, "animessenger.config.json"), JSON.stringify({
    comfyUrl: `http://127.0.0.1:${comfyPort}`,
    proactiveEnabled: false,
  }));
  await fs.writeFile(path.join(home, "data", "threads", `${threadId}.json`), JSON.stringify({
    id: threadId,
    character: { id: threadId, name: "Recovery Character", series: "Test" },
    messages: [],
    relationship: 10,
    updatedAt: new Date().toISOString(),
  }));
  await fs.writeFile(path.join(home, "data", "image-jobs.json"), JSON.stringify({
    [promptId]: {
      characterId: threadId,
      appended: false,
      caption: "Recovered caption",
      imageContext: "recovery test",
      updatedAt: new Date().toISOString(),
    },
  }));

  const port = 52974;
  const child = spawn(process.execPath, [path.join(root, "server", "index.mjs"), "--serve-dist"], {
    cwd: root,
    env: { ...process.env, ANIMESSENGER_HOME: home, HOST: "127.0.0.1", PORT: String(port) },
    stdio: "ignore",
  });
  t.after(async () => {
    if (child.exitCode === null) child.kill();
    await new Promise((resolve) => comfy.close(resolve));
    await fs.rm(home, { recursive: true, force: true });
  });

  let recovered;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const thread = JSON.parse(await fs.readFile(path.join(home, "data", "threads", `${threadId}.json`), "utf8"));
      if (thread.messages?.[0]?.image) {
        recovered = thread;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  assert.equal(recovered?.messages?.length, 1);
  assert.equal(recovered.messages[0].text, "Recovered caption");
  assert.match(recovered.messages[0].image, /recovered\.png/);
  const jobs = JSON.parse(await fs.readFile(path.join(home, "data", "image-jobs.json"), "utf8"));
  assert.equal(jobs[promptId].appended, true);
});

test("repeated status checks reconnect an already completed avatar job to its owning thread", async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "animessenger-avatar-reconnect-"));
  const promptId = "completed-avatar-job";
  const threadId = "marie";
  const imageUrl = "/api/images/view?filename=marie-profile.png&type=output";
  const comfy = http.createServer((request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({
      [promptId]: { outputs: { "14": { images: [{ filename: "marie-profile.png", type: "output" }] } } },
    }));
  });
  await new Promise((resolve) => comfy.listen(0, "127.0.0.1", resolve));
  const comfyPort = comfy.address().port;
  const portProbe = http.createServer();
  await new Promise((resolve) => portProbe.listen(0, "127.0.0.1", resolve));
  const port = portProbe.address().port;
  await new Promise((resolve) => portProbe.close(resolve));

  await fs.mkdir(path.join(home, "data", "threads"), { recursive: true });
  await fs.writeFile(path.join(home, "animessenger.config.json"), JSON.stringify({
    comfyUrl: `http://127.0.0.1:${comfyPort}`,
    proactiveEnabled: false,
  }));
  await fs.writeFile(path.join(home, "data", "threads", `${threadId}.json`), JSON.stringify({
    id: threadId,
    character: { id: threadId, name: "Marie", series: "Test", avatarUrl: imageUrl },
    messages: [],
    relationship: 10,
    updatedAt: new Date().toISOString(),
  }));
  await fs.writeFile(path.join(home, "data", "image-jobs.json"), JSON.stringify({
    [promptId]: {
      kind: "avatar",
      characterId: threadId,
      appended: true,
      updatedAt: new Date().toISOString(),
    },
  }));

  const child = spawn(process.execPath, [path.join(root, "server", "index.mjs"), "--serve-dist"], {
    cwd: root,
    env: { ...process.env, ANIMESSENGER_HOME: home, HOST: "127.0.0.1", PORT: String(port) },
    stdio: "ignore",
  });
  t.after(async () => {
    if (child.exitCode === null) child.kill();
    await new Promise((resolve) => comfy.close(resolve));
    await fs.rm(home, { recursive: true, force: true });
  });

  let result;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/images/status/${promptId}`);
      if (response.ok) {
        result = await response.json();
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  assert.equal(result?.status, "complete");
  assert.equal(result?.thread?.character?.avatarUrl, imageUrl);
  assert.deepEqual(result?.thread?.messages, []);
});
