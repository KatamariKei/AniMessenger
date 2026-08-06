import assert from "node:assert/strict";
import test from "node:test";
import { researchCharacter } from "../server/research.mjs";

function response(payload) {
  return { ok: true, json: async () => payload };
}

test("rejects a same-name AniList character from the wrong series", async () => {
  const originalFetch = globalThis.fetch;
  let call = 0;
  globalThis.fetch = async () => {
    call += 1;
    if (call === 1) return response({ query: { pages: {} } });
    return response({
      data: {
        Character: {
          id: 999,
          name: { full: "Kaine Tully", native: "", alternative: [] },
          description: "An unrelated character.",
          media: { nodes: [{ title: { english: "Unrelated Series" }, type: "ANIME" }] },
        },
      },
    });
  };
  try {
    const research = await researchCharacter({ name: "Kaine (Nier)", series: "Nier", sourceUrl: "" }, true);
    assert.deepEqual(research.sources, []);
    assert.deepEqual(research.notes, []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("accepts an AniList character only when the associated series also matches", async () => {
  const originalFetch = globalThis.fetch;
  let call = 0;
  globalThis.fetch = async () => {
    call += 1;
    if (call === 1) return response({ query: { pages: {} } });
    return response({
      data: {
        Character: {
          id: 123,
          name: { full: "Kainé", native: "", alternative: ["Kaine"] },
          description: "A fierce and capable warrior.",
          gender: "Female",
          age: "adult",
          media: { nodes: [{ title: { english: "Nier" }, type: "GAME" }] },
        },
      },
    });
  };
  try {
    const research = await researchCharacter({ name: "Kaine (Nier)", series: "Nier", sourceUrl: "" }, true);
    assert.equal(research.sources[0].url, "https://anilist.co/character/123");
    assert.match(research.notes[0], /fierce and capable warrior/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
