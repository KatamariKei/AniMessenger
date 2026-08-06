import { demoCatalog } from "./demo-catalog.mjs";

function absoluteUrl(base, value) {
  if (!value) return undefined;
  return new URL(value, base.endsWith("/") ? base : base + "/").toString();
}

export async function checkAnimaDex(config) {
  try {
    const response = await fetch(config.animadexUrl + "/api/characters/facets", { signal: AbortSignal.timeout(2500) });
    return response.ok;
  } catch {
    return false;
  }
}

export async function searchCharacters(config, query, page = 1) {
  const url = new URL("/api/characters/search", config.animadexUrl);
  url.searchParams.set("q", query || "");
  url.searchParams.set("page", String(page));
  url.searchParams.set("sort", "count");
  let payload;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error("AnimaDex search failed.");
    payload = await response.json();
  } catch {
    const needle = String(query || "").toLowerCase();
    const results = demoCatalog.filter((item) => (item.name + " " + item.series).toLowerCase().includes(needle));
    return { total: results.length, results, demo: true };
  }
  return {
    total: Number(payload.total || 0),
    results: (payload.results || []).map((item) => ({
      id: item.slug,
      name: item.name || String(item.slug).replaceAll("_", " "),
      series: item.copyright_name || String(item.copyright || "").replaceAll("_", " "),
      trigger: item.trigger || item.name,
      tags: Array.isArray(item.tags) ? item.tags : [],
      thumbUrl: absoluteUrl(config.animadexUrl, item.thumb_url),
      imageUrl: absoluteUrl(config.animadexUrl, item.img_url),
      sourceUrl: item.url || "",
      count: Number(item.count || 0),
    })),
  };
}
