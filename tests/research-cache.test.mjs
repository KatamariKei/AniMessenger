import test from "node:test";
import assert from "node:assert/strict";
import { discoveryResearchNeedsRefresh, researchCacheFingerprint, reusableResearchCacheEntry } from "../server/research-cache.mjs";

test("discovery retries refresh failed wiki lookups rather than reusing thin cached research", () => {
  const evidence = { passages: [{ provider: "anilist", text: "Short character summary." }],
    diagnostics: [{ provider: "franchise_wiki", status: "failed" }] };
  assert.equal(discoveryResearchNeedsRefresh({ evidence }), true);
  assert.equal(discoveryResearchNeedsRefresh({ evidence: { ...evidence, diagnostics: [{ provider: "franchise_wiki", status: "no_match" }] } }), true);
  assert.equal(discoveryResearchNeedsRefresh({ evidence: { ...evidence, passages: [...evidence.passages, { provider: "franchise_wiki", text: "Character reference." }] } }), false);
  assert.equal(discoveryResearchNeedsRefresh({ evidence: { ...evidence, diagnostics: [] } }), false);
});

test("cached shared-name characters must match the requested installment", () => {
  const character = { name: "Lucy", series: "Cyberpunk: Edgerunners" };
  const cached = title => ({ evidence: { passages: [{ provider: "franchise_wiki", title,
    text: title === "Sister Lucy" ? "Lucy worked at Holy Angels Church in Night City." : "Lucyna Kushinada, known as just Lucy, works with Maine in Edgerunners." }] } });
  assert.equal(discoveryResearchNeedsRefresh(cached("Sister Lucy"), character), true);
  assert.equal(discoveryResearchNeedsRefresh(cached("Lucyna Kushinada"), character), false);
});

const character = {
  id: "anilist-123",
  name: "Example",
  series: "Example Series",
  trigger: "example_character",
  tags: ["1girl", "blue eyes"],
  catalogNotes: ["A catalogue note."],
};

test("research cache fingerprints the selected character evidence", () => {
  assert.equal(researchCacheFingerprint(character), researchCacheFingerprint(structuredClone(character)));
  assert.notEqual(researchCacheFingerprint(character), researchCacheFingerprint({ ...character, series: "Another Series" }));
  assert.notEqual(researchCacheFingerprint(character), researchCacheFingerprint({ ...character, tags: [...character.tags, "long hair"] }));
});

test("research cache reuses only fresh matching entries with source passages", () => {
  const now = Date.parse("2026-09-29T12:00:00.000Z");
  const entry = {
    version: 3,
    savedAt: "2026-09-28T12:00:00.000Z",
    fingerprint: researchCacheFingerprint(character),
    research: { evidence: { passages: [{ id: "source-1", text: "Grounded evidence." }] } },
  };
  assert.equal(reusableResearchCacheEntry(entry, character, now), true);
  assert.equal(reusableResearchCacheEntry({ ...entry, version: 2 }, character, now), false);
  assert.equal(reusableResearchCacheEntry({ ...entry, savedAt: "2026-09-01T12:00:00.000Z" }, character, now), false);
  assert.equal(reusableResearchCacheEntry({ ...entry, research: { evidence: { passages: [] } } }, character, now), false);
  assert.equal(reusableResearchCacheEntry(entry, { ...character, name: "Different" }, now), false);
});
