import assert from "node:assert/strict";
import test from "node:test";
import { fandomWikiCandidates, researchCharacter, selectBaselineQuoteText, selectFranchiseWikiTitle, selectWikiEvidenceText } from "../server/research.mjs";

function response(payload) {
  return { ok: true, json: async () => payload };
}

test("franchise wiki search resolves capitalization and reordered-name misses", () => {
  assert.equal(selectFranchiseWikiTitle("Yennefer Of Vengerberg", [
    { title: "Geralt of Rivia" },
    { title: "Yennefer of Vengerberg" },
  ]), "Yennefer of Vengerberg");
  assert.equal(selectFranchiseWikiTitle("Okumura Haru", [
    { title: "Haru Okumura" },
    { title: "Haru (disambiguation)" },
  ]), "Haru Okumura");
  assert.equal(selectFranchiseWikiTitle("Female Byleth", [
    { title: "Byleth/Female Supports" },
    { title: "Byleth" },
  ]), "Byleth");
});

test("gender-prefixed Fire Emblem avatars research the character overview, not supports", async () => {
  const originalFetch = globalThis.fetch;
  const wikiPages = [];
  globalThis.fetch = async (url) => {
    const value = String(url);
    if (value.includes("fireemblem.fandom.com")) {
      wikiPages.push(new URL(value).searchParams.get("page"));
      return response({ parse: { pageid: 45, title: "Byleth", wikitext: { "*":
        "Byleth is a professor in Fire Emblem: Three Houses.\n== Appearance ==\nFemale Byleth has dark teal hair and wears a black coat." } } });
    }
    if (value.includes("wikipedia")) return response({ query: { pages: {} } });
    return response({ data: { Character: null } });
  };
  try {
    const result = await researchCharacter({ name: "Female Byleth", series: "Fire Emblem" });
    assert.equal(wikiPages[0], "Byleth");
    const passage = result.evidence.passages.find((item) => item.provider === "franchise_wiki");
    assert.equal(passage?.title, "Byleth");
    assert.match(passage?.text || "", /dark teal hair/);
  } finally { globalThis.fetch = originalFetch; }
});

test("discovers bounded franchise wiki hosts from series names and safe catalogue links", () => {
  assert.deepEqual(fandomWikiCandidates({ name: "Ayane (Doa)", series: "Dead Or Alive" }), [
    { host: "deadoralive.fandom.com", pageName: "" },
  ]);
  assert.deepEqual(fandomWikiCandidates({ name: "Nyotengu", series: "Dead Or Alive 5" }), [
    { host: "deadoralive.fandom.com", pageName: "" },
    { host: "deadoralive5.fandom.com", pageName: "" },
  ]);
  assert.deepEqual(fandomWikiCandidates({ name: "Ranma-chan", series: "Ranma 1/2" }), [
    { host: "ranma.fandom.com", pageName: "" },
    { host: "ranma12.fandom.com", pageName: "" },
    { host: "ranma1.fandom.com", pageName: "" },
  ]);
  assert.deepEqual(fandomWikiCandidates({ name: "Throne Anguis", series: "Octopath Traveler II" }), [
    { host: "octopathtravelerii.fandom.com", pageName: "" },
    { host: "octopathtraveler.fandom.com", pageName: "" },
  ]);
  assert.deepEqual(fandomWikiCandidates({ series: "The Apothecary Diaries", sourceRefs: [
    { url: "https://apothecarydiaries.fandom.com/wiki/Maomao" },
    { url: "http://127.0.0.1/wiki/Maomao" },
  ] }), [
    { host: "apothecarydiaries.fandom.com", pageName: "Maomao" },
    { host: "theapothecarydiaries.fandom.com", pageName: "" },
  ]);
});

