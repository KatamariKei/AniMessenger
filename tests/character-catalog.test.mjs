import assert from "node:assert/strict";
import test from "node:test";
import { mergeCatalogResults, parseAniListCharacter, parseDanbooruCharacter, parseWikidataCharacter, summarizeDanbooruEvidence } from "../server/character-catalog.mjs";

test("Danbooru catalogue records become image-ready candidates without borrowing artwork", () => {
  const candidate = parseDanbooruCharacter(
    { id: 178224, name: "lara_croft", category: 4, post_count: 561, is_deprecated: false },
    { body: "Protagonist of the [[Tomb Raider]] franchise. She has [[brown eyes]] and [[long hair|long]] [[brown hair]] in a [[ponytail]]. She usually wears a [[blue tank top]], [[brown shorts]], and [[boots]]." },
  );
  assert.equal(candidate.name, "Lara Croft");
  assert.equal(candidate.series, "Tomb Raider");
  assert.match(candidate.trigger, /lara_croft/);
  assert.deepEqual(candidate.tags, ["1girl", "brown eyes", "long hair", "brown hair", "ponytail", "blue tank top", "brown shorts", "boots"]);
  assert.equal(candidate.thumbUrl, undefined);
  assert.equal(candidate.imageUrl, undefined);
});

test("a partial famous-character query can outrank an obscure exact-name result", () => {
  const results = mergeCatalogResults([[
    { id: "lara", name: "Lara", series: "Sayonara Lara", sourceProvider: "danbooru", tags: [], count: 289 },
    { id: "croft", name: "Lara Croft", series: "Tomb Raider", sourceProvider: "danbooru", tags: [], count: 561 },
    { id: "klara", name: "Klara", series: "Pokémon", sourceProvider: "danbooru", tags: [], count: 1022 },
  ]], "Lara");
  assert.equal(results[0].name, "Lara Croft");
});

test("series extraction favors an explicit series phrase over the first linked character", () => {
  const candidate = parseDanbooruCharacter(
    { id: 3, name: "valac_clara", category: 4, post_count: 100 },
    { body: "Classmate of [[Suzuki Iruma]], from the series [[Mairimashita! Iruma-kun]]." },
  );
  assert.match(candidate.series, /^Mairimashita! Iruma-kun$/i);
});

test("series extraction understands a character described as belonging to a game series", () => {
  const candidate = parseDanbooruCharacter(
    { id: 437685, name: "bayonetta", category: 4, post_count: 1847 },
    { body: "The main character of the action game series [[bayonetta (series)|Bayonetta]]. She uses pistols and magical attacks." },
  );
  assert.equal(candidate.series, "Bayonetta");
  const merged = mergeCatalogResults([[
    candidate,
    { id: "wikidata", name: "Bayonetta", series: "Bayonetta", sourceProvider: "wikidata", tags: [], count: 0 },
    { id: "film", name: "Bayonetta", series: "Bayonetta: Bloody Fate", sourceProvider: "anilist", tags: [], count: 400 },
  ]], "Bayonetta");
  assert.equal(merged.length, 2);
  assert.equal(merged[0].series, "Bayonetta");
  assert.ok(merged[0].sourceRefs.some((ref) => ref.url.includes("danbooru")));
});

test("costume-variant tags do not create long duplicate character names", () => {
  assert.equal(parseDanbooruCharacter({ id: 1, name: "new_jersey_(special_outfit)_(azur_lane)", category: 4 }, null), null);
  assert.equal(parseDanbooruCharacter({ id: 2, name: "characters:samus_aran", category: 4 }, null), null);
});

test("AniList and Wikidata provide normalized source-neutral candidates", () => {
  const ani = parseAniListCharacter({ id: 17, name: { full: "Misty" }, favourites: 10, media: { nodes: [{ title: { english: "Pokémon" } }] } });
  assert.equal(ani.series, "Pokémon");
  const wiki = parseWikidataCharacter({ id: "Q123", label: "Lara Croft", description: "fictional character from the Tomb Raider video game series", concepturi: "https://www.wikidata.org/wiki/Q123" });
  assert.equal(wiki.name, "Lara Croft");
  assert.match(wiki.series, /Tomb Raider/i);
  const cyberpunk = parseWikidataCharacter({ id: "Q456", label: "Judy Alvarez", description: "fictional character in the video game Cyberpunk 2077" });
  assert.equal(cyberpunk.series, "Cyberpunk 2077");
});

