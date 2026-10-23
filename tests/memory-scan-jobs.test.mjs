import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createMemoryScanJobs, saveMemoryScanCheckpoint } from "../server/memory-scan-jobs.mjs";
import { extractHistoricalMemories } from "../server/ollama.mjs";

async function directory(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ani-memory-scan-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return dir;
}
async function waitFor(task, predicate) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const value = await task();
    if (predicate(value)) return value;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error("Fixture scan did not reach its expected state.");
}

test("checkpoint replacement retries temporary Windows locks without deleting saved progress", async t => {
  const dir = await directory(t);
  const target = path.join(dir, "checkpoint.json");
  await fs.writeFile(target, "old checkpoint");
  let attempts = 0;
  const waits = [];
  await saveMemoryScanCheckpoint(target, "new checkpoint", {
    fileSystem: { ...fs, rename: async (source, destination) => {
      assert.equal(await fs.readFile(target, "utf8"), "old checkpoint");
      if (++attempts <= 3) throw Object.assign(new Error("locked"), { code: "EPERM" });
      return fs.rename(source, destination);
    } }, wait: async ms => { waits.push(ms); },
  });
  assert.equal(attempts, 4);
  assert.deepEqual(waits, [50, 100, 200]);
  assert.equal(await fs.readFile(target, "utf8"), "new checkpoint");
  assert.deepEqual(await fs.readdir(dir), ["checkpoint.json"]);
});

test("persistent checkpoint locks preserve the previous checkpoint and report a resumable error", async t => {
  const dir = await directory(t);
  const target = path.join(dir, "checkpoint.json");
  await fs.writeFile(target, "saved receipts");
  let attempts = 0;
  await assert.rejects(saveMemoryScanCheckpoint(target, "new receipts", {
    fileSystem: { ...fs, rename: async () => { attempts++; throw Object.assign(new Error("locked"), { code: "EACCES" }); } },
    delays: [1, 2], wait: async () => {},
  }), /Recovered memories are safe.*resume/);
  assert.equal(attempts, 3);
  assert.equal(await fs.readFile(target, "utf8"), "saved receipts");
  assert.deepEqual(await fs.readdir(dir), ["checkpoint.json"]);
});

test("checkpoint failures unrelated to file locks are not retried", async t => {
  const target = path.join(await directory(t), "checkpoint.json");
  let attempts = 0;
  await assert.rejects(saveMemoryScanCheckpoint(target, "receipts", {
    fileSystem: { ...fs, rename: async () => { attempts++; throw Object.assign(new Error("disk full"), { code: "ENOSPC" }); } },
    wait: async () => assert.fail("unexpected retry"),
  }), /disk full/);
  assert.equal(attempts, 1);
});

test("scan startup returns before extraction and concurrent clicks reuse one job", async t => {
  let finish;
  const hold = new Promise(resolve => { finish = resolve; });
  let calls = 0;
  const scans = createMemoryScanJobs({ directory: await directory(t), run: async (_, progress) => {
    calls++;
    await progress({ completed: 1, total: 2, added: 3 });
    await hold;
    return { completed: 2, added: 4 };
  } });
  const jobs = await Promise.all(Array.from({ length: 5 }, () => scans.start("pyra")));
  assert.equal(new Set(jobs.map(job => job.id)).size, 1);
  await waitFor(() => scans.status("pyra"), job => job.completed === 1);
  assert.equal((await scans.start("pyra")).id, jobs[0].id);
  assert.equal(calls, 1);
  finish();
  const complete = await waitFor(() => scans.status("pyra"), job => job.status === "complete" && !scans.running);
  assert.equal(complete.added, 4);
});

test("scan jobs serialize characters and wait for busy AI work", async t => {
  let ready = false;
  let active = 0;
  let maximum = 0;
  const scans = createMemoryScanJobs({ directory: await directory(t), delayMs: 10, ready: () => ready,
    run: async () => { active++; maximum = Math.max(maximum, active); await new Promise(resolve => setTimeout(resolve, 20)); active--; return { added: 1 }; } });
  await scans.start("one"); await scans.start("two");
  assert.equal((await scans.status("one")).status, "queued");
  ready = true;
  await waitFor(() => scans.status("two"), job => job.status === "complete" && !scans.running);
  assert.equal(maximum, 1);
});

test("partial recovery and interruption status survive a service restart", async t => {
  const dir = await directory(t);
  const scans = createMemoryScanJobs({ directory: dir, run: async (_, progress) => {
    await progress({ completed: 1, total: 2, added: 2 });
    throw new Error("A later batch failed.");
  } });
  await scans.start("pyra");
  const failed = await waitFor(() => scans.status("pyra"), job => job.status === "error" && !scans.running);
  assert.equal(failed.added, 2);
  const restarted = createMemoryScanJobs({ directory: dir, run: async () => ({}) });
  assert.deepEqual(await restarted.status("pyra"), failed);
  await fs.writeFile(path.join(dir, "interrupted.json"), JSON.stringify({ id: "old", characterId: "interrupted", status: "running", added: 3 }));
  const interrupted = await restarted.status("interrupted");
  assert.equal(interrupted.status, "error");
  assert.equal(interrupted.added, 3);
  assert.match(interrupted.error, /restarted/);
});

