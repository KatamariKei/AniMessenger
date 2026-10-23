import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import { stripWikiReferences } from "../server/wiki-text.mjs";
import { researchCharacter } from "../server/research.mjs";
import { selectDiscoveryEvidenceText } from "../server/revelation-research.mjs";

const raw = '==Profile==\nShe is a guardian.<ref name="role" />\n===Appearance===\nShe wears an eye cover.<ref name="cover">A citation.</ref>\nIn her casual attire, she wears glasses.<ref name="reuse"/>\n===Personality===\nShe is quiet and thoughtful.<ref>Another citation.</ref>';

test("self-closing wiki citations cannot consume later character descriptions", () => {
  const cleaned = stripWikiReferences(raw);
  assert.match(cleaned, /She wears an eye cover/);
  assert.match(cleaned, /In her casual attire, she wears glasses/);
  assert.match(cleaned, /quiet and thoughtful/);
  assert.doesNotMatch(cleaned, /<ref|A citation|Another citation/);
  assert.equal(stripWikiReferences('Before<REF name="x" / >After'), 'BeforeAfter');
});

test("discovery excerpts preserve facts after reusable references", () => {
  const selected = selectDiscoveryEvidenceText(raw);
  assert.match(selected, /quiet and thoughtful/);
});

test("profile research preserves appearance and personality after self-closing references", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => ({ ok: true, json: async () => String(url).includes('typemoon.fandom.com')
    ? { parse: { title: 'Medusa (Rider)', pageid: 1, wikitext: { '*': raw } } }
    : String(url).includes('wikipedia') ? { query: { pages: {} } } : { data: { Character: null } } });
  try {
    const result = await researchCharacter({ name: 'Medusa (Rider) (Fate)', series: 'Fate' });
    const text = result.evidence.passages[0].text;
    assert.match(text, /eye cover/);
    assert.match(text, /casual attire/);
    assert.match(text, /quiet and thoughtful/);
  } finally { globalThis.fetch = originalFetch; }
});

test("profile instructions keep casual accessories separate from selected-form presentation", async () => {
  const source = await fs.readFile(new URL('../server/ollama.mjs', import.meta.url), 'utf8');
  assert.match(source, /SELECTED PRESENTATION RULE/);
  assert.match(source, /casual attire belongs with that attire in wardrobePreferences/);
  assert.match(source, /strapless garments and detached sleeves/);
});
