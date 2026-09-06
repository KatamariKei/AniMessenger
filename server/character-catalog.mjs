import { checkAnimaDex, searchCharacters as searchAnimaDex } from "./animadex.mjs";

const DANBOORU = "https://danbooru.donmai.us";
const ANILIST = "https://graphql.anilist.co";
const WIKIDATA = "https://www.wikidata.org/w/api.php";
const cache = new Map();
const cacheTtlMs = 10 * 60 * 1000;
const catalogHeaders = { "user-agent": "AniMessenger/0.4 character catalogue" };

function cleanText(value = "") {
  return String(value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function titleFromTag(value = "") {
  return String(value || "")
    .replaceAll("_", " ")
    .replace(/\s+/g, " ")
    .replace(/\b\p{L}/gu, (letter) => letter.toUpperCase())
    .replace(/\b(?:Pokemon)\b/g, "Pokémon")
    .trim();
}

function titleFromSeriesLink(value = "") {
  return titleFromTag(value).replace(/\s*\((?:series|franchise)\)\s*$/i, "").trim();
}

function normalizedKey(value = "") {
  return String(value || "").toLowerCase().normalize("NFKD").replace(/\p{M}/gu, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function canonicalNameKey(value = "") {
  return normalizedKey(value).split(" ").filter(Boolean).sort().join(" ");
}

export function seriesKeys(item = {}) {
  return [...new Set([item.series, ...(item.seriesAliases || [])]
    .filter((value) => value && value !== "Series to confirm")
    .map(normalizedKey)
    .filter((value) => value.length >= 4 && /[a-z]/.test(value)))];
}

export function seriesCompatible(left = {}, right = {}) {
  const leftKeys = seriesKeys(left);
  const rightKeys = seriesKeys(right);
  if (!leftKeys.length || !rightKeys.length) return false;
  return leftKeys.some((a) => rightKeys.some((b) => a === b));
}

function mergeSourceRefs(...groups) {
  const refs = new Map();
  for (const ref of groups.flat().filter(Boolean)) {
    const url = String(ref.url || "").trim();
    if (url && !refs.has(url)) refs.set(url, ref);
  }
  return [...refs.values()];
}

function booruParts(tagName = "") {
  const groups = [...String(tagName).matchAll(/_\(([^()]*)\)/g)];
  const seriesTag = groups.at(-1)?.[1] || "";
  const base = seriesTag ? String(tagName).slice(0, groups.at(-1).index) : String(tagName);
  return { name: titleFromTag(base), series: titleFromTag(seriesTag) };
}

function wikiLinks(body = "") {
  return [...String(body).matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)].map((match) => match[1].trim());
}

const visualTagPattern = /\b(?:1girl|1boy|1other|hair|ponytail|twintails?|braid|bun|bangs|ahoge|eyes?|skin|complexion|freckles?|scar|tattoo|ears?|horns?|tail|wings?|fangs?|breasts?|chest|build|physique|height|short|tall|petite|muscular|athletic|curvy|slender|glasses|eyepatch|blindfold|ribbon|hairband|earrings?|necklace|choker|shirt|top|blouse|dress|skirt|shorts|pants|trousers|jeans|leggings|stockings|socks|boots|shoes|heels|jacket|coat|robe|armor|uniform|swimsuit|bikini|leotard|bodysuit|gloves|sleeves|hat|cap)\b/i;

const stableEvidencePattern = /^(?:1girl|1boy|1other|(?:black|blonde|brown|blue|green|grey|gray|orange|pink|purple|red|silver|white|aqua|multicolored|two-tone)_hair|(?:black|brown|blue|green|grey|gray|orange|pink|purple|red|yellow|aqua|heterochromia)_eyes|(?:dark|dark-skinned|tan|pale)_skin|freckles|scar|facial_scar|tattoo|petite|short|tall|muscular|athletic|curvy|slender|very_long_hair|long_hair|medium_hair|short_hair|blunt_bangs|parted_bangs|sidelocks|hair_intakes|ahoge|ponytail|side_ponytail|twintails|low_twintails|braid|twin_braids|hair_bun|single_hair_bun|double_bun|half_updo|multi-tied_hair|glasses|eyepatch|blindfold|fangs|animal_ears|horns|tail|wings|hair_beads|beads|hair_ornament|hair_ribbon|hair_bow|hairband|ribbon|(?:black|blue|brown|green|grey|gray|orange|pink|purple|red|white|yellow)_ribbon|earrings|necklace|choker|chinese_clothes|japanese_clothes|hanfu|aoqun|ruqun|qipao|kimono|yukata|school_uniform|sailor_collar|serafuku|armor|robe|dress|shirt|blouse|tank_top|crop_top|skirt|shorts|pants|trousers|jeans|leggings|jacket|coat|leotard|bodysuit|swimsuit|bikini|gloves|stockings|thighhighs|boots|shoes|sandals|flats|heels|long_sleeves|short_sleeves|wide_sleeves|sleeveless|(?:black|blue|brown|green|grey|gray|orange|pink|purple|red|white|yellow)_(?:hanfu|kimono|robe|dress|shirt|blouse|skirt|shorts|pants|jacket|coat|leotard|bodysuit|swimsuit|bikini|gloves|stockings|thighhighs|boots|shoes))$/;

export function summarizeDanbooruEvidence(posts, targetTag) {
  const target = String(targetTag || "").trim();
  const usable = (Array.isArray(posts) ? posts : []).filter((post) => {
    const characters = String(post?.tag_string_character || "").split(/\s+/).filter(Boolean);
    const general = new Set(String(post?.tag_string_general || "").split(/\s+/).filter(Boolean));
    const alternate = general.has("alternate_hairstyle") || general.has("official_alternate_hairstyle") || general.has("alternate_costume") || general.has("official_alternate_costume") || general.has("aged_down") || general.has("genderbend");
    return characters.length === 1 && characters[0] === target && !alternate;
  });
  if (!usable.length) return [];
  const counts = new Map();
  for (const post of usable) {
    const unique = new Set(String(post?.tag_string_general || "").split(/\s+/).filter((tag) => stableEvidencePattern.test(tag)));
    for (const tag of unique) counts.set(tag, (counts.get(tag) || 0) + 1);
  }
  const threshold = Math.max(3, Math.ceil(usable.length * 0.14));
  const ranked = [...counts.entries()].filter(([, count]) => count >= threshold).sort((a, b) => b[1] - a[1]);
  const subject = ranked.find(([tag, count]) => /^1(?:girl|boy|other)$/.test(tag) && count >= Math.ceil(usable.length * 0.5));
  const filtered = ranked.filter(([tag]) => !/^1(?:girl|boy|other)$/.test(tag));
  return [...(subject ? [subject[0]] : []), ...filtered.map(([tag]) => tag.replaceAll("_", " "))].slice(0, 26);
}

export function parseDanbooruCharacter(tag, wiki = null, evidenceTags = []) {
  const tagName = String(tag?.name || "").trim();
  if (!tagName || tagName.includes(":") || Number(tag?.category) !== 4 || tag?.is_deprecated) return null;
  // Variant/costume tags often contain a second parenthetical group. The canonical
  // character result is clearer and avoids recreating AnimaDex's long outfit names.
  if ((tagName.match(/_\([^()]*\)/g) || []).length > 1) return null;
  const parsed = booruParts(tagName);
  const body = String(wiki?.body || "");
  const appearanceBody = body.split(/\b(?:other|alternate)\s+(?:official\s+)?(?:outfits?|costumes?)\b|\bh\d(?:#\S+)?\./i)[0];
  const links = wikiLinks(appearanceBody);
  const linkedSeries = body.match(/\bfrom\s+(?:the\s+)?series\s+\[\[([^\]|]+)/i)?.[1]
    || body.match(/\b(?:video\s+game|action\s+game|game|anime|manga|novel)?\s*series\s+\[\[([^\]|]+)/i)?.[1]
    || body.match(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]\s+character\b/i)?.[1]
    || body.match(/\b(?:protagonist|antagonist|character)\s+(?:from|of|in)\s+(?:the\s+)?\[\[([^\]|]+)/i)?.[1]
    || body.match(/\b(?:from|of|in)\s+(?:the\s+)?\[\[([^\]|]+)(?:\|[^\]]+)?\]\](?:\s+(?:franchise|series|game|anime|manga))?/i)?.[1]
    || "";
  const series = parsed.series || titleFromSeriesLink(linkedSeries);
  const subject = /\b(?:she|her)\b/i.test(body) ? "1girl" : /\b(?:he|him|his)\b/i.test(body) ? "1boy" : "";
  const hasEvidenceHairColor = evidenceTags.some((item) => /^(?:black|blonde|brown|blue|green|grey|gray|orange|pink|purple|red|silver|white|aqua|multicolored|two-tone) hair$/i.test(item));
  const hasEvidenceEyeColor = evidenceTags.some((item) => /^(?:black|brown|blue|green|grey|gray|orange|pink|purple|red|yellow|aqua|heterochromia) eyes$/i.test(item));
  const wikiVisuals = links.filter((item) => visualTagPattern.test(item)).filter((item) => {
    if (hasEvidenceHairColor && /\b(?:black|blonde|brown|blue|green|grey|gray|orange|pink|purple|red|silver|white|aqua|multicolored|two-tone) hair\b/i.test(item)) return false;
    if (hasEvidenceEyeColor && /\b(?:black|brown|blue|green|grey|gray|orange|pink|purple|red|yellow|aqua) eyes\b/i.test(item)) return false;
    return true;
  });
  const tags = [...new Set([subject, ...evidenceTags, ...wikiVisuals].filter(Boolean))];
  // Base character wikis often contain a later section listing alternate
  // costumes. Only a parenthetical tag whose own page identifies it as an
  // outfit is a variant; the base character must remain searchable.
  const isVariant = Boolean(parsed.series) && /\b(?:official\s+)?alternate\s+(?:costume|outfit)|\b(?:costume|outfit)\s+(?:for|from)\b|\bwearing\s+(?:his|her|their)\s+(?:attire|outfit|costume)\b|\bthis\s+outfit\s+consists\b/i.test(body);
  return {
    id: `danbooru-${tag.id || normalizedKey(tagName).replaceAll(" ", "-")}`,
    name: parsed.name,
    series: series || "Series to confirm",
    trigger: [tagName, series ? String(series).toLowerCase().replaceAll(" ", "_") : ""].filter(Boolean).join(", "),
    tags,
    sourceUrl: `${DANBOORU}/wiki_pages/${encodeURIComponent(tagName)}`,
    sourceProvider: "danbooru",
    sourceRefs: [{ title: `${parsed.name} character tag`, url: `${DANBOORU}/wiki_pages/${encodeURIComponent(tagName)}` }],
    catalogNotes: body ? [`Danbooru character wiki: ${cleanText(body).slice(0, 7000)}`] : [],
    count: Number(tag.post_count || 0),
    isVariant,
    variantLabel: isVariant ? parsed.series : "",
  };
}

export function parseWikidataCharacter(item) {
  const description = cleanText(item?.description);
  if (!item?.id || !item?.label || !/\b(?:fictional|character|protagonist|antagonist)\b/i.test(description)) return null;
  const typedTitle = description.match(/\b(?:from|in|of)\s+(?:the\s+)?(?:video\s+game|game|anime|manga|television\s+series|film|comic|novel)\s+(.+)$/i)?.[1];
  const series = (typedTitle || description.match(/\b(?:from|in|of)\s+(?:the\s+)?(.+?)(?:\s+(?:video game|game|anime|manga|television|film|comic|novel|franchise|series)\b|$)/i)?.[1])
    ?.replace(/^(?:fictional\s+)?character\s+/i, "")
    ?.replace(/\s+(?:video game|game|anime|manga|television|film|comic|novel|franchise|series)$/i, "")
    ?.trim();
  return {
    id: `wikidata-${item.id}`,
    name: cleanText(item.label),
    series: series ? series.replace(/\s+and\s+.*$/i, "").trim() : "Series to confirm",
    trigger: cleanText(item.label).toLowerCase().replaceAll(" ", "_"),
    tags: [],
    sourceUrl: item.concepturi || `https://www.wikidata.org/wiki/${item.id}`,
    sourceProvider: "wikidata",
    sourceRefs: [{ title: `${cleanText(item.label)} on Wikidata`, url: item.concepturi || `https://www.wikidata.org/wiki/${item.id}` }],
    catalogNotes: description ? [`Wikidata description: ${description}`] : [],
    count: 0,
  };
}

export function parseAniListCharacter(item) {
  const name = cleanText(item?.name?.full);
  if (!item?.id || !name) return null;
  const media = item.media?.nodes || [];
  const firstMedia = media.find((entry) => entry?.title?.english || entry?.title?.romaji || entry?.title?.native);
  const series = cleanText(firstMedia?.title?.english || firstMedia?.title?.romaji || firstMedia?.title?.native) || "Series to confirm";
  const seriesAliases = [...new Set(media.flatMap((entry) => [entry?.title?.english, entry?.title?.romaji, entry?.title?.native]).map(cleanText).filter(Boolean))];
  return {
    id: `anilist-${item.id}`,
    name,
    series,
    seriesAliases,
    trigger: [name, series].map((part) => part.toLowerCase().replace(/\s+/g, "_")).join(", "),
    tags: [],
    sourceUrl: `https://anilist.co/character/${item.id}`,
    sourceProvider: "anilist",
    sourceRefs: [{ title: `${name} on AniList`, url: `https://anilist.co/character/${item.id}` }],
    catalogNotes: [
      item.gender ? `AniList gender: ${item.gender}.` : "",
      item.age ? `AniList listed age: ${item.age}.` : "",
      item.description ? `AniList description: ${cleanText(item.description).slice(0, 7000)}` : "",
    ].filter(Boolean),
    count: Number(item.favourites || 0),
  };
}

async function fetchJson(url, options = {}, timeout = 9000) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(timeout) });
  if (!response.ok) throw new Error(`Character source returned HTTP ${response.status}.`);
  return response.json();
}

async function searchDanbooru(query) {
  const tokens = normalizedKey(query).split(/\s+/).filter(Boolean);
  const rawPattern = String(query).trim().toLowerCase().normalize("NFKD").replace(/\p{M}/gu, "").replace(/[^a-z0-9-]+/g, "_");
  const patterns = [...new Set([
    `*${rawPattern}*`,
    tokens.length > 1 ? `*${tokens.join("-")}*` : "",
    tokens.length > 1 ? `*${tokens.join("_")}*` : "",
    tokens.length > 1 ? `*${tokens.join("*")}*` : "",
  ].filter(Boolean))];
  let tags = [];
  for (const pattern of patterns) {
    try {
      const url = new URL("/tags.json", DANBOORU);
      url.searchParams.set("search[name_matches]", pattern);
      url.searchParams.set("search[category]", "4");
      url.searchParams.set("search[order]", "count");
      url.searchParams.set("limit", "16");
      const matches = await fetchJson(url, { headers: { "user-agent": "AniMessenger/0.4 character catalogue" } });
      tags = (Array.isArray(matches) ? matches : []).filter((tag) => {
        const name = normalizedKey(tag?.name);
        return tokens.every((token) => name.includes(token));
      });
    } catch {
      tags = [];
    }
    if (Array.isArray(tags) && tags.length) break;
  }
  const canonical = (Array.isArray(tags) ? tags : []).filter((tag) => (String(tag.name).match(/_\([^()]*\)/g) || []).length <= 1).slice(0, 10);
  const wikiResults = await Promise.all(canonical.map(async (tag, index) => {
    try {
      const wikiUrl = new URL("/wiki_pages.json", DANBOORU);
      wikiUrl.searchParams.set("search[title]", tag.name);
      wikiUrl.searchParams.set("limit", "1");
      const requests = [fetchJson(wikiUrl, { headers: { "user-agent": "AniMessenger/0.4 character catalogue" } }, 6000)];
      if (index < 6) {
        const postsUrl = new URL("/posts.json", DANBOORU);
        postsUrl.searchParams.set("tags", tag.name);
        postsUrl.searchParams.set("limit", "100");
        postsUrl.searchParams.set("only", "id,tag_string_general,tag_string_character");
        requests.push(fetchJson(postsUrl, { headers: { "user-agent": "AniMessenger/0.4 character catalogue" } }, 7000).catch(() => []));
      }
      const [pages, posts = []] = await Promise.all(requests);
      return parseDanbooruCharacter(tag, pages?.[0], summarizeDanbooruEvidence(posts, tag.name));
    } catch {
      return parseDanbooruCharacter(tag);
    }
  }));
  return wikiResults.filter(Boolean);
}

async function searchAniList(query) {
  const payload = await fetchJson(ANILIST, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "AniMessenger/0.4 character catalogue" },
    body: JSON.stringify({
      query: `query CharacterSearch($search: String) {
        Page(page: 1, perPage: 10) {
          characters(search: $search, sort: FAVOURITES_DESC) {
            id favourites description(asHtml: false) gender age
            name { full native alternative }
            media(perPage: 4, sort: POPULARITY_DESC) { nodes { title { romaji english native } type } }
          }
        }
      }`,
      variables: { search: String(query).trim() },
    }),
  });
  return (payload?.data?.Page?.characters || []).map(parseAniListCharacter).filter(Boolean);
}

