import test from "node:test";
import assert from "node:assert/strict";
import { createRateLimitedPoller } from "../shared/polling.mjs";

test("notification transport deduplicates overlapping requests and rate-limits remounts", async () => {
  let time = 0, calls = 0, resolve;
  const poller = createRateLimitedPoller({ now: () => time });
  const task = () => { calls++; return new Promise(done => { resolve = done; }); };
  const first = poller.run("same", task);
  assert.equal(poller.run("same", task), first);
  await Promise.resolve();
  assert.equal(calls, 1);
  resolve("ready");
  assert.deepEqual(await first, { status: "success", value: "ready" });
  for (let i = 0; i < 1000; i++) assert.equal((await poller.run("same", task)).status, "skipped");
  assert.equal(calls, 1);
  time = 10000;
  assert.equal((await poller.run("same", async () => { calls++; return "next"; })).status, "success");
  assert.equal(calls, 2);
});

test("failures back off exponentially, cap at one minute, then recover normally", async () => {
  let time = 0, calls = 0;
  const poller = createRateLimitedPoller({ now: () => time });
  const fail = async () => { calls++; throw new Error("offline"); };
  for (const delay of [20000, 40000, 60000, 60000]) {
    assert.equal((await poller.run("same", fail)).status, "error");
    time += delay - 1;
    assert.equal((await poller.run("same", fail)).status, "skipped");
    time++;
  }
  assert.equal(calls, 4);
  assert.equal((await poller.run("same", async () => "online")).status, "success");
  time += 9999;
  assert.equal((await poller.run("same", fail)).status, "skipped");
  time++;
  assert.equal((await poller.run("same", fail)).status, "error");
});

test("slow requests cannot be multiplied even after the nominal polling interval", async () => {
  let time = 0, resolve;
  const poller = createRateLimitedPoller({ now: () => time });
  const pending = poller.run("one", () => new Promise(done => { resolve = done; }));
  await Promise.resolve();
  time = 100000;
  assert.equal(poller.run("one", async () => "duplicate"), pending);
  assert.equal((await poller.run("two", async () => "independent")).status, "success");
  resolve("one");
  await pending;
  assert.equal((await poller.run("one", async () => "duplicate")).status, "skipped");
});