test("Ranma-chan researches Ranma Saotome while retaining the female-form selection", async () => {
  const originalFetch = globalThis.fetch;
  const wikiRequests = [];
  globalThis.fetch = async (url, options = {}) => {
    const value = String(url);
    if (value.startsWith("https://ranma.fandom.com/api.php")) {
      const page = new URL(value).searchParams.get("page");
      wikiRequests.push(page);
      assert.equal(page, "Ranma Saotome");
      return response({ parse: { pageid: 56, title: "Ranma Saotome", wikitext: { "*":
        "Ranma Saotome is a martial artist in Ranma 1/2. Cold water transforms Ranma into a girl with red hair; hot water restores his male form." } } });
    }
    if (value.includes("wikipedia")) {
      assert.match(new URL(value).searchParams.get("gsrsearch"), /Ranma Saotome/);
      return response({ query: { pages: {} } });
    }
    const query = JSON.parse(options.body).variables.search;
    assert.equal(query, "Ranma Saotome");
    return response({ data: { Character: null } });
  };
  try {
    const result = await researchCharacter({ name: "Ranma-chan", series: "Ranma 1/2", sourceRefs: [
      { title: "Ranma-chan on AnimaDex", url: "https://danbooru.donmai.us/posts?tags=ranma-chan" },
    ] });
    assert.deepEqual(wikiRequests, ["Ranma Saotome"]);
    assert.match(result.selectedForm, /female physical form/i);
    assert.equal(result.evidence.passages.find((item) => item.provider === "franchise_wiki")?.url,
      "https://ranma.fandom.com/wiki/Ranma_Saotome");
    assert.match(result.evidence.passages.find((item) => item.provider === "franchise_wiki")?.text || "", /Cold water transforms/);
  } finally { globalThis.fetch = originalFetch; }
});

test("catalogue redirect evidence expands short series qualifiers before research", async () => {
  const originalFetch = globalThis.fetch;
  const wikiHosts = [];
  globalThis.fetch = async (url, options = {}) => {
    const value = String(url);
    if (value.includes("zelda.fandom.com")) {
      wikiHosts.push(new URL(value).hostname);
      return response({ parse: { pageid: 81, title: "Princess Zelda", wikitext: { "*":
        "Princess Zelda is the princess of Hyrule in The Legend of Zelda: Breath of the Wild. She is scholarly, determined, and frustrated by her difficulty awakening her sealing power." } } });
    }
    if (value.includes("wikipedia")) {
      assert.match(new URL(value).searchParams.get("gsrsearch"), /breath of the wild/i);
      return response({ query: { pages: {} } });
    }
    const query = JSON.parse(options.body).variables.search;
    assert.equal(query, "Princess Zelda");
    return response({ data: { Character: null } });
  };
  try {
    const result = await researchCharacter({
      name: "Princess Zelda",
      series: "Botw",
      catalogNotes: ["Danbooru character wiki: See {{princess_zelda the_legend_of_zelda:_breath_of_the_wild}}."],
    });
    assert.deepEqual(wikiHosts, ["zelda.fandom.com"]);
    assert.match(result.evidence.passages.find((item) => item.provider === "franchise_wiki")?.text || "", /scholarly, determined/);
  } finally { globalThis.fetch = originalFetch; }
});

test("short alphanumeric designations retain matching wiki and AniList evidence", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    const value = String(url);
    if (value.includes("nier.fandom.com")) return response({ parse: { pageid: 22, title: "YoRHa No.2 Type B", wikitext: { "*":
      "YoRHa No.2 Type B, or just 2B, is a protagonist of NieR:Automata. She is a YoRHa battle android. She is calm and reserved." } } });
    if (value.includes("wikipedia")) return response({ query: { pages: {} } });
    assert.equal(JSON.parse(options.body).variables.search, "2B");
    return response({ data: { Character: { id: 22, name: { full: "2B", native: "", alternative: [] },
      description: "A YoRHa combat android.", media: { nodes: [{ title: { english: "NieR:Automata" }, type: "GAME" }] } } } });
  };
  try {
    const result = await researchCharacter({ name: "2B (Nier:automata)", series: "Nier" });
    assert.equal(result.evidence.passages.find((item) => item.provider === "franchise_wiki")?.title, "YoRHa No.2 Type B");
    assert.equal(result.evidence.passages.find((item) => item.provider === "anilist")?.title, "2B on AniList");
  } finally { globalThis.fetch = originalFetch; }
});

test("short designation search skips a different-installment page for a verified long-title alias", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const value = String(url);
    if (value.includes("nier.fandom.com")) {
      const params = new URL(value).searchParams;
      if (params.get("list") === "search") return response({ query: { search: [
        { title: "2B (Reincarnation)" }, { title: "2B Copy" }, { title: "YoRHa No.2 Type B" },
      ] } });
      const title = params.get("page");
      if (title === "YoRHa No.2 Type B") return response({ parse: { pageid: 23, title, wikitext: { "*":
        "'''YoRHa No.2 Type B''', or just '''2B''', is a protagonist of NieR:Automata. She is a YoRHa soldier." } } });
      return response({ parse: { pageid: 24, title: title === "2B Copy" ? title : "2B (Reincarnation)", wikitext: { "*":
        "This is a separate 2B Copy or Reincarnation variant; it references NieR:Automata." } } });
    }
    if (value.includes("wikipedia")) return response({ query: { pages: {} } });
    return response({ data: { Character: null } });
  };
  try {
    const result = await researchCharacter({ name: "2B (Nier:automata)", series: "Nier" });
    assert.equal(result.evidence.passages.find((item) => item.provider === "franchise_wiki")?.title, "YoRHa No.2 Type B");
  } finally { globalThis.fetch = originalFetch; }
});