async function searchWikidata(query) {
  const url = new URL(WIKIDATA);
  url.searchParams.set("action", "wbsearchentities");
  url.searchParams.set("search", String(query).trim());
  url.searchParams.set("language", "en");
  url.searchParams.set("uselang", "en");
  url.searchParams.set("type", "item");
  url.searchParams.set("limit", "12");
  url.searchParams.set("format", "json");
  url.searchParams.set("origin", "*");
  const payload = await fetchJson(url, { headers: { "user-agent": "AniMessenger/0.4 character catalogue" } });
  return (payload?.search || []).map(parseWikidataCharacter).filter(Boolean);
}

function resultScore(item, query) {
  const needle = normalizedKey(query);
  const name = normalizedKey(item.name);
  const wordMatch = name.split(" ").some((word) => word.startsWith(needle));
  const exact = name === needle ? 200_000 : name.startsWith(needle) ? 150_000 : wordMatch ? 80_000 : name.includes(needle) ? 10_000 : 0;
  const provider = item.sourceProvider === "danbooru" ? 30_000 : item.sourceProvider === "anilist" ? 20_000 : 10_000;
  return exact + provider + Math.min(Number(item.count || 0) * 200, 250_000);
}

export function mergeCatalogResults(groups, query, limit = 20) {
  const items = groups.flat().filter(Boolean);
  const familyMap = new Map();
  for (const item of items) {
    const name = canonicalNameKey(item.name);
    if (!name || !seriesKeys(item).length) continue;
    const families = familyMap.get(name) || [];
    const family = families.find((candidate) => seriesCompatible(candidate, item));
    if (family) {
      family.seriesAliases = [...new Set([...(family.seriesAliases || []), ...(item.seriesAliases || []), item.series].filter(Boolean))];
    } else {
      families.push({ series: item.series, seriesAliases: [...(item.seriesAliases || [])] });
    }
    familyMap.set(name, families);
  }
  const compatibleIncludingUnambiguousUnknown = (left, right) => {
    if (seriesCompatible(left, right)) return true;
    const leftKnown = seriesKeys(left).length > 0;
    const rightKnown = seriesKeys(right).length > 0;
    if (leftKnown === rightKnown) return false;
    const families = familyMap.get(canonicalNameKey(left.name)) || [];
    const known = leftKnown ? left : right;
    return families.length === 1 && seriesCompatible(families[0], known);
  };
  const merged = [];
  for (const item of items) {
    const index = merged.findIndex((candidate) => canonicalNameKey(candidate.name) === canonicalNameKey(item.name) && compatibleIncludingUnambiguousUnknown(candidate, item));
    const existing = index >= 0 ? merged[index] : null;
    if (!existing) {
      merged.push({ ...item });
    } else if (resultScore(item, query) > resultScore(existing, query)) {
      merged[index] = {
        ...item,
        series: seriesKeys(item).length ? item.series : existing.series,
        seriesAliases: [...new Set([...(item.seriesAliases || []), ...(existing.seriesAliases || []), item.series, existing.series].filter(Boolean))],
        tags: [...new Set([...(item.tags || []), ...(existing.tags || [])])],
        catalogNotes: [...new Set([...(item.catalogNotes || []), ...(existing.catalogNotes || [])])],
        sourceRefs: mergeSourceRefs(item.sourceRefs, existing.sourceRefs),
      };
    } else {
      if (!seriesKeys(existing).length && seriesKeys(item).length) existing.series = item.series;
      else if (item.sourceProvider === "anilist" && seriesCompatible(existing, item)) existing.series = item.series;
      existing.seriesAliases = [...new Set([...(existing.seriesAliases || []), ...(item.seriesAliases || []), existing.series, item.series].filter(Boolean))];
      existing.tags = [...new Set([...(existing.tags || []), ...(item.tags || [])])];
      existing.catalogNotes = [...new Set([...(existing.catalogNotes || []), ...(item.catalogNotes || [])])];
      existing.sourceRefs = mergeSourceRefs(existing.sourceRefs, item.sourceRefs);
    }
  }
  const queryKey = normalizedKey(query);
  const filtered = merged.filter((item) => {
    if (!item.isVariant) return true;
    const hasBase = merged.some((candidate) => canonicalNameKey(candidate.name) === canonicalNameKey(item.name) && !candidate.isVariant);
    if (!hasBase) return true;
    const variantKey = normalizedKey(item.variantLabel || item.series);
    return Boolean(variantKey && queryKey.includes(variantKey));
  });
  return filtered.sort((a, b) => resultScore(b, query) - resultScore(a, query)).slice(0, limit);
}

