import test from "node:test";
import assert from "node:assert/strict";
import { discoveryWikiTarget, linkedDiscoverySubpages, researchCharacterDiscoveries, selectDiscoveryEvidenceText, discoveryEvidencePassages } from "../server/revelation-research.mjs";

test("dedicated discovery excerpts prioritize backstory over long appearance sections", () => {
  const selected = selectDiscoveryEvidenceText(`Lead.\n== Appearance ==\n${"Costume detail. ".repeat(2000)}\n== History ==\nShe learned her craft from her grandmother.\n== Relationships ==\nHer family remains important to her.`);
  assert.match(selected, /learned her craft/);
  assert.match(selected, /family remains/);
});

test("alternate-version sections and their nested history are excluded", () => {
  const selected = selectDiscoveryEvidenceText("Lead.\n== Alternate versions ==\nOther version.\n=== History ===\nA different incarnation's history.\n== Personality ==\nThe selected character is thoughtful.");
  assert.doesNotMatch(selected, /different incarnation|Other version/);
  assert.match(selected, /selected character/);
});

test("large early history cannot crowd out later relationships, interests and treasured possessions", () => {
  const raw = `Lead.\n== History ==\n${"A long formative history. ".repeat(2500)}\n== Relationships ==\n=== A trusted companion ===\nA distinct bond with a trusted companion.\n== Personality ==\nA strong interest in gardening.\n== Trivia ==\nA treasured keepsake with personal meaning.\n== Appearance ==\n${"Costume details. ".repeat(1500)}`;
  const text = selectDiscoveryEvidenceText(raw, 7000);
  assert.ok(text.length <= 7000);
  for (const topic of ["trusted companion", "gardening", "treasured keepsake"]) assert.ok(text.includes(topic));
  assert.doesNotMatch(text, /Costume details/);
});

test("discovery packets bypass profile truncation and preserve coverage on every fresh source", () => {
  const research = { evidence: { passages: [
    { id: "discovery-one", provider: "franchise_wiki", text: `== History ==\n${"History facts. ".repeat(1800)}\n== Relationships ==\nLate relationship evidence.` },
    { id: "discovery-two", provider: "franchise_wiki", text: "== Personality ==\nDistinct personal interests and meaningful possessions." },
    { id: "catalogue", provider: "catalogue", text: "Not reliable new discovery proof." },
  ] } };
  const passages = discoveryEvidencePassages(research, 16000);
  assert.equal(passages.length, 2);
  assert.match(passages[0].text, /Late relationship evidence/);
  assert.match(passages[1].text, /Distinct personal interests/);
  assert.ok(passages.reduce((sum, item) => sum + item.text.length, 0) <= 16000);
  assert.deepEqual(discoveryEvidencePassages(research, 0), []);
});

test("research targets stay on approved public wiki hosts and the same parent character", () => {
  assert.equal(discoveryWikiTarget({ url: "http://localhost/wiki/Character" }), null);
  assert.equal(discoveryWikiTarget({ url: "https://wiki.fandom.com.evil.test/wiki/Character" }), null);
  assert.equal(discoveryWikiTarget({ url: "https://wiki.fandom.com:444/wiki/Character" }), null);
  assert.equal(discoveryWikiTarget({ url: "https://en.wikipedia.org/wiki/Franchise" }, { name: "Test Character" }), null);
  assert.deepEqual(linkedDiscoverySubpages("[[Character/History]] [[Other/History]] [[Character/Gallery]] [[Character/Relationships]]", "Character"), ["Character/History", "Character/Relationships"]);
});

test("fresh character page and targeted search supplement cached creation evidence", async () => {
  const research = { evidence: { passages: [{ id: "cached", provider: "franchise_wiki", url: "https://fixture.fandom.com/wiki/Character", text: "An old appearance-focused creation excerpt." }] } };
  const calls = [];
  const result = await researchCharacterDiscoveries({ name: "Character" }, research, {
    fetchPage: async (_host, title) => { calls.push(title); return { title, pageid: calls.length, wikitext: { "*": `${title}\n== History ==\n${"Grounded character history and relationships. ".repeat(4)}` } }; },
    searchPages: async () => ["Other Character/History", "Character/History", "Character/Relationships", "Character/Gallery"],
  });
  assert.deepEqual(calls, ["Character", "Character/History", "Character/Relationships"]);
  assert.equal(result.discoveryResearch.retrievedPages, 3);
  assert.equal(result.discoveryResearch.attemptedSearches, 1);
  assert.equal(result.evidence.passages.at(-1).id, "cached");
  assert.equal(research.evidence.passages.length, 1);
});

test("missing web pages preserve existing evidence without inventing sources", async () => {
  const research = { evidence: { passages: [{ id: "cached", provider: "franchise_wiki", url: "https://fixture.fandom.com/wiki/Character", text: "Existing sourced detail." }] } };
  const result = await researchCharacterDiscoveries({ name: "Character" }, research, { fetchPage: async () => { throw new Error("Unavailable"); }, searchPages: async () => [] });
  assert.equal(result.discoveryResearch.retrievedPages, 0);
  assert.deepEqual(result.evidence.passages, research.evidence.passages);
});
