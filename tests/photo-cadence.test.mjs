import test from "node:test";
import assert from "node:assert/strict";
import { advancePhotoCadence, photoCadenceRange, postponePhotoCadence, resetPhotoCadence } from "../server/photo-cadence.mjs";

test("photo cadence unlocks and accelerates with relationship trust", () => {
  assert.equal(photoCadenceRange(20), null);
  assert.deepEqual(photoCadenceRange(30), [10, 15]);
  assert.deepEqual(photoCadenceRange(55), [7, 12]);
  assert.deepEqual(photoCadenceRange(90), [5, 10]);
});

test("close characters receive a visual opportunity after five to ten user turns", () => {
  let cadence;
  for (let turn = 1; turn <= 4; turn += 1) {
    cadence = advancePhotoCadence(cadence?.state, 90, () => 0);
    assert.equal(cadence.opportunity, false);
  }
  cadence = advancePhotoCadence(cadence.state, 90, () => 0);
  assert.equal(cadence.opportunity, true);
});

test("declined opportunities postpone briefly and sent photos reset the rhythm", () => {
  assert.deepEqual(postponePhotoCadence({ turnsSincePhoto: 8, nextPhotoTurn: 8 }, () => 0), { turnsSincePhoto: 8, nextPhotoTurn: 9 });
  assert.deepEqual(resetPhotoCadence(90, () => 0.999), { turnsSincePhoto: 0, nextPhotoTurn: 10 });
});
