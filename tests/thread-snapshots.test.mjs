import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import ts from "typescript";
import vm from "node:vm";

const code = ts.transpileModule(await fs.readFile(new URL("../src/thread-snapshots.ts", import.meta.url), "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { createThreadSnapshotMerger } = await import("data:text/javascript;base64," + Buffer.from(code).toString("base64"));
const thread = (instance, messages = [], updatedAt = "2026-11-01T09:00:00Z") => ({ id: "mira", storageInstanceId: instance, messages, updatedAt, character: { id: "mira" }, relationship: 8 });
const image = { id: "old-image", from: "character", image: "/old.png", time: "2026-11-01T23:00:00Z" };

test("recreated character never inherits old images, even when the old chat has a later clock time", () => {
  const merger = createThreadSnapshotMerger();
  const old = thread("old", [image], "2026-11-01T23:00:00Z");
  const fresh = thread("new", [{ id: "new-reply", from: "character", text: "Hello" }]);
  assert.deepEqual(merger.merge(old, fresh), fresh);
  assert.deepEqual(merger.merge(fresh, old), fresh);
});

test("delete blocks delayed callbacks before recreation and after a replacement starts chatting", () => {
  const merger = createThreadSnapshotMerger();
  const old = thread("old", [image]);
  merger.retire(old);
  assert.equal(merger.isRetired(old), true);
  assert.equal(merger.merge(undefined, old), undefined);
  const fresh = merger.merge(undefined, thread("new"));
  assert.equal(merger.merge(fresh, old), fresh);
  const reply = { id: "fresh-reply", from: "character", text: "New conversation" };
  assert.deepEqual(merger.merge(fresh, thread("new", [reply])).messages, [reply]);
});

test("summaries from a new incarnation do not carry the old full profile or gallery", () => {
  const merger = createThreadSnapshotMerger();
  const old = { ...thread("old", [image]), profile: { summary: "Old history" } };
  const next = { ...thread("new"), summary: true, profile: { summary: "Fresh" } };
  assert.deepEqual(merger.merge(old, next), next);
});

test("same-conversation updates preserve concurrent images, opening order and optimistic delivery handoff", () => {
  const merger = createThreadSnapshotMerger();
  const optimistic = { id: "user", from: "user", text: "Hi", delivery: "sending" };
  const previous = thread("same", [optimistic]);
  const confirmed = { id: "user", from: "user", text: "Hi" };
  const saved = thread("same", [image, confirmed], "2026-11-01T10:00:00Z");
  const merged = merger.merge(previous, saved);
  assert.deepEqual(merged.messages, [image, confirmed]);
  assert.deepEqual(merger.merge(merged, previous).messages, [image, confirmed]);
});

test("unversioned legacy responses cannot replace a versioned recreated conversation", () => {
  const merger = createThreadSnapshotMerger();
  const fresh = thread("new");
  assert.equal(merger.merge(fresh, thread(undefined, [image])), fresh);
  merger.retire(thread(undefined, [image]));
  assert.equal(merger.merge(undefined, thread(undefined, [image])), undefined);
});

test("a delayed snapshot cannot undo a demeanor change saved without moving the chat", () => {
  const merger = createThreadSnapshotMerger();
  const previous = { ...thread("same"), storageRevision: 1, demeanor: "Reserved" };
  const edited = { ...previous, storageRevision: 2, demeanor: "Relaxed" };
  assert.equal(merger.merge(previous, edited).demeanor, "Relaxed");
  assert.equal(merger.merge(edited, previous).demeanor, "Relaxed");
});

test("same-instance summary refresh retains the full dossier and gallery", () => {
  const merger = createThreadSnapshotMerger();
  const full = { ...thread("same", [image]), profile: { summary: "Full dossier", canon: { history: ["Background"] } } };
  const summary = { ...thread("same", [], "2026-11-01T10:00:00Z"), summary: true, profile: { summary: "Partial" } };
  const result = merger.merge(full, summary);
  assert.equal(result.summary, false);
  assert.deepEqual(result.profile, full.profile);
  assert.deepEqual(result.messages, [image]);
});

test("the actual app merge ignores retired callbacks without reopening a deleted chat", async () => {
  const app = await fs.readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  const ast = ts.createSourceFile("App.tsx", app, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let merge;
  const visit = node => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === "mergeThread") merge = node.getText(ast);
    ts.forEachChild(node, visit);
  };
  visit(ast);
  const js = ts.transpileModule(merge, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const snapshots = createThreadSnapshotMerger();
  const old = thread("old", [image], "2026-11-01T23:00:00Z");
  let current = [old], active = "mira";
  const sandbox = { threadSnapshots: snapshots, setThreads: update => { current = update(current); }, setActiveId: value => { active = value; }, orderThreads: threads => threads };
  vm.createContext(sandbox);
  vm.runInContext(js, sandbox);
  snapshots.retire(old);
  current = []; active = "";
  sandbox.mergeThread(old, true);
  assert.equal(current.length, 0);
  assert.equal(active, "");
  sandbox.mergeThread(thread("new"), true);
  sandbox.mergeThread(old, true);
  assert.equal(current.length, 1);
  assert.equal(current[0].storageInstanceId, "new");
  assert.equal(current[0].messages.length, 0);
});