test("catalogue merging ranks exact names and preserves visual evidence", () => {
  const results = mergeCatalogResults([[{
    id: "wikidata-1", name: "Lara Croft", series: "Tomb Raider", sourceProvider: "wikidata", tags: [], count: 0,
  }], [{
    id: "danbooru-1", name: "Lara Croft", series: "Tomb Raider", sourceProvider: "danbooru", tags: ["brown hair"], count: 500,
  }, {
    id: "danbooru-2", name: "Klara", series: "Pokémon", sourceProvider: "danbooru", tags: [], count: 900,
  }]], "Lara");
  assert.equal(results[0].name, "Lara Croft");
  assert.deepEqual(results[0].tags, ["brown hair"]);
});

test("catalogue merging recognizes reversed Japanese and Western name order", () => {
  const results = mergeCatalogResults([[
    { id: "anilist", name: "Misato Katsuragi", series: "Neon Genesis Evangelion", sourceProvider: "anilist", tags: [], count: 1000 },
    { id: "danbooru", name: "Katsuragi Misato", series: "Neon Genesis Evangelion", sourceProvider: "danbooru", tags: ["purple hair"], count: 900 },
  ]], "Misato");
  assert.equal(results.length, 1);
  assert.deepEqual(results[0].tags, ["purple hair"]);
});

test("recurring solo-character tags provide stable visual evidence without unsafe or contaminating tags", () => {
  const solo = (tags) => ({ tag_string_character: "maomao_(kusuriya_no_hitorigoto)", tag_string_general: tags });
  const tags = summarizeDanbooruEvidence([
    solo("1girl green_hair blue_eyes long_hair blue_ribbon hair_beads nude nipples"),
    solo("1girl green_hair blue_eyes long_hair blue_ribbon hair_beads hanfu"),
    solo("1girl green_hair blue_eyes long_hair blue_ribbon hair_beads freckles hanfu"),
    solo("1girl green_hair blue_eyes freckles hanfu"),
    solo("1girl black_hair purple_eyes freckles"),
    solo("1girl alternate_hairstyle pink_hair twintails"),
    { tag_string_character: "maomao_(kusuriya_no_hitorigoto) jinshi_(kusuriya_no_hitorigoto)", tag_string_general: "1girl purple_hair pink_eyes" },
  ], "maomao_(kusuriya_no_hitorigoto)");
  assert.deepEqual(tags.slice(0, 5), ["1girl", "green hair", "blue eyes", "long hair", "blue ribbon"]);
  assert.ok(tags.includes("hair beads"));
  assert.ok(tags.includes("hanfu"));
  assert.ok(!tags.includes("nude"));
  assert.ok(!tags.includes("purple hair"));
  assert.ok(!tags.includes("pink hair"));
  assert.ok(!tags.includes("twintails"));
});

test("English and romanized series aliases merge biography and visual evidence", () => {
  const results = mergeCatalogResults([[
    { id: "danbooru", name: "Maomao", series: "Kusuriya No Hitorigoto", sourceProvider: "danbooru", tags: ["green hair", "blue eyes"], count: 2000 },
    { id: "anilist", name: "Maomao", series: "The Apothecary Diaries", seriesAliases: ["The Apothecary Diaries", "Kusuriya no Hitorigoto", "薬屋のひとりごと 第2期"], sourceProvider: "anilist", tags: [], count: 22000 },
    { id: "other", name: "Maomao", series: "Unrelated Series", seriesAliases: ["Unrelated Series", "超智能足球2 世界大赛篇"], sourceProvider: "anilist", tags: ["red hair"], count: 10 },
  ]], "Maomao");
  assert.equal(results.length, 2);
  assert.equal(results[0].series, "The Apothecary Diaries");
  assert.deepEqual(results[0].tags, ["green hair", "blue eyes"]);
});