export async function checkCharacterCatalog(config) {
  const checks = [
    fetchJson(`${DANBOORU}/tags.json?limit=1&search%5Bcategory%5D=4`, { headers: catalogHeaders }, 5000).then(() => true),
    fetchJson(ANILIST, {
      method: "POST",
      headers: { ...catalogHeaders, "content-type": "application/json" },
      body: JSON.stringify({ query: "query CatalogueHealth { Page(page: 1, perPage: 1) { characters { id } } }" }),
    }, 5000).then(() => true),
    fetchJson(`${WIKIDATA}?action=query&format=json&origin=*`, { headers: catalogHeaders }, 5000).then(() => true),
    checkAnimaDex(config, 5000),
  ];
  const results = await Promise.allSettled(checks);
  return results.some((result) => result.status === "fulfilled" && result.value === true);
}

export async function searchCharacterCatalog(config, query, page = 1) {
  const cleanQuery = String(query || "").trim();
  if (cleanQuery.length < 2) return { total: 0, results: [] };
  const key = `${normalizedKey(cleanQuery)}:${page}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < cacheTtlMs) return cached.value;
  const settled = await Promise.allSettled([searchDanbooru(cleanQuery), searchAniList(cleanQuery), searchWikidata(cleanQuery)]);
  const independent = mergeCatalogResults(settled.filter((result) => result.status === "fulfilled").map((result) => result.value), cleanQuery);
  const value = independent.length
    ? { total: independent.length, results: independent, source: "independent" }
    : await searchAnimaDex(config, cleanQuery, page);
  // A provider outage falls back to the tiny built-in catalogue. Do not retain
  // that temporary failure for ten minutes after connectivity returns.
  if (!value.demo) cache.set(key, { at: Date.now(), value });
  return value;
}

export async function enrichCharacterCatalog(config, character) {
  if (!character?.name) return character;
  const result = await searchCharacterCatalog(config, character.name, 1);
  const match = (result.results || []).find((candidate) => canonicalNameKey(candidate.name) === canonicalNameKey(character.name) && seriesCompatible(candidate, character));
  if (!match) return character;
  return {
    ...character,
    trigger: match.trigger || character.trigger,
    tags: [...new Set([...(character.tags || []), ...(match.tags || [])])],
    sourceRefs: mergeSourceRefs(character.sourceRefs, match.sourceRefs),
    catalogNotes: [...new Set([...(character.catalogNotes || []), ...(match.catalogNotes || [])])],
    seriesAliases: [...new Set([...(character.seriesAliases || []), ...(match.seriesAliases || []), character.series, match.series].filter(Boolean))],
  };
}
