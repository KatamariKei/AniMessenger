import assert from "node:assert/strict";
import test from "node:test";
import { checkCharacterCatalog, mergeCatalogResults, parseAniListCharacter, parseDanbooruCharacter, parseWikidataCharacter, searchCharacterCatalog, summarizeDanbooruEvidence } from "../server/character-catalog.mjs";

test("catalogue health checks all search providers with an identifying user agent", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  const hosts = new Set();
  const headers = [];
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(String(input));
    hosts.add(url.hostname);
    headers.push(options.headers || {});
    if (url.hostname === "graphql.anilist.co") return new Response(JSON.stringify({ data: { Page: { characters: [] } } }), { status: 200 });
    return new Response(JSON.stringify(url.hostname === "www.wikidata.org" ? { query: {} } : []), { status: 200 });
  };
  try {
    assert.equal(await checkCharacterCatalog({ animadexUrl: "https://animadex.net" }), true);
    assert.deepEqual(hosts, new Set(["danbooru.donmai.us", "graphql.anilist.co", "www.wikidata.org", "animadex.net"]));
    assert.ok(headers.some((value) => String(value["user-agent"] || "").includes("AniMessenger/0.5")));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("a temporary all-source failure is not retained in the catalogue cache", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  let available = false;
  globalThis.fetch = async (input) => {
    if (!available) throw new Error("temporary provider outage");
    const url = new URL(String(input));
    if (url.hostname === "www.wikidata.org") {
      return new Response(JSON.stringify({ search: [{ id: "Q-test", label: "Resilient Cache Hero", description: "fictional character from the Cache Quest video game series" }] }), { status: 200 });
    }
    if (url.hostname === "graphql.anilist.co") return new Response(JSON.stringify({ data: { Page: { characters: [] } } }), { status: 200 });
    return new Response("[]", { status: 200 });
  };
  try {
    const config = { animadexUrl: "https://animadex.net" };
    const failed = await searchCharacterCatalog(config, "Resilient Cache Hero");
    assert.equal(failed.demo, true);
    available = true;
    const recovered = await searchCharacterCatalog(config, "Resilient Cache Hero");
    assert.equal(recovered.results[0]?.name, "Resilient Cache Hero");
    assert.equal(recovered.source, "independent");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

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

test("linked canon work outranks a Danbooru disambiguation label", () => {
  const candidate = parseDanbooruCharacter(
    { id: 2170472, name: "catherine_(atlus_character)", category: 4, post_count: 249 },
    { body: "Namesake character of the [[catherine (game)|Catherine video game]], she attempts to seduce [[Vincent Brooks]]." },
  );
  assert.equal(candidate.name, "Catherine");
  assert.equal(candidate.series, "Catherine");
  assert.match(candidate.trigger, /catherine_\(atlus_character\)/);
});

test("AnimaDex participates in normal search and merges with independent evidence", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  const hosts = new Set();
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    hosts.add(url.hostname);
    if (url.hostname === "danbooru.donmai.us" && url.pathname === "/tags.json") {
      return new Response(JSON.stringify([{ id: 2170472, name: "catherine_(atlus_character)", category: 4, post_count: 249 }]), { status: 200 });
    }
    if (url.hostname === "danbooru.donmai.us" && url.pathname === "/wiki_pages.json") {
      return new Response(JSON.stringify([{ body: "Namesake character of the [[catherine (game)|Catherine video game]]." }]), { status: 200 });
    }
    if (url.hostname === "danbooru.donmai.us") return new Response("[]", { status: 200 });
    if (url.hostname === "graphql.anilist.co") return new Response(JSON.stringify({ data: { Page: { characters: [] } } }), { status: 200 });
    if (url.hostname === "www.wikidata.org") return new Response(JSON.stringify({ search: [] }), { status: 200 });
    return new Response(JSON.stringify({ total: 1, results: [{ slug: "catherine", name: "Catherine", copyright_name: "Catherine (Game)", count: 208, url: "https://animadex.net/characters/catherine" }] }), { status: 200 });
  };
  try {
    const result = await searchCharacterCatalog({ animadexUrl: "https://animadex.net" }, "Catherine");
    assert.ok(hosts.has("animadex.net"));
    assert.equal(result.source, "combined");
    assert.equal(result.results.length, 1);
    assert.equal(result.results[0].name, "Catherine");
    assert.equal(result.results[0].series, "Catherine");
    assert.ok(result.results[0].sourceRefs.some((ref) => ref.url.includes("animadex.net")));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("catalogue search tries reversed character-name order for verified visual evidence", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  const patterns = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.hostname === "danbooru.donmai.us" && url.pathname === "/tags.json") {
      const pattern = url.searchParams.get("search[name_matches]");
      patterns.push(pattern);
      return new Response(JSON.stringify(pattern === "*yamada_elf*"
        ? [{ id: 121473, name: "yamada_elf", category: 4, post_count: 615 }]
        : []), { status: 200 });
    }
    if (url.hostname === "danbooru.donmai.us" && url.pathname === "/wiki_pages.json") {
      return new Response(JSON.stringify([{ body: "A character in the [[Eromanga Sensei]] series." }]), { status: 200 });
    }
    if (url.hostname === "danbooru.donmai.us" && url.pathname === "/posts.json") {
      const post = { tag_string_character: "yamada_elf", tag_string_general: "1girl blonde_hair blue_eyes long_hair" };
      return new Response(JSON.stringify(Array.from({ length: 5 }, () => post)), { status: 200 });
    }
    if (url.hostname === "graphql.anilist.co") return new Response(JSON.stringify({ data: { Page: { characters: [] } } }), { status: 200 });
    if (url.hostname === "www.wikidata.org") return new Response(JSON.stringify({ search: [] }), { status: 200 });
    return new Response(JSON.stringify({ total: 0, results: [] }), { status: 200 });
  };
  try {
    const result = await searchCharacterCatalog({ animadexUrl: "https://animadex.net" }, "Elf Yamada");
    assert.ok(patterns.includes("*yamada_elf*"));
    assert.ok(result.results[0].tags.includes("blonde hair"));
    assert.ok(result.results[0].tags.includes("blue eyes"));
  } finally { globalThis.fetch = originalFetch; }
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

test("a merged independent result inherits its optional AnimaDex search thumbnail", () => {
  const results = mergeCatalogResults([[
    { id: "danbooru", name: "Catherine", series: "Catherine", sourceProvider: "danbooru", tags: ["blonde hair"], count: 249 },
    { id: "animadex", name: "Catherine", series: "Catherine", sourceProvider: "animadex", tags: [], count: 208, thumbUrl: "https://blobs.animadex.net/Outputs/thumbs/catherine.webp" },
  ]], "Catherine");
  assert.equal(results.length, 1);
  assert.equal(results[0].sourceProvider, "danbooru");
  assert.equal(results[0].thumbUrl, "https://blobs.animadex.net/Outputs/thumbs/catherine.webp");
  assert.deepEqual(results[0].tags, ["blonde hair"]);
});

test("a source-qualified alias merges into the stronger matching-series character", () => {
  const results = mergeCatalogResults([[
    { id: "danbooru", name: "Alice", series: "Goddess Of Victory: Nikke", sourceProvider: "danbooru", tags: ["pink eyes"], catalogNotes: ["Detailed canon guide"], count: 1195 },
    { id: "animadex", name: "Alice (Nikke)", series: "Goddess Of Victory: Nikke", sourceProvider: "animadex", tags: ["pink bodysuit"], count: 663, thumbUrl: "https://blobs.animadex.net/alice.webp" },
  ]], "Alice");
  assert.equal(results.length, 1);
  assert.equal(results[0].name, "Alice");
  assert.equal(results[0].thumbUrl, "https://blobs.animadex.net/alice.webp");
  assert.deepEqual(results[0].catalogNotes, ["Detailed canon guide"]);
  assert.ok(results[0].tags.includes("pink eyes"));
  assert.ok(results[0].tags.includes("pink bodysuit"));
});

test("AnimaDex supplements thumbnails and clothing without injecting unsupported anatomy", () => {
  const results = mergeCatalogResults([[
    { id: "danbooru", name: "Triss Merigold", series: "The Witcher", sourceProvider: "danbooru", tags: ["red hair", "green eyes"], count: 500 },
    { id: "animadex", name: "Triss Merigold", series: "The Witcher", sourceProvider: "animadex", tags: ["mole under mouth", "large breasts", "green dress"], count: 400, thumbUrl: "https://example.com/triss.webp" },
  ]], "Triss");
  assert.equal(results[0].thumbUrl, "https://example.com/triss.webp");
  assert.ok(results[0].tags.includes("green dress"));
  assert.ok(!results[0].tags.includes("mole under mouth"));
  assert.ok(!results[0].tags.includes("large breasts"));
});

test("an outfit qualifier is not mistaken for a series alias", () => {
  const results = mergeCatalogResults([[
    { id: "base", name: "Alice", series: "Goddess Of Victory: Nikke", sourceProvider: "danbooru", tags: [], count: 1195 },
    { id: "variant", name: "Alice (Wonderland Bunny)", series: "Goddess Of Victory: Nikke", sourceProvider: "animadex", tags: ["bunny outfit"], count: 300, thumbUrl: "https://blobs.animadex.net/alice-bunny.webp" },
  ]], "Alice");
  assert.equal(results.length, 2);
});

test("Rebecca merges across a Danbooru collision suffix and enclosing Cyberpunk franchise", () => {
  const visual = parseDanbooruCharacter(
    { id: 1846970, name: "rebecca_(cyberpunk)", category: 4, post_count: 2524 },
    { body: "A character from the [[Cyberpunk: Edgerunners 1]] anime, set in the [[Cyberpunk_(series)|]] universe. Rebecca is a petite cyborg." },
    ["1girl", "green hair", "twintails"],
  );
  const results = mergeCatalogResults([[
    visual,
    { id: "anilist", name: "Rebecca", series: "Cyberpunk: Edgerunners", sourceProvider: "anilist", tags: [], catalogNotes: ["Canonical personality guide"], count: 5385 },
    { id: "animadex", name: "Rebecca (Cyberpunk)", series: "Cyberpunk", sourceProvider: "animadex", tags: ["pink jacket"], count: 1709, thumbUrl: "https://blobs.animadex.net/rebecca.webp" },
  ]], "Rebecca");
  assert.equal(results.length, 1);
  assert.equal(results[0].name, "Rebecca");
  assert.equal(results[0].series, "Cyberpunk: Edgerunners");
  assert.equal(results[0].thumbUrl, "https://blobs.animadex.net/rebecca.webp");
  assert.ok(results[0].catalogNotes.includes("Canonical personality guide"));
  assert.ok(results[0].tags.includes("green hair"));
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

test("a leading The does not split otherwise identical character series", () => {
  const results = mergeCatalogResults([[
    { id: "primary", name: "Maomao", series: "The Apothecary Diaries", sourceProvider: "anilist", tags: ["green hair"], count: 2000 },
    { id: "wikidata", name: "Maomao", series: "Apothecary Diaries", sourceProvider: "wikidata", tags: [], catalogNotes: ["Canonical Wikidata description"], count: 0 },
  ]], "Maomao");
  assert.equal(results.length, 1);
  assert.equal(results[0].series, "The Apothecary Diaries");
  assert.ok(results[0].catalogNotes.includes("Canonical Wikidata description"));
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
