function plainText(value) {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, "\"")
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizedWords(value) {
  return new Set(String(value || "").toLowerCase().match(/[a-z0-9]+/g) || []);
}

function sharesUsefulWords(left, right) {
  const a = normalizedWords(left);
  const b = normalizedWords(right);
  const ignored = new Set(["the", "a", "an", "of", "and", "series"]);
  return [...a].some((word) => word.length > 2 && !ignored.has(word) && b.has(word));
}

function researchName(character) {
  return String(character?.name || "").replace(/\s*\([^)]*\)\s*$/, "").trim();
}

async function researchAniList(character) {
  const response = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": "AniMessenger/0.2 local character research",
    },
    body: JSON.stringify({
      query: `query CharacterResearch($search: String) {
        Character(search: $search) {
          id
          name { full native alternative }
          description(asHtml: false)
          gender
          age
          media(perPage: 12, sort: POPULARITY_DESC) {
            nodes { title { romaji english native } type }
          }
        }
      }`,
      variables: { search: researchName(character) || character.name },
    }),
    signal: AbortSignal.timeout(9000),
  });
  if (!response.ok) return null;
  const entry = (await response.json())?.data?.Character;
  if (!entry?.id || !entry?.name?.full) return null;
  if (!sharesUsefulWords(researchName(character) || character.name, [entry.name.full, entry.name.native, ...(entry.name.alternative || [])].join(" "))) return null;
  const media = (entry.media?.nodes || []).map((item) => ({
    title: item.title?.english || item.title?.romaji || item.title?.native || "",
    type: item.type || "",
  }));
  const matchingMedia = media.filter((item) => sharesUsefulWords(character.series, item.title));
  if (String(character.series || "").trim() && !matchingMedia.length) return null;
  const relevantMedia = (matchingMedia.length ? matchingMedia : media.slice(0, 4)).slice(0, 6);
  return {
    note: [
      "AniList character record for " + entry.name.full + ".",
      entry.gender ? "Gender: " + entry.gender + "." : "",
      entry.age ? "Listed age: " + entry.age + "." : "",
      plainText(entry.description).slice(0, 7000),
      relevantMedia.length ? "Associated media: " + relevantMedia.map((item) => item.title + (item.type ? " (" + item.type + ")" : "")).join("; ") + "." : "",
    ].filter(Boolean).join(" "),
    source: { title: entry.name.full + " on AniList", url: "https://anilist.co/character/" + entry.id },
  };
}

export async function researchCharacter(character, enabled = true) {
  const sources = [];
  const notes = [];
  if (character.sourceUrl) sources.push({ title: "AnimaDex source reference", url: character.sourceUrl });
  if (!enabled) return { notes, sources };
  try {
    const search = new URL("https://en.wikipedia.org/w/api.php");
    search.searchParams.set("action", "query");
    search.searchParams.set("generator", "search");
    const name = researchName(character) || character.name;
    search.searchParams.set("gsrsearch", "\"" + name + "\" \"" + character.series + "\" character");
    search.searchParams.set("gsrlimit", "5");
    search.searchParams.set("prop", "extracts|info");
    search.searchParams.set("explaintext", "1");
    search.searchParams.set("exchars", "9000");
    search.searchParams.set("redirects", "1");
    search.searchParams.set("inprop", "url");
    search.searchParams.set("format", "json");
    search.searchParams.set("origin", "*");
    const response = await fetch(search, {
      headers: { "user-agent": "AniMessenger/0.3 local character research" },
      signal: AbortSignal.timeout(9000),
    });
    if (!response.ok) return { notes, sources };
    const payload = await response.json();
    const pages = Object.values(payload.query?.pages || {}).sort((a, b) => Number(a.index || 99) - Number(b.index || 99));
    const relevantPages = pages.filter((page) => {
      const text = page.title + " " + String(page.extract || "");
      return sharesUsefulWords(name, text) && sharesUsefulWords(character.series, text);
    });
    for (const page of (relevantPages.length ? relevantPages : pages).slice(0, 3)) {
      if (page.extract) notes.push("Wikipedia article " + page.title + ": " + String(page.extract).slice(0, 9000));
      if (page.fullurl) sources.push({ title: page.title, url: page.fullurl });
    }
  } catch {
    // Research is supplemental. Ollama can still build from AnimaDex and local model knowledge.
  }
  try {
    const aniList = await researchAniList(character);
    if (aniList?.note) notes.push(aniList.note);
    if (aniList?.source) sources.push(aniList.source);
  } catch {
    // A second source improves depth when available but never blocks local profile creation.
  }
  return { notes, sources };
}
