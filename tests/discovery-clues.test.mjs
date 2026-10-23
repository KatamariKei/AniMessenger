import test from "node:test";
import assert from "node:assert/strict";
import { isDiscoveryClue, safeClueUpdates } from "../server/discovery-clues.mjs";

test("discovery clues distinguish third-person observations from dialogue and mechanics", () => {
  for (const clue of ["An old clock catches her attention.", "Faye's confidence masks uncertainty about her identity.", "A treasured toy has a special place in her everyday life."]) assert.equal(isDiscoveryClue(clue), true);
  for (const clue of ["You've always carried yourself with confidence, but I wonder about your name.", "She might mention the gift of her physical existence.", "Ask her about the old clock.", "Who taught her that skill?", "An old clock will unlock relationship points."]) assert.equal(isDiscoveryClue(clue), false);
});

test("presentation updates whitelist only known IDs and usable non-answer clues", () => {
  const definitions = [{ id: "one", truth: "Her grandmother taught her clock repair." }];
  assert.deepEqual(safeClueUpdates(definitions, [
    { id: "one", clue: "An old clock catches her attention.", truth: "Replacement truth", minimumTrust: 0 },
    { id: "one", clue: "A second clue must not duplicate the same ID." },
    { id: "other", clue: "An unrelated character's clue must stay separate." },
  ]), [{ id: "one", clue: "An old clock catches her attention." }]);
  assert.deepEqual(safeClueUpdates(definitions, [{ id: "one", clue: "Her grandmother taught her clock repair." }]), []);
});
