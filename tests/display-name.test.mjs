import assert from "node:assert/strict";
import test from "node:test";
import { applyDisplayName, normalizeDisplayName } from "../server/display-name.mjs";

test("a local display name preserves the canonical AnimaDex name", () => {
  const character = applyDisplayName({ id: "hero", name: "Hero (Winter Outfit)" }, "Hero");
  assert.equal(character.name, "Hero (Winter Outfit)");
  assert.equal(character.displayName, "Hero");
});

test("display names are cleaned and bounded", () => {
  assert.equal(normalizeDisplayName("  Makoto   Niijima  ", "Queen"), "Makoto Niijima");
  assert.equal(normalizeDisplayName("x".repeat(100), "Queen").length, 80);
});

test("matching or blank display names fall back to the canonical name", () => {
  assert.equal(normalizeDisplayName("Hero", "Hero"), undefined);
  assert.equal(normalizeDisplayName("   ", "Hero"), undefined);
});
