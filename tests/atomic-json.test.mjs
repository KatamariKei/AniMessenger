import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { replaceFileAtomically, writeJsonAtomically } from "../server/atomic-json.mjs";

async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "animessenger-atomic-review-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const target = path.join(directory, "saved.json");
  await fs.writeFile(target, '{"old":true}\n');
  return { directory, target };
}

test("partial write failure preserves the previous JSON and removes only the temporary file", async t => {
  const { directory, target } = await fixture(t);
  const fileSystem = { ...fs, open: async (...args) => {
    const handle = await fs.open(...args);
    return { writeFile: async () => { await handle.writeFile('{"partial":'); throw Object.assign(new Error("disk full"), { code: "ENOSPC" }); }, sync: () => handle.sync(), close: () => handle.close() };
  } };
  await assert.rejects(replaceFileAtomically(target, '{"new":true}', { fileSystem }), { code: "ENOSPC" });
  assert.deepEqual(JSON.parse(await fs.readFile(target, "utf8")), { old: true });
  assert.deepEqual(await fs.readdir(directory), ["saved.json"]);
});

test("persistent Windows locks never delete the previous destination", async t => {
  const { directory, target } = await fixture(t);
  let attempts = 0;
  const fileSystem = { ...fs, rename: async () => { attempts++; throw Object.assign(new Error("locked"), { code: "EPERM" }); } };
  await assert.rejects(replaceFileAtomically(target, '{"new":true}', { fileSystem, delays: [0, 0], wait: async () => {} }), { code: "EPERM" });
  assert.equal(attempts, 3);
  assert.deepEqual(JSON.parse(await fs.readFile(target, "utf8")), { old: true });
  assert.deepEqual(await fs.readdir(directory), ["saved.json"]);
});

test("a temporary Windows lock retries safely and then replaces the file", async t => {
  const { target } = await fixture(t);
  let attempts = 0;
  const fileSystem = { ...fs, rename: async (...args) => { if (++attempts === 1) throw Object.assign(new Error("locked"), { code: "EACCES" }); return fs.rename(...args); } };
  await replaceFileAtomically(target, '{"new":true}', { fileSystem, delays: [0], wait: async () => {} });
  assert.equal(attempts, 2);
  assert.deepEqual(JSON.parse(await fs.readFile(target, "utf8")), { new: true });
});

test("overlapping saves snapshot values immediately and leave the final complete version", async t => {
  const { target } = await fixture(t);
  const first = { value: 1 };
  const a = writeJsonAtomically(target, first);
  first.value = 99;
  const b = writeJsonAtomically(target, { value: 2 });
  await Promise.all([a, b]);
  assert.deepEqual(JSON.parse(await fs.readFile(target, "utf8")), { value: 2 });
});
