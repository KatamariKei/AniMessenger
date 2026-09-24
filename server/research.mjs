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
  return new Set(String(value || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").match(/[a-z0-9]+/g) || []);
}

function sharesUsefulWords(left, right) {
  const a = normalizedWords(left);
  const b = normalizedWords(right);
  const ignored = new Set(["the", "a", "an", "of", "and", "series"]);
  // Character designations such as 2B and 9S are short but distinctive.
  // Still ignore ordinary one-letter initials and two-letter prose words.
  return [...a].some((word) => (word.length > 2 || /^(?=.*[a-z])(?=.*\d)[a-z0-9]{2,}$/.test(word))
    && !ignored.has(word) && b.has(word));
}

function shortDesignation(name) {
  const token = String(name || "").trim();
  return /^(?=.*[a-z])(?=.*\d)[a-z0-9]{2,}$/i.test(token) ? token : "";
}

function wikiPageMatches(name, series, page) {
  const title = String(page?.title || "");
  const body = String(page?.wikitext?.["*"] || "");
  if (!body || title.includes("/") || /\bdisambiguation\b/i.test(title)) return false;
  const designation = shortDesignation(name);
  if (designation) {
    const exactTitle = title.toLowerCase() === designation.toLowerCase();
    const qualifiedTitle = title.toLowerCase().startsWith(designation.toLowerCase() + " (")
      && sharesUsefulWords(series, title);
    if (exactTitle || qualifiedTitle) return true;
    // "2B Copy" and "DLC2: 2B" are distinct subjects, even though their
    // titles include the requested short code. Require a verified alias lead.
    if (new RegExp("(?:^|[^a-z0-9])" + designation + "(?:$|[^a-z0-9])", "i").test(title)) return false;
  } else if (sharesUsefulWords(name, title)) return true;
  // A short catalogue designation may redirect to a longer official name.
  // Accept it only when the character's own lead explicitly states the alias,
  // and the selected franchise appears in the page, never from a loose mention.
  if (!designation || !sharesUsefulWords(series, body)) return false;
  const escaped = designation.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const lead = body.slice(0, 5000).replace(/'{2,}/g, "");
  return new RegExp("\\b(?:or just|also known as|known as|called|alias(?:es)?)\\s+" + escaped + "\\b", "i")
    .test(lead);
}

function researchName(character) {
  const name = String(character?.name || "").replace(/\s*\([^)]*\)\s*$/, "").trim();
  // The catalogue names Ranma's female form separately, while character
  // reference sites document both forms on Ranma Saotome's shared page.
  if (/^ranma-chan$/i.test(name) && /^ranma\s*1\s*\/\s*2$/i.test(String(character?.series || "").trim())) {
    return "Ranma Saotome";
  }
  // Fire Emblem avatar variants share a character overview. Searching the
  // gender-prefixed catalogue label can otherwise select a supports/script
  // subpage instead of the page that documents the character's appearance.
  if (/^fire emblem\b/i.test(String(character?.series || ""))) {
    const avatar = name.match(/^(?:female|male)\s+(Byleth|Robin|Corrin|Shez|Alear)$/i);
    if (avatar) return avatar[1];
  }
  return name;
}

function researchSeries(character) {
  const series = String(character?.series || "").trim();
  const qualifier = String(character?.name || "").match(/\(([^)]+)\)\s*$/)?.[1]?.trim();
  // Danbooru sometimes exposes only a short tag qualifier (for example
  // "botw") while its character wiki redirects to a fully qualified tag such
  // as {{princess_zelda the_legend_of_zelda:_breath_of_the_wild}}. Recover the
  // canonical series from that catalogue evidence instead of searching the
  // web for an opaque abbreviation.
  const cleanName = researchName(character).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const redirectedSeries = (character?.catalogNotes || []).flatMap((note) =>
    [...String(note || "").matchAll(/\bSee\s+\{\{([^{}]+)\}\}/gi)]
      .map((match) => match[1].replaceAll("_", " ").replace(/\s+/g, " ").trim()))
    .map((target) => {
      const normalizedTarget = target.toLowerCase().replace(/[^a-z0-9:]+/g, " ").trim();
      return normalizedTarget.startsWith(cleanName + " ")
        ? normalizedTarget.slice(cleanName.length).trim()
        : "";
    })
    .find(Boolean);
  if (redirectedSeries && (series.length <= 6 || sharesUsefulWords(series, redirectedSeries))) return redirectedSeries;
  // Catalogue results sometimes label only the parent franchise, while the
  // selected name identifies a specific installment or continuity.
  return qualifier && qualifier.toLowerCase().includes(series.toLowerCase())
    && qualifier.length > series.length ? qualifier : series;
}