test("historical batches merge into the latest thread without reverting chat or memory edits", async t => {
  const home = await directory(t);
  const store = new URL("../server/store.mjs", import.meta.url).href;
  const code = `import assert from 'node:assert/strict';
    import {createThread,saveThread,mergeThreadHistoricalMemories,loadThread} from ${JSON.stringify(store)};
    const original=await createThread({id:'fixture-pyra',name:'Pyra'});
    await saveThread({...original,messages:[{id:'new-message',from:'user',text:'A new conversation message.'}],
      scene:{...original.scene,location:'kitchen'},bondScore:114,memoryRevision:7,
      memoryCheckpoint:{lastReviewedMessageId:'new-message'},
      memories:[{id:'manual',kind:'preference',text:'The user loves jasmine tea.',importance:4,keywords:['jasmine','tea']}]});
    await mergeThreadHistoricalMemories(original.id,[{kind:'preference',text:'The user loves Panang curry.',importance:4,keywords:['panang','curry']}]);
    await mergeThreadHistoricalMemories(original.id,[],true);
    const latest=await loadThread(original.id);
    assert.equal(latest.messages[0].id,'new-message'); assert.equal(latest.scene.location,'kitchen');
    assert.equal(latest.bondScore,114); assert.equal(latest.memoryCheckpoint.lastReviewedMessageId,'new-message');
    assert.ok(latest.memories.some(m=>m.text.includes('jasmine'))); assert.ok(latest.memories.some(m=>m.text.includes('Panang')));
    assert.equal(latest.memoryRevision,9); assert.ok(latest.memoryBackfilledAt);`;
  execFileSync(process.execPath, ["--input-type=module", "-e", code], { env: { ...process.env, ANIMESSENGER_HOME: home }, timeout: 10000 });
});

test("historical extraction reports batches and commits recoveries before a later failure", async t => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    const content = calls === 1 ? JSON.stringify({ memories: [{ kind: "preference", text: "The user loves Panang curry.",
      keywords: ["panang", "curry"], importance: 4, sourceMessageIds: ["message-0"], eventAt: null }] }) : "not json";
    return new Response(JSON.stringify({ message: { content }, done_reason: "stop" }), { status: 200 });
  };
  const recovered = [];
  const progress = [];
  await assert.rejects(extractHistoricalMemories({ ollamaUrl: "http://fixture", profileModel: "fixture" }, {
    profile: { name: "Pyra" }, messages: Array.from({ length: 61 }, (_, index) => ({ id: `message-${index}`, from: "user", text: "I love Panang curry." })),
  }, { onBatch: batch => recovered.push(...batch), onProgress: update => progress.push(update) }), /1 of 2 chat batches/);
  assert.equal(recovered.length, 1);
  assert.equal(progress.at(-1).completed, 2);
  assert.equal(progress.at(-1).total, 2);
  assert.equal(progress.at(-1).failed, 1);
  assert.equal(progress.at(-1).completedBatchIds.length, 1);
  assert.equal(progress.at(-1).scanVersion, 2);
});

test("retry after restart passes saved successful batch receipts and recovered count to the runner", async t => {
  const dir = await directory(t);
  await fs.writeFile(path.join(dir, "resume.json"), JSON.stringify({ id: "prior", characterId: "resume", status: "running",
    scanVersion: 2, completedBatchIds: ["batch-one"], completed: 1, total: 3, added: 4 }));
  let received;
  const scans = createMemoryScanJobs({ directory: dir, run: async (_, progress, checkpoint) => {
    received = checkpoint;
    await progress({ completed: 3, total: 3, completedBatchIds: ["batch-one", "batch-two", "batch-three"] });
    return { added: checkpoint.added + 2 };
  } });
  await scans.start("resume");
  const completed = await waitFor(() => scans.status("resume"), job => job.status === "complete" && !scans.running);
  assert.deepEqual(received.completedBatchIds, ["batch-one"]);
  assert.equal(received.added, 4);
  assert.equal(completed.added, 6);
});

test("yielding a scan releases the model gate without starting another character scan", async t => {
  let pendingLiveWork = false;
  let overlap = false;
  const scans = createMemoryScanJobs({ directory: await directory(t), delayMs: 5,
    ready: () => !pendingLiveWork,
    run: async id => {
      if (id === "one") {
        pendingLiveWork = true;
        const live = setInterval(() => {
          if (!scans.running) { pendingLiveWork = false; clearInterval(live); }
        }, 5);
        await scans.waitUntilReady();
      } else overlap = pendingLiveWork;
      return {};
    },
  });
  await scans.start("one"); await scans.start("two");
  await waitFor(() => scans.status("two"), job => job.status === "complete");
  assert.equal(overlap, false);
});
