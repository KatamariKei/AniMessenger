import test from "node:test";
import assert from "node:assert/strict";
import { createDiscoveryDiagnostics } from "../shared/discovery-diagnostics.mjs";

test("notification diagnostics are bounded, local and tolerant of unavailable storage", () => {
  const saved = new Map();
  const trace = createDiscoveryDiagnostics({ limit: 3, now: () => 42,
    storage: { setItem: (key, value) => saved.set(key, value) } });
  for (let index = 0; index < 5; index++) trace.record("commit", { instance: index });
  assert.deepEqual(trace.read().map(event => event.instance), [2, 3, 4]);
  assert.equal(JSON.parse([...saved.values()][0]).length, 3);
  const copy = trace.read();
  copy[0].event = "changed";
  assert.equal(trace.read()[0].event, "commit");
  const blocked = createDiscoveryDiagnostics({ storage: { setItem() { throw Error("blocked"); } } });
  assert.doesNotThrow(() => blocked.record("dismiss"));
});
