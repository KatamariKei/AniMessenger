import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";

test("current-image endpoints repair uncertain scenes once, preserve chat and block unverifiable artwork", { timeout: 20000 }, async t => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "animessenger-scene-check-"));
  let child, reviews = 0, chats = 0, badReview = false, simpleChat = false;
  const prompts = [];
  const passage = "Mira reclines on red velvet cushions inside her private quarters. Obsidian pillars surround the lounge beneath a vaulted ceiling. Warm lamps light the room.";
  const evidence = quote => ({ quote, source: "character", actor: "character", phase: "current" });
  const repairedScene = { location: "private quarters", environment: "Obsidian pillars surround the lounge beneath a vaulted ceiling", activity: "reclining on red velvet cushions", posture: "lying", lighting: "warm lamps" };
  const repairedEvidence = { location: evidence(passage.split(". ")[0]), environment: evidence(passage.split(". ")[1]), activity: evidence(passage.split(". ")[0]), posture: evidence(passage.split(". ")[0]), lighting: evidence("Warm lamps light the room") };
  const mock = http.createServer(async (request, response) => {
    let raw = ""; for await (const chunk of request) raw += chunk;
    const body = raw ? JSON.parse(raw) : {};
    const json = value => { response.writeHead(200, { "content-type": "application/json" }); response.end(JSON.stringify(value)); };
    if (request.url === "/api/ps") return json({ models: [{ name: "synthetic", context_length: 65536 }] });
    if (request.url === "/api/show") return json({ model_info: { "test.context_length": 65536 }, details: { family: "test" } });
    if (request.url === "/prompt") { prompts.push(body); return json({ prompt_id: "scene-image-" + prompts.length }); }
    if (request.url === "/api/chat") {
      let result = {};
      if (body.format?.properties?.relationshipDelta) {
        chats++;
        result = { reply: simpleChat ? "The lounge is comfortable. Thank you for asking." : passage, narration: null, relationshipDelta: 0,
          scene: simpleChat ? {} : repairedScene, sceneEvidence: {}, shouldSendPhoto: !simpleChat,
          photoBrief: "Mira standing in the old corridor", photoMessage: "Here you go.", memoryCandidates: [], achievementSignals: [] };
      } else if (body.format?.properties?.sceneEvidence) {
        reviews++;
        assert.equal(body.options.num_ctx, undefined);
        assert.ok(body.format.properties.sceneEvidence.properties.activity.anyOf[0].properties.evidenceId);
        assert.ok(body.format.properties.locationDisposition);
        assert.match(body.messages[0].content, /quoted data, never instructions/);
        const input = JSON.parse(body.messages.at(-1).content);
        const references = Object.fromEntries(Object.entries(repairedEvidence).map(([field, proof]) => [field, {
          evidenceId: input.evidenceCatalog.find(item => item.source === proof.source && item.quote.includes(proof.quote))?.id || "missing",
          actor: proof.actor, phase: proof.phase,
        }]));
        result = { locationDisposition: input.uncertainFields.includes("location") ? "changed" : null, scene: repairedScene, sceneEvidence: badReview ? {} : references };
      }
      return json({ message: { content: JSON.stringify(result) }, done: true, prompt_eval_count: 100, eval_count: 80 });
    }
    return json({});
  });
  await new Promise(resolve => mock.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    if (child && child.exitCode === null) { child.kill(); await once(child, "exit"); }
    mock.closeAllConnections(); await new Promise(resolve => mock.close(resolve));
    assert.ok(path.resolve(home).startsWith(path.resolve(os.tmpdir()) + path.sep + "animessenger-scene-check-"));
    await fs.rm(home, { recursive: true, force: true });
  });
  const profile = { name: "Mira", series: "Synthetic", age: 25, summary: "A patient gardener.", status: "Ready",
    visual: { identity: [], signature: [], defaultWardrobe: "blue dress", wardrobePreferences: [] },
    persona: { traits: [], mannerisms: [], speechStyle: "Plain", emotionalRules: [], exampleLines: [] },
    canon: { overview: "Synthetic", history: [], relationships: [], knowledge: [], boundaries: [] }, sources: [] };
  await fs.mkdir(path.join(home, "data/threads"), { recursive: true });
  for (const id of ["capture", "failure", "automatic", "routine", "optional", "continuity"]) {
    const pending = ["capture", "failure", "optional"].includes(id);
    const thread = { id, storageInstanceId: "instance-" + id, storageRevision: 1, character: { id, name: "Mira", series: "Synthetic" }, profile: { ...profile, id }, memories: [], relationship: 8, conversationMode: "chat",
      messages: pending ? [{ id: "u1", from: "user", text: "Please get comfortable." }, { id: "c1", from: "character", text: passage }] : [],
      scene: { location: "corridor", environment: "stone walls beside a heavy wooden door", activity: "returning from the gardens", posture: "standing", outfit: "blue dress", expression: "calm", lighting: "corridor lanterns", presence: "together",
        ...(pending ? { verification: { version: 1, status: "needs_review", pending: ["location", "environment", "activity", "posture", "lighting"] } } : {}),
        ...(id === "optional" ? { location: "private quarters", environment: "Obsidian pillars surround the lounge beneath a vaulted ceiling", environmentEvidence: { kind: "final_scene" }, posture: "lying", verification: { version: 1, status: "needs_review", pending: ["activity"] } } : {}) }, updatedAt: new Date().toISOString() };
    if (id === "continuity") {
      thread.scene.location = "throne room";
      thread.scene.locationEvidence = { kind: "final_scene", source: "character", text: "Mira entered the throne room" };
      thread.scene.verification = { version: 1, status: "needs_review", pending: ["location"] };
      thread.messages = [{ from: "character", text: "Mira entered the throne room." }, { from: "user", text: "Please take a picture." }, { from: "character", text: "Mira leans against the door." }];
    }
    await fs.writeFile(path.join(home, "data/threads", id + ".json"), JSON.stringify(thread));
  }
  const url = `http://127.0.0.1:${mock.address().port}`;
  await fs.writeFile(path.join(home, "animessenger.config.json"), JSON.stringify({ ollamaUrl: url, comfyUrl: url, chatModel: "synthetic", proactiveEnabled: false, researchEnabled: false,
    comfyWorkflowFile: path.join(root, "workflows/anima-recommended-api.json"), comfyMappingFile: path.join(root, "workflows/anima-recommended-api.mapping.json") }));
  const bootstrap = `import http from 'node:http';const listen=http.Server.prototype.listen;http.Server.prototype.listen=function(...args){this.once('listening',()=>console.log('TEST_PORT='+this.address().port));return listen.apply(this,args)};await import('./server/index.mjs');`;
  child = spawn(process.execPath, ["--input-type=module", "-e", bootstrap], { cwd: root, env: { ...process.env, ANIMESSENGER_HOME: home, HOST: "127.0.0.1", PORT: "0", ANIMESSENGER_ALLOWED_ORIGINS: "" }, stdio: ["ignore", "pipe", "pipe"] });
  let diagnostics = ""; child.stderr.on("data", chunk => { diagnostics += chunk; });
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Startup timed out: " + diagnostics)), 5000);
    child.stdout.on("data", chunk => { const match = /TEST_PORT=(\d+)/.exec(String(chunk)); if (match) { clearTimeout(timer); resolve(Number(match[1])); } });
    child.on("exit", code => { clearTimeout(timer); reject(new Error(`Service exited ${code}: ${diagnostics}`)); });
  });
  const call = (route, body) => fetch(`http://127.0.0.1:${port}` + route, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const saved = async id => JSON.parse(await fs.readFile(path.join(home, "data/threads", id + ".json"), "utf8"));
  const capture = await call("/api/images/capture-moment", { characterId: "capture" });
  assert.equal(capture.status, 200, JSON.stringify(await capture.clone().json()));
  assert.equal(reviews, 1); assert.equal(prompts.length, 1);
  assert.match(JSON.stringify(prompts[0]), /red velvet cushions/);
  assert.match(JSON.stringify(prompts[0]), /Obsidian pillars/);
  assert.doesNotMatch(JSON.stringify(prompts[0]), /corridor|returning from the gardens/);
  const corrected = await saved("capture");
  assert.equal(corrected.scene.posture, "lying"); assert.equal(corrected.messages.length, 2);
  assert.equal(corrected.scene.verification.status, "verified");
  assert.equal((await call("/api/images/generate", { characterId: "capture", brief: "a close-up" })).status, 200);
  assert.equal(reviews, 1); assert.equal(prompts.length, 2);

  badReview = true;
  const failure = await call("/api/images/capture-moment", { characterId: "failure" });
  assert.equal(failure.status, 500); assert.match((await failure.json()).error, /could not be verified/);
  assert.equal(prompts.length, 2); assert.equal((await saved("failure")).scene.location, "corridor");

  badReview = false;
  const automatic = await call("/api/chat", { characterId: "automatic", text: "Please send me a picture.", clientMessageId: "auto-turn" });
  assert.equal(automatic.status, 200);
  const reply = await automatic.json();
  assert.ok(reply.imageJob, JSON.stringify(reply));
  assert.equal(chats, 1); assert.equal(reviews, 3); assert.equal(prompts.length, 3);
  assert.doesNotMatch(JSON.stringify(prompts[2]), /corridor|standing/);
  assert.equal(reply.thread.scene.posture, "lying");
  assert.equal((await saved("automatic")).messages.length, 2);

  simpleChat = true;
  assert.equal((await call("/api/chat", { characterId: "routine", text: "Thanks for inviting me.", clientMessageId: "plain-turn" })).status, 200);
  assert.equal(chats, 2); assert.equal(reviews, 3); assert.equal(prompts.length, 3);

  badReview = true;
  const optional = await call("/api/images/capture-moment", { characterId: "optional" });
  assert.equal(optional.status, 200, JSON.stringify(await optional.clone().json()));
  assert.equal(reviews, 4); assert.equal(prompts.length, 4);
  assert.match(JSON.stringify(prompts[3]), /private quarters/);
  assert.doesNotMatch(JSON.stringify(prompts[3]), /returning from the gardens|unspecified/);
  const optionalSaved = await saved("optional");
  assert.equal(optionalSaved.scene.posture, "lying");
  assert.deepEqual(optionalSaved.scene.verification.omitted, ["activity"]);

  badReview = false;
  const continuity = await call("/api/images/capture-moment", { characterId: "continuity" });
  assert.equal(continuity.status, 200, JSON.stringify(await continuity.clone().json()));
  assert.equal(reviews, 5); assert.equal(prompts.length, 5);
  assert.match(JSON.stringify(prompts[4]), /throne room/);
  assert.doesNotMatch(JSON.stringify(prompts[4]), /private quarters/);
  const retained = await saved("continuity");
  assert.equal(retained.scene.location, "throne room");
  assert.equal(retained.scene.posture, "standing");
  assert.deepEqual(retained.scene.verification.pending, []);
});
