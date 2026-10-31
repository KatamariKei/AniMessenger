import type { AnimaCharacter } from "./api";

export function catalogSourceLabel(character: AnimaCharacter): string {
  const names = new Set<string>();
  const providers: Record<string, string> = { danbooru: "Danbooru", anilist: "AniList", wikidata: "Wikidata", animadex: "AnimaDex" };
  if (character.sourceProvider && providers[character.sourceProvider]) names.add(providers[character.sourceProvider]);
  for (const url of [character.sourceUrl, ...(character.sourceRefs || []).map(ref => ref.url)]) {
    if (!url) continue;
    try {
      const host = new URL(url).hostname;
      for (const [domain, label] of [["donmai.us", "Danbooru"], ["anilist.co", "AniList"], ["wikidata.org", "Wikidata"], ["animadex.net", "AnimaDex"]]) {
        if (host === domain || host.endsWith("." + domain)) names.add(label);
      }
    } catch { /* An invalid optional source cannot hide the search result. */ }
  }
  return names.size ? [...names].join(" · ") : "Source unconfirmed";
}
