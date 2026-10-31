import { fetchFranchiseWikiPage } from "./research.mjs";
import { stripWikiReferences } from "./wiki-text.mjs";
import { performanceMetrics } from "./performance-metrics.mjs";

export function selectDiscoveryEvidenceText(raw, maximum = 24000) {
  const content = stripWikiReferences(raw)
    .replace(/\[\[(?:File|Image):[^\]]*\]\]/gi, "")
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2").replace(/\[\[([^\]]+)\]\]/g, "$1").replace(/'{2,}/g, "");
  const headings = [...content.matchAll(/^={2,6}\s*([^=\n]+?)\s*={2,6}\s*$/gm)];
  if (!headings.length) return content.slice(0, maximum);
  const sections = headings.map((match, index) => ({ heading: match[1], level: match[0].match(/^=+/)[0].length,
    text: content.slice(match.index, headings[index + 1]?.index ?? content.length) }));
  let excludedLevel = 0;
  const eligible = sections.filter(item => {
    if (excludedLevel && item.level > excludedLevel) return false;
    excludedLevel = 0;
    if (/gallery|references|external links|merchandise|alternate|variants?|other (?:versions|incarnations)|adaptations|non.canon/i.test(item.heading)) { excludedLevel = item.level; return false; }
    return true;
  });
  const useful = /history|background|biography|childhood|past|story|lore|relationships|family|friends|motivations|goals|personality|quotes|dialogue|trivia|interests|possessions/i;
  // Children inherit their parent topic: a tournament or friend's name is often
  // a valuable subsection even though its own heading contains no topic keyword.
  const parents = [];
  const ranked = eligible.map(item => {
    while (parents.length && parents.at(-1).level >= item.level) parents.pop();
    const relevant = useful.test(item.heading) || Boolean(parents.at(-1)?.relevant);
    parents.push({ level: item.level, relevant });
    return { ...item, relevant };
  });
  const preferred = ranked.filter(item => item.relevant);
  const selected = preferred.length ? preferred : ranked.filter(item => !/appearance|costume|outfit|moves|gameplay|statistics/i.test(item.heading));
  const lead = content.slice(0, headings[0].index).slice(0, Math.min(1200, maximum));
  const lengths = selected.map(() => 0);
  let remaining = Math.max(0, maximum - lead.length - selected.length * 2 - 2);
  // Allocate coverage before depth. No long early history section may consume
  // the entire budget before relationships, personality or trivia are sampled.
  while (remaining > 0) {
    let added = 0;
    for (const [index, item] of selected.entries()) {
      const take = Math.min(800, remaining, Math.min(5000, item.text.length) - lengths[index]);
      if (take <= 0) continue;
      lengths[index] += take; remaining -= take; added += take;
    }
    if (!added) break;
  }
  return [lead, ...selected.map((item, index) => item.text.slice(0, lengths[index]))].filter(Boolean).join("\n\n").slice(0, maximum);
}

export function discoveryEvidencePassages(research, maximum = 30000) {
  const input = (research.evidence?.passages || []).filter(item => item.provider !== "catalogue" && item.text);
  const fresh = input.filter(item => String(item.id).startsWith("discovery-"));
  const sources = [...fresh, ...input.filter(item => !fresh.includes(item))];
  if (!sources.length) return [];
  // Keep all fresh pages represented, without the profile dossier's second
  // 12k-per-page truncation. Supplemental cached excerpts use the remaining room.
  let remaining = maximum;
  return sources.flatMap((item, index) => {
    const freshRemaining = Math.max(1, fresh.length - index);
    const allowance = index < fresh.length ? Math.floor(remaining / freshRemaining) : remaining;
    const text = selectDiscoveryEvidenceText(item.text, allowance);
    remaining -= text.length;
    return text ? [{ ...item, text }] : [];
  });
}

