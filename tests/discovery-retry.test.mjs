import test from "node:test";
import assert from "node:assert/strict";
import { fillDiscoverySlots } from "../server/discovery-retry.mjs";

test("retries rotate rejected topics, retain approved discoveries, and stop when full", async () => {
  const existing = [{ id: "old", truth: "Existing discovery" }];
  let calls = 0;
  const result = await fillDiscoverySlots(async (approved, options) => {
    calls++;
    assert.deepEqual(approved.slice(0, 1), existing);
    if (calls === 1) {
      options.onRejectedTopics(["Unknown family secret"]);
      options.onDiagnostics({ proposed: 1, selected: 0, rejections: { "character-unaware": 1 } });
      return [];
    }
    assert.deepEqual(options.rejectedTopics, ["Unknown family secret"]);
    assert.equal(options.feedback.rejections["character-unaware"], 1);
    options.onDiagnostics({ proposed: 4, selected: 2 });
    return [{ id: "new1", truth: "A hobby" }, { id: "new2", truth: "A treasured object" }];
  }, existing);
  assert.equal(calls, 2);
  assert.equal(result.definitions.length, 2);
  assert.doesNotMatch(JSON.stringify(result.attempts), /Unknown family secret/);
});

test("retries are bounded and optional failure preserves approved results", async () => {
  let calls = 0;
  await fillDiscoverySlots(async () => { calls++; return []; });
  assert.equal(calls, 3);
  calls = 0;
  const result = await fillDiscoverySlots(async () => {
    if (++calls === 1) return [{ id: "safe", truth: "Approved" }];
    throw new Error("Model unavailable");
  });
  assert.equal(result.definitions[0].id, "safe");
  await assert.rejects(fillDiscoverySlots(async () => { throw new Error("Initial failure"); }), /Initial failure/);
});

test("completed characters require no model call", async () => {
  const result = await fillDiscoverySlots(() => { throw new Error("Must not run"); }, [1, 2, 3]);
  assert.deepEqual(result, { definitions: [], attempts: [] });
});