test("an unknown-series same-name record does not collapse unrelated characters", () => {
  const results = mergeCatalogResults([[
    { id: "unknown", name: "Maomao", series: "Series to confirm", sourceProvider: "danbooru", tags: [], count: 1 },
    { id: "apothecary", name: "Maomao", series: "The Apothecary Diaries", sourceProvider: "anilist", tags: [], count: 100 },
    { id: "football", name: "Maomao", series: "Chao Zhineng Zuqiu 2", sourceProvider: "anilist", tags: [], count: 0 },
  ]], "Maomao");
  assert.equal(results.length, 3);
});

test("an unknown visual record merges when one and only one series identity is available", () => {
  const results = mergeCatalogResults([[
    { id: "visual", name: "Triss Merigold", series: "Series to confirm", sourceProvider: "danbooru", tags: ["red hair", "green eyes"], count: 500 },
    { id: "canon", name: "Triss Merigold", series: "Witcher", sourceProvider: "wikidata", tags: [], count: 0 },
  ]], "Triss Merigold");
  assert.equal(results.length, 1);
  assert.equal(results[0].series, "Witcher");
  assert.deepEqual(results[0].tags, ["red hair", "green eyes"]);
});

test("accented and plain spellings of the same character name merge", () => {
  const results = mergeCatalogResults([[
    { id: "visual", name: "Judy Alvarez", series: "Series to confirm", sourceProvider: "danbooru", tags: ["multicolored hair"], count: 500 },
    { id: "canon", name: "Judy Álvarez", series: "Cyberpunk 2077", sourceProvider: "wikidata", tags: [], count: 0 },
  ]], "Judy Alvarez");
  assert.equal(results.length, 1);
  assert.equal(results[0].series, "Cyberpunk 2077");
});

test("plain character searches hide official costume variants when a base result exists", () => {
  const base = parseDanbooruCharacter(
    { id: 1, name: "chun-li_(street_fighter)", category: 4, post_count: 5000 },
    { body: "A character from [[Street Fighter]]." },
  );
  const variant = parseDanbooruCharacter(
    { id: 2, name: "chun-li_(battle_outfit)", category: 4, post_count: 400 },
    { body: "An official alternate costume for [[Chun-Li]] in Street Fighter V." },
  );
  const attireVariant = parseDanbooruCharacter(
    { id: 3, name: "princess_peach_(super_rush)", category: 4, post_count: 20 },
    { body: "[[Princess Peach]] wearing her attire from Mario Golf. This outfit consists of a golf polo and skirt." },
  );
  assert.equal(mergeCatalogResults([[base, variant]], "Chun Li").length, 1);
  assert.equal(mergeCatalogResults([[base, variant]], "Chun Li Battle Outfit").length, 2);
  assert.equal(attireVariant.isVariant, true);
});

test("crowd-sourced post evidence does not infer breast size", () => {
  const solo = (tags) => ({ tag_string_character: "princess_peach", tag_string_general: tags });
  const tags = summarizeDanbooruEvidence([
    solo("1girl blonde_hair blue_eyes large_breasts dress"),
    solo("1girl blonde_hair blue_eyes large_breasts dress"),
    solo("1girl blonde_hair blue_eyes large_breasts dress"),
  ], "princess_peach");
  assert.ok(!tags.includes("large breasts"));
  assert.ok(tags.includes("blonde hair"));
});

test("strong recurring evidence supersedes conflicting wiki color variants", () => {
  const candidate = parseDanbooruCharacter(
    { id: 1, name: "maomao_(kusuriya_no_hitorigoto)", category: 4, post_count: 100 },
    { body: "She has [[black eyes]] or [[purple eyes]] depending on the edition." },
    ["1girl", "green hair", "blue eyes"],
  );
  assert.ok(candidate.tags.includes("green hair"));
  assert.ok(candidate.tags.includes("blue eyes"));
  assert.ok(!candidate.tags.includes("black eyes"));
  assert.ok(!candidate.tags.includes("purple eyes"));
});