function selectedForm(character) {
  return /^ranma-chan$/i.test(String(character?.name || "").trim())
    && /^ranma\s*1\s*\/\s*2$/i.test(String(character?.series || "").trim())
    ? "Female physical form of Ranma Saotome; share Ranma's biography and personality, but use the selected female form for visual appearance. Do not infer gender identity or pronouns from physical form alone."
    : "";
}

// Explicit franchise routing avoids guessing arbitrary hosts from user input.
const franchiseWikis = [
  { series: /^catherine(?:: full body)?$/i, host: "catherine.fandom.com" },
  { series: /^dead or alive(?:\s+\d+)?$/i, host: "deadoralive.fandom.com" },
  { series: /^ghost in the shell/i, host: "ghostintheshell.fandom.com" },
  { series: /^the witcher$|^witcher$/i, host: "witcher.fandom.com" },
  { series: /^pok[eé]mon\b/i, host: "bulbapedia.bulbagarden.net", apiPath: "/w/api.php" },
  { series: /^tokyo mirage sessions\b/i, host: "megamitensei.fandom.com" },
  { series: /^azur lane$/i, host: "blhx.fandom.com" },
  { series: /^genshin impact$/i, host: "genshin-impact.fandom.com", detailSubpage: "Profile" },
  { series: /^zenless zone zero$/i, host: "zenless-zone-zero.fandom.com", detailSubpage: "Lore" },
  { series: /^(?:the )?legend of zelda\b|^zelda\b/i, host: "zelda.fandom.com" },
  { series: /^uzaki-chan (?:wants to hang out|wa asobitai)/i, host: "uzaki-chan.fandom.com" },
];

// Most Fandom communities use a compact form of the franchise title as their
// subdomain. Keep exceptional cross-franchise wikis above, but do not require
// a code change for every newly requested series.
export function fandomWikiCandidates(character) {
  const candidates = [];
  const add = (host, pageName = "") => {
    if (!/^[a-z0-9-]+\.fandom\.com$/.test(host) || candidates.some((item) => item.host === host)) return;
    candidates.push({ host, pageName });
  };
  for (const ref of [...(character.sourceRefs || []), { url: character.sourceUrl }]) {
    try {
      const url = new URL(ref?.url || "");
      if (url.protocol !== "https:" || !/^[a-z0-9-]+\.fandom\.com$/.test(url.hostname)) continue;
      const pageName = url.pathname.startsWith("/wiki/") ? decodeURIComponent(url.pathname.slice(6)).replaceAll("_", " ") : "";
      add(url.hostname, pageName);
    } catch { /* An invalid catalogue reference is not a research source. */ }
  }
  const seriesNames = [character.series, ...(Array.isArray(character.seriesAliases) ? character.seriesAliases : [])];
  for (const series of seriesNames) {
    const words = String(series || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/&/g, " and ")
      .split(/[:：]/, 1)[0].toLowerCase().match(/[a-z0-9]+/g) || [];
    if (!words.length) continue;
    const slug = words.join("");
    // Numeric franchise suffixes can include a fraction (Ranma 1/2), not
    // just a single installment number. Try the base franchise first.
    const baseWords = [...words];
    while (baseWords.length > 1 && /^\d+$/.test(baseWords.at(-1))) baseWords.pop();
    if (baseWords.length < words.length && baseWords.join("").length >= 4) add(baseWords.join("") + ".fandom.com");
    if (slug.length >= 4 && slug.length <= 45) add(slug + ".fandom.com");
    if (words[0] === "the" && words.length > 1) add(words.slice(1).join("") + ".fandom.com");
    // Installments commonly share the original franchise's wiki: for example
    // Octopath Traveler II is documented at octopathtraveler.fandom.com.
    if (words.length > 1 && /^(?:\d+|ii|iii|iv|v|vi|vii|viii|ix|x)$/.test(words.at(-1))) {
      add(words.slice(0, -1).join("") + ".fandom.com");
    }
  }
  return candidates.slice(0, 4);
}