test("long wiki histories do not crowd personality and appearance out of the dossier", () => {
  const text = "Ayane is a kunoichi.\n== History ==\n" + "A long chronology. ".repeat(1200)
    + "\n== Character ==\n=== Appearance ===\nShe has lavender hair.\n=== Personality ===\nShe is fierce and loyal.";
  const excerpt = selectWikiEvidenceText(text);
  assert.ok(excerpt.length <= 14000);
  assert.match(excerpt, /She is fierce and loyal/);
  assert.match(excerpt, /She has lavender hair/);
  assert.ok(excerpt.indexOf("Personality") < excerpt.indexOf("History"));
});

test("Azur Lane uses the ship wiki and grounds baseline behavior in default dialogue only", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const value = String(url);
    if (value.includes("blhx.fandom.com") && value.includes("Bremerton%2FQuotes")) return response({ parse: {
      pageid: 204, title: "Bremerton/Quotes", wikitext: { "*":
        "== Default Skin ==\nAcquisition: I'm Bremerton, an Eagle Union heavy cruiser. Tell me about yourself!\nSecretary: If something's bothering you, I'm here to listen.\n== Scorching-Hot Training ==\nIn this tennis outfit, call me coach today." },
    } });
    if (value.includes("blhx.fandom.com")) return response({ parse: {
      pageid: 203, title: "Bremerton", wikitext: { "*": "Bremerton is an Eagle Union heavy cruiser in Azur Lane. Quotes: Bremerton/Quotes." },
    } });
    if (value.includes("wikipedia")) return response({ query: { pages: {} } });
    return response({ data: { Character: null } });
  };
  try {
    const result = await researchCharacter({ name: "Bremerton (Azur Lane)", series: "Azur Lane" });
    const wiki = result.evidence.passages.filter((item) => item.provider === "franchise_wiki");
    assert.equal(wiki.length, 2);
    assert.equal(wiki[0].title, "Bremerton/Quotes");
    assert.match(wiki[0].text, /here to listen/);
    assert.doesNotMatch(wiki[0].text, /call me coach/);
    assert.equal(wiki[1].url, "https://blhx.fandom.com/wiki/Bremerton");
  } finally { globalThis.fetch = originalFetch; }
});

test("Genshin research includes the character profile subpage when available", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const value = String(url);
    if (value.includes("genshin-impact.fandom.com") && value.includes("Ganyu%2FProfile")) return response({ parse: {
      pageid: 410, title: "Ganyu/Profile", wikitext: { "*": "== Personality ==\nGanyu is quiet and reserved but conscientious in her work as a secretary. She can be socially awkward around others." },
    } });
    if (value.includes("genshin-impact.fandom.com")) return response({ parse: {
      pageid: 409, title: "Ganyu", wikitext: { "*": "Ganyu is an adeptus and the secretary of the Liyue Qixing in Genshin Impact." },
    } });
    if (value.includes("wikipedia")) return response({ query: { pages: {} } });
    return response({ data: { Character: null } });
  };
  try {
    const result = await researchCharacter({ name: "Ganyu (Genshin Impact)", series: "Genshin Impact" });
    const wiki = result.evidence.passages.filter((item) => item.provider === "franchise_wiki");
    assert.equal(wiki.length, 2);
    assert.match(wiki[0].text, /quiet and reserved/);
    assert.equal(wiki[0].url, "https://genshin-impact.fandom.com/wiki/Ganyu%2FProfile");
  } finally { globalThis.fetch = originalFetch; }
});

