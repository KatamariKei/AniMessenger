import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import ts from "typescript";
import { parseWikidataCharacter, parseDanbooruCharacter, mergeCatalogResults, searchCharacterCatalog, enrichCharacterCatalog } from "../server/character-catalog.mjs";

const source = ts.transpileModule(await fs.readFile(new URL("../src/catalog-display.ts", import.meta.url), "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { catalogSourceLabel } = await import("data:text/javascript;base64," + Buffer.from(source).toString("base64"));

test("fan-created franchise descriptions identify the series without claiming official personality", () => {
  const item = parseWikidataCharacter({ id: "Q58207644", label: "Boosette", description: "fan-made Mario franchise character" });
  assert.equal(item.series, "Mario");
  assert.equal(item.catalogDescription, "fan-made Mario franchise character");
  const result = mergeCatalogResults([[{ id: "danbooru-alias", name: "Boosette", series: "Series to confirm", sourceProvider: "danbooru", tags: [], sourceRefs: [{ url: "https://danbooru.donmai.us/wiki_pages/boosette" }] }], [item]], "Boosette");
  assert.equal(result.length, 1);
  assert.equal(result[0].series, "Mario");
  assert.equal(result[0].catalogDescription, item.catalogDescription);
  assert.equal(catalogSourceLabel(result[0]), "Danbooru · Wikidata");
});

test("ambiguous same-name unknown records and conflicting franchises remain separate", () => {
  for (const series of [["Series to confirm", "Series to confirm"], ["Moon Kingdom", "Sun Kingdom"]]) {
    const result = mergeCatalogResults([[{ id: "a", name: "Mira", series: series[0], sourceProvider: "danbooru", tags: [] }, { id: "b", name: "Mira", series: series[1], sourceProvider: "wikidata", tags: [] }]], "Mira");
    assert.equal(result.length, 2);
  }
});

test("a transformation of another character is not assigned that character as its series", () => {
  const item = parseDanbooruCharacter({ id: 1, name: "princess_king_boo", category: 4 }, { body: "A transformation of [[King Boo]] using the [[Super Crown]], similar to [[Bowsette]]. Stereotypically a variant of [[Princess Peach]]. Frequently in [[ghost pose]]." });
  assert.equal(item.series, "Series to confirm");
  const wiki = parseWikidataCharacter({ id: "Q58207644", label: item.name, description: "fan-made Mario franchise character" });
  assert.equal(mergeCatalogResults([[item, wiki]], item.name).length, 1);
});

test("source labels preserve combined providers and ignore malformed or deceptive URLs", () => {
  assert.equal(catalogSourceLabel({ sourceProvider: "wikidata", sourceRefs: [{ url: "https://danbooru.donmai.us/wiki_pages/mira" }, { url: "https://www.wikidata.org/wiki/Q1" }] }), "Wikidata · Danbooru");
  assert.equal(catalogSourceLabel({ sourceRefs: [{ url: "not a URL" }, { url: "https://wikidata.org.evil.example/mira" }] }), "Source unconfirmed");
});

function mockCatalogue(t, name, { failTarget = false, category = 4, prose = false } = {}) {
  const tag = name.toLowerCase().replaceAll(" ", "_"), target = "canonical_" + tag;
  const counts = { targetTags: 0, targetPages: 0 };
  t.mock.method(globalThis, "fetch", async input => {
    const url = new URL(String(input));
    if (url.hostname === "danbooru.donmai.us") {
      if (url.pathname === "/tags.json") {
        if (url.searchParams.get("search[name_matches]") === target) { counts.targetTags++; return Response.json([{ id: 42, name: target, category, post_count: 500 }]); }
        return Response.json([{ id: 41, name: tag, category: 4, post_count: 0 }]);
      }
      if (url.pathname === "/posts.json") return Response.json([]);
      if (url.pathname === "/wiki_pages.json") {
        if (url.searchParams.get("search[title]") === target) {
          counts.targetPages++;
          if (failTarget) return new Response("Unavailable", { status: 503 });
          return Response.json([{ title: target, body: "A character from [[Moonlight]]. She is a fan-created character with a documented visual identity. She wears [[blue dress]] and has [[silver hair]]." }]);
        }
        return Response.json([{ title: tag, body: `See [[${target}]].${prose ? " This other character is related." : ""}` }]);
      }
    }
    if (url.hostname === "www.wikidata.org") return Response.json({ search: [{ id: "Q42", label: name, description: "fan-created Moonlight franchise character" }] });
    if (url.hostname === "graphql.anilist.co") return Response.json({ data: { Page: { characters: [] } } });
    return Response.json({ results: [], total: 0 });
  });
  return counts;
}

test("search follows one exact character alias, merges references and enriches an older selected identity", async t => {
  const counts = mockCatalogue(t, "Alias Scholar");
  const config = { animadexUrl: "https://catalogue.invalid" };
  const results = await searchCharacterCatalog(config, "Alias Scholar");
  assert.equal(results.results.length, 1);
  const item = results.results[0];
  assert.equal(item.id, "danbooru-41");
  assert.equal(item.name, "Alias Scholar");
  assert.equal(item.series, "Moonlight");
  assert.equal(item.count, 500);
  assert.equal(item.imageIdentity.trigger.split(",")[0], "canonical_alias_scholar");
  assert.ok(item.catalogNotes.some(note => note.includes("documented visual identity")));
  assert.equal(item.sourceRefs.length, 3);
  assert.deepEqual(counts, { targetTags: 1, targetPages: 1 });
  const selected = { id: "wikidata-Q42", name: "Alias Scholar", series: "Series to confirm", sourceProvider: "wikidata", sourceUrl: "https://www.wikidata.org/wiki/Q42", tags: [] };
  const enriched = await enrichCharacterCatalog(config, selected);
  assert.equal(enriched.id, selected.id);
  assert.equal(enriched.series, "Moonlight");
  assert.equal(enriched.sourceRefs.length, 3);
  assert.equal(enriched.catalogDescription, "fan-created Moonlight franchise character");
  // Existing selected continuities are never reassigned just because a URL matches.
  const other = { ...selected, series: "Another World" };
  assert.deepEqual(await enrichCharacterCatalog(config, other), other);
});

for (const options of [{ failTarget: true }, { category: 0 }, { prose: true }]) {
  test(`alias failure or non-alias material preserves the selected result: ${JSON.stringify(options)}`, async t => {
    const name = options.failTarget ? "Missing Scholar" : options.category === 0 ? "General Scholar" : "Related Scholar";
    const counts = mockCatalogue(t, name, options);
    const result = await searchCharacterCatalog({ animadexUrl: "https://catalogue.invalid" }, name);
    assert.equal(result.results.length, 1);
    assert.equal(result.results[0].name, name);
    assert.equal(result.results[0].id, "danbooru-41");
    assert.equal(result.results[0].count, 0);
    assert.equal(result.results[0].imageIdentity, undefined);
    if (options.prose) assert.equal(counts.targetTags, 0);
    if (options.category === 0) assert.equal(counts.targetPages, 0);
  });
}
