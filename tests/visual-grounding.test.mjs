import test from "node:test";
import assert from "node:assert/strict";
import { assessVisualGrounding, groundVisualProfile } from "../server/visual-grounding.mjs";
import { enrichCharacterCatalog, searchCharacterCatalog, mergeCatalogResults, parseDanbooruCharacter } from "../server/character-catalog.mjs";
import { buildImagePrompt } from "../server/identity.mjs";

test("an empty name-order tag and unrelated surname cannot hide a populated reversed-name reference", async t => {
  const patterns = [];
  t.mock.method(globalThis, "fetch", async input => {
    const url = new URL(String(input));
    if (url.hostname === "danbooru.donmai.us") {
      if (url.pathname === "/tags.json") {
        const pattern = url.searchParams.get("search[name_matches]"); patterns.push(pattern);
        return Response.json(pattern === "*mori_ada*" ? [{ id: 2, name: "mori_ada", category: 4, post_count: 80 }]
          : [{ id: 1, name: "ada_mori", category: 4, post_count: 0 }, { id: 3, name: "nadalia_mori", category: 4, post_count: 900 }]);
      }
      if (url.pathname === "/wiki_pages.json") return Response.json([{ title: "mori_ada", body: "A female character from [[Synthetic Series]]. She has [[red_hair]], [[brown_eyes]] and a [[wolf_cut]]." }]);
      if (url.pathname === "/posts.json") return Response.json([]);
    }
    if (url.hostname === "graphql.anilist.co") return Response.json({ data: { Page: { characters: [{ id: 10, name: { full: "Ada Mori" }, favourites: 9000, media: { nodes: [{ title: { english: "Synthetic Series" } }] } }] } } });
    if (url.hostname === "www.wikidata.org") return Response.json({ search: [] });
    return Response.json({ total: 0, results: [] });
  });
  const config = { animadexUrl: "https://catalogue-test.invalid" };
  const results = await searchCharacterCatalog(config, "Ada Mori");
  const candidate = results.results.find(item => item.name === "Ada Mori");
  assert.ok(patterns.includes("*mori_ada*"));
  assert.equal(candidate.sourceProvider, "anilist");
  assert.equal(candidate.imageIdentity.trigger.split(",")[0], "mori_ada");
  assert.equal(candidate.trigger.split(",")[0], "mori_ada");
  assert.ok(candidate.tags.includes("red hair"));
  assert.ok(candidate.tags.includes("brown eyes"));
  assert.ok(candidate.tags.includes("wolf cut"));
  assert.equal(results.results.some(item => item.name.includes("Nadalia")), false);
  const enriched = await enrichCharacterCatalog(config, { id: "existing-chat", name: "Ada Mori", series: "Synthetic Series", trigger: "ada_mori", tags: ["1girl"] });
  assert.equal(enriched.id, "existing-chat");
  assert.equal(enriched.imageIdentity.trigger.split(",")[0], "mori_ada");
});

test("image identity never crosses same-name characters from different franchises", () => {
  const first = parseDanbooruCharacter({ id: 1, name: "ada_(first)", category: 4, post_count: 10 }, { body: "A character from [[First Series]]." });
  const results = mergeCatalogResults([[first], [{ id: "other", name: "Ada", series: "Other Series", sourceProvider: "anilist", tags: [] }]], "Ada");
  assert.equal(results.length, 2);
  assert.equal(results.find(item => item.series === "Other Series").imageIdentity, undefined);
});

test("generic subjects, moods and hair length remain limited without invented colors", () => {
  const original = { visual: { identity: ["1girl", "long hair", "determined expression"], signature: [] } };
  const next = groundVisualProfile(original, { tags: ["1girl"] });
  assert.deepEqual(next.visual.identity, ["1girl", "long hair"]);
  assert.equal(next.visual.grounding.status, "limited");
  assert.deepEqual(original.visual.identity, ["1girl", "long hair", "determined expression"]);
});

test("supported colors fill gaps while preserving compound identity details and manual overrides", () => {
  const overrides = { identity: ["silver hair"], signature: [], exceptions: [], updatedAt: "test" };
  const profile = { visual: { identity: ["1girl", "long blue hair and freckles"], signature: [], userOverrides: overrides } };
  const next = groundVisualProfile(profile, { sourceProvider: "danbooru", tags: ["red hair", "brown eyes"] });
  assert.ok(next.visual.identity.includes("long red hair and freckles"));
  assert.ok(next.visual.identity.includes("brown eyes"));
  assert.equal(next.visual.grounding.status, "supported");
  assert.deepEqual(next.visual.userOverrides, overrides);
});

test("conflicting colors and unverified image-provider traits do not force a guessed appearance", () => {
  const profile = { visual: { identity: ["1girl", "green eyes"], signature: [] } };
  const conflicting = groundVisualProfile(profile, { sourceProvider: "danbooru", tags: ["red hair", "blue hair", "blue eyes"] }, { facts: [{ category: "appearance", scope: "baseline", sourceId: "wiki", quote: "She has green eyes." }] });
  assert.ok(conflicting.visual.identity.includes("green eyes"));
  assert.equal(conflicting.visual.identity.some(item => /hair/.test(item)), false);
  const unverified = groundVisualProfile(profile, { sourceProvider: "animadex", tags: ["red hair", "brown eyes"] });
  assert.equal(unverified.visual.identity.includes("red hair"), false);
});

test("non-human reference features do not require human hair or eye colors", () => {
  const profile = { visual: { identity: ["no humans", "horns", "scales"], signature: [] } };
  const dossier = { facts: [{ category: "appearance", scope: "baseline", sourceId: "wiki", quote: "The creature has horns and scales." }] };
  assert.equal(assessVisualGrounding(profile, {}, dossier).status, "supported");
});

test("image prompts use the verified profile trigger even when an existing chat retains its old catalogue ID", () => {
  const profile = { age: 25, imageIdentity: { trigger: "mori_ada, synthetic_series", sourceUrl: "https://example.test/character", postCount: 80 }, visual: { identity: ["1girl", "red hair", "brown eyes"], signature: [], defaultWardrobe: "coat" } };
  const prompt = buildImagePrompt(profile, { id: "existing-chat", name: "Ada Mori", trigger: "ada_mori" }, { location: "studio", environment: "gray background", outfit: "coat" }, "head and shoulders portrait");
  assert.match(prompt, /mori_ada/);
  assert.doesNotMatch(prompt, /(?:^|, )ada_mori(?:,|$)/);
});