test("Zenless research uses the hyphenated franchise wiki and prioritizes character lore", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const value = String(url);
    if (value.includes("zenless-zone-zero.fandom.com") && value.includes("Nicole+Demara%2FLore")) return response({ parse: {
      pageid: 512, title: "Nicole Demara/Lore", wikitext: { "*": "== History ==\n" + "A long chronology. ".repeat(1000)
        + "\n== Profile ==\nNicole Demara is the founder and current leader of the Cunning Hares odd-job agency. She is cunning and often has trouble managing its finances." },
    } });
    if (value.includes("zenless-zone-zero.fandom.com")) return response({ parse: {
      pageid: 511, title: "Nicole Demara", wikitext: { "*": "Nicole Demara belongs to the Cunning Hares in Zenless Zone Zero." },
    } });
    if (value.includes("wikipedia")) return response({ query: { pages: {} } });
    return response({ data: { Character: null } });
  };
  try {
    const result = await researchCharacter({ name: "Nicole Demara", series: "Zenless Zone Zero" });
    const wiki = result.evidence.passages.filter((item) => item.provider === "franchise_wiki");
    assert.equal(wiki.length, 2);
    assert.match(wiki[0].text, /founder and current leader/);
    assert.ok(wiki[0].text.indexOf("founder and current leader") < wiki[0].text.indexOf("History"));
    assert.equal(wiki[0].url, "https://zenless-zone-zero.fandom.com/wiki/Nicole_Demara%2FLore");
  } finally { globalThis.fetch = originalFetch; }
});

test("skin-specific dialogue is not treated as the character's default behavior", () => {
  assert.equal(selectBaselineQuoteText("== Default Skin ==\nI am a cruiser.\n== Event Skin ==\nI'm the captain now."), "== Default Skin ==\nI am a cruiser.");
});

test("Ayane can use a series-named wiki without a hard-coded route", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const value = String(url);
    if (value.startsWith("https://deadoralive.fandom.com/api.php")) return response({ parse: {
      pageid: 123,
      title: "Ayane",
      wikitext: { "*": "Ayane is a kunoichi of the Mugen Tenshin clan. She has a fierce rivalry with Kasumi, but also shows loyalty to Hayate." },
    } });
    if (value.includes("wikipedia")) return response({ query: { pages: {} } });
    return response({ data: { Character: null } });
  };
  try {
    const result = await researchCharacter({ name: "Ayane (Doa)", series: "Dead Or Alive", catalogNotes: [] });
    const passage = result.evidence.passages.find((item) => item.provider === "franchise_wiki");
    assert.equal(passage?.url, "https://deadoralive.fandom.com/wiki/Ayane");
    assert.match(passage?.text || "", /rivalry with Kasumi/);
  } finally { globalThis.fetch = originalFetch; }
});

test("numbered Dead or Alive entries try the shared series wiki first", async () => {
  const originalFetch = globalThis.fetch;
  const wikiHosts = [];
  globalThis.fetch = async (url) => {
    const value = String(url);
    if (value.includes("fandom.com")) {
      wikiHosts.push(new URL(value).hostname);
      return response({ parse: { pageid: 124, title: "Nyotengu", wikitext: { "*":
        "Nyotengu is a tengu in Dead or Alive 5. She is something of a prankster." } } });
    }
    if (value.includes("wikipedia")) return response({ query: { pages: {} } });
    return response({ data: { Character: null } });
  };
  try {
    const result = await researchCharacter({ name: "Nyotengu", series: "Dead Or Alive 5" });
    assert.equal(wikiHosts[0], "deadoralive.fandom.com");
    assert.equal(result.evidence.passages.find((item) => item.provider === "franchise_wiki")?.title, "Nyotengu");
  } finally { globalThis.fetch = originalFetch; }
});

test("a catalogue link to an unrelated same-name wiki is not accepted", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const value = String(url);
    if (value.includes("unrelated.fandom.com")) return response({ parse: {
      pageid: 321, title: "Ayane", wikitext: { "*": "Ayane is a character from an unrelated fantasy game." },
    } });
    if (value.includes("deadoralive.fandom.com")) return response({ parse: null, query: { search: [] } });
    if (value.includes("wikipedia")) return response({ query: { pages: {} } });
    return response({ data: { Character: null } });
  };
  try {
    const result = await researchCharacter({ name: "Ayane (Doa)", series: "Dead Or Alive", sourceRefs: [
      { url: "https://unrelated.fandom.com/wiki/Ayane" },
    ] });
    assert.equal(result.evidence.passages.some((item) => item.provider === "franchise_wiki"), false);
    assert.ok(result.evidence.diagnostics.find((item) => item.provider === "franchise_wiki").attempts
      .some((item) => item.host === "unrelated.fandom.com" && item.status === "wrong_series"));
  } finally { globalThis.fetch = originalFetch; }
});