export function discoveryWikiTarget(passage, character = {}) {
  try {
    const url = new URL(passage?.url);
    if (url.protocol !== "https:" || url.port || url.username || url.password
      || !(/^[a-z0-9-]+\.fandom\.com$/.test(url.hostname) || ["bulbapedia.bulbagarden.net", "en.wikipedia.org"].includes(url.hostname))
      || !url.pathname.startsWith("/wiki/")) return null;
    const title = decodeURIComponent(url.pathname.slice(6)).replaceAll("_", " ");
    if (!title || title.includes("/") || title.includes(":")) return null;
    if (url.hostname === "en.wikipedia.org") {
      const nameWords = String(character.name || "").toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
      if (!nameWords.length || !nameWords.every(word => title.toLowerCase().includes(word))) return null;
    }
    return { host: url.hostname, title, apiPath: ["bulbapedia.bulbagarden.net", "en.wikipedia.org"].includes(url.hostname) ? "/w/api.php" : "/api.php" };
  } catch { return null; }
}

export function linkedDiscoverySubpages(raw, title) {
  return [...new Set([...String(raw || "").matchAll(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g)]
    .map(match => match[1].replaceAll("_", " ").trim())
    .filter(page => page.startsWith(title + "/") && /\/(?:history|biography|background|relationships|profile|lore|quotes|dialogue|trivia)$/i.test(page)))].slice(0, 2);
}

async function searchDiscoveryPages(target) {
  const url = new URL(`https://${target.host}${target.apiPath}`);
  url.search = new URLSearchParams({ action: "query", list: "search", srsearch: `"${target.title.replaceAll('"', '')}"`, srlimit: "8", format: "json" }).toString();
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(9000) });
  if (!response.ok) return [];
  return (await response.json())?.query?.search?.map(item => item.title) || [];
}

export async function researchCharacterDiscoveries(character, research, { fetchPage = fetchFranchiseWikiPage, searchPages = searchDiscoveryPages } = {}) {
  const startedAt = performance.now();
  const base = research.evidence?.passages || [];
  const targets = base.filter(item => ["franchise_wiki", "wikipedia"].includes(item.provider)).map(item => discoveryWikiTarget(item, character)).filter(Boolean);
  const target = targets[0];
  const passages = [];
  const diagnostics = { attemptedPages: 0, retrievedPages: 0, attemptedSearches: 0, targeted: Boolean(target) };
  if (!target) return { ...research, discoveryResearch: diagnostics };
  async function retrieve(title) {
    diagnostics.attemptedPages++;
    try {
      const page = await fetchPage(target.host, title, target.apiPath);
      if (!page?.wikitext?.["*"] || !page.title || (page.title !== target.title && !page.title.startsWith(target.title + "/"))) return null;
      const text = selectDiscoveryEvidenceText(page.wikitext["*"]);
      if (text.trim().length < 80) return null;
      diagnostics.retrievedPages++;
      return { page, passage: { id: `discovery-${target.host}-${page.pageid || title}`, provider: "franchise_wiki", title: page.title,
        url: `https://${target.host}/wiki/${encodeURIComponent(page.title.replaceAll(" ", "_"))}`, text } };
    } catch { return null; }
  }
  // Re-fetch the full verified character page rather than reusing the appearance-heavy
  // creation excerpt. Follow only actually linked, same-character detail pages.
  const mainResult = await retrieve(target.title);
  if (mainResult) passages.push(mainResult.passage);
  const main = mainResult?.page;
  const details = main ? linkedDiscoverySubpages(main.wikitext["*"], target.title) : [];
  if (details.length < 2) {
    diagnostics.attemptedSearches++;
    try {
      const hits = await searchPages(target);
      for (const title of hits) {
        if (typeof title === "string" && title.startsWith(target.title + "/")
          && /\/(?:history|biography|background|relationships|profile|lore|quotes|dialogue|trivia)$/i.test(title) && !details.includes(title)) details.push(title);
        if (details.length >= 2) break;
      }
    } catch { /* Keep the retrieved character page when targeted search is unavailable. */ }
  }
  const detailResults = await Promise.all(details.slice(0, 2).map(retrieve));
  for (const result of detailResults) if (result) passages.push(result.passage);
  performanceMetrics.record("discovery_research", { totalMs: performance.now() - startedAt, sourceCount: passages.length });
  return { ...research, evidence: { ...research.evidence, passages: [...passages, ...base] }, discoveryResearch: diagnostics };
}
