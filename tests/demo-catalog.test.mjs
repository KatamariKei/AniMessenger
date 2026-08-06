import assert from "node:assert/strict";
import test from "node:test";

import { demoCatalog } from "../server/demo-catalog.mjs";

test("the offline catalogue uses release-safe generated placeholders", () => {
  assert.ok(demoCatalog.length > 0);
  assert.equal(new Set(demoCatalog.map((character) => character.id)).size, demoCatalog.length);
  for (const character of demoCatalog) {
    assert.equal(character.thumbUrl, undefined);
    assert.equal(character.sprite, undefined);
    assert.ok(character.name);
    assert.ok(character.trigger);
  }
});