export function selectWikiEvidenceText(text) {
  const content = String(text || "");
  const headings = [...content.matchAll(/^={2,6}\s*([^=\n]+?)\s*={2,6}\s*$/gm)];
  if (!headings.length) return content.slice(0, 14000);
  const sections = headings.map((match, index) => ({
    heading: match[1].replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2").trim(),
    text: content.slice(match.index, headings[index + 1]?.index ?? content.length),
    index,
  }));
  const chosen = [{ text: content.slice(0, headings[0].index), cap: 2200 }];
  const groups = [
    { test: /\b(?:personality|temperament|characterization|behavior)\b/i, cap: 4600, max: 2 },
    { test: /\bprofile\b/i, cap: 4200, max: 1 },
    { test: /\b(?:appearance|design|costume|outfit|clothing)\b/i, cap: 3300, max: 2 },
    { test: /\b(?:relationships?|family|friends?)\b/i, cap: 1600, max: 1 },
    { test: /\b(?:history|background|biography|childhood)\b/i, cap: 1900, max: 2 },
  ];
  const used = new Set();
  for (const group of groups) {
    for (const section of sections.filter((item) => group.test.test(item.heading)).slice(0, group.max)) {
      chosen.push({ text: section.text, cap: group.cap });
      used.add(section.index);
    }
  }
  for (const section of sections) {
    if (!used.has(section.index)) chosen.push({ text: section.text, cap: 1200 });
  }
  let remaining = 14000;
  return chosen.map((item) => {
    const excerpt = item.text.slice(0, Math.min(item.cap, remaining));
    remaining -= excerpt.length;
    return excerpt;
  }).filter(Boolean).join("\n\n");
}

// Ship pages often put the character's actual dialogue on a /Quotes subpage.
// Keep only the default-skin section here: other skins are useful visual
// variants, but their activities and roles must not become baseline biography.
export function selectBaselineQuoteText(text) {
  const content = String(text || "");
  const start = content.search(/(?:^|\n)={2,6}\s*Default(?:\s+Skin)?\s*={2,6}/im);
  const baseline = start >= 0 ? content.slice(start) : content;
  const nextSection = [...baseline.matchAll(/(?:^|\n)={2,6}\s*([^=\n]+?)\s*={2,6}/gm)]
    .find((match, index) => index > 0 && !/^(?:default(?: skin)?|base|standard|voice lines?|quotes)$/i.test(match[1].trim()));
  return (nextSection ? baseline.slice(0, nextSection.index) : baseline).slice(0, 7000);
}

export function selectFranchiseWikiTitle(name, results = []) {
  const wanted = normalizedWords(name);
  const ignored = new Set(["the", "a", "an", "of", "and", "series"]);
  const scored = results
    .map((item) => {
      const title = String(item?.title || "").trim();
      const words = normalizedWords(title);
      const usefulWanted = [...wanted].filter((word) => word.length > 2 && !ignored.has(word));
      const overlap = usefulWanted.filter((word) => words.has(word)).length;
      return { title, overlap, coverage: usefulWanted.length ? overlap / usefulWanted.length : 0 };
    })
    // Research the character overview first. Dialogue, gallery, and support
    // subpages are optional detail sources, not substitutes for identity.
    .filter((item) => item.title && !item.title.includes("/") && item.overlap > 0)
    .sort((a, b) => b.coverage - a.coverage || b.overlap - a.overlap || a.title.length - b.title.length);
  return scored[0]?.coverage >= 0.5 ? scored[0].title : "";
}

async function fetchFranchiseWikiPage(host, pageName, apiPath = "/api.php") {
  const url = new URL("https://" + host + apiPath);
  url.search = new URLSearchParams({ action: "parse", page: pageName, prop: "wikitext", redirects: "1", format: "json" }).toString();
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(9000) });
  if (!response.ok) throw new Error("Franchise wiki HTTP " + response.status);
  return (await response.json()).parse || null;
}