test("a numbered sequel can use its shared franchise wiki and accented character title", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const value = String(url);
    if (value.includes("octopathtravelerii.fandom.com")) return { ok: false, status: 404 };
    if (value.includes("octopathtraveler.fandom.com")) return response({ parse: {
      pageid: 88,
      title: "Throné Anguis",
      wikitext: { "*": "Throné Anguis is a thief in Octopath Traveler II who wants to free herself from the Blacksnakes. She is guarded but deeply values the freedom to choose her own life." },
    } });
    if (value.includes("wikipedia")) return response({ query: { pages: {} } });
    return response({ data: { Character: null } });
  };
  try {
    const result = await researchCharacter({ name: "Throne Anguis", series: "Octopath Traveler II" });
    const passage = result.evidence.passages.find((item) => item.provider === "franchise_wiki");
    assert.equal(passage?.title, "Throné Anguis");
    assert.equal(result.evidence.diagnostics.find((item) => item.provider === "franchise_wiki").attempts[0].status, "failed");
  } finally { globalThis.fetch = originalFetch; }
});

test("Tokyo Mirage Sessions characters use the Megami Tensei franchise wiki", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const value = String(url);
    if (value.includes("megamitensei.fandom.com")) return response({
      parse: {
        pageid: 42,
        title: "Tsubasa Oribe",
        wikitext: { "*": "Tsubasa Oribe is an optimistic, hard-working aspiring idol and Mirage Master." },
      },
    });
    if (value.includes("wikipedia")) return response({ query: { pages: {} } });
    return response({ data: { Character: null } });
  };
  try {
    const result = await researchCharacter({ name: "Tsubasa Oribe", series: "Tokyo Mirage Sessions ♯FE" });
    const passage = result.evidence.passages.find((item) => item.provider === "franchise_wiki");
    assert.equal(passage?.title, "Tsubasa Oribe");
    assert.match(passage?.text || "", /aspiring idol/i);
  } finally { globalThis.fetch = originalFetch; }
});

test("Uzaki-chan characters use their dedicated franchise wiki", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const value = String(url);
    if (value.includes("uzaki-chan.fandom.com")) return response({
      parse: {
        pageid: 77,
        title: "Hana Uzaki",
        wikitext: { "*": "Hana Uzaki is a cheerful college student who loves teasing Shinichi and persistently draws him into spending time together." },
      },
    });
    if (value.includes("wikipedia")) return response({ query: { pages: {} } });
    return response({ data: { Character: null } });
  };
  try {
    const result = await researchCharacter({ name: "Hana Uzaki", series: "Uzaki-chan Wants to Hang Out!" });
    const passage = result.evidence.passages.find((item) => item.provider === "franchise_wiki");
    assert.equal(passage?.title, "Hana Uzaki");
    assert.match(passage?.text || "", /loves teasing Shinichi/i);
  } finally { globalThis.fetch = originalFetch; }
});

test("Wikipedia HTTP failure does not suppress AniList and is recorded", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => String(url).includes("wikipedia")
    ? { ok: false, status: 503 }
    : response({ data: { Character: { id: 123, name: { full: "Erica Anderson" }, description: "A waitress at the Stray Sheep.", media: { nodes: [{ title: { english: "Catherine" }, type: "GAME" }] } } } });
  try {
    const result = await researchCharacter({ name: "Erica Anderson", series: "Catherine" });
    assert.match(result.notes.join(" "), /waitress/);
    assert.equal(result.evidence.diagnostics.find((item) => item.provider === "wikipedia").status, "failed");
    assert.equal(result.evidence.passages[0].url, "https://anilist.co/character/123");
  } finally { globalThis.fetch = originalFetch; }
});

test("irrelevant Wikipedia results are not accepted as fallback evidence", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => String(url).includes("wikipedia")
    ? response({ query: { pages: { 1: { pageid: 1, title: "Unrelated person", extract: "An unrelated biography", fullurl: "https://en.wikipedia.org/wiki/Unrelated" } } } })
    : response({ data: { Character: null } });
  try {
    const result = await researchCharacter({ name: "Erica Anderson", series: "Catherine" });
    assert.deepEqual(result.notes, []);
    assert.deepEqual(result.sources, []);
    assert.deepEqual(result.evidence.passages, []);
    assert.equal(result.evidence.diagnostics.find((item) => item.provider === "wikipedia").status, "no_match");
  } finally { globalThis.fetch = originalFetch; }
});

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