async function researchFranchiseWiki(character) {
  const name = researchName(character);
  const series = researchSeries(character);
  const route = franchiseWikis.find((item) => item.series.test(series));
  const attempts = [];
  const candidates = [
    ...(route ? [{ host: route.host, apiPath: route.apiPath }] : []),
    ...fandomWikiCandidates(character),
  ].filter((item, index, all) => all.findIndex((other) => other.host === item.host) === index);
  const seriesNamedHosts = new Set(fandomWikiCandidates({ series: character.series, seriesAliases: character.seriesAliases }).map((item) => item.host));
  for (const candidate of candidates) {
    try {
      let page = await fetchFranchiseWikiPage(candidate.host, candidate.pageName || name, candidate.apiPath);
      if (!wikiPageMatches(name, series, page)) {
        const searchUrl = new URL("https://" + candidate.host + (candidate.apiPath || "/api.php"));
        searchUrl.search = new URLSearchParams({ action: "query", list: "search", srsearch: name, srlimit: "6", format: "json" }).toString();
        const searchResponse = await fetch(searchUrl, { redirect: "error", signal: AbortSignal.timeout(9000) });
        if (!searchResponse.ok) throw new Error("Franchise wiki search HTTP " + searchResponse.status);
        const searchResults = (await searchResponse.json())?.query?.search || [];
        const searchTitle = selectFranchiseWikiTitle(name, searchResults);
        page = searchTitle ? await fetchFranchiseWikiPage(candidate.host, searchTitle, candidate.apiPath) : null;
        if (!wikiPageMatches(name, series, page) && shortDesignation(name)) {
          // Search indexes may return the official long title without the
          // short designation in its title. Verify the page's own lead.
          for (const result of searchResults.slice(0, 6)) {
            if (!result?.title || result.title === searchTitle || result.title.includes("/")) continue;
            const possible = await fetchFranchiseWikiPage(candidate.host, result.title, candidate.apiPath);
            if (wikiPageMatches(name, series, possible)) { page = possible; break; }
          }
        }
      }
      if (!wikiPageMatches(name, series, page)) {
        attempts.push({ host: candidate.host, status: "no_match" });
        continue;
      }
      const text = selectWikiEvidenceText(String(page.wikitext["*"])
        .split(/==\s*(?:Gallery|Trivia|References)\s*==/i)[0]
        .replace(/<ref\b[^>]*>[\s\S]*?<\/ref>/gi, "")
        .replace(/\[\[(?:File|Image):[^\]]*\]\]/gi, "")
        .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
        .replace(/\[\[([^\]]+)\]\]/g, "$1")
        .replace(/'{2,}/g, ""));
      if (candidate.host !== route?.host && !seriesNamedHosts.has(candidate.host) && !sharesUsefulWords(series, text)) {
        attempts.push({ host: candidate.host, status: "wrong_series" });
        continue;
      }
      if (text.trim().length < 20) {
        attempts.push({ host: candidate.host, status: "too_short" });
        continue;
      }
      attempts.push({ host: candidate.host, status: "retrieved" });
      let quotePassage = null;
      let detailPassage = null;
      if (candidate.host === route?.host && route.detailSubpage) {
        try {
          const detailPage = await fetchFranchiseWikiPage(candidate.host, page.title + "/" + route.detailSubpage, candidate.apiPath);
          const detailText = selectWikiEvidenceText(detailPage?.wikitext?.["*"]);
          if (detailPage && detailText.trim().length >= 80) detailPassage = {
            id: "franchise-" + candidate.host + "-detail-" + detailPage.pageid,
            provider: "franchise_wiki", title: detailPage.title,
            url: "https://" + candidate.host + "/wiki/" + encodeURIComponent(detailPage.title.replaceAll(" ", "_")),
            text: detailText,
          };
        } catch { /* A missing detail subpage does not discard the character page. */ }
      }
      if (candidate.host === "blhx.fandom.com") {
        try {
          const quotePage = await fetchFranchiseWikiPage(candidate.host, page.title + "/Quotes", candidate.apiPath);
          const quoteText = selectBaselineQuoteText(quotePage?.wikitext?.["*"]);
          if (quotePage && quoteText.trim().length >= 80) quotePassage = {
            id: "franchise-" + candidate.host + "-quotes-" + quotePage.pageid,
            provider: "franchise_wiki", title: quotePage.title,
            url: "https://" + candidate.host + "/wiki/" + encodeURIComponent(quotePage.title.replaceAll(" ", "_")),
            text: quoteText,
          };
        } catch { /* A missing quotes subpage does not discard the ship page. */ }
      }
      return { passage: { id: "franchise-" + candidate.host + "-" + page.pageid, provider: "franchise_wiki", title: page.title,
        url: "https://" + candidate.host + "/wiki/" + encodeURIComponent(page.title.replaceAll(" ", "_")), text }, quotePassage, detailPassage, attempts };
    } catch (error) {
      // One missing or unavailable wiki must not suppress other sources.
      attempts.push({ host: candidate.host, status: "failed", error: String(error.message || error) });
    }
  }
  return { passage: null, attempts };
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
  const matchingMedia = media.filter((item) => sharesUsefulWords(researchSeries(character), item.title));
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
  const startedAt = Date.now();
  const diagnostics = [];
  const passages = [];
  const sources = [];
  const catalogueNotes = Array.isArray(character.catalogNotes) ? character.catalogNotes.filter(Boolean) : [];
  const notes = [...catalogueNotes];
  if (Array.isArray(character.sourceRefs)) sources.push(...character.sourceRefs.filter((item) => item?.url));
  else if (character.sourceUrl) sources.push({ title: "Character catalogue source", url: character.sourceUrl });
  const result = () => ({ catalogueNotes, notes, sources, selectedForm: selectedForm(character), evidence: { version: 1, retrievedAt: new Date().toISOString(), durationMs: Date.now() - startedAt, diagnostics, passages } });
  if (!enabled) return result();
  const wikipedia = (async () => {
  const providerStarted = Date.now();
  try {
    const search = new URL("https://en.wikipedia.org/w/api.php");
    search.searchParams.set("action", "query");
    search.searchParams.set("generator", "search");
    const name = researchName(character) || character.name;
    search.searchParams.set("gsrsearch", "\"" + name + "\" \"" + researchSeries(character) + "\" character");
    search.searchParams.set("gsrlimit", "5");
    search.searchParams.set("prop", "extracts|info");
    search.searchParams.set("explaintext", "1");
    search.searchParams.set("exchars", "9000");
    search.searchParams.set("redirects", "1");
    search.searchParams.set("inprop", "url");
    search.searchParams.set("format", "json");
    search.searchParams.set("origin", "*");
    const response = await fetch(search, {
      headers: { "user-agent": "AniMessenger/0.5 local character research" },
      signal: AbortSignal.timeout(9000),
    });
    if (!response.ok) throw new Error("Wikipedia HTTP " + response.status);
    const payload = await response.json();
    const pages = Object.values(payload.query?.pages || {}).sort((a, b) => Number(a.index || 99) - Number(b.index || 99));
    const relevantPages = pages.filter((page) => {
      const text = page.title + " " + String(page.extract || "");
      return sharesUsefulWords(name, text) && sharesUsefulWords(researchSeries(character), text);
    });
    for (const page of relevantPages.slice(0, 3)) {
      if (page.extract) notes.push("Wikipedia article " + page.title + ": " + String(page.extract).slice(0, 9000));
      if (page.fullurl) sources.push({ title: page.title, url: page.fullurl });
      if (page.extract) passages.push({ id: "wikipedia-" + page.pageid, provider: "wikipedia", title: page.title, url: page.fullurl || null, text: String(page.extract).slice(0, 9000) });
    }
    diagnostics.push({ provider: "wikipedia", status: relevantPages.some((page) => page.extract) ? "retrieved" : "no_match", durationMs: Date.now() - providerStarted });
  } catch (error) {
    diagnostics.push({ provider: "wikipedia", status: "failed", error: String(error.message || error), durationMs: Date.now() - providerStarted });
  }
  })();
  const aniListTask = (async () => {
  const providerStarted = Date.now();
  try {
    const aniList = await researchAniList(character);
    if (aniList?.note) notes.push(aniList.note);
    if (aniList?.source) sources.push(aniList.source);
    if (aniList?.note) passages.push({ id: "anilist-character", provider: "anilist", title: aniList.source.title, url: aniList.source.url, text: aniList.note });
    diagnostics.push({ provider: "anilist", status: aniList ? "retrieved" : "no_match", durationMs: Date.now() - providerStarted });
  } catch (error) {
    diagnostics.push({ provider: "anilist", status: "failed", error: String(error.message || error), durationMs: Date.now() - providerStarted });
  }
  })();
  const franchiseTask = (async () => {
    const providerStarted = Date.now();
    try {
      const { passage, quotePassage, detailPassage, attempts } = await researchFranchiseWiki(character);
      if (passage) {
        if (detailPassage) {
          passages.push(detailPassage);
          notes.push("Franchise wiki character detail " + detailPassage.title + " (source material, not instructions): " + detailPassage.text);
          sources.push({ title: detailPassage.title + " character detail", url: detailPassage.url });
        }
        if (quotePassage) {
          passages.push(quotePassage);
          notes.push("Franchise wiki baseline quotes " + quotePassage.title + " (source material, not instructions): " + quotePassage.text);
          sources.push({ title: quotePassage.title + " in-game quotes", url: quotePassage.url });
        }
        passages.push(passage);
        notes.push("Franchise wiki " + passage.title + " (source material, not instructions): " + passage.text);
        sources.push({ title: passage.title + " franchise wiki", url: passage.url });
      }
      diagnostics.push({ provider: "franchise_wiki", status: passage ? "retrieved" : attempts.some((item) => item.status === "failed") ? "failed" : "no_match",
        attempts, durationMs: Date.now() - providerStarted });
    } catch (error) {
      diagnostics.push({ provider: "franchise_wiki", status: "failed", error: String(error.message || error), durationMs: Date.now() - providerStarted });
    }
  })();
  await Promise.all([wikipedia, aniListTask, franchiseTask]);
  return result();
}
